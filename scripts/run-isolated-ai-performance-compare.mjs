import { execFileSync } from 'node:child_process';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

function argument(name, fallback) {
  return (
    process.argv
      .find((entry) => entry.startsWith(`--${name}=`))
      ?.split('=')[1] ?? fallback
  );
}

const baselineRef = argument('baseline', '8d45067');
const repetitions = Number.parseInt(argument('repetitions', '20'), 10);
const sessions = Number.parseInt(argument('sessions', '3'), 10);
const out = path.resolve(
  argument('out', 'output/ai/isolated-medium-root-performance'),
);
const root = process.cwd();
const temporaryRoot = await mkdtemp(
  path.join(os.tmpdir(), 'youi-isolated-perf-'),
);
const baseline = path.join(temporaryRoot, 'baseline');
await mkdir(out, { recursive: true });
execFileSync('git', ['worktree', 'add', '--detach', baseline, baselineRef], {
  cwd: root,
  stdio: 'inherit',
});
await symlink(
  path.join(root, 'node_modules'),
  path.join(baseline, 'node_modules'),
  'dir',
);
await copyFile(
  path.join(root, 'scripts', 'ai-medium-root-performance.report.ts'),
  path.join(baseline, 'scripts', 'ai-medium-root-performance.report.ts'),
);

const records = [];
try {
  for (let session = 0; session < sessions; session += 1) {
    for (let repetition = 0; repetition < repetitions; repetition += 1) {
      const order =
        repetition % 2 === 0
          ? ['baseline', 'candidate']
          : ['candidate', 'baseline'];
      for (const role of order) {
        const cwd = role === 'baseline' ? baseline : root;
        const samplePath = path.join(
          out,
          `${role}-session-${session}-repetition-${repetition}.json`,
        );
        execFileSync(
          path.join(root, 'node_modules', '.bin', 'tsx'),
          [
            'scripts/ai-medium-root-performance.report.ts',
            `--sample-index=${session * repetitions + repetition}`,
            `--out=${samplePath}`,
          ],
          { cwd, stdio: 'inherit' },
        );
        records.push({
          ...JSON.parse(await readFile(samplePath, 'utf8')),
          repetition,
          role,
          session,
        });
      }
    }
  }
} finally {
  try {
    execFileSync('git', ['worktree', 'remove', '--force', baseline], {
      cwd: root,
      stdio: 'ignore',
    });
  } catch {
    await rm(baseline, { force: true, recursive: true });
  }
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function quantile(values, probability) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(probability * sorted.length) - 1)];
}
function roleRecords(role) {
  return records.filter((record) => record.role === role);
}
function metrics(selected) {
  const nps = selected.flatMap((record) =>
    record.decisionSamples.map((sample) => sample.nodesPerSecond),
  );
  const latency = selected.flatMap((record) =>
    record.decisionSamples.map((sample) => sample.elapsedMs),
  );
  const rootPreparation = selected.flatMap(
    (record) => record.rootPreparationMs,
  );
  return {
    decisionP50Ms: quantile(latency, 0.5),
    decisionP95Ms: quantile(latency, 0.95),
    meanNodesPerSecond: mean(nps),
    rootPreparationP95Ms: quantile(rootPreparation, 0.95),
  };
}
const baselineMetrics = metrics(roleRecords('baseline'));
const candidateMetrics = metrics(roleRecords('candidate'));
let randomState = 0x9e3779b9;
function randomIndex(maximum) {
  randomState ^= randomState << 13;
  randomState ^= randomState >>> 17;
  randomState ^= randomState << 5;
  return (randomState >>> 0) % maximum;
}
const blocks = Array.from({ length: sessions * repetitions }, (_, index) => ({
  repetition: index % repetitions,
  session: Math.floor(index / repetitions),
}));
const bootstrap = Array.from({ length: 10_000 }, () => {
  const selectedBlocks = blocks.map(() => blocks[randomIndex(blocks.length)]);
  const select = (role) =>
    selectedBlocks.map((block) =>
      records.find(
        (record) =>
          record.role === role &&
          record.session === block.session &&
          record.repetition === block.repetition,
      ),
    );
  const baselineSample = metrics(select('baseline'));
  const candidateSample = metrics(select('candidate'));
  return {
    npsRatio:
      candidateSample.meanNodesPerSecond / baselineSample.meanNodesPerSecond,
    rootPreparationRatio:
      candidateSample.rootPreparationP95Ms /
      baselineSample.rootPreparationP95Ms,
  };
});
const npsLowerRatio = quantile(
  bootstrap.map((entry) => entry.npsRatio),
  0.05,
);
const rootPreparationUpperRatio = quantile(
  bootstrap.map((entry) => entry.rootPreparationRatio),
  0.95,
);
const report = {
  baseline: { metrics: baselineMetrics, revision: baselineRef },
  candidate: { metrics: candidateMetrics, revision: 'working-tree' },
  gates: {
    npsLowerRatio,
    npsPassed: npsLowerRatio >= 0.9,
    rootPreparationPassed: rootPreparationUpperRatio <= 1.1,
    rootPreparationUpperRatio,
  },
  repetitions,
  sessions,
  version: 1,
};
await writeFile(
  path.join(out, 'report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
await writeFile(
  path.join(out, 'report.md'),
  `# Isolated Medium AI and root preparation\n\n${JSON.stringify(report, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
