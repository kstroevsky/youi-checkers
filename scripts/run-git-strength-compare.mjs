import { execFileSync } from 'node:child_process';
import { access, mkdtemp, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

function parseArgs(argv) {
  const known = new Set([
    'baseline',
    'candidate',
    'enforce-gate',
    'out-dir',
    'resolution-margin',
    'score-margin',
  ]);
  const parsed = {
    baseline: 'HEAD',
    candidate: 'working',
    enforceGate: 'false',
    forwarded: [],
    outDir: path.join('output', 'ai', 'strength-ab'),
    resolutionMargin: '0.03',
    scoreMargin: '0.03',
  };

  for (const entry of argv) {
    if (!entry.startsWith('--')) {
      parsed.forwarded.push(entry);
      continue;
    }
    const [key, value = ''] = entry.slice(2).split('=');
    if (!known.has(key)) {
      parsed.forwarded.push(entry);
      continue;
    }
    if (key === 'enforce-gate') parsed.enforceGate = value;
    else if (key === 'out-dir') parsed.outDir = value;
    else if (key === 'resolution-margin') parsed.resolutionMargin = value;
    else if (key === 'score-margin') parsed.scoreMargin = value;
    else parsed[key] = value;
  }
  return parsed;
}

function runNpm(cwd, script, args) {
  execFileSync('npm', ['run', script, '--', ...args], {
    cwd,
    stdio: 'inherit',
  });
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function prepareWorkspace(ref) {
  if (ref === 'working') {
    return { cleanup: null, cwd: process.cwd(), label: 'working' };
  }
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'youi-strength-ab-'));
  execFileSync('git', ['worktree', 'add', '--detach', cwd, ref], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });
  try {
    await symlink(
      path.join(process.cwd(), 'node_modules'),
      path.join(cwd, 'node_modules'),
      'dir',
    );
  } catch {
    // Dependency reuse is best-effort. npm will report a clear error if unavailable.
  }
  return {
    cleanup: async () => {
      try {
        execFileSync('git', ['worktree', 'remove', '--force', cwd], {
          cwd: process.cwd(),
          stdio: 'inherit',
        });
      } catch {
        await rm(cwd, { force: true, recursive: true });
      }
    },
    cwd,
    label: ref,
  };
}

async function runRevision(role, ref, outDir, forwarded) {
  const workspace = await prepareWorkspace(ref);
  const prefix = path.resolve(process.cwd(), outDir, role, 'strength');
  try {
    runNpm(workspace.cwd, 'ai:strength', [...forwarded, `--out=${prefix}`]);
    for (const suffix of ['.json', '.md', '.samples.jsonl']) {
      if (!(await exists(`${prefix}${suffix}`))) {
        throw new Error(`${role} did not emit ${prefix}${suffix}.`);
      }
    }
    return { label: workspace.label, prefix };
  } finally {
    if (workspace.cleanup) await workspace.cleanup();
  }
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const baseline = await runRevision(
    'baseline',
    parsed.baseline,
    parsed.outDir,
    parsed.forwarded,
  );
  const candidate = await runRevision(
    'candidate',
    parsed.candidate,
    parsed.outDir,
    parsed.forwarded,
  );
  const comparisonPrefix = path.resolve(
    process.cwd(),
    parsed.outDir,
    'comparison',
  );
  runNpm(process.cwd(), 'ai:strength:compare-files', [
    `--baseline-report=${baseline.prefix}.json`,
    `--baseline-raw=${baseline.prefix}.samples.jsonl`,
    `--candidate-report=${candidate.prefix}.json`,
    `--candidate-raw=${candidate.prefix}.samples.jsonl`,
    `--score-margin=${parsed.scoreMargin}`,
    `--resolution-margin=${parsed.resolutionMargin}`,
    `--enforce-gate=${parsed.enforceGate}`,
    `--out=${comparisonPrefix}`,
  ]);
  process.stdout.write(
    `\nStrength A/B complete: ${baseline.label} -> ${candidate.label}\nArtifacts: ${path.resolve(process.cwd(), parsed.outDir)}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
