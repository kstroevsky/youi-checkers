import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { loadLegacyPolicyV0 } from '@/ai/test/legacyPolicyV0.node';
import type { AiPolicy } from '@/ai/test/policy';
import {
  runPolicyMatchPair,
  type PolicyMatchPair,
} from '@/ai/test/policyMatch';
import { loadCurrentAiPolicy } from '@/ai/test/policyProvenance.node';
import {
  summarizePolicyStrengthInsights,
  type PolicyStrengthInsights,
} from '@/ai/test/policyStrengthInsights';
import {
  expandStrengthFixtureSymmetry,
  type StrengthFixture,
} from '@/ai/test/referenceStrength';
import { withRuleDefaults } from '@/domain/model/ruleConfig';

import {
  POSITION_BUCKET_SCENARIOS,
  buildScenarioState,
} from './aiScenarioCatalog';

type Profile = 'full' | 'smoke';

type Settings = {
  maxPlies: number;
  nodeBudget: number;
  out: string;
  pairCount: number;
  profile: Profile;
  scenarioLimit: number;
};

type Matchup = {
  id: 'current-current' | 'legacy-legacy' | 'current-legacy';
  policyA: AiPolicy;
  policyB: AiPolicy;
};

function parsePositiveInteger(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive safe integer.`);
  }
  return parsed;
}

function parseArgs(argv: string[]): Settings {
  const args = new Map<string, string>();
  const allowed = new Set([
    'max-plies',
    'nodes',
    'out',
    'pairs',
    'profile',
    'scenario-limit',
  ]);
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
  return {
    maxPlies: parsePositiveInteger(
      args.get('max-plies') ?? (profile === 'full' ? '32' : '12'),
      'max-plies',
    ),
    nodeBudget: parsePositiveInteger(
      args.get('nodes') ?? (profile === 'full' ? '512' : '128'),
      'nodes',
    ),
    out:
      args.get('out') ??
      path.join(process.cwd(), 'output', 'ai', 'ai-policy-counterfactual'),
    pairCount: parsePositiveInteger(
      args.get('pairs') ?? (profile === 'full' ? '4' : '1'),
      'pairs',
    ),
    profile,
    scenarioLimit: parsePositiveInteger(
      args.get('scenario-limit') ?? (profile === 'full' ? '6' : '2'),
      'scenario-limit',
    ),
  };
}

function buildFixtures(scenarioLimit: number): StrengthFixture[] {
  const ruleConfig = withRuleDefaults({
    drawRule: 'threefold',
    scoringMode: 'off',
  });
  return POSITION_BUCKET_SCENARIOS.filter(
    (scenario) => scenario.strengthSplit === 'holdout',
  )
    .slice(0, scenarioLimit)
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

function aliasPolicy(policy: AiPolicy, id: string): AiPolicy {
  return {
    id,
    sourceHash: policy.sourceHash,
    createSession: (seed) => policy.createSession(seed),
    async dispose() {},
  };
}

function compactPair(pair: PolicyMatchPair): PolicyMatchPair {
  return {
    ...pair,
    games: pair.games.map((game) => ({
      ...game,
      plies: game.plies.map((ply) => {
        const diagnostics =
          typeof ply.decision.diagnostics === 'object' &&
          ply.decision.diagnostics !== null &&
          !Array.isArray(ply.decision.diagnostics)
            ? (ply.decision.diagnostics as Record<string, unknown>)
            : null;
        return {
          ...ply,
          decision: {
            action: ply.decision.action,
            ...(diagnostics
              ? {
                  diagnostics: Object.fromEntries(
                    [
                      'behaviorProfileId',
                      'completedDepth',
                      'evaluatedNodes',
                      'fallbackKind',
                      'riskMode',
                      'selectionRegret',
                      'strategicIntent',
                    ]
                      .filter((key) => diagnostics[key] !== undefined)
                      .map((key) => [key, diagnostics[key]]),
                  ),
                }
              : {}),
          },
        };
      }),
    })) as PolicyMatchPair['games'],
  };
}

function sideMean(
  insights: PolicyStrengthInsights,
  metric: keyof PolicyStrengthInsights['behavior'],
): number {
  const comparison = insights.behavior[metric];
  return (comparison.candidate.mean + comparison.baseline.mean) / 2;
}

function richSideMean(
  insights: PolicyStrengthInsights,
  metric: keyof PolicyStrengthInsights['richBehavior']['comparisons'],
): number | null {
  const comparison = insights.richBehavior.comparisons[metric];
  return comparison
    ? (comparison.candidate.mean + comparison.baseline.mean) / 2
    : null;
}

function format(value: number | null | undefined): string {
  return value === null || value === undefined ? 'n/a' : value.toFixed(4);
}

function markdown(
  results: Array<{ id: Matchup['id']; insights: PolicyStrengthInsights }>,
  settings: Settings,
): string {
  const lines = [
    '# AI Short Counterfactual Matchups',
    '',
    `Profile: **${settings.profile}**; ${settings.pairCount} seed pair(s), ${settings.scenarioLimit} base fixture(s) plus mirrors, ${settings.maxPlies} plies, ${settings.nodeBudget} fixed nodes.`,
    '',
    'Self-play cells average both aliased sides. Cross-play uses the same current and legacy policies as the strength harness. The short horizon measures trajectory quality, not release strength.',
    '',
    '| Matchup | Natural endings | Action diversity | Kind switches | Jumps | Exact reuse | Family diversity | Family repeats | Productive progress | Participation delta | Opponent replies | Depth-0 |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const result of results) {
    lines.push(
      `| ${result.id} | ${format(result.insights.gameDynamics.naturalResolutionShare)} | ${format(sideMean(result.insights, 'actionKindDiversity'))} | ${format(sideMean(result.insights, 'actionKindSwitchRate'))} | ${format(sideMean(result.insights, 'jumpShare'))} | ${format(sideMean(result.insights, 'exactActionReuseRate'))} | ${format(richSideMean(result.insights, 'sourceFamilyDiversity'))} | ${format(richSideMean(result.insights, 'sameFamilyRepeatRate'))} | ${format(richSideMean(result.insights, 'productiveProgressShare'))} | ${format(richSideMean(result.insights, 'meanParticipationDelta'))} | ${format(richSideMean(result.insights, 'meanOpponentReplyCount'))} | ${format(richSideMean(result.insights, 'depthZeroShare'))} |`,
    );
  }
  lines.push(
    '',
    'Use differences between current/current and legacy/legacy to attribute intrinsic policy behavior. Treat current/legacy as an interaction check rather than a causal decomposition.',
    '',
  );
  return lines.join('\n');
}

async function main(): Promise<void> {
  const settings = parseArgs(process.argv.slice(2));
  const fixtures = buildFixtures(settings.scenarioLimit);
  const [current, legacy] = await Promise.all([
    loadCurrentAiPolicy(),
    loadLegacyPolicyV0(),
  ]);
  const matchups: Matchup[] = [
    {
      id: 'current-current',
      policyA: aliasPolicy(current, 'current-a'),
      policyB: aliasPolicy(current, 'current-b'),
    },
    {
      id: 'legacy-legacy',
      policyA: aliasPolicy(legacy, 'legacy-a'),
      policyB: aliasPolicy(legacy, 'legacy-b'),
    },
    {
      id: 'current-legacy',
      policyA: aliasPolicy(current, 'current'),
      policyB: aliasPolicy(legacy, 'legacy-v0'),
    },
  ];
  const ruleConfig = withRuleDefaults({
    drawRule: 'threefold',
    scoringMode: 'off',
  });
  const results: Array<{
    id: Matchup['id'];
    insights: PolicyStrengthInsights;
  }> = [];
  const raw: string[] = [];
  const startedAt = performance.now();

  try {
    for (const matchup of matchups) {
      process.stdout.write(`Running ${matchup.id}...\n`);
      const pairs: PolicyMatchPair[] = [];
      for (const fixture of fixtures) {
        const baseFixtureId = fixture.id.replace(/-mirror-horizontal$/u, '');
        const baseFixtureIndex = Math.max(
          0,
          fixtures.findIndex((entry) => entry.id === baseFixtureId) / 2,
        );
        for (let repeat = 0; repeat < settings.pairCount; repeat += 1) {
          pairs.push(
            await runPolicyMatchPair({
              adjudicateHorizon: true,
              difficulty: 'hard',
              fixture,
              maxPlies: settings.maxPlies,
              nodeBudget: settings.nodeBudget,
              pairId: `${matchup.id}/${fixture.id}/repeat-${repeat}`,
              policyA: matchup.policyA,
              policyASeed: 0x51f15e + repeat * 2 + baseFixtureIndex * 101,
              policyB: matchup.policyB,
              policyBSeed: 0x9e3779 + repeat * 2 + baseFixtureIndex * 211,
              retainDecisionDiagnostics: true,
              retainMeasurementEvidence: true,
              ruleConfig,
            }),
          );
        }
      }
      const insights = summarizePolicyStrengthInsights(pairs, {
        baselineId: matchup.policyB.id,
        candidateId: matchup.policyA.id,
        horizonPlies: settings.maxPlies,
      });
      results.push({ id: matchup.id, insights });
      raw.push(
        ...pairs.map((pair) =>
          JSON.stringify({
            kind: 'policyCounterfactualPair',
            matchup: matchup.id,
            pair: compactPair(pair),
          }),
        ),
      );
    }
  } finally {
    await Promise.allSettled([current.dispose(), legacy.dispose()]);
  }

  const rawText = `${raw.join('\n')}\n`;
  const report = {
    execution: {
      elapsedMs: performance.now() - startedAt,
      plannedDecisionUpperBound:
        matchups.length *
        fixtures.length *
        settings.pairCount *
        2 *
        settings.maxPlies,
    },
    generatedAt: new Date().toISOString(),
    provenance: {
      currentPolicyHash: current.sourceHash,
      legacyPolicyHash: legacy.sourceHash,
      rawSha256: createHash('sha256').update(rawText).digest('hex'),
    },
    results,
    schemaVersion: 1,
    settings: {
      maxPlies: settings.maxPlies,
      nodeBudget: settings.nodeBudget,
      pairCount: settings.pairCount,
      profile: settings.profile,
      scenarioLimit: settings.scenarioLimit,
    },
  };
  await mkdir(path.dirname(settings.out), { recursive: true });
  await Promise.all([
    writeFile(`${settings.out}.json`, `${JSON.stringify(report, null, 2)}\n`),
    writeFile(`${settings.out}.md`, `${markdown(results, settings)}\n`),
    writeFile(`${settings.out}.samples.jsonl`, rawText),
  ]);
  process.stdout.write(
    `${markdown(results, settings)}\nArtifacts: ${settings.out}.json, ${settings.out}.md, ${settings.out}.samples.jsonl\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
