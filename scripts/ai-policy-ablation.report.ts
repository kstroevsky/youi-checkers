import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { loadLegacyPolicyV0 } from '@/ai/test/legacyPolicyV0.node';
import { measurePolicyMirrorEquivariance } from '@/ai/test/policyAttribution';
import { loadCurrentAiPolicy } from '@/ai/test/policyProvenance.node';
import {
  runPolicyMatchPair,
  type PolicyMatchPair,
} from '@/ai/test/policyMatch';
import {
  summarizePolicyStrengthInsights,
  type PolicyStrengthInsights,
} from '@/ai/test/policyStrengthInsights';
import {
  expandStrengthFixtureSymmetry,
  type StrengthFixture,
} from '@/ai/test/referenceStrength';
import type { AiSearchDiagnosticAblation } from '@/ai/types';
import { withRuleDefaults } from '@/domain/model/ruleConfig';

import {
  POSITION_BUCKET_SCENARIOS,
  buildScenarioState,
} from './aiScenarioCatalog';

type Profile = 'full' | 'smoke';

type Variant = {
  ablation: AiSearchDiagnosticAblation | null;
  claim: string;
  id: string;
};

type Settings = {
  maxPlies: number;
  nodeBudget: number;
  out: string;
  pairCount: number;
  profile: Profile;
  scenarioLimit: number;
  variants: Variant[];
};

type VariantResult = {
  ablation: AiSearchDiagnosticAblation | null;
  claim: string;
  elapsedMs: number;
  error: string | null;
  id: string;
  insights: PolicyStrengthInsights | null;
  mirror: Awaited<ReturnType<typeof measurePolicyMirrorEquivariance>> | null;
};

const VARIANTS: Variant[] = [
  {
    ablation: null,
    claim: 'Current production semantics; all reconstructed signals disabled.',
    id: 'production',
  },
  {
    ablation: { behaviorEvaluation: true },
    claim: 'Restore persona state bias only at evaluated leaves.',
    id: 'behavior-evaluation',
  },
  {
    ablation: { participationEvaluation: true },
    claim: 'Restore participation score only at evaluated leaves.',
    id: 'participation-evaluation',
  },
  {
    ablation: { participationEvaluationScale: 0.25 },
    claim: 'Restore one quarter of the removed participation leaf value.',
    id: 'participation-evaluation-0.25',
  },
  {
    ablation: { participationEvaluationScale: 0.5 },
    claim: 'Restore one half of the removed participation leaf value.',
    id: 'participation-evaluation-0.5',
  },
  {
    ablation: { participationEvaluationScale: 0.75 },
    claim: 'Restore three quarters of the removed participation leaf value.',
    id: 'participation-evaluation-0.75',
  },
  {
    ablation: { behaviorOrdering: true },
    claim: 'Restore persona action and opening geometry move-ordering bias.',
    id: 'behavior-ordering',
  },
  {
    ablation: { participationOrdering: true },
    claim: 'Restore participation delta as a move-ordering signal.',
    id: 'participation-ordering',
  },
  {
    ablation: {
      participationEvaluationScale: 0.25,
      participationOrdering: true,
    },
    claim:
      'Combine quarter-scale participation leaf value with participation-aware ordering.',
    id: 'participation-balanced',
  },
  {
    ablation: { rootParticipationScale: 0.5 },
    claim:
      'Increase only bounded final-root participation weighting from 0.2 to 0.5.',
    id: 'root-participation-0.5',
  },
  {
    ablation: { rootParticipationScale: 1 },
    claim:
      'Increase only bounded final-root participation weighting from 0.2 to 1.0.',
    id: 'root-participation-1.0',
  },
  {
    ablation: { rootParticipationScale: 2 },
    claim:
      'Increase only bounded final-root participation weighting from 0.2 to 2.0.',
    id: 'root-participation-2.0',
  },
  {
    ablation: { noveltyOrdering: true },
    claim: 'Restore strategic-tag novelty penalty in deeper move ordering.',
    id: 'novelty-ordering',
  },
  {
    ablation: {
      behaviorOrdering: true,
      noveltyOrdering: true,
      participationOrdering: true,
    },
    claim:
      'Restore all removed move-ordering signals without changing leaf values.',
    id: 'all-ordering',
  },
  {
    ablation: {
      behaviorEvaluation: true,
      behaviorOrdering: true,
      noveltyOrdering: true,
      participationEvaluation: true,
      participationOrdering: true,
    },
    claim:
      'Reconstruct all style and participation signals removed by 9d8e884.',
    id: 'historical-all',
  },
];

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
    'variants',
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
  const selectedIds = args.get('variants')?.split(',').filter(Boolean) ?? null;
  const variants = selectedIds
    ? selectedIds.map((id) => {
        const variant = VARIANTS.find((candidate) => candidate.id === id);
        if (!variant) throw new Error(`Unknown ablation variant ${id}.`);
        return variant;
      })
    : VARIANTS;
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
      path.join(process.cwd(), 'output', 'ai', 'ai-policy-ablation'),
    pairCount: parsePositiveInteger(
      args.get('pairs') ?? (profile === 'full' ? '4' : '1'),
      'pairs',
    ),
    profile,
    scenarioLimit: parsePositiveInteger(
      args.get('scenario-limit') ?? (profile === 'full' ? '6' : '2'),
      'scenario-limit',
    ),
    variants,
  };
}

function buildFixtures(scenarioLimit: number): {
  all: StrengthFixture[];
  originals: StrengthFixture[];
} {
  const ruleConfig = withRuleDefaults({
    drawRule: 'threefold',
    scoringMode: 'off',
  });
  const originals = POSITION_BUCKET_SCENARIOS.filter(
    (scenario) => scenario.strengthSplit === 'holdout',
  )
    .slice(0, scenarioLimit)
    .map(
      (scenario): StrengthFixture => ({
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
  return {
    all: originals.flatMap(expandStrengthFixtureSymmetry),
    originals,
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
                      'bestSearchAction',
                      'bestSearchScore',
                      'completedDepth',
                      'evaluatedNodes',
                      'fallbackKind',
                      'partialDepth',
                      'riskMode',
                      'selectedActionScore',
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

async function runVariant(
  variant: Variant,
  settings: Settings,
  fixtures: ReturnType<typeof buildFixtures>,
): Promise<{ raw: string[]; result: VariantResult }> {
  const startedAt = performance.now();
  const [current, legacy] = await Promise.all([
    loadCurrentAiPolicy(),
    loadLegacyPolicyV0(),
  ]);

  try {
    const ruleConfig = withRuleDefaults({
      drawRule: 'threefold',
      scoringMode: 'off',
    });
    const seeds = Array.from(
      { length: settings.pairCount },
      (_, index) => 0x41424c + index * 101,
    );
    const mirror = await measurePolicyMirrorEquivariance({
      diagnosticAblation: variant.ablation,
      difficulty: 'hard',
      fixtures: fixtures.originals,
      nodeBudget: settings.nodeBudget,
      policy: current,
      ruleConfig,
      seeds,
    });
    const pairs: PolicyMatchPair[] = [];
    for (const fixture of fixtures.all) {
      const baseFixtureIndex = fixtures.originals.findIndex((original) =>
        fixture.id.startsWith(original.id),
      );
      for (let repeat = 0; repeat < settings.pairCount; repeat += 1) {
        pairs.push(
          await runPolicyMatchPair({
            adjudicateHorizon: true,
            diagnosticAblation: variant.ablation,
            difficulty: 'hard',
            fixture,
            maxPlies: settings.maxPlies,
            nodeBudget: settings.nodeBudget,
            pairId: `${variant.id}/${fixture.id}/repeat-${repeat}`,
            policyA: current,
            policyASeed:
              0x51f15e + repeat * 2 + Math.max(0, baseFixtureIndex) * 101,
            policyB: legacy,
            policyBSeed:
              0x9e3779 + repeat * 2 + Math.max(0, baseFixtureIndex) * 211,
            retainDecisionDiagnostics: true,
            retainMeasurementEvidence: true,
            ruleConfig,
          }),
        );
      }
    }
    const insights = summarizePolicyStrengthInsights(pairs, {
      baselineId: 'legacy-v0',
      candidateId: 'current',
      horizonPlies: settings.maxPlies,
    });
    return {
      raw: pairs.map((pair) =>
        JSON.stringify({
          kind: 'policyAblationPair',
          pair: compactPair(pair),
          variant: variant.id,
        }),
      ),
      result: {
        ablation: variant.ablation,
        claim: variant.claim,
        elapsedMs: performance.now() - startedAt,
        error: null,
        id: variant.id,
        insights,
        mirror,
      },
    };
  } catch (error) {
    return {
      raw: [],
      result: {
        ablation: variant.ablation,
        claim: variant.claim,
        elapsedMs: performance.now() - startedAt,
        error:
          error instanceof Error
            ? (error.stack ?? error.message)
            : String(error),
        id: variant.id,
        insights: null,
        mirror: null,
      },
    };
  } finally {
    await Promise.allSettled([current.dispose(), legacy.dispose()]);
  }
}

function value(result: VariantResult, metric: string): number | null {
  if (!result.insights) return null;
  if (metric in result.insights.behavior) {
    return result.insights.behavior[
      metric as keyof typeof result.insights.behavior
    ].candidate.mean;
  }
  return (
    result.insights.richBehavior.comparisons[
      metric as keyof typeof result.insights.richBehavior.comparisons
    ]?.candidate.mean ?? null
  );
}

function format(value: number | null | undefined): string {
  return value === null || value === undefined ? 'n/a' : value.toFixed(4);
}

function markdown(results: VariantResult[], settings: Settings): string {
  const lines = [
    '# AI Search Signal Ablation',
    '',
    `Profile: **${settings.profile}**; ${settings.pairCount} seed pair(s), ${settings.scenarioLimit} base fixture(s) plus mirrors, ${settings.maxPlies} plies, ${settings.nodeBudget} fixed nodes.`,
    '',
    'Every row changes only the explicitly named measurement-only search signals. Product semantics are the `production` row.',
    '',
    '| Variant | Point share | Mirror | Depth-0 | Action diversity | Kind switches | Jumps | Exact reuse | Family diversity | Family repeats | Productive progress | Participation delta |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const result of results) {
    lines.push(
      `| ${result.id}${result.error ? ' (failed)' : ''} | ${format(result.insights?.strength.adjudicatedCandidatePointShare.mean)} | ${format(result.mirror?.equivalentShare)} | ${format(value(result, 'depthZeroShare'))} | ${format(value(result, 'actionKindDiversity'))} | ${format(value(result, 'actionKindSwitchRate'))} | ${format(value(result, 'jumpShare'))} | ${format(value(result, 'exactActionReuseRate'))} | ${format(value(result, 'sourceFamilyDiversity'))} | ${format(value(result, 'sameFamilyRepeatRate'))} | ${format(value(result, 'productiveProgressShare'))} | ${format(value(result, 'meanParticipationDelta'))} |`,
    );
  }
  lines.push('', '## Change from production', '');
  const production = results.find((result) => result.id === 'production');
  if (production) {
    for (const result of results.filter((entry) => entry !== production)) {
      const changes = [
        'depthZeroShare',
        'actionKindDiversity',
        'actionKindSwitchRate',
        'jumpShare',
        'exactActionReuseRate',
        'sourceFamilyDiversity',
        'sameFamilyRepeatRate',
        'productiveProgressShare',
        'meanParticipationDelta',
      ]
        .map((metric) => {
          const base = value(production, metric);
          const candidate = value(result, metric);
          return {
            delta:
              base === null || candidate === null ? null : candidate - base,
            metric,
          };
        })
        .filter(
          (entry): entry is { delta: number; metric: string } =>
            entry.delta !== null,
        )
        .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta));
      lines.push(`### ${result.id}`, '', result.claim, '');
      lines.push(
        ...changes.map(
          ({ delta, metric }) =>
            `- ${metric}: ${delta >= 0 ? '+' : ''}${delta.toFixed(4)}`,
        ),
        '',
      );
    }
  }
  lines.push(
    'Ablations reconstruct historical signals for causal diagnosis only. Retention requires a separate strength and performance decision.',
    '',
  );
  return lines.join('\n');
}

async function main(): Promise<void> {
  const settings = parseArgs(process.argv.slice(2));
  const fixtures = buildFixtures(settings.scenarioLimit);
  const results: VariantResult[] = [];
  const raw: string[] = [];
  const startedAt = performance.now();
  for (const variant of settings.variants) {
    process.stdout.write(`Running ablation ${variant.id}...\n`);
    const completed = await runVariant(variant, settings, fixtures);
    results.push(completed.result);
    raw.push(...completed.raw);
  }
  const rawText = raw.length ? `${raw.join('\n')}\n` : '';
  const report = {
    execution: {
      elapsedMs: performance.now() - startedAt,
      failedVariantCount: results.filter((result) => result.error).length,
      plannedDecisionUpperBound:
        settings.variants.length *
        (fixtures.all.length * settings.pairCount * 2 * settings.maxPlies +
          fixtures.originals.length * settings.pairCount * 2),
    },
    generatedAt: new Date().toISOString(),
    provenance: {
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
      variants: settings.variants,
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
  if (report.execution.failedVariantCount > 0) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
