import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import allocationFile from '@/ai/test/fixtures/ai-policy-strength-allocation.json';
import protocolFile from '@/ai/test/fixtures/ai-policy-strength-protocol.json';
import { fingerprintLegacyPolicyV0 } from '@/ai/test/legacyPolicyV0.node';
import {
  enumeratePolicyStrengthBlockJobs,
  parsePolicyStrengthCheckpoint,
  type PolicyStrengthCheckpoint,
  type PolicyStrengthJob,
} from '@/ai/test/policyStrengthCampaign';
import { collectCompletePolicyStrengthBlocks } from '@/ai/test/policyStrengthFinalization';
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

const AI_POLICY_STRENGTH_SCHEMA_VERSION = 1 as const;
const FIXED_NODE_BUDGET_SEMANTICS_VERSION = 1 as const;
const ADMINISTRATIVE_FINALIZATION_SCHEMA_VERSION = 1 as const;

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
  profile: 'full';
  question: StrengthQuestion;
  scenarioLimit: number;
};

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  const allowed = new Set([
    'campaign-id',
    'checkpoint-dir',
    'out',
    'reason',
    'worker-count',
  ]);
  for (const entry of argv) {
    if (!entry.startsWith('--')) continue;
    const [key, value = ''] = entry.slice(2).split('=');
    if (!allowed.has(key)) throw new Error(`Unknown argument --${key}.`);
    args.set(key, value);
  }
  const campaignId = args.get('campaign-id');
  const out = args.get('out');
  const reason = args.get('reason');
  if (!campaignId || !/^[0-9a-f]{64}$/u.test(campaignId)) {
    throw new Error('Missing or invalid --campaign-id=<sha256>.');
  }
  if (!out) throw new Error('Missing --out=<path>.');
  if (!reason) throw new Error('Missing --reason=<text>.');
  const workerCount = Number.parseInt(args.get('worker-count') ?? '1', 10);
  if (!Number.isSafeInteger(workerCount) || workerCount <= 0) {
    throw new Error('--worker-count must be a positive integer.');
  }
  return {
    campaignId,
    checkpointDir:
      args.get('checkpoint-dir') ?? `${out}.checkpoints/${campaignId}`,
    out,
    reason,
    workerCount,
  };
}

function buildSettings(): Settings {
  return {
    alpha: protocolFile.primary.alpha,
    beta: protocolFile.primary.beta,
    difficulty: protocolFile.search.difficulty as AiDifficulty,
    enforceGate: false,
    margin: protocolFile.primary.margin,
    maxBlocks: protocolFile.sampling.maxBalancedBlocks,
    maxPlies: protocolFile.primary.horizonPlies,
    minBlocks: protocolFile.sampling.minBalancedBlocks,
    nodeBudget: protocolFile.search.fixedNodeBudget,
    profile: 'full',
    question: protocolFile.primary.question as StrengthQuestion,
    scenarioLimit: POSITION_BUCKET_SCENARIOS.filter(
      (scenario) => scenario.strengthSplit === 'holdout',
    ).length,
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

async function fingerprintFiles(files: string[]): Promise<string> {
  const contents = await Promise.all(
    files
      .sort()
      .map(async (file) => `${file}\0${await readFile(file, 'utf8')}`),
  );
  return sha256(contents.join('\0'));
}

async function readValidatedCheckpoints(
  checkpointDir: string,
  campaignId: string,
  expectedJobs: Map<string, PolicyStrengthJob>,
): Promise<PolicyStrengthCheckpoint[]> {
  const checkpoints: PolicyStrengthCheckpoint[] = [];
  for (const name of (await readdir(checkpointDir)).sort()) {
    if (!name.endsWith('.json')) continue;
    const payload = await readFile(path.join(checkpointDir, name), 'utf8');
    let candidate: PolicyStrengthCheckpoint;
    try {
      candidate = JSON.parse(payload) as PolicyStrengthCheckpoint;
    } catch (error) {
      throw new Error(`Invalid checkpoint JSON ${name}.`, { cause: error });
    }
    const expectedJob = expectedJobs.get(candidate.job?.pairId);
    if (!expectedJob || name !== `${sha256(expectedJob.pairId)}.json`) {
      throw new Error(`Unexpected checkpoint ${name}.`);
    }
    checkpoints.push(
      parsePolicyStrengthCheckpoint(payload, campaignId, expectedJob),
    );
  }
  return checkpoints;
}

let temporaryWriteSequence = 0;
async function atomicWriteFile(filePath: string, payload: string) {
  temporaryWriteSequence += 1;
  const temporaryPath = `${filePath}.${process.pid}.${temporaryWriteSequence}.tmp`;
  await writeFile(temporaryPath, payload, 'utf8');
  await rename(temporaryPath, filePath);
}

function markdown(report: {
  execution: {
    campaignId: string;
    completeBlockCount: number;
    completedPairCount: number;
    excludedCheckpointCount: number;
    firstIncompleteBlock: number | null;
    status: 'administrativelyStopped';
    stopReason: string;
  };
  primary: ReturnType<typeof evaluateSequentialStrength>;
  provenance: {
    currentPolicyHash: string;
    domainHash: string;
    harnessHash: string;
    legacyPolicyHash: string;
  };
  secondary: {
    naturalResolvedGameCount: number;
    naturalResolvedGameShare: number;
  };
  settings: Settings;
}): string {
  const { execution, primary } = report;
  return [
    '# Current AI vs LegacyPolicyV0 Strength — Administrative Snapshot',
    '',
    `Finalization status: **${execution.status}**. Sequential protocol verdict: **${primary.verdict}**.`,
    '',
    'This is a valid descriptive snapshot, not an acceptance or rejection of the preregistered gate.',
    '',
    `Stop reason: ${execution.stopReason}`,
    '',
    `Fixed-horizon pentanomial point share: ${primary.meanPointShare ?? 'n/a'} over ${primary.pairCount} color-swapped pairs.`,
    '',
    `Pentanomial counts [0, 0.25, 0.5, 0.75, 1]: [${primary.counts.join(', ')}].`,
    '',
    `LLR: ${primary.llr ?? 'not evaluated'}; secondary LLR: ${primary.secondaryLlr ?? 'n/a'}; Wald bounds: ${primary.bounds.lower} .. ${primary.bounds.upper}.`,
    '',
    `Complete balanced blocks: ${execution.completeBlockCount}; first incomplete block: ${execution.firstIncompleteBlock ?? 'none'}; excluded partial checkpoints: ${execution.excludedCheckpointCount}.`,
    '',
    `Natural resolution: ${report.secondary.naturalResolvedGameCount}/${primary.pairCount * 2} games (${report.secondary.naturalResolvedGameShare}).`,
    '',
    `Fixed horizon: ${report.settings.maxPlies} plies; fixed-node budget: ${report.settings.nodeBudget}.`,
    '',
    `Campaign: \`${execution.campaignId}\``,
    '',
    `Current policy: \`${report.provenance.currentPolicyHash}\``,
    '',
    `Legacy policy: \`${report.provenance.legacyPolicyHash}\``,
    '',
    `Domain: \`${report.provenance.domainHash}\``,
    '',
    `Harness: \`${report.provenance.harnessHash}\``,
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  const { campaignId, checkpointDir, out, reason, workerCount } = parseArgs(
    process.argv.slice(2),
  );
  const settings = buildSettings();
  const fixtures = buildFixtures(settings);
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
  const [domainHash, harnessHash, finalizerHash] = await Promise.all([
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
    fingerprintFiles([
      path.join(process.cwd(), 'src/ai/test/policyStrengthFinalization.ts'),
      path.join(process.cwd(), 'scripts/ai-policy-strength.finalize.ts'),
    ]),
  ]);
  const recomputedCampaignId = sha256(
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
  if (recomputedCampaignId !== campaignId) {
    throw new Error(
      `Campaign identity mismatch: expected ${campaignId}, recomputed ${recomputedCampaignId}.`,
    );
  }

  const expectedJobs = new Map(
    Array.from({ length: settings.maxBlocks }, (_, blockIndex) =>
      enumeratePolicyStrengthBlockJobs(fixtures, allocation, blockIndex),
    )
      .flat()
      .map((job) => [job.pairId, job]),
  );
  const checkpoints = await readValidatedCheckpoints(
    checkpointDir,
    campaignId,
    expectedJobs,
  );
  const snapshot = collectCompletePolicyStrengthBlocks(
    checkpoints,
    campaignId,
    blockPairCount,
  );
  if (!snapshot.pairs.length) {
    throw new Error('No complete balanced checkpoint blocks were found.');
  }

  const sequentialConfig: SequentialStrengthConfig = {
    allocation,
    alpha: settings.alpha,
    beta: settings.beta,
    margin: settings.margin,
    maxPairs: settings.maxBlocks * blockPairCount,
    minPairs: settings.minBlocks * blockPairCount,
    question: settings.question,
  };
  const primary = evaluateSequentialStrength(snapshot.pairs, sequentialConfig);
  const naturalResolvedGames = snapshot.pairs
    .flatMap((pair) => pair.games)
    .filter((game) => game.policyAPoints !== null).length;
  const raw = `${snapshot.pairs.map((pair) => JSON.stringify(pair)).join('\n')}\n`;
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
      completeBlockCount: snapshot.completeBlockCount,
      completedPairCount: snapshot.pairs.length,
      excludedCheckpointCount: snapshot.excludedCheckpointCount,
      firstIncompleteBlock:
        snapshot.firstIncompleteBlock === null
          ? null
          : snapshot.firstIncompleteBlock + 1,
      status: 'administrativelyStopped' as const,
      stopReason: reason,
      workerCount,
    },
    generatedAt: new Date().toISOString(),
    primary,
    provenance: {
      adjudicationVersion: STRENGTH_ADJUDICATION_VERSION,
      budgetSemanticsVersion: FIXED_NODE_BUDGET_SEMANTICS_VERSION,
      currentPolicyHash,
      domainHash,
      finalizerHash,
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
        naturalResolvedGames / Math.max(1, snapshot.pairs.length * 2),
    },
    settings,
    snapshotSchemaVersion: ADMINISTRATIVE_FINALIZATION_SCHEMA_VERSION,
    workload: fixtureManifest,
  };
  const summary = markdown(report);
  const progress = {
    campaignId,
    checkpointDir,
    generatedAt: report.generatedAt,
    primary,
    status: report.execution.status,
    stopReason: reason,
    totalCompletedPairCount: snapshot.pairs.length,
    workerCount,
  };
  await mkdir(path.dirname(out), { recursive: true });
  await Promise.all([
    atomicWriteFile(`${out}.json`, `${JSON.stringify(report, null, 2)}\n`),
    atomicWriteFile(`${out}.md`, summary),
    atomicWriteFile(`${out}.samples.jsonl`, raw),
    atomicWriteFile(
      `${out}.progress.json`,
      `${JSON.stringify(progress, null, 2)}\n`,
    ),
  ]);
  process.stdout.write(
    `${summary}\nArtifacts: ${out}.json, ${out}.md, ${out}.samples.jsonl\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
