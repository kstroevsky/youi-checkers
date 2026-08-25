import { spawn } from 'node:child_process';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';

const maxHoursArg = process.argv.find((entry) =>
  entry.startsWith('--max-hours='),
);
const maxHours = Number(maxHoursArg?.split('=')[1] ?? 3);
if (!Number.isFinite(maxHours) || maxHours <= 0 || maxHours > 4) {
  throw new Error(
    '--max-hours must be greater than zero and no more than four.',
  );
}
const startedAt = Date.now();
const deadline = startedAt + maxHours * 60 * 60 * 1000;
const outputPath = path.resolve('output/ai/bounded-validation/status.json');
await mkdir(path.dirname(outputPath), { recursive: true });
const stages = [
  {
    name: 'affected-tests',
    argv: [
      'vitest',
      'run',
      'src/ai/test/search.parity.test.ts',
      'src/ai/test/symmetry.test.ts',
      'src/ai/test/search.budget.test.ts',
      'src/ai/test/search.timeout.test.ts',
      'src/ai/test/selectionPolicy.test.ts',
      'src/ai/test/exactTieParticipation.test.ts',
      'src/ai/test/productTranspositionAudit.test.ts',
      'src/ai/test/referenceOracle.test.ts',
    ],
  },
  {
    name: 'parallel-fixed-node-evidence',
    commands: [
      {
        name: 'paired-default-ai',
        argv: [
          'ai:measure:compare',
          '--before=8d45067',
          '--after=working',
          '--profile=smoke',
          '--budget=fixedNodes',
          '--nodes=512',
          '--pairs=6',
          '--max-turns=48',
          '--decision-repetitions=4',
          '--scenario-limit=16',
        ],
      },
      {
        name: 'exact-tie-ablation',
        argv: [
          'ai:policy-ablation',
          '--profile=full',
          '--variants=production,exact-tie-participation',
          '--pairs=4',
          '--scenario-limit=4',
          '--max-plies=32',
          '--nodes=4096',
          '--out=output/ai/bounded-validation/exact-tie-ablation',
        ],
      },
      {
        name: 'balanced-participation-ablation',
        argv: [
          'ai:policy-ablation',
          '--profile=full',
          '--variants=production,participation-balanced',
          '--pairs=4',
          '--scenario-limit=4',
          '--max-plies=32',
          '--nodes=4096',
          '--out=output/ai/bounded-validation/balanced-participation-ablation',
        ],
      },
      {
        name: 'root-participation-ablation',
        argv: [
          'ai:policy-ablation',
          '--profile=full',
          '--variants=production,root-participation-0.5',
          '--pairs=4',
          '--scenario-limit=4',
          '--max-plies=32',
          '--nodes=4096',
          '--out=output/ai/bounded-validation/root-participation-ablation',
        ],
      },
      {
        name: 'competence',
        argv: [
          'ai:competence',
          '--profile=full',
          '--nodes=256,1024,4096',
          '--repetitions=4',
          '--oracle-depth=3',
        ],
      },
    ],
  },
  {
    name: 'browser-performance',
    argv: [
      'perf:compare:git',
      '--before=8d45067',
      '--after=working',
      '--out=output/ai/bounded-validation/performance.compare.md',
    ],
  },
];
const results = [];

async function persist(status) {
  const record = {
    deadline: new Date(deadline).toISOString(),
    maxHours,
    results,
    startedAt: new Date(startedAt).toISOString(),
    status,
  };
  const temporary = `${outputPath}.tmp`;
  await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`);
  await rename(temporary, outputPath);
}

async function runStage(stage) {
  if (stage.commands) {
    const started = Date.now();
    const commands = await Promise.all(
      stage.commands.map((command) => {
        process.stdout.write(`\n--- ${command.name} ---\n`);
        return runCommand(command);
      }),
    );
    return {
      commands,
      elapsedMs: Date.now() - started,
      exitCode: commands.every((command) => command.exitCode === 0) ? 0 : 1,
      name: stage.name,
      status: commands.some((command) => command.status === 'deadline')
        ? 'deadline'
        : commands.every((command) => command.status === 'passed')
          ? 'passed'
          : 'failed',
    };
  }
  return runCommand(stage);
}

async function runCommand(stage) {
  const remaining = deadline - Date.now();
  if (remaining <= 0)
    return { exitCode: null, name: stage.name, status: 'deadline' };
  const stageStarted = Date.now();
  const child = spawn('pnpm', stage.argv, { detached: true, stdio: 'inherit' });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      // The process group already exited between the deadline and signal.
    }
    setTimeout(() => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        // The graceful termination completed before the kill grace expired.
      }
    }, 5_000).unref();
  }, remaining);
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve(code ?? (signal ? 128 : 1)));
  });
  clearTimeout(timer);
  return {
    elapsedMs: Date.now() - stageStarted,
    exitCode,
    name: stage.name,
    status: timedOut ? 'deadline' : exitCode === 0 ? 'passed' : 'failed',
  };
}

await persist('running');
for (const stage of stages) {
  process.stdout.write(`\n=== ${stage.name} ===\n`);
  const result = await runStage(stage);
  results.push(result);
  await persist('running');
  if (result.status !== 'passed') {
    await persist(result.status);
    process.exitCode = result.status === 'deadline' ? 124 : 1;
    break;
  }
}
if (
  results.length === stages.length &&
  results.every((result) => result.status === 'passed')
) {
  await persist('passed');
}
