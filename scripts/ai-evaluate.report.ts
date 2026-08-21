import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { access, copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {
  AI_EVALUATION_RUN_SCHEMA_VERSION,
  atomicWriteJson,
  atomicWriteText,
  boundedFailureSummary,
  createEvaluationRunId,
  mergeJsonlArtifacts,
  readCheckpoint,
  recordArtifact,
  sha256,
  sha256File,
  verifyCheckpointArtifacts,
  type EvaluationArtifactRecordV1,
  type EvaluationPipelineCheckpointV1,
  type EvaluationRunProgressV1,
} from '@/ai/test/evaluationRun.node';

type Profile = 'full' | 'smoke';

type PipelineDefinition = {
  fixedArtifacts?: string[];
  id: string;
  outSuffixes?: string[];
  performance?: boolean;
  script: string;
  supportsOut?: boolean;
  supportsProfile?: boolean;
};

type ParsedArgs = {
  argsFile: string | null;
  finalizeOnly: boolean;
  outRoot: string;
  pipelines: string[];
  profile: Profile;
  resume: boolean;
  runDirectory: string | null;
  workers: number;
};

type RunManifestV1 = {
  command: string[];
  createdAt: string;
  environment: Record<string, unknown>;
  pipelineArgs: Record<string, string[]>;
  pipelines: Array<{
    args: string[];
    id: string;
    performance: boolean;
    script: string;
  }>;
  profile: Profile;
  protocols: Record<string, number>;
  provenance: Record<string, string>;
  runId: string;
  schemaVersion: 1;
  workers: number;
};

const PIPELINES: Record<string, PipelineDefinition> = Object.fromEntries(
  [
    {
      fixedArtifacts: [
        'output/ai/ai-measurement-report.json',
        'output/ai/ai-measurement-report.md',
        'output/ai/ai-measurement-samples.jsonl',
      ],
      id: 'measure',
      script: 'ai:measure',
      supportsProfile: true,
    },
    {
      fixedArtifacts: [
        'output/ai/ai-competence-report.json',
        'output/ai/ai-competence-report.md',
        'output/ai/ai-competence-samples.jsonl',
      ],
      id: 'competence',
      script: 'ai:competence',
      supportsProfile: true,
    },
    {
      id: 'reference-strength',
      outSuffixes: ['.json', '.md', '.samples.jsonl'],
      script: 'ai:strength',
      supportsOut: true,
      supportsProfile: true,
    },
    {
      id: 'policy-strength',
      outSuffixes: ['.json', '.md', '.samples.jsonl', '.progress.json'],
      script: 'ai:policy-strength',
      supportsOut: true,
      supportsProfile: true,
    },
    {
      id: 'attribution',
      outSuffixes: ['.json', '.md', '.samples.jsonl'],
      script: 'ai:policy-attribution',
      supportsOut: true,
      supportsProfile: true,
    },
    {
      id: 'ablation',
      outSuffixes: ['.json', '.md', '.samples.jsonl'],
      script: 'ai:policy-ablation',
      supportsOut: true,
      supportsProfile: true,
    },
    {
      id: 'counterfactual',
      outSuffixes: ['.json', '.md', '.samples.jsonl'],
      script: 'ai:policy-counterfactual',
      supportsOut: true,
      supportsProfile: true,
    },
    {
      fixedArtifacts: [
        'output/ai/ai-crossplay-report.json',
        'output/ai/ai-crossplay-report.md',
      ],
      id: 'crossplay',
      script: 'ai:crossplay',
    },
    {
      fixedArtifacts: [
        'output/ai/ai-loop-benchmark-report.json',
        'output/ai/ai-loop-benchmark-report.md',
      ],
      id: 'loop-benchmark',
      script: 'ai:loop-benchmark',
    },
    {
      fixedArtifacts: [
        'output/ai/ai-position-buckets-report.json',
        'output/ai/ai-position-buckets-report.md',
      ],
      id: 'position-buckets',
      script: 'ai:position-buckets',
    },
    {
      fixedArtifacts: [
        'output/ai/ai-stage-variety-report.json',
        'output/ai/ai-stage-variety-report.md',
      ],
      id: 'stage-variety',
      script: 'ai:stage-variety',
    },
    {
      fixedArtifacts: [
        'output/ai/ai-threat-report.json',
        'output/ai/ai-threat-report.md',
      ],
      id: 'threat',
      script: 'ai:threat',
    },
    {
      fixedArtifacts: [
        'output/ai/ai-variety-report.json',
        'output/ai/ai-variety-report.md',
      ],
      id: 'variety',
      script: 'ai:variety',
    },
    {
      fixedArtifacts: [
        'output/playwright/perf-report.json',
        'output/playwright/perf-report.md',
        'output/playwright/perf-charts.html',
      ],
      id: 'performance',
      performance: true,
      script: 'perf:report',
    },
    {
      id: 'human-calibration',
      outSuffixes: ['.json', '.md'],
      script: 'ai:human-calibration',
      supportsOut: true,
    },
  ].map((definition) => [definition.id, definition]),
);

function positiveInteger(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive safe integer.`);
  }
  return parsed;
}

function defaultWorkers(): number {
  const parallelism =
    typeof os.availableParallelism === 'function'
      ? os.availableParallelism()
      : os.cpus().length;
  return Math.max(1, Math.min(Math.max(1, parallelism) - 1, 8));
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = new Map<string, string>();
  const allowed = new Set([
    'args-file',
    'finalize-only',
    'out-root',
    'pipelines',
    'profile',
    'resume',
    'run-dir',
    'workers',
  ]);
  for (const entry of argv) {
    if (!entry.startsWith('--')) continue;
    const [key, value = ''] = entry.slice(2).split('=');
    if (!allowed.has(key)) throw new Error(`Unknown argument --${key}.`);
    args.set(key, value);
  }
  const pipelines = (args.get('pipelines') ?? '').split(',').filter(Boolean);
  const profile = (args.get('profile') ?? 'smoke') as Profile;
  if (profile !== 'full' && profile !== 'smoke') {
    throw new Error('--profile must be full or smoke.');
  }
  const runDirectory = args.get('run-dir') ?? null;
  const resume = args.get('resume') === 'true';
  const finalizeOnly = args.get('finalize-only') === 'true';
  if ((resume || finalizeOnly) && !runDirectory) {
    throw new Error('--resume/--finalize-only requires --run-dir.');
  }
  if (!finalizeOnly && !pipelines.length && !runDirectory) {
    throw new Error('--pipelines requires at least one registered pipeline.');
  }
  for (const pipeline of pipelines) {
    if (!PIPELINES[pipeline]) throw new Error(`Unknown pipeline ${pipeline}.`);
  }
  if (pipelines.includes('performance') && pipelines.length !== 1) {
    throw new Error(
      'The performance pipeline must run alone so no evaluation workload shares its benchmark process.',
    );
  }
  return {
    argsFile: args.get('args-file') ?? null,
    finalizeOnly,
    outRoot:
      args.get('out-root') ??
      path.join(process.cwd(), 'output', 'ai', 'evaluation-runs'),
    pipelines,
    profile,
    resume,
    runDirectory,
    workers: args.has('workers')
      ? positiveInteger(args.get('workers') as string, 'workers')
      : defaultWorkers(),
  };
}

function git(args: string[], encoding: BufferEncoding = 'utf8'): string {
  return execFileSync('git', args, {
    cwd: process.cwd(),
    encoding,
    maxBuffer: 64 * 1024 * 1024,
  }) as string;
}

function commandOutput(command: string, args: string[]): string | null {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    }).trim();
  } catch {
    return null;
  }
}

async function optionalFileHash(filePath: string): Promise<string> {
  try {
    return await sha256File(filePath);
  } catch {
    return 'missing';
  }
}

async function collectProvenance(): Promise<{
  environment: Record<string, unknown>;
  provenance: Record<string, string>;
}> {
  const status = git(['status', '--porcelain=v1', '-z']);
  const untracked = status
    .split('\0')
    .filter((entry) => entry.startsWith('?? '))
    .sort()
    .join('\0');
  const archive = execFileSync('git', ['archive', '--format=tar', 'HEAD'], {
    cwd: process.cwd(),
    maxBuffer: 128 * 1024 * 1024,
  });
  const packagePath = path.join(process.cwd(), 'package.json');
  const lockPath = path.join(process.cwd(), 'pnpm-lock.yaml');
  const scriptPath = path.join(
    process.cwd(),
    'scripts',
    'ai-evaluate.report.ts',
  );
  return {
    environment: {
      architecture: os.arch(),
      availableParallelism:
        typeof os.availableParallelism === 'function'
          ? os.availableParallelism()
          : os.cpus().length,
      cpuModels: [...new Set(os.cpus().map((cpu) => cpu.model))],
      logicalCores: os.cpus().length,
      lowPowerAndBattery: commandOutput('pmset', ['-g', 'batt']),
      memoryBytes: os.totalmem(),
      node: process.version,
      platform: `${os.platform()} ${os.release()}`,
      powerConfiguration: commandOutput('pmset', ['-g', 'custom']),
      thermalState: commandOutput('pmset', ['-g', 'therm']),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      typescript: commandOutput(
        path.join(process.cwd(), 'node_modules', '.bin', 'tsc'),
        ['--version'],
      ),
      vite: commandOutput(
        path.join(process.cwd(), 'node_modules', '.bin', 'vite'),
        ['--version'],
      ),
    },
    provenance: {
      archiveSha256: sha256(archive),
      dirtyStatusSha256: sha256(status),
      gitHead: git(['rev-parse', 'HEAD']).trim(),
      gitTree: git(['rev-parse', 'HEAD^{tree}']).trim(),
      lockSha256: await optionalFileHash(lockPath),
      packageSha256: await optionalFileHash(packagePath),
      runnerSha256: await optionalFileHash(scriptPath),
      untrackedManifestSha256: sha256(untracked),
    },
  };
}

async function readPipelineArgs(
  filePath: string | null,
): Promise<Record<string, string[]>> {
  if (!filePath) return {};
  const parsed = JSON.parse(await readFile(filePath, 'utf8')) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('--args-file must contain an object of string arrays.');
  }
  const result: Record<string, string[]> = {};
  for (const [pipeline, value] of Object.entries(parsed)) {
    if (!PIPELINES[pipeline] || !Array.isArray(value)) {
      throw new Error(`Invalid pipeline args entry ${pipeline}.`);
    }
    if (value.some((entry) => typeof entry !== 'string')) {
      throw new Error(`Pipeline args for ${pipeline} must all be strings.`);
    }
    result[pipeline] = value as string[];
  }
  return result;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function checkpointPath(
  runDirectory: string,
  index: number,
  id: string,
): string {
  return path.join(
    runDirectory,
    'checkpoints',
    `${String(index).padStart(3, '0')}-${id}.json`,
  );
}

function shardDirectory(
  runDirectory: string,
  index: number,
  id: string,
): string {
  return path.join(
    runDirectory,
    'shards',
    `${String(index).padStart(3, '0')}-${id}`,
  );
}

async function runCommand(
  script: string,
  args: string[],
  stdoutPath: string,
  stderrPath: string,
): Promise<{ exitCode: number; stderrTail: string; stdoutTail: string }> {
  const child = spawn('npm', ['run', script, '--', ...args], {
    cwd: process.cwd(),
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    const value = String(chunk);
    stdout = boundedFailureSummary(`${stdout}${value}`);
    process.stdout.write(value);
  });
  child.stderr.on('data', (chunk) => {
    const value = String(chunk);
    stderr = boundedFailureSummary(`${stderr}${value}`);
    process.stderr.write(value);
  });
  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) reject(new Error(`${script} exited on signal ${signal}.`));
      else resolve(code ?? 1);
    });
  });
  await Promise.all([
    atomicWriteText(stdoutPath, stdout),
    atomicWriteText(stderrPath, stderr),
  ]);
  return { exitCode, stderrTail: stderr, stdoutTail: stdout };
}

function buildPipelineArgs(
  definition: PipelineDefinition,
  profile: Profile,
  workers: number,
  shardDir: string,
  extra: string[],
): { args: string[]; outputPrefix: string | null } {
  const args = [...extra];
  if (
    definition.supportsProfile &&
    !args.some((entry) => entry.startsWith('--profile='))
  ) {
    args.push(`--profile=${profile}`);
  }
  const outputPrefix = definition.supportsOut
    ? path.join(shardDir, 'result')
    : null;
  if (outputPrefix && !args.some((entry) => entry.startsWith('--out='))) {
    args.push(`--out=${outputPrefix}`);
  }
  if (
    definition.id === 'policy-strength' &&
    !args.some((entry) => entry.startsWith('--workers='))
  ) {
    args.push(`--workers=${workers}`);
  }
  return { args, outputPrefix };
}

async function collectPipelineArtifacts(
  definition: PipelineDefinition,
  outputPrefix: string | null,
  runDirectory: string,
  shardDir: string,
  startedAtMs: number,
): Promise<EvaluationArtifactRecordV1[]> {
  const artifacts: EvaluationArtifactRecordV1[] = [];
  if (definition.supportsOut && outputPrefix) {
    for (const suffix of definition.outSuffixes ?? []) {
      const filePath = `${outputPrefix}${suffix}`;
      if (!(await exists(filePath))) {
        throw new Error(`${definition.id} did not produce ${filePath}.`);
      }
      artifacts.push(await recordArtifact(runDirectory, filePath));
    }
    return artifacts;
  }
  const artifactDir = path.join(shardDir, 'artifacts');
  await mkdir(artifactDir, { recursive: true });
  for (const relativeSource of definition.fixedArtifacts ?? []) {
    const source = path.join(process.cwd(), relativeSource);
    const sourceStat = await stat(source);
    if (sourceStat.mtimeMs + 1_000 < startedAtMs) {
      throw new Error(
        `${definition.id} artifact was not refreshed: ${relativeSource}.`,
      );
    }
    const destination = path.join(artifactDir, path.basename(source));
    await copyFile(source, destination);
    artifacts.push(await recordArtifact(runDirectory, destination));
  }
  return artifacts;
}

function manifestIdentity(manifest: RunManifestV1): string {
  return sha256(
    JSON.stringify({
      pipelineArgs: manifest.pipelineArgs,
      pipelines: manifest.pipelines,
      profile: manifest.profile,
      protocols: manifest.protocols,
      provenance: manifest.provenance,
      schemaVersion: manifest.schemaVersion,
      workers: manifest.workers,
    }),
  );
}

async function finalizeRun(
  runDirectory: string,
  manifest: RunManifestV1,
): Promise<void> {
  const finalizationPath = path.join(
    runDirectory,
    'state',
    'finalization.json',
  );
  await atomicWriteJson(finalizationPath, {
    manifestIdentity: manifestIdentity(manifest),
    startedAt: new Date().toISOString(),
    status: 'finalizing',
  });
  const checkpoints: EvaluationPipelineCheckpointV1[] = [];
  for (let index = 0; index < manifest.pipelines.length; index += 1) {
    const pipeline = manifest.pipelines[index];
    const checkpoint = await readCheckpoint(
      checkpointPath(runDirectory, index, pipeline.id),
    );
    if (checkpoint.pipelineId !== pipeline.id) {
      throw new Error(`Checkpoint identity mismatch for ${pipeline.id}.`);
    }
    await verifyCheckpointArtifacts(runDirectory, checkpoint);
    checkpoints.push(checkpoint);
  }
  const rawArtifacts = checkpoints.flatMap((checkpoint) =>
    checkpoint.artifacts
      .filter((record) => record.kind === 'jsonl')
      .map((record) => ({ pipelineId: checkpoint.pipelineId, record })),
  );
  const mergedPath = path.join(runDirectory, 'merged', 'samples.jsonl');
  const merged = rawArtifacts.length
    ? await mergeJsonlArtifacts({
        artifacts: rawArtifacts,
        outputPath: mergedPath,
        runDirectory,
      })
    : { lineCount: 0, sha256: sha256('') };
  const decision = {
    completedAt: new Date().toISOString(),
    manifestIdentity: manifestIdentity(manifest),
    merged,
    note: 'Pipeline completion is not an efficacy verdict; inspect each versioned report.',
    pipelines: checkpoints.map((checkpoint) => ({
      artifactCount: checkpoint.artifacts.length,
      exitCode: checkpoint.exitCode,
      id: checkpoint.pipelineId,
      status: 'complete',
    })),
    runId: manifest.runId,
    schemaVersion: AI_EVALUATION_RUN_SCHEMA_VERSION,
    state: 'complete',
  };
  await atomicWriteJson(path.join(runDirectory, 'decision.json'), decision);
  await atomicWriteText(
    path.join(runDirectory, 'report.md'),
    [
      '# Unified AI Evaluation Run',
      '',
      `Run: \`${manifest.runId}\``,
      '',
      `Profile: **${manifest.profile}**`,
      '',
      `Merged raw samples: ${merged.lineCount}; SHA-256 \`${merged.sha256}\`.`,
      '',
      '| Pipeline | Exit | Artifacts |',
      '| --- | ---: | ---: |',
      ...checkpoints.map(
        (checkpoint) =>
          `| ${checkpoint.pipelineId} | ${checkpoint.exitCode} | ${checkpoint.artifacts.length} |`,
      ),
      '',
      'Completion verifies execution and artifacts only. Each pipeline owns its scientific verdict.',
      '',
    ].join('\n'),
  );
  await atomicWriteJson(finalizationPath, {
    completedAt: new Date().toISOString(),
    decisionSha256: await sha256File(path.join(runDirectory, 'decision.json')),
    manifestIdentity: manifestIdentity(manifest),
    merged,
    status: 'complete',
  });
  const progress: EvaluationRunProgressV1 = {
    completedPipelineCount: checkpoints.length,
    failedPipelineCount: 0,
    plannedPipelineCount: manifest.pipelines.length,
    schemaVersion: AI_EVALUATION_RUN_SCHEMA_VERSION,
    state: 'complete',
    updatedAt: new Date().toISOString(),
  };
  await atomicWriteJson(
    path.join(runDirectory, 'state', 'progress.json'),
    progress,
  );
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  const providedPipelineArgs = await readPipelineArgs(parsed.argsFile);
  let runDirectory: string;
  let manifest: RunManifestV1;

  if (parsed.runDirectory) {
    runDirectory = path.resolve(parsed.runDirectory);
    manifest = JSON.parse(
      await readFile(path.join(runDirectory, 'manifest.json'), 'utf8'),
    ) as RunManifestV1;
    if (manifest.schemaVersion !== AI_EVALUATION_RUN_SCHEMA_VERSION) {
      throw new Error('Run manifest uses an unsupported schema.');
    }
    const current = await collectProvenance();
    if (
      current.provenance.gitHead !== manifest.provenance.gitHead ||
      current.provenance.gitTree !== manifest.provenance.gitTree ||
      current.provenance.dirtyStatusSha256 !==
        manifest.provenance.dirtyStatusSha256
    ) {
      throw new Error(
        'Current repository identity does not match the resumable run.',
      );
    }
  } else {
    const runId = createEvaluationRunId();
    const outRoot = path.resolve(parsed.outRoot);
    await mkdir(outRoot, { recursive: true });
    runDirectory = path.join(outRoot, runId);
    await mkdir(runDirectory, { recursive: false });
    const collected = await collectProvenance();
    const pipelineArgs = Object.fromEntries(
      parsed.pipelines.map((id) => [id, providedPipelineArgs[id] ?? []]),
    );
    const pipelines = parsed.pipelines.map((id, index) => {
      const definition = PIPELINES[id];
      const shardDir = shardDirectory(runDirectory, index, id);
      const built = buildPipelineArgs(
        definition,
        parsed.profile,
        parsed.workers,
        shardDir,
        pipelineArgs[id],
      );
      pipelineArgs[id] = built.args;
      return {
        args: built.args,
        id,
        performance: definition.performance ?? false,
        script: definition.script,
      };
    });
    manifest = {
      command: process.argv,
      createdAt: new Date().toISOString(),
      environment: collected.environment,
      pipelineArgs,
      pipelines,
      profile: parsed.profile,
      protocols: {
        adjudication: 1,
        budgetSemantics: 1,
        evaluationRun: AI_EVALUATION_RUN_SCHEMA_VERSION,
        policyAttribution: 1,
        policyStrength: 1,
      },
      provenance: collected.provenance,
      runId,
      schemaVersion: AI_EVALUATION_RUN_SCHEMA_VERSION,
      workers: parsed.workers,
    };
    await atomicWriteJson(path.join(runDirectory, 'manifest.json'), manifest);
  }

  if (parsed.finalizeOnly) {
    await finalizeRun(runDirectory, manifest);
    process.stdout.write(`Finalized ${runDirectory}\n`);
    return;
  }

  const progressPath = path.join(runDirectory, 'state', 'progress.json');
  let completed = 0;
  const durations: number[] = [];
  for (let index = 0; index < manifest.pipelines.length; index += 1) {
    const planned = manifest.pipelines[index];
    const definition = PIPELINES[planned.id];
    const checkpointFile = checkpointPath(runDirectory, index, planned.id);
    if (parsed.resume && (await exists(checkpointFile))) {
      const checkpoint = await readCheckpoint(checkpointFile);
      await verifyCheckpointArtifacts(runDirectory, checkpoint);
      completed += 1;
      continue;
    }
    const shardDir = shardDirectory(runDirectory, index, planned.id);
    await mkdir(shardDir, { recursive: true });
    const workerPath = path.join(
      runDirectory,
      'workers',
      `${String(index).padStart(3, '0')}-${planned.id}.json`,
    );
    const startedAt = Date.now();
    await atomicWriteJson(workerPath, {
      args: planned.args,
      pipelineId: planned.id,
      script: planned.script,
      startedAt: new Date(startedAt).toISOString(),
      status: 'running',
    });
    try {
      const execution = await runCommand(
        planned.script,
        planned.args,
        path.join(shardDir, 'stdout.log'),
        path.join(shardDir, 'stderr.log'),
      );
      const outputPrefix = definition.supportsOut
        ? (planned.args
            .find((entry) => entry.startsWith('--out='))
            ?.slice('--out='.length) ?? null)
        : null;
      const artifacts = await collectPipelineArtifacts(
        definition,
        outputPrefix,
        runDirectory,
        shardDir,
        startedAt,
      );
      const checkpoint: EvaluationPipelineCheckpointV1 = {
        artifacts,
        completedAt: new Date().toISOString(),
        exitCode: execution.exitCode,
        pipelineId: planned.id,
        schemaVersion: AI_EVALUATION_RUN_SCHEMA_VERSION,
        status: 'complete',
      };
      await atomicWriteJson(checkpointFile, checkpoint);
      await atomicWriteJson(workerPath, {
        ...checkpoint,
        stderrTail: execution.stderrTail,
        stdoutTail: execution.stdoutTail,
      });
      completed += 1;
      durations.push(Date.now() - startedAt);
    } catch (error) {
      await atomicWriteJson(workerPath, {
        completedAt: new Date().toISOString(),
        error:
          error instanceof Error
            ? (error.stack ?? error.message)
            : String(error),
        pipelineId: planned.id,
        status: 'failed',
      });
      const failedProgress: EvaluationRunProgressV1 = {
        completedPipelineCount: completed,
        failedPipelineCount: 1,
        plannedPipelineCount: manifest.pipelines.length,
        schemaVersion: AI_EVALUATION_RUN_SCHEMA_VERSION,
        state: 'failed',
        updatedAt: new Date().toISOString(),
      };
      await atomicWriteJson(progressPath, failedProgress);
      throw error;
    }
    const averageDuration =
      durations.reduce((sum, duration) => sum + duration, 0) /
      Math.max(1, durations.length);
    await atomicWriteJson(progressPath, {
      completedPipelineCount: completed,
      estimatedRemainingMs:
        averageDuration * (manifest.pipelines.length - completed),
      failedPipelineCount: 0,
      plannedPipelineCount: manifest.pipelines.length,
      schemaVersion: AI_EVALUATION_RUN_SCHEMA_VERSION,
      state: 'incomplete',
      throughputPipelinesPerHour: 3_600_000 / averageDuration,
      updatedAt: new Date().toISOString(),
    });
  }

  await finalizeRun(runDirectory, manifest);
  process.stdout.write(`Unified AI evaluation complete: ${runDirectory}\n`);
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
