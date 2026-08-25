import { createHash } from 'node:crypto';
import { execFileSync, fork, type ChildProcess } from 'node:child_process';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import allocationFile from '@/ai/test/fixtures/ai-policy-strength-allocation.json';
import protocolFile from '@/ai/test/fixtures/ai-policy-strength-protocol.json';
import { fingerprintLegacyPolicyV0 } from '@/ai/test/legacyPolicyV0.node';
import type { PolicyMatchPair } from '@/ai/test/policyMatch';
import {
  enumeratePolicyStrengthBlockJobs,
  mergePolicyStrengthBlockPairs,
  parsePolicyStrengthCheckpoint,
  POLICY_STRENGTH_CHECKPOINT_SCHEMA_VERSION,
  selectPolicyStrengthWorkerCount,
  type PolicyStrengthCheckpoint,
  type PolicyStrengthJob,
  type PolicyStrengthWorkerJob,
  type PolicyStrengthWorkerRequest,
  type PolicyStrengthWorkerResponse,
} from '@/ai/test/policyStrengthCampaign';
import { loadCurrentAiPolicy } from '@/ai/test/policyProvenance.node';
import {
  evaluateSequentialStrength,
  type SequentialStrengthConfig,
  type StrengthQuestion,
} from '@/ai/test/policyStrengthProtocol';
import {
  expandStrengthFixtureSymmetry,
  type StrengthFixture,
} from '@/ai/test/referenceStrength';
import { STRENGTH_ADJUDICATION_VERSION } from '@/ai/test/strengthOutcome';
import { hashPosition, withRuleDefaults } from '@/domain';
import type { AiDifficulty } from '@/shared/types/session';

import {
  POSITION_BUCKET_SCENARIOS,
  buildScenarioState,
} from './aiScenarioCatalog';

export const AI_POLICY_STRENGTH_SCHEMA_VERSION = 1 as const;
export const FIXED_NODE_BUDGET_SEMANTICS_VERSION = 1 as const;

type Profile = 'full' | 'smoke';

type Settings = {
  alpha: number;
  beta: number;
  difficulty: AiDifficulty;
  enforceGate: boolean;
  margin: number;
  maxBlocks: number;
  maxPlies: number;
  minBlocks: number;
  nodeBudget: number;
  profile: Profile;
  question: StrengthQuestion;
  scenarioLimit: number;
};

type ExecutionSettings = {
  requestedWorkers?: number;
  resume: boolean;
};

type PolicyWorker = {
  child: ChildProcess;
  index: number;
};

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function parsePositiveInteger(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive safe integer.`);
  }
  return parsed;
}

function parseProbability(value: string, name: string): number {
  const parsed = Number(value);
  if (!(parsed > 0 && parsed < 1)) {
    throw new Error(`--${name} must be strictly between zero and one.`);
  }
  return parsed;
}

function parseArgs(argv: string[]): {
  execution: ExecutionSettings;
  out: string;
  settings: Settings;
} {
  const allowed = new Set([
    'alpha',
    'beta',
    'difficulty',
    'enforce-gate',
    'margin',
    'max-blocks',
    'max-plies',
    'min-blocks',
    'nodes',
    'out',
    'profile',
    'question',
    'resume',
    'scenario-limit',
    'workers',
  ]);
  const args = new Map<string, string>();
  for (const entry of argv) {
    if (!entry.startsWith('--')) continue;
    const [key, value = ''] = entry.slice(2).split('=');
    if (!allowed.has(key)) throw new Error(`Unknown argument --${key}.`);
    args.set(key, value);
  }
  const profile = (args.get('profile') ?? 'smoke') as Profile;
  if (profile !== 'full' && profile !== 'smoke') {
    throw new Error('--profile must be full or smoke.');
  }
  const question = (args.get('question') ??
    (profile === 'full'
      ? protocolFile.primary.question
      : 'nonInferiority')) as StrengthQuestion;
  if (!['equivalence', 'nonInferiority', 'superiority'].includes(question)) {
    throw new Error(
      '--question must be equivalence, nonInferiority, or superiority.',
    );
  }
  const difficulty = (args.get('difficulty') ??
    protocolFile.search.difficulty) as AiDifficulty;
  if (!['easy', 'medium', 'hard'].includes(difficulty)) {
    throw new Error('--difficulty must be easy, medium, or hard.');
  }
  const holdoutCount = POSITION_BUCKET_SCENARIOS.filter(
    (scenario) => scenario.strengthSplit === 'holdout',
  ).length;
  const maxBlocks = parsePositiveInteger(
    args.get('max-blocks') ??
      (profile === 'full'
        ? String(protocolFile.sampling.maxBalancedBlocks)
        : '1'),
    'max-blocks',
  );
  const minBlocks = parsePositiveInteger(
    args.get('min-blocks') ??
      (profile === 'full'
        ? String(protocolFile.sampling.minBalancedBlocks)
        : '1'),
    'min-blocks',
  );
  if (minBlocks > maxBlocks) {
    throw new Error('--min-blocks cannot exceed --max-blocks.');
  }

  return {
    execution: {
      ...(args.has('workers')
        ? {
            requestedWorkers: parsePositiveInteger(
              args.get('workers') as string,
              'workers',
            ),
          }
        : {}),
      resume: args.get('resume') === 'true',
    },
    out:
      args.get('out') ??
      path.join(process.cwd(), 'output', 'ai', 'ai-policy-strength'),
    settings: {
      alpha: parseProbability(
        args.get('alpha') ?? String(protocolFile.primary.alpha),
        'alpha',
      ),
      beta: parseProbability(
        args.get('beta') ?? String(protocolFile.primary.beta),
        'beta',
      ),
      difficulty,
      enforceGate: args.get('enforce-gate') === 'true',
      margin: parseProbability(
        args.get('margin') ?? String(protocolFile.primary.margin),
        'margin',
      ),
      maxBlocks,
      maxPlies: parsePositiveInteger(
        args.get('max-plies') ??
          (profile === 'full'
            ? String(protocolFile.primary.horizonPlies)
            : '4'),
        'max-plies',
      ),
      minBlocks,
      nodeBudget: parsePositiveInteger(
        args.get('nodes') ??
          (profile === 'full'
            ? String(protocolFile.search.fixedNodeBudget)
            : '32'),
        'nodes',
      ),
      profile,
      question,
      scenarioLimit: parsePositiveInteger(
        args.get('scenario-limit') ??
          String(profile === 'full' ? holdoutCount : 1),
        'scenario-limit',
      ),
    },
  };
}

function buildFixtures(settings: Settings): StrengthFixture[] {
  const ruleConfig = withRuleDefaults({
    drawRule: 'threefold',
    scoringMode: 'off',
  });
  return POSITION_BUCKET_SCENARIOS.filter(
    (scenario) => scenario.strengthSplit === 'holdout',
  )
    .slice(0, settings.scenarioLimit)
    .flatMap((scenario) =>
      expandStrengthFixtureSymmetry({
        bucket: scenario.bucket,
        id: scenario.label,
        mirror: 'original',
        origin: scenario.randomPlay
          ? 'randomLegal'
          : scenario.turnCount === 0
            ? 'initial'
            : 'syntheticLoop',
        split: scenario.strengthSplit,
        state: buildScenarioState(scenario, ruleConfig),
      }),
    );
}

async function fingerprintFiles(files: string[]): Promise<string> {
  const contents = await Promise.all(
    files
      .sort()
      .map(async (file) => `${file}\0${await readFile(file, 'utf8')}`),
  );
  return sha256(contents.join('\0'));
}

function gitFiles(directory: string): string[] {
  return execFileSync('git', ['ls-files', directory], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .map((file) => path.join(process.cwd(), file));
}

function gitRevision(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
}

function markdown(report: {
  execution: {
    campaignId: string;
    elapsedMs: number;
    resumedPairCount: number;
    workerCount: number;
  };
  primary: ReturnType<typeof evaluateSequentialStrength>;
  provenance: {
    currentPolicyHash: string;
    domainHash: string;
    harnessHash: string;
    legacyPolicyHash: string;
  };
  settings: Settings;
}): string {
  const { primary } = report;
  return [
    '# Current AI vs LegacyPolicyV0 Strength',
    '',
    `Primary question: **${report.settings.question}**; verdict: **${primary.verdict}**.`,
    '',
    `Fixed-horizon pentanomial point share: ${primary.meanPointShare ?? 'n/a'} over ${primary.pairCount} color-swapped pairs.`,
    '',
    `LLR: ${primary.llr ?? 'not evaluated'}; secondary LLR: ${primary.secondaryLlr ?? 'n/a'}; Wald bounds: ${primary.bounds.lower} .. ${primary.bounds.upper}.`,
    '',
    `Balanced block: ${primary.balancedBlock ?? 'incomplete'}; fixed horizon: ${report.settings.maxPlies} plies; fixed-node budget: ${report.settings.nodeBudget}.`,
    '',
    `Execution: ${report.execution.workerCount} workers; ${report.execution.resumedPairCount} resumed pairs; ${(report.execution.elapsedMs / 60_000).toFixed(1)} minutes.`,
    '',
    `Campaign: \`${report.execution.campaignId}\``,
    '',
    `Current policy: \`${report.provenance.currentPolicyHash}\``,
    '',
    `Legacy policy: \`${report.provenance.legacyPolicyHash}\``,
    '',
    `Domain: \`${report.provenance.domainHash}\``,
    '',
    `Harness: \`${report.provenance.harnessHash}\``,
    '',
    'Natural resolution remains secondary; unfinished games are resolved only by the versioned symmetric domain adjudicator for the declared primary endpoint.',
    '',
  ].join('\n');
}

function isAcceptVerdict(verdict: string): boolean {
  return verdict.startsWith('accept');
}

function isTerminalVerdict(verdict: string): boolean {
  return verdict !== 'continue';
}

let temporaryWriteSequence = 0;

async function atomicWriteFile(
  filePath: string,
  payload: string,
): Promise<void> {
  temporaryWriteSequence += 1;
  const temporaryPath = `${filePath}.${process.pid}.${temporaryWriteSequence}.tmp`;
  await writeFile(temporaryPath, payload, 'utf8');
  await rename(temporaryPath, filePath);
}

function checkpointPath(checkpointDir: string, job: PolicyStrengthJob): string {
  return path.join(checkpointDir, `${sha256(job.pairId)}.json`);
}

async function readCheckpoint(
  checkpointDir: string,
  campaignId: string,
  job: PolicyStrengthJob,
): Promise<PolicyMatchPair | null> {
  try {
    return parsePolicyStrengthCheckpoint(
      await readFile(checkpointPath(checkpointDir, job), 'utf8'),
      campaignId,
      job,
    ).pair;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function writeCheckpoint(
  checkpointDir: string,
  campaignId: string,
  job: PolicyStrengthJob,
  pair: PolicyMatchPair,
): Promise<void> {
  const checkpoint: PolicyStrengthCheckpoint = {
    campaignId,
    job,
    pair,
    schemaVersion: POLICY_STRENGTH_CHECKPOINT_SCHEMA_VERSION,
  };
  await atomicWriteFile(
    checkpointPath(checkpointDir, job),
    `${JSON.stringify(checkpoint)}\n`,
  );
}

function workerFailure(message: PolicyStrengthWorkerResponse): Error {
  return new Error(
    message.type === 'error'
      ? message.error
      : `Unexpected policy-strength worker message ${message.type}.`,
  );
}

async function spawnPolicyWorker({
  currentPolicyHash,
  index,
  legacyPolicyHash,
}: {
  currentPolicyHash: string;
  index: number;
  legacyPolicyHash: string;
}): Promise<PolicyWorker> {
  const child = fork(
    new URL('./ai-policy-strength.worker.ts', import.meta.url),
    [],
    {
      cwd: process.cwd(),
      execArgv: process.execArgv,
      serialization: 'advanced',
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    },
  );

  await new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      child.off('error', onError);
      child.off('exit', onExit);
      child.off('message', onMessage);
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const onExit = (
      code: number | null,
      signal: NodeJS.Signals | null,
    ): void => {
      cleanup();
      reject(
        new Error(
          `Policy-strength worker ${index} exited during startup (${code ?? signal}).`,
        ),
      );
    };
    const onMessage = (rawMessage: unknown): void => {
      const message = rawMessage as PolicyStrengthWorkerResponse;
      if (message.type === 'error') {
        cleanup();
        reject(workerFailure(message));
        return;
      }
      if (message.type !== 'ready') return;
      cleanup();
      if (
        message.currentPolicyHash !== currentPolicyHash ||
        message.legacyPolicyHash !== legacyPolicyHash
      ) {
        reject(
          new Error(`Policy-strength worker ${index} loaded wrong policies.`),
        );
        return;
      }
      resolve();
    };
    child.on('error', onError);
    child.on('exit', onExit);
    child.on('message', onMessage);
  });

  return { child, index };
}

async function runWorkerJob(
  worker: PolicyWorker,
  job: PolicyStrengthWorkerJob,
): Promise<PolicyMatchPair> {
  return new Promise((resolve, reject) => {
    const { child } = worker;
    const cleanup = (): void => {
      child.off('error', onError);
      child.off('exit', onExit);
      child.off('message', onMessage);
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const onExit = (
      code: number | null,
      signal: NodeJS.Signals | null,
    ): void => {
      cleanup();
      reject(
        new Error(
          `Policy-strength worker ${worker.index} exited while running ${job.job.pairId} (${code ?? signal}).`,
        ),
      );
    };
    const onMessage = (rawMessage: unknown): void => {
      const message = rawMessage as PolicyStrengthWorkerResponse;
      if (message.type === 'ready') return;
      cleanup();
      if (message.type === 'error') {
        reject(workerFailure(message));
        return;
      }
      if (
        message.type !== 'result' ||
        message.jobIndex !== job.job.jobIndex ||
        message.pair.pairId !== job.job.pairId
      ) {
        reject(
          new Error(
            `Policy-strength worker ${worker.index} returned the wrong job.`,
          ),
        );
        return;
      }
      resolve(message.pair);
    };
    child.on('error', onError);
    child.on('exit', onExit);
    child.on('message', onMessage);
    child.send({ job, type: 'run' } satisfies PolicyStrengthWorkerRequest);
  });
}

async function shutdownPolicyWorker(worker: PolicyWorker): Promise<void> {
  const { child } = worker;
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
    }, 5_000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    child.send({ type: 'shutdown' } satisfies PolicyStrengthWorkerRequest);
  });
}

async function spawnPolicyWorkers({
  currentPolicyHash,
  legacyPolicyHash,
  workerCount,
}: {
  currentPolicyHash: string;
  legacyPolicyHash: string;
  workerCount: number;
}): Promise<PolicyWorker[]> {
  const attempts = await Promise.allSettled(
    Array.from({ length: workerCount }, (_, index) =>
      spawnPolicyWorker({ currentPolicyHash, index, legacyPolicyHash }),
    ),
  );
  const started = attempts.flatMap((attempt) =>
    attempt.status === 'fulfilled' ? [attempt.value] : [],
  );
  const failed = attempts.find(
    (attempt): attempt is PromiseRejectedResult =>
      attempt.status === 'rejected',
  );
  if (failed) {
    await Promise.all(started.map(shutdownPolicyWorker));
    throw failed.reason;
  }
  return started;
}

async function runJobs(
  workers: PolicyWorker[],
  jobs: PolicyStrengthWorkerJob[],
  onPair: (pair: PolicyMatchPair, job: PolicyStrengthJob) => Promise<void>,
): Promise<PolicyMatchPair[]> {
  const completed: PolicyMatchPair[] = [];
  let nextJobIndex = 0;

  await Promise.all(
    workers.slice(0, jobs.length).map(async (worker) => {
      while (nextJobIndex < jobs.length) {
        const job = jobs[nextJobIndex];
        nextJobIndex += 1;
        const pair = await runWorkerJob(worker, job);
        completed.push(pair);
        await onPair(pair, job.job);
      }
    }),
  );

  return completed;
}

async function main(): Promise<void> {
  const { execution, out, settings } = parseArgs(process.argv.slice(2));
  const startedAt = performance.now();
  const ruleConfig = withRuleDefaults({
    drawRule: 'threefold',
    scoringMode: 'off',
  });
  const fixtures = buildFixtures(settings);
  if (!fixtures.length) throw new Error('No holdout fixtures selected.');
  const allocation = Object.fromEntries(
    fixtures.map((fixture) => {
      const weight =
        allocationFile.allocation[
          fixture.id as keyof typeof allocationFile.allocation
        ];
      if (!weight) {
        throw new Error(`Frozen allocation is missing fixture ${fixture.id}.`);
      }
      return [fixture.id, weight];
    }),
  );
  const blockPairCount = Object.values(allocation).reduce(
    (sum, weight) => sum + weight,
    0,
  );
  const sequentialConfig: SequentialStrengthConfig = {
    allocation,
    alpha: settings.alpha,
    beta: settings.beta,
    margin: settings.margin,
    maxPairs: settings.maxBlocks * blockPairCount,
    minPairs: settings.minBlocks * blockPairCount,
    question: settings.question,
  };
  const fixtureManifest = fixtures.map((fixture) => ({
    bucket: fixture.bucket,
    id: fixture.id,
    mirror: fixture.mirror,
    origin: fixture.origin,
    positionHash: hashPosition(fixture.state),
    split: fixture.split,
  }));
  const currentPolicy = await loadCurrentAiPolicy();
  const currentPolicyHash = currentPolicy.sourceHash;
  await currentPolicy.dispose();
  const legacyPolicyHash = fingerprintLegacyPolicyV0();
  const [domainHash, harnessHash] = await Promise.all([
    fingerprintFiles(gitFiles('src/domain')),
    fingerprintFiles([
      path.join(process.cwd(), 'src/ai/test/legacyPolicyV0.node.ts'),
      path.join(process.cwd(), 'src/ai/test/policy.ts'),
      path.join(process.cwd(), 'src/ai/test/policyMatch.ts'),
      path.join(process.cwd(), 'src/ai/test/policyStrengthCampaign.ts'),
      path.join(process.cwd(), 'src/ai/test/policyStrengthProtocol.ts'),
      path.join(process.cwd(), 'src/ai/test/strengthOutcome.ts'),
      path.join(process.cwd(), 'scripts/ai-policy-strength.report.ts'),
      path.join(process.cwd(), 'scripts/ai-policy-strength.worker.ts'),
    ]),
  ]);
  const campaignId = sha256(
    JSON.stringify({
      allocation: allocationFile,
      currentPolicyHash,
      domainHash,
      fixtureManifest,
      harnessHash,
      legacyPolicyHash,
      protocol: protocolFile,
      schemaVersion: AI_POLICY_STRENGTH_SCHEMA_VERSION,
      settings,
    }),
  );
  const checkpointDir = `${out}.checkpoints/${campaignId}`;
  await mkdir(checkpointDir, { recursive: true });
  const firstBlockJobs = enumeratePolicyStrengthBlockJobs(
    fixtures,
    allocation,
    0,
  );
  const workerCount = selectPolicyStrengthWorkerCount({
    availableParallelism: availableParallelism(),
    jobCount: firstBlockJobs.length,
    requestedWorkers: execution.requestedWorkers,
  });
  const pairs: PolicyMatchPair[] = [];
  let workers: PolicyWorker[] = [];
  let resumedPairCount = 0;
  let newlyCompletedPairCount = 0;
  let progressWrites = Promise.resolve();
  let primary = evaluateSequentialStrength(pairs, sequentialConfig);

  try {
    for (let block = 0; block < settings.maxBlocks; block += 1) {
      const jobs = enumeratePolicyStrengthBlockJobs(
        fixtures,
        allocation,
        block,
      );
      const restored: PolicyMatchPair[] = [];
      if (execution.resume) {
        for (const job of jobs) {
          const pair = await readCheckpoint(checkpointDir, campaignId, job);
          if (pair) {
            restored.push(pair);
            resumedPairCount += 1;
          }
        }
      }
      const restoredIds = new Set(restored.map(({ pairId }) => pairId));
      const pendingJobs = jobs.filter(({ pairId }) => !restoredIds.has(pairId));
      const progressInterval = Math.max(1, Math.ceil(jobs.length / 12));
      let blockCompletedPairCount = restored.length;

      if (pendingJobs.length && !workers.length) {
        process.stdout.write(
          `[strength] campaign ${campaignId.slice(0, 12)}: starting ${workerCount} workers; ${jobs.length} pairs per balanced block.\n`,
        );
        workers = await spawnPolicyWorkers({
          currentPolicyHash,
          legacyPolicyHash,
          workerCount,
        });
      }

      const completed = pendingJobs.length
        ? await runJobs(
            workers,
            pendingJobs.map((job) => ({
              fixture: fixtures[job.fixtureIndex],
              job,
              ruleConfig,
              settings: {
                difficulty: settings.difficulty,
                maxPlies: settings.maxPlies,
                nodeBudget: settings.nodeBudget,
              },
            })),
            async (pair, job) => {
              await writeCheckpoint(checkpointDir, campaignId, job, pair);
              newlyCompletedPairCount += 1;
              blockCompletedPairCount += 1;
              const completedAtProgress = blockCompletedPairCount;
              if (
                completedAtProgress % progressInterval !== 0 &&
                completedAtProgress !== jobs.length
              ) {
                return;
              }
              const elapsedMs = performance.now() - startedAt;
              const averagePairMs =
                elapsedMs / Math.max(1, newlyCompletedPairCount);
              const blockEtaMs =
                ((jobs.length - completedAtProgress) * averagePairMs) /
                workerCount;
              const progress = {
                block: block + 1,
                blockCompletedPairCount: completedAtProgress,
                blockPairCount: jobs.length,
                campaignId,
                checkpointDir,
                elapsedMs,
                estimatedBlockRemainingMs: blockEtaMs,
                generatedAt: new Date().toISOString(),
                resumedPairCount,
                status: 'running',
                totalCompletedPairCount: pairs.length + completedAtProgress,
                workerCount,
              };
              progressWrites = progressWrites.then(() =>
                atomicWriteFile(
                  `${out}.progress.json`,
                  `${JSON.stringify(progress, null, 2)}\n`,
                ),
              );
              await progressWrites;
              process.stdout.write(
                `[strength] block ${block + 1}: ${completedAtProgress}/${jobs.length} pairs; elapsed ${(elapsedMs / 60_000).toFixed(1)}m; block ETA ${(blockEtaMs / 60_000).toFixed(1)}m.\n`,
              );
            },
          )
        : [];

      pairs.push(
        ...mergePolicyStrengthBlockPairs(jobs, [...restored, ...completed]),
      );
      primary = evaluateSequentialStrength(pairs, sequentialConfig);
      await atomicWriteFile(
        `${out}.progress.json`,
        `${JSON.stringify(
          {
            block: block + 1,
            campaignId,
            checkpointDir,
            elapsedMs: performance.now() - startedAt,
            generatedAt: new Date().toISOString(),
            primary,
            resumedPairCount,
            status: isTerminalVerdict(primary.verdict) ? 'complete' : 'running',
            totalCompletedPairCount: pairs.length,
            workerCount,
          },
          null,
          2,
        )}\n`,
      );
      process.stdout.write(
        `[strength] balanced block ${block + 1} complete: ${pairs.length} pairs; verdict ${primary.verdict}.\n`,
      );
      if (isTerminalVerdict(primary.verdict)) break;
    }
  } finally {
    await Promise.all(workers.map(shutdownPolicyWorker));
  }

  const naturalResolvedGames = pairs
    .flatMap((pair) => pair.games)
    .filter((game) => game.policyAPoints !== null).length;
  const raw = `${pairs.map((pair) => JSON.stringify(pair)).join('\n')}\n`;
  const report = {
    allocation: {
      ...allocationFile,
      active: allocation,
      hash: sha256(JSON.stringify(allocationFile)),
    },
    protocol: {
      ...protocolFile,
      hash: sha256(JSON.stringify(protocolFile)),
    },
    execution: {
      campaignId,
      checkpointDir,
      completedPairCount: pairs.length,
      elapsedMs: performance.now() - startedAt,
      requestedWorkers: execution.requestedWorkers ?? null,
      resume: execution.resume,
      resumedPairCount,
      workerCount,
    },
    generatedAt: new Date().toISOString(),
    primary,
    provenance: {
      adjudicationVersion: STRENGTH_ADJUDICATION_VERSION,
      budgetSemanticsVersion: FIXED_NODE_BUDGET_SEMANTICS_VERSION,
      currentPolicyHash,
      domainHash,
      fixtureHash: sha256(JSON.stringify(fixtureManifest)),
      gitRevision: gitRevision(),
      harnessHash,
      legacyPolicyHash,
      rawHash: sha256(raw),
    },
    schemaVersion: AI_POLICY_STRENGTH_SCHEMA_VERSION,
    secondary: {
      naturalResolvedGameCount: naturalResolvedGames,
      naturalResolvedGameShare:
        naturalResolvedGames / Math.max(1, pairs.length * 2),
    },
    settings,
    workload: fixtureManifest,
  };
  const summary = markdown(report);
  await mkdir(path.dirname(out), { recursive: true });
  await Promise.all([
    writeFile(`${out}.json`, `${JSON.stringify(report, null, 2)}\n`, 'utf8'),
    writeFile(`${out}.md`, summary, 'utf8'),
    writeFile(`${out}.samples.jsonl`, raw, 'utf8'),
  ]);
  process.stdout.write(summary);

  if (settings.enforceGate && !isAcceptVerdict(primary.verdict)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
