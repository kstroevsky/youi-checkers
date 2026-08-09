import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
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
  summarizeNumericDistribution,
  summarizeProportion,
} from '@/ai/test/measurement';
import { hashPosition, withRuleDefaults } from '@/domain';
import type { AiDifficulty } from '@/shared/types/session';

import {
  POSITION_BUCKET_SCENARIOS,
  buildScenarioState,
} from './aiScenarioCatalog';

type Profile = 'full' | 'smoke';
type SplitSelection = StrengthFixtureSplit | 'all';

type Settings = {
  candidateDifficulty: AiDifficulty;
  maxPlies: number;
  nodeBudget: number;
  pairCount: number;
  profile: Profile;
  referenceIds: FrozenReferenceId[];
  scenarioLimit: number;
  split: SplitSelection;
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

function parseArgs(argv: string[]): { out: string; settings: Settings } {
  const args = new Map<string, string>();
  for (const entry of argv) {
    if (!entry.startsWith('--')) continue;
    const [key, value = ''] = entry.slice(2).split('=');
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
  const candidateDifficulty = (args.get('difficulty') ?? 'hard') as AiDifficulty;
  if (!['easy', 'medium', 'hard'].includes(candidateDifficulty)) {
    throw new Error('--difficulty must be easy, medium, or hard.');
  }
  const availableIds = new Set(FROZEN_REFERENCE_POOL.map(({ id }) => id));
  const referenceIds = (args.get('references') ??
    FROZEN_REFERENCE_POOL.map(({ id }) => id).join(','))
    .split(',')
    .filter(Boolean) as FrozenReferenceId[];
  if (!referenceIds.length || referenceIds.some((id) => !availableIds.has(id))) {
    throw new Error('--references contains an unknown frozen reference id.');
  }
  const filteredScenarioCount = POSITION_BUCKET_SCENARIOS.filter(
    (_, index) => split === 'all' || getFixtureSplit(index) === split,
  ).length;
  const scenarioLimit = parsePositiveInteger(
    args.get('scenario-limit') ??
      String(profile === 'full' ? filteredScenarioCount : Math.min(2, filteredScenarioCount)),
    'scenario-limit',
  );

  return {
    out:
      args.get('out') ??
      path.join(process.cwd(), 'output', 'ai', 'ai-reference-strength'),
    settings: {
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
  const ruleConfig = withRuleDefaults({ drawRule: 'threefold', scoringMode: 'off' });
  return POSITION_BUCKET_SCENARIOS.map((scenario, index) => ({
    bucket: scenario.bucket,
    id: scenario.label,
    split: getFixtureSplit(index),
    state: buildScenarioState(scenario, ruleConfig),
  }))
    .filter((fixture) => settings.split === 'all' || fixture.split === settings.split)
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

function summarizePairs(pairs: ReferenceStrengthPair[]) {
  const games = pairs.flatMap((pair) => pair.games);
  const resolvedGames = games.flatMap((game) =>
    game.candidatePoints === null ? [] : [game.candidatePoints],
  );
  const resolvedPairs = pairs.flatMap((pair) =>
    pair.pairScore === null ? [] : [pair.pairScore],
  );
  const candidatePlies = games
    .flatMap((game) => game.plies)
    .filter((ply) => ply.actorKind === 'candidate');
  const strata = Object.fromEntries(
    [...new Set(pairs.map(({ stratumId }) => stratumId))].sort().map((stratumId) => {
      const values = pairs
        .filter((pair) => pair.stratumId === stratumId)
        .flatMap((pair) => (pair.pairScore === null ? [] : [pair.pairScore]));
      return [
        stratumId,
        {
          pairScore: summarizeNumericDistribution(values),
          resolvedPairs: summarizeProportion(values.length, pairs.filter((pair) => pair.stratumId === stratumId).length),
        },
      ];
    }),
  );

  return {
    candidateDecisionCount: candidatePlies.length,
    candidateFallbackShare: summarizeProportion(
      candidatePlies.filter((ply) => ply.searchResult?.fallbackKind !== 'none').length,
      candidatePlies.length,
    ),
    candidatePointShareByGame: summarizeNumericDistribution(resolvedGames),
    candidatePointShareByPair: summarizeNumericDistribution(resolvedPairs),
    candidateZeroDepthShare: summarizeProportion(
      candidatePlies.filter((ply) => ply.searchResult?.completedDepth === 0).length,
      candidatePlies.length,
    ),
    resolvedGames: summarizeProportion(resolvedGames.length, games.length),
    resolvedPairs: summarizeProportion(resolvedPairs.length, pairs.length),
    strata,
    terminalCounts: games.reduce<Record<string, number>>((counts, game) => {
      counts[game.terminalType] = (counts[game.terminalType] ?? 0) + 1;
      return counts;
    }, {}),
    totalGames: games.length,
    totalPairs: pairs.length,
  };
}

function markdown(report: {
  provenance: { fixtureSha256: string; gitRevision: string; rawSha256: string; referencePoolSha256: string };
  settings: Settings;
  summary: ReturnType<typeof summarizePairs>;
}): string {
  const lines = [
    '# AI Frozen-Reference Strength',
    '',
    `Revision: \`${report.provenance.gitRevision}\``,
    '',
    `Fixture checksum: \`${report.provenance.fixtureSha256}\``,
    '',
    `Reference-pool checksum: \`${report.provenance.referencePoolSha256}\``,
    '',
    `Resolved color-swapped pairs: ${report.summary.resolvedPairs.count}/${report.summary.resolvedPairs.total} (${report.summary.resolvedPairs.share})`,
    '',
    `Candidate point share over resolved pairs: ${report.summary.candidatePointShareByPair.mean} (naive bootstrap 95% CI ${report.summary.candidatePointShareByPair.meanCi95.low}–${report.summary.candidatePointShareByPair.meanCi95.high})`,
    '',
    '| Stratum | Resolved pairs | Point share | 95% CI |',
    '| --- | ---: | ---: | ---: |',
  ];
  for (const [stratumId, summary] of Object.entries(report.summary.strata)) {
    lines.push(
      `| ${stratumId} | ${summary.resolvedPairs.count}/${summary.resolvedPairs.total} | ${summary.pairScore.mean} | [${summary.pairScore.meanCi95.low}, ${summary.pairScore.meanCi95.high}] |`,
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
  const { out, settings } = parseArgs(process.argv.slice(2));
  const fixtures = buildFixtures(settings);
  if (!fixtures.length) throw new Error('No strength fixtures selected.');
  const ruleConfig = withRuleDefaults({ drawRule: 'threefold', scoringMode: 'off' });
  const pairs: ReferenceStrengthPair[] = [];

  for (const fixture of fixtures) {
    for (const referenceId of settings.referenceIds) {
      for (let pairIndex = 0; pairIndex < settings.pairCount; pairIndex += 1) {
        const fixtureIndex = fixtures.indexOf(fixture);
        const referenceIndex = settings.referenceIds.indexOf(referenceId);
        pairs.push(
          runReferenceStrengthPair({
            candidateDifficulty: settings.candidateDifficulty,
            candidateSeed: 0x51f15e + pairIndex * 2 + fixtureIndex * 101,
            fixture,
            maxPlies: settings.maxPlies,
            nodeBudget: settings.nodeBudget,
            pairIndex,
            referenceId,
            referenceSeed: 0x9e3779 + pairIndex * 2 + referenceIndex * 211,
            ruleConfig,
          }),
        );
      }
    }
  }

  const rawText = `${pairs.map((pair) => JSON.stringify(pair)).join('\n')}\n`;
  const fixtureManifest = fixtures.map((fixture) => ({
    bucket: fixture.bucket,
    id: fixture.id,
    positionHash: hashPosition(fixture.state),
    split: fixture.split,
  }));
  const report = {
    generatedAt: new Date().toISOString(),
    provenance: {
      fixtureSha256: sha256(JSON.stringify(fixtureManifest)),
      gitRevision: gitRevision(),
      rawSha256: sha256(rawText),
      referencePoolSha256: sha256(
        JSON.stringify({ pool: FROZEN_REFERENCE_POOL, version: FROZEN_REFERENCE_POOL_VERSION }),
      ),
    },
    referencePool: {
      definitions: FROZEN_REFERENCE_POOL,
      version: FROZEN_REFERENCE_POOL_VERSION,
    },
    schemaVersion: AI_REFERENCE_STRENGTH_SCHEMA_VERSION,
    settings,
    summary: summarizePairs(pairs),
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
  process.stdout.write(`${markdown(report)}\nArtifacts: ${jsonPath}, ${markdownPath}, ${rawPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
