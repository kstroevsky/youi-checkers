import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  FROZEN_REFERENCE_POOL,
  FROZEN_REFERENCE_POOL_VERSION,
  type FrozenReferenceId,
} from '@/ai/test/frozenReferencePool';
import {
  AI_REFERENCE_STRENGTH_SCHEMA_VERSION,
  runReferenceStrengthPair,
  type ReferenceStrengthPair,
  type StrengthFixture,
  type StrengthFixtureSplit,
} from '@/ai/test/referenceStrength';
import {
  enumerateReferenceStrengthJobs,
  mergeReferenceStrengthPairs,
  parseReferenceStrengthPairsJsonl,
  selectReferenceStrengthShard,
} from '@/ai/test/referenceStrengthCampaign';
import { summarizeReferenceStrengthPairs } from '@/ai/test/referenceStrengthReport';
import { hashPosition, withRuleDefaults } from '@/domain';
import type { AiDifficulty } from '@/shared/types/session';

import {
  POSITION_BUCKET_SCENARIOS,
  buildScenarioState,
} from './aiScenarioCatalog';

type Profile = 'full' | 'smoke';
type SplitSelection = StrengthFixtureSplit | 'all';

type Settings = {
  adjudicateHorizon: boolean;
  candidateDifficulty: AiDifficulty;
  maxPlies: number;
  nodeBudget: number;
  pairCount: number;
  profile: Profile;
  referenceIds: FrozenReferenceId[];
  scenarioLimit: number;
  split: SplitSelection;
};

type ExecutionSettings = {
  resume: boolean;
  shardCount: number;
  shardIndex: number;
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

function parseArgs(argv: string[]): {
  execution: ExecutionSettings;
  out: string;
  settings: Settings;
} {
  const allowedArgs = new Set([
    'adjudicate-horizon',
    'difficulty',
    'max-plies',
    'nodes',
    'out',
    'pairs',
    'profile',
    'references',
    'resume',
    'scenario-limit',
    'shard-count',
    'shard-index',
    'split',
  ]);
  const args = new Map<string, string>();
  for (const entry of argv) {
    if (!entry.startsWith('--')) continue;
    const [key, value = ''] = entry.slice(2).split('=');
    if (!allowedArgs.has(key)) {
      throw new Error(`Unknown argument --${key}.`);
    }
    args.set(key, value);
  }
  const profile = (args.get('profile') ?? 'smoke') as Profile;
  if (profile !== 'smoke' && profile !== 'full') {
    throw new Error('--profile must be smoke or full.');
  }
  const split = (args.get('split') ??
    (profile === 'full' ? 'holdout' : 'development')) as SplitSelection;
  if (split !== 'all' && split !== 'development' && split !== 'holdout') {
    throw new Error('--split must be all, development, or holdout.');
  }
  const candidateDifficulty = (args.get('difficulty') ??
    'hard') as AiDifficulty;
  if (!['easy', 'medium', 'hard'].includes(candidateDifficulty)) {
    throw new Error('--difficulty must be easy, medium, or hard.');
  }
  const availableIds = new Set(FROZEN_REFERENCE_POOL.map(({ id }) => id));
  const referenceIds = (
    args.get('references') ??
    FROZEN_REFERENCE_POOL.map(({ id }) => id).join(',')
  )
    .split(',')
    .filter(Boolean) as FrozenReferenceId[];
  if (
    !referenceIds.length ||
    referenceIds.some((id) => !availableIds.has(id))
  ) {
    throw new Error('--references contains an unknown frozen reference id.');
  }
  const filteredScenarioCount = POSITION_BUCKET_SCENARIOS.filter(
    (_, index) => split === 'all' || getFixtureSplit(index) === split,
  ).length;
  const scenarioLimit = parsePositiveInteger(
    args.get('scenario-limit') ??
      String(
        profile === 'full'
          ? filteredScenarioCount
          : Math.min(2, filteredScenarioCount),
      ),
    'scenario-limit',
  );

  const shardCount = parsePositiveInteger(
    args.get('shard-count') ?? '1',
    'shard-count',
  );
  const shardIndex = Number.parseInt(args.get('shard-index') ?? '0', 10);
  if (
    !Number.isSafeInteger(shardIndex) ||
    shardIndex < 0 ||
    shardIndex >= shardCount
  ) {
    throw new Error('--shard-index must be between zero and shard-count - 1.');
  }

  return {
    execution: {
      resume: args.get('resume') === 'true',
      shardCount,
      shardIndex,
    },
    out:
      args.get('out') ??
      path.join(process.cwd(), 'output', 'ai', 'ai-reference-strength'),
    settings: {
      adjudicateHorizon:
        args.get('adjudicate-horizon') === 'true' ||
        (args.get('adjudicate-horizon') === undefined && profile === 'full'),
      candidateDifficulty,
      maxPlies: parsePositiveInteger(
        args.get('max-plies') ?? (profile === 'full' ? '160' : '24'),
        'max-plies',
      ),
      nodeBudget: parsePositiveInteger(
        args.get('nodes') ?? (profile === 'full' ? '2048' : '64'),
        'nodes',
      ),
      pairCount: parsePositiveInteger(
        args.get('pairs') ?? (profile === 'full' ? '8' : '1'),
        'pairs',
      ),
      profile,
      referenceIds,
      scenarioLimit,
      split,
    },
  };
}

function getFixtureSplit(index: number): StrengthFixtureSplit {
  return index % 3 === 1 ? 'holdout' : 'development';
}

function buildFixtures(settings: Settings): StrengthFixture[] {
  const ruleConfig = withRuleDefaults({
    drawRule: 'threefold',
    scoringMode: 'off',
  });
  return POSITION_BUCKET_SCENARIOS.map((scenario, index) => ({
    bucket: scenario.bucket,
    id: scenario.label,
    split: getFixtureSplit(index),
    state: buildScenarioState(scenario, ruleConfig),
  }))
    .filter(
      (fixture) => settings.split === 'all' || fixture.split === settings.split,
    )
    .slice(0, settings.scenarioLimit);
}

function gitRevision(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

function gitTrackedFiles(directory: string): string[] {
  try {
    return execFileSync('git', ['ls-files', directory], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')
      .filter((filePath) => filePath.endsWith('.ts'))
      .sort();
  } catch {
    return [];
  }
}

async function sourceFingerprint(filePaths: string[]): Promise<string> {
  if (!filePaths.length)
    throw new Error('No source files found for fingerprinting.');
  const contents = await Promise.all(
    filePaths.map(async (filePath) => ({
      content: await readFile(path.join(process.cwd(), filePath), 'utf8'),
      filePath,
    })),
  );
  return sha256(
    contents
      .map(({ content, filePath }) => `${filePath}\0${content}`)
      .join('\0'),
  );
}

function markdown(report: {
  execution: {
    completedPairCount: number;
    plannedPairCount: number;
    shardCount: number;
    shardIndex: number;
  };
  provenance: {
    candidateSha256: string;
    domainSha256: string;
    fixtureSha256: string;
    gitRevision: string;
    rawSha256: string;
    referencePoolSha256: string;
  };
  settings: Settings;
  summary: ReturnType<typeof summarizeReferenceStrengthPairs>;
}): string {
  const lines = [
    '# AI Frozen-Reference Strength',
    '',
    `Revision: \`${report.provenance.gitRevision}\``,
    '',
    `Candidate-source checksum: \`${report.provenance.candidateSha256}\``,
    '',
    `Fixture checksum: \`${report.provenance.fixtureSha256}\``,
    '',
    `Reference-pool checksum: \`${report.provenance.referencePoolSha256}\``,
    '',
    `Domain-rules checksum: \`${report.provenance.domainSha256}\``,
    '',
    `Campaign progress: ${report.execution.completedPairCount}/${report.execution.plannedPairCount} pairs; shard ${report.execution.shardIndex + 1}/${report.execution.shardCount}.`,
    '',
    `Resolved color-swapped pairs: ${report.summary.resolvedPairs.count}/${report.summary.resolvedPairs.total} (${report.summary.resolvedPairs.share})`,
    '',
    `Candidate point share over resolved pairs: ${report.summary.candidatePointShareByPair.mean} (naive bootstrap 95% CI ${report.summary.candidatePointShareByPair.meanCi95.low}–${report.summary.candidatePointShareByPair.meanCi95.high})`,
    '',
    report.settings.adjudicateHorizon
      ? `Fixed-horizon adjudicated point share: ${report.summary.candidatePointShareByAdjudicatedPair.mean} (95% CI ${report.summary.candidatePointShareByAdjudicatedPair.meanCi95.low}–${report.summary.candidatePointShareByAdjudicatedPair.meanCi95.high}).`
      : 'Fixed-horizon adjudication is disabled for this run.',
    '',
    '| Stratum | Resolved pairs | Natural point share | Adjudicated point share | Adjudicated 95% CI |',
    '| --- | ---: | ---: | ---: | ---: |',
  ];
  for (const [stratumId, summary] of Object.entries(report.summary.strata)) {
    lines.push(
      `| ${stratumId} | ${summary.resolvedPairs.count}/${summary.resolvedPairs.total} | ${summary.pairScore.mean} | ${summary.adjudicatedPairScore.mean} | [${summary.adjudicatedPairScore.meanCi95.low}, ${summary.adjudicatedPairScore.meanCi95.high}] |`,
    );
  }
  lines.push(
    '',
    'Unfinished games are censored, never scored as draws. Each pair requires both color-swapped games to resolve.',
    '',
    `Settings: split ${report.settings.split}; ${report.settings.pairCount} seed pairs per stratum; ${report.settings.nodeBudget} fixed nodes per candidate decision; ${report.settings.maxPlies} plies; references ${report.settings.referenceIds.join(', ')}.`,
  );
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const { execution, out, settings } = parseArgs(process.argv.slice(2));
  const fixtures = buildFixtures(settings);
  if (!fixtures.length) throw new Error('No strength fixtures selected.');
  const ruleConfig = withRuleDefaults({
    drawRule: 'threefold',
    scoringMode: 'off',
  });
  const fixtureManifest = fixtures.map((fixture) => ({
    bucket: fixture.bucket,
    id: fixture.id,
    positionHash: hashPosition(fixture.state),
    split: fixture.split,
  }));
  const productionAiFiles = gitTrackedFiles('src/ai').filter(
    (filePath) => !filePath.startsWith('src/ai/test/'),
  );
  const [candidateSha256, domainSha256, referencePoolSha256] =
    await Promise.all([
      sourceFingerprint(productionAiFiles),
      sourceFingerprint(gitTrackedFiles('src/domain')),
      sourceFingerprint(['src/ai/test/frozenReferencePool.ts']),
    ]);
  const revision = gitRevision();
  const jobs = enumerateReferenceStrengthJobs(
    fixtures,
    settings.referenceIds,
    settings.pairCount,
  );
  const shardJobs = selectReferenceStrengthShard(
    jobs,
    execution.shardIndex,
    execution.shardCount,
  );
  const campaignId = sha256(
    JSON.stringify({
      domainSha256,
      candidateSha256,
      fixtureManifest,
      referencePoolSha256,
      revision,
      schemaVersion: AI_REFERENCE_STRENGTH_SCHEMA_VERSION,
      settings,
      shardCount: execution.shardCount,
    }),
  );
  const checkpointDir = `${out}.checkpoints/${campaignId}`;
  await mkdir(checkpointDir, { recursive: true });
  const collected: ReferenceStrengthPair[] = [];
  let resumedPairCount = 0;

  for (const job of shardJobs) {
    const checkpointPath = path.join(
      checkpointDir,
      `${sha256(job.pairId)}.json`,
    );
    if (execution.resume) {
      try {
        const [pair] = parseReferenceStrengthPairsJsonl(
          await readFile(checkpointPath, 'utf8'),
        );
        if (pair?.pairId !== job.pairId) {
          throw new Error(`Checkpoint identity mismatch for ${job.pairId}.`);
        }
        collected.push(pair);
        resumedPairCount += 1;
        continue;
      } catch (error) {
        if (
          error instanceof Error &&
          !('code' in error && error.code === 'ENOENT')
        ) {
          throw error;
        }
      }
    }

    const pair = runReferenceStrengthPair({
      adjudicateHorizon: settings.adjudicateHorizon,
      candidateDifficulty: settings.candidateDifficulty,
      candidateSeed: 0x51f15e + job.pairIndex * 2 + job.fixtureIndex * 101,
      fixture: fixtures[job.fixtureIndex],
      maxPlies: settings.maxPlies,
      nodeBudget: settings.nodeBudget,
      pairIndex: job.pairIndex,
      referenceId: job.referenceId,
      referenceSeed: 0x9e3779 + job.pairIndex * 2 + job.referenceIndex * 211,
      ruleConfig,
    });
    const temporaryPath = `${checkpointPath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(pair)}\n`, 'utf8');
    await rename(temporaryPath, checkpointPath);
    collected.push(pair);
  }

  const pairs = mergeReferenceStrengthPairs(
    [collected],
    shardJobs.map(({ pairId }) => pairId),
  );
  const rawText = `${pairs.map((pair) => JSON.stringify(pair)).join('\n')}\n`;
  const report = {
    execution: {
      campaignId,
      completedPairCount: pairs.length,
      plannedPairCount: jobs.length,
      resume: execution.resume,
      resumedPairCount,
      shardCount: execution.shardCount,
      shardIndex: execution.shardIndex,
      shardPairCount: shardJobs.length,
    },
    generatedAt: new Date().toISOString(),
    provenance: {
      candidateSha256,
      domainSha256,
      fixtureSha256: sha256(JSON.stringify(fixtureManifest)),
      gitRevision: revision,
      rawSha256: sha256(rawText),
      referencePoolSha256,
    },
    referencePool: {
      definitions: FROZEN_REFERENCE_POOL,
      version: FROZEN_REFERENCE_POOL_VERSION,
    },
    schemaVersion: AI_REFERENCE_STRENGTH_SCHEMA_VERSION,
    settings,
    summary: summarizeReferenceStrengthPairs(pairs, settings.maxPlies),
    workload: fixtureManifest,
  };
  const jsonPath = `${out}.json`;
  const markdownPath = `${out}.md`;
  const rawPath = `${out}.samples.jsonl`;
  await mkdir(path.dirname(out), { recursive: true });
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'),
    writeFile(markdownPath, markdown(report), 'utf8'),
    writeFile(rawPath, rawText, 'utf8'),
  ]);
  process.stdout.write(
    `${markdown(report)}\nArtifacts: ${jsonPath}, ${markdownPath}, ${rawPath}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
