import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';

import {
  assertCompatibleReports,
  buildExperimentSummary,
  buildPairedSchedule,
  normalizeDomainReport,
  normalizeFullReport,
  parsePerfAbArgs,
} from './perf-ab-core.mjs';

const rootDir = process.cwd();

function runCommand(command, args, { cwd = rootDir, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    let stdout = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      const wallTimeMs = performance.now() - startedAt;

      if (code === 0) {
        resolve({ stderr, stdout, wallTimeMs });
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(' ')} exited with code ${code}\n${stderr || stdout}`,
        ),
      );
    });
  });
}

async function resolveCommit(ref) {
  if (ref.startsWith('-')) {
    throw new Error(`Unsafe Git ref: ${ref}`);
  }

  const result = await runCommand('git', [
    'rev-parse',
    '--verify',
    `${ref}^{commit}`,
  ]);

  return result.stdout.trim();
}

async function readGitFile(commit, filePath) {
  const result = await runCommand('git', ['show', `${commit}:${filePath}`]);
  return result.stdout;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function safeLabel(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 48);
}

async function prepareWorkspace(label, commit) {
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), `youi-perf-ab-${label}-`),
  );

  try {
    await runCommand('git', ['worktree', 'add', '--detach', workspace, commit]);
    await symlink(
      path.join(rootDir, 'node_modules'),
      path.join(workspace, 'node_modules'),
      'dir',
    );
    await Promise.all([
      access(path.join(workspace, 'package.json')),
      access(path.join(workspace, 'scripts', 'domainPerformance.report.ts')),
    ]);

    return workspace;
  } catch (error) {
    await cleanupWorkspace(workspace);
    throw error;
  }
}

async function cleanupWorkspace(workspace) {
  try {
    await runCommand('git', ['worktree', 'remove', '--force', workspace]);
  } catch {
    await rm(workspace, { force: true, recursive: true });
  }
}

async function writeLog(outputDir, name, result) {
  const logPath = path.join(outputDir, 'logs', `${name}.log`);
  await mkdir(path.dirname(logPath), { recursive: true });
  await writeFile(
    logPath,
    [
      `wallTimeMs=${Math.round(result.wallTimeMs * 100) / 100}`,
      '',
      result.stdout,
      result.stderr,
    ].join('\n'),
    'utf8',
  );

  return path.relative(rootDir, logPath);
}

async function validateWorkspace(label, workspace, options, outputDir) {
  const validation = {};

  if (!options.skipBuild) {
    const build = await runCommand('pnpm', ['build'], { cwd: workspace });
    validation.build = {
      log: await writeLog(outputDir, `${label}-build`, build),
      wallTimeMs: Math.round(build.wallTimeMs * 100) / 100,
    };
  }

  if (!options.skipValidation) {
    const tests = await runCommand(
      'pnpm',
      [
        'exec',
        'vitest',
        'run',
        '--exclude',
        'src/ai/test/perf.benchmark.test.ts',
      ],
      { cwd: workspace },
    );
    validation.tests = {
      log: await writeLog(outputDir, `${label}-tests`, tests),
      wallTimeMs: Math.round(tests.wallTimeMs * 100) / 100,
    };
  }

  const status = await runCommand(
    'git',
    ['status', '--porcelain', '--untracked-files=no'],
    { cwd: workspace },
  );

  if (status.stdout.trim()) {
    throw new Error(
      `${label} workspace modified tracked files during validation:\n${status.stdout}`,
    );
  }

  return validation;
}

function normalizeReport(pipeline, report) {
  return pipeline === 'full'
    ? normalizeFullReport(report)
    : normalizeDomainReport(report);
}

async function collectReport({
  artifactPath,
  label,
  options,
  pairIndex,
  phase,
  workspace,
}) {
  const temporaryOutput = path.join(
    workspace,
    'output',
    'perf-ab',
    `${phase}-${pairIndex}-${label}.json`,
  );
  await mkdir(path.dirname(temporaryOutput), { recursive: true });
  await rm(temporaryOutput, { force: true });

  let commandResult;
  let sourcePath = temporaryOutput;

  if (options.pipeline === 'full') {
    sourcePath = path.join(
      workspace,
      'output',
      'playwright',
      'perf-report.json',
    );
    await rm(sourcePath, { force: true });
    commandResult = await runCommand('node', ['scripts/perf-report.mjs'], {
      cwd: workspace,
      env: {
        ...process.env,
        WMBL_ROOT_ORDER_BENCH_ITERS: String(options.rootOrderingIterations),
      },
    });
  } else {
    commandResult = await runCommand(
      'pnpm',
      [
        'exec',
        'vitest',
        'run',
        '--config',
        'scripts/vitest.perf.config.ts',
        'scripts/domainPerformance.report.ts',
      ],
      {
        cwd: workspace,
        env: {
          ...process.env,
          WMBL_DOMAIN_PERF_OUTPUT: temporaryOutput,
          WMBL_PERF_REPORT: '1',
          WMBL_ROOT_ORDER_BENCH_ITERS: String(options.rootOrderingIterations),
        },
      },
    );
  }

  const report = JSON.parse(await readFile(sourcePath, 'utf8'));
  const normalized = normalizeReport(options.pipeline, report);
  const artifact = {
    collection: {
      label,
      pairIndex,
      phase,
      wallTimeMs: Math.round(commandResult.wallTimeMs * 100) / 100,
    },
    normalized,
    report,
  };

  if (artifactPath) {
    await mkdir(path.dirname(artifactPath), { recursive: true });
    await writeFile(
      artifactPath,
      `${JSON.stringify(artifact, null, 2)}\n`,
      'utf8',
    );
  }

  return artifact;
}

function buildMarkdown(experiment) {
  const lines = [
    '# Paired Performance A/B Report',
    '',
    `- Verdict: **${experiment.summary.overallVerdict}**`,
    `- Baseline: \`${experiment.revisions.baseline.ref}\` (\`${experiment.revisions.baseline.commit}\`)`,
    `- Candidate: \`${experiment.revisions.candidate.ref}\` (\`${experiment.revisions.candidate.commit}\`)`,
    `- Pipeline: \`${experiment.config.pipeline}\``,
    `- Paired samples: ${experiment.config.pairCount}`,
    `- Materiality threshold: ${experiment.config.minimumImprovementPercent}%`,
    `- Workload: \`${experiment.contract.workloadId}\``,
    '',
    'Positive improvement percentages mean the candidate moved in the desired direction.',
    '',
    '## Decision metrics',
    '',
    '| metric | baseline median | candidate median | paired improvement | 95% CI | verdict |',
    '| --- | ---: | ---: | ---: | ---: | --- |',
  ];
  const metrics = Object.entries(experiment.summary.metrics);
  const decisionMetrics = metrics.filter(
    ([, metric]) => metric.role === 'decision',
  );

  for (const [name, metric] of decisionMetrics) {
    lines.push(
      `| ${name} | ${metric.baselineMedian} ${metric.unit} | ${metric.candidateMedian} ${metric.unit} | ${metric.medianImprovementPercent}% | ${metric.confidenceIntervalPercent.low}%…${metric.confidenceIntervalPercent.high}% | ${metric.verdict} |`,
    );
  }

  lines.push('', '## Guardrails', '');
  lines.push(
    `- Legal-action fixture identity: passed across all ${experiment.config.pairCount} pairs.`,
  );
  lines.push(
    `- Completed-depth quality: ${experiment.summary.qualityGuardrails.passed ? 'passed' : 'failed'}.`,
  );

  for (const violation of experiment.summary.qualityGuardrails.violations) {
    lines.push(
      `- Regression: ${violation.key} ${violation.metric} ${violation.baselineMedian} → ${violation.candidateMedian}.`,
    );
  }

  lines.push('', '## All metrics', '');
  lines.push(
    '| metric | role | baseline median | candidate median | verdict |',
  );
  lines.push('| --- | --- | ---: | ---: | --- |');

  for (const [name, metric] of metrics) {
    lines.push(
      `| ${name} | ${metric.role} | ${metric.baselineMedian} ${metric.unit} | ${metric.candidateMedian} ${metric.unit} | ${metric.verdict} |`,
    );
  }

  lines.push(
    '',
    '## Interpretation limits',
    '',
    '- This report proves only the recorded revisions, workload, environment, and pipeline.',
    '- Time-budgeted AI latency is diagnostic; hard-mode nodes/second is the decision metric.',
    '- Selected AI actions are retained as observations but may change when a faster search completes more work.',
    '- Raw reports, command logs, schedule, and environment metadata are preserved beside this file.',
    '',
  );

  return lines.join('\n');
}

async function getEnvironmentMetadata() {
  const pnpm = await runCommand('pnpm', ['--version']);
  const cpus = os.cpus();

  return {
    architecture: os.arch(),
    cpuCount: cpus.length,
    cpuModel: cpus[0]?.model ?? 'unknown',
    node: process.version,
    platform: os.platform(),
    pnpm: pnpm.stdout.trim(),
    release: os.release(),
    totalMemoryBytes: os.totalmem(),
  };
}

async function main() {
  const options = parsePerfAbArgs(process.argv.slice(2));
  const [baselineCommit, candidateCommit] = await Promise.all([
    resolveCommit(options.baseline),
    resolveCommit(options.candidate),
  ]);

  if (baselineCommit === candidateCommit) {
    throw new Error('Baseline and candidate refs resolve to the same commit.');
  }

  const [baselineLockfile, candidateLockfile] = await Promise.all([
    readGitFile(baselineCommit, 'pnpm-lock.yaml'),
    readGitFile(candidateCommit, 'pnpm-lock.yaml'),
  ]);
  const baselineLockHash = sha256(baselineLockfile);
  const candidateLockHash = sha256(candidateLockfile);

  if (baselineLockHash !== candidateLockHash) {
    throw new Error(
      'pnpm-lock.yaml differs between revisions; dependency drift would confound this A/B run.',
    );
  }

  const schedule = buildPairedSchedule(options.pairCount);
  const resolved = {
    config: options,
    revisions: {
      baseline: { commit: baselineCommit, ref: options.baseline },
      candidate: { commit: candidateCommit, ref: options.candidate },
    },
    schedule,
  };

  if (options.dryRun) {
    process.stdout.write(`${JSON.stringify(resolved, null, 2)}\n`);
    return;
  }

  const runId = [
    safeLabel(options.baseline),
    baselineCommit.slice(0, 8),
    'vs',
    safeLabel(options.candidate),
    candidateCommit.slice(0, 8),
    new Date().toISOString().replace(/[:.]/g, '-'),
  ].join('-');
  const outputDir = path.resolve(rootDir, options.outputDir, runId);
  await mkdir(outputDir, { recursive: true });

  let baselineWorkspace;
  let candidateWorkspace;

  try {
    baselineWorkspace = await prepareWorkspace('baseline', baselineCommit);
    candidateWorkspace = await prepareWorkspace('candidate', candidateCommit);

    const validation = {
      baseline: await validateWorkspace(
        'baseline',
        baselineWorkspace,
        options,
        outputDir,
      ),
      candidate: await validateWorkspace(
        'candidate',
        candidateWorkspace,
        options,
        outputDir,
      ),
    };

    await collectReport({
      artifactPath: path.join(outputDir, 'warmup', 'baseline.json'),
      label: 'baseline',
      options,
      pairIndex: -1,
      phase: 'warmup',
      workspace: baselineWorkspace,
    });
    await collectReport({
      artifactPath: path.join(outputDir, 'warmup', 'candidate.json'),
      label: 'candidate',
      options,
      pairIndex: -1,
      phase: 'warmup',
      workspace: candidateWorkspace,
    });

    const pairs = [];
    const rawArtifacts = [];

    for (const scheduledPair of schedule) {
      const pair = {};

      for (const label of scheduledPair.order) {
        const workspace =
          label === 'baseline' ? baselineWorkspace : candidateWorkspace;
        const artifactPath = path.join(
          outputDir,
          'raw',
          `pair-${String(scheduledPair.pairIndex + 1).padStart(2, '0')}-${label}.json`,
        );
        const artifact = await collectReport({
          artifactPath,
          label,
          options,
          pairIndex: scheduledPair.pairIndex,
          phase: 'measured',
          workspace,
        });
        pair[label] = artifact.normalized;
        rawArtifacts.push(path.relative(rootDir, artifactPath));
      }

      assertCompatibleReports(pair.baseline, pair.candidate);
      pairs.push(pair);
    }

    const summary = buildExperimentSummary(pairs, options);
    const experiment = {
      ...resolved,
      config: {
        ...options,
        lockfileSha256: baselineLockHash,
      },
      contract: pairs[0].baseline.contract,
      environment: await getEnvironmentMetadata(),
      generatedAt: new Date().toISOString(),
      rawArtifacts,
      summary,
      validation,
    };

    await writeFile(
      path.join(outputDir, 'experiment.json'),
      `${JSON.stringify(experiment, null, 2)}\n`,
      'utf8',
    );
    await writeFile(
      path.join(outputDir, 'report.md'),
      `${buildMarkdown(experiment)}\n`,
      'utf8',
    );

    process.stdout.write(
      `${summary.overallVerdict}: ${path.relative(rootDir, path.join(outputDir, 'report.md'))}\n`,
    );

    if (summary.overallVerdict === 'regression') {
      process.exitCode = 2;
    }
  } finally {
    if (candidateWorkspace) {
      await cleanupWorkspace(candidateWorkspace);
    }
    if (baselineWorkspace) {
      await cleanupWorkspace(baselineWorkspace);
    }
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
