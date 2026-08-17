import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import type { AiPolicyDecision } from '@/ai/test/policy';
import { measurePolicyMirrorEquivariance } from '@/ai/test/policyAttribution';
import type { PolicyMatchPair } from '@/ai/test/policyMatch';
import { runPolicyMatchPair } from '@/ai/test/policyMatch';
import {
  summarizePolicyStrengthInsights,
  type PolicyStrengthInsights,
} from '@/ai/test/policyStrengthInsights';
import {
  expandStrengthFixtureSymmetry,
  type StrengthFixture,
} from '@/ai/test/referenceStrength';
import { loadRevisionPolicy } from '@/ai/test/revisionPolicy.node';
import { withRuleDefaults } from '@/domain/model/ruleConfig';

import {
  POSITION_BUCKET_SCENARIOS,
  buildScenarioState,
} from './aiScenarioCatalog';

type Profile = 'full' | 'smoke';

type RevisionSpec = {
  claim: string;
  label: string;
  ref: string;
};

type Settings = {
  maxPlies: number;
  nodeBudget: number;
  out: string;
  pairCount: number;
  profile: Profile;
  revisions: RevisionSpec[];
  scenarioLimit: number;
};

type RevisionResult = {
  claim: string;
  elapsedMs: number;
  error: string | null;
  insights: PolicyStrengthInsights | null;
  label: string;
  mirror: Awaited<ReturnType<typeof measurePolicyMirrorEquivariance>> | null;
  policyHash: string | null;
  revision: string;
  subject: string;
};

const DEFAULT_REVISIONS: RevisionSpec[] = [
  {
    claim: 'feature merge-base',
    label: 'merge-base',
    ref: '2bd9c455ec2537aa84b1fef38550ce13c53efd29',
  },
  {
    claim: 'actor-explicit decision semantics',
    label: 'actor-explicit',
    ref: '944e0f06d937d3a8bce6fba2f6063485a3266ecb',
  },
  {
    claim: 'completed-versus-partial search evidence',
    label: 'partial-search-evidence',
    ref: '211dc38',
  },
  {
    claim: 'strength-bounded stylistic root selection',
    label: 'bounded-style',
    ref: 'd094f72',
  },
  {
    claim: 'style removed from adversarial evaluation',
    label: 'style-separated',
    ref: '9d8e884',
  },
  {
    claim: 'strategic intent persisted across turns',
    label: 'persistent-plan',
    ref: 'c46744c',
  },
  {
    claim: 'hard opening variety preset retuned',
    label: 'opening-variety',
    ref: 'ac5e891',
  },
  {
    claim: 'style selection isolated to final search result',
    label: 'final-only-style',
    ref: '14e7111',
  },
  {
    claim: 'strategic plan hypotheses represented explicitly',
    label: 'plan-hypotheses',
    ref: '9d06efe',
  },
];

const TARGET_METRICS = [
  'actionKindDiversity',
  'actionKindSwitchRate',
  'exactActionReuseRate',
  'jumpShare',
  'regionDiversity',
  'retainedTurnShare',
  'sameRegionRepeatRate',
  'sourceDiversity',
] as const;

const RICH_TARGET_METRICS = [
  'homeReadinessDelta',
  'depthZeroShare',
  'intentSwitchRate',
  'meanCompletedDepth',
  'meanOpponentReplyCount',
  'meanParticipationDelta',
  'meanSelectionRegret',
  'orderedFallbackShare',
  'positiveParticipationShare',
  'productiveProgressShare',
  'sameFamilyRepeatRate',
  'sixStackReadinessDelta',
  'sourceFamilyDiversity',
  'styleSelectionShare',
] as const;

function parsePositiveInteger(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive safe integer.`);
  }
  return parsed;
}

function parseRevisions(value: string | undefined): RevisionSpec[] {
  if (!value) return DEFAULT_REVISIONS;
  return value.split(',').map((entry) => {
    const [label, ref] = entry.split(':');
    if (!label || !ref) {
      throw new Error('--revisions entries must use label:git-ref.');
    }
    return { claim: label, label, ref };
  });
}

function parseArgs(argv: string[]): Settings {
  const allowed = new Set([
    'max-plies',
    'nodes',
    'out',
    'pairs',
    'profile',
    'revisions',
    'scenario-limit',
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
      path.join(process.cwd(), 'output', 'ai', 'ai-policy-attribution'),
    pairCount: parsePositiveInteger(
      args.get('pairs') ?? (profile === 'full' ? '4' : '1'),
      'pairs',
    ),
    profile,
    revisions: parseRevisions(args.get('revisions')),
    scenarioLimit: parsePositiveInteger(
      args.get('scenario-limit') ?? (profile === 'full' ? '6' : '2'),
      'scenario-limit',
    ),
  };
}

function resolveRevision(ref: string): string {
  return execFileSync('git', ['rev-parse', ref], { encoding: 'utf8' }).trim();
}

function revisionSubject(revision: string): string {
  return execFileSync('git', ['show', '-s', '--format=%s', revision], {
    encoding: 'utf8',
  }).trim();
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

function compactDiagnostics(
  diagnostics: unknown,
): AiPolicyDecision['diagnostics'] {
  if (
    typeof diagnostics !== 'object' ||
    diagnostics === null ||
    Array.isArray(diagnostics)
  ) {
    return undefined;
  }
  const source = diagnostics as Record<string, unknown>;
  return Object.fromEntries(
    [
      'behaviorProfileId',
      'completedDepth',
      'evaluatedNodes',
      'fallbackKind',
      'partialDepth',
      'riskMode',
      'selectionRegret',
      'strategicIntent',
    ]
      .filter((key) => source[key] !== undefined)
      .map((key) => [key, source[key]]),
  );
}

function compactPair(pair: PolicyMatchPair): PolicyMatchPair {
  return {
    ...pair,
    games: pair.games.map((game) => ({
      ...game,
      plies: game.plies.map((ply) => ({
        ...ply,
        decision: {
          action: ply.decision.action,
          diagnostics: compactDiagnostics(ply.decision.diagnostics),
        },
      })),
    })) as PolicyMatchPair['games'],
  };
}

async function runRevision(
  spec: RevisionSpec,
  settings: Settings,
  fixtures: ReturnType<typeof buildFixtures>,
): Promise<{ raw: string[]; result: RevisionResult }> {
  const revision = resolveRevision(spec.ref);
  const startedAt = performance.now();
  let candidate: Awaited<ReturnType<typeof loadRevisionPolicy>> | null = null;
  let baseline: Awaited<ReturnType<typeof loadRevisionPolicy>> | null = null;

  try {
    [candidate, baseline] = await Promise.all([
      loadRevisionPolicy({
        behaviorSeedNamespace: 'policy-attribution-',
        id: 'candidate',
        revision,
      }),
      loadRevisionPolicy({
        behaviorSeedNamespace: 'policy-attribution-',
        id: 'baseline',
        revision: resolveRevision(DEFAULT_REVISIONS[0].ref),
      }),
    ]);
    const ruleConfig = withRuleDefaults({
      drawRule: 'threefold',
      scoringMode: 'off',
    });
    const mirrorSeeds = Array.from(
      { length: settings.pairCount },
      (_, index) => 0x4d4952 + index * 101,
    );
    const mirror = await measurePolicyMirrorEquivariance({
      difficulty: 'hard',
      fixtures: fixtures.originals,
      nodeBudget: settings.nodeBudget,
      policy: candidate,
      ruleConfig,
      seeds: mirrorSeeds,
    });
    const pairs: PolicyMatchPair[] = [];

    for (const fixture of fixtures.all) {
      const baseFixtureIndex = fixtures.originals.findIndex((original) =>
        fixture.id.startsWith(original.id),
      );
      for (let repeat = 0; repeat < settings.pairCount; repeat += 1) {
        const candidateSeed =
          0x51f15e + repeat * 2 + Math.max(0, baseFixtureIndex) * 101;
        const baselineSeed =
          0x9e3779 + repeat * 2 + Math.max(0, baseFixtureIndex) * 211;
        pairs.push(
          await runPolicyMatchPair({
            adjudicateHorizon: true,
            difficulty: 'hard',
            fixture,
            maxPlies: settings.maxPlies,
            nodeBudget: settings.nodeBudget,
            pairId: `${spec.label}/${fixture.id}/repeat-${repeat}`,
            policyA: candidate,
            policyASeed: candidateSeed,
            policyB: baseline,
            policyBSeed: baselineSeed,
            retainDecisionDiagnostics: true,
            retainMeasurementEvidence: true,
            ruleConfig,
          }),
        );
      }
    }
    const insights = summarizePolicyStrengthInsights(pairs, {
      baselineId: 'baseline',
      candidateId: 'candidate',
      horizonPlies: settings.maxPlies,
    });
    const raw = pairs.map((pair) =>
      JSON.stringify({
        kind: 'policyAttributionPair',
        label: spec.label,
        pair: compactPair(pair),
        revision,
      }),
    );
    return {
      raw,
      result: {
        claim: spec.claim,
        elapsedMs: performance.now() - startedAt,
        error: null,
        insights,
        label: spec.label,
        mirror,
        policyHash: candidate.sourceHash,
        revision,
        subject: revisionSubject(revision),
      },
    };
  } catch (error) {
    return {
      raw: [],
      result: {
        claim: spec.claim,
        elapsedMs: performance.now() - startedAt,
        error:
          error instanceof Error
            ? (error.stack ?? error.message)
            : String(error),
        insights: null,
        label: spec.label,
        mirror: null,
        policyHash: candidate?.sourceHash ?? null,
        revision,
        subject: revisionSubject(revision),
      },
    };
  } finally {
    await Promise.allSettled(
      [candidate, baseline]
        .filter(
          (policy): policy is NonNullable<typeof policy> => policy !== null,
        )
        .map((policy) => policy.dispose()),
    );
  }
}

function metricValues(result: RevisionResult): Record<string, number | null> {
  const values: Record<string, number | null> = {
    mirrorEquivariance: result.mirror?.equivalentShare ?? null,
    naturalResolution:
      result.insights?.gameDynamics.naturalResolutionShare ?? null,
    pointShare:
      result.insights?.strength.adjudicatedCandidatePointShare.mean ?? null,
  };
  for (const metric of TARGET_METRICS) {
    values[metric] = result.insights?.behavior[metric].candidate.mean ?? null;
  }
  for (const metric of RICH_TARGET_METRICS) {
    values[metric] =
      result.insights?.richBehavior.comparisons[metric]?.candidate.mean ?? null;
  }
  return values;
}

function incrementalEffects(results: RevisionResult[]) {
  return results.slice(1).map((result, index) => {
    const before = results[index];
    const beforeValues = metricValues(before);
    const afterValues = metricValues(result);
    return {
      after: result.label,
      before: before.label,
      changes: Object.fromEntries(
        Object.keys(afterValues).map((metric) => {
          const beforeValue = beforeValues[metric];
          const afterValue = afterValues[metric];
          return [
            metric,
            beforeValue === null || afterValue === null
              ? null
              : Number((afterValue - beforeValue).toFixed(6)),
          ];
        }),
      ),
    };
  });
}

function format(value: number | null | undefined): string {
  return value === null || value === undefined ? 'n/a' : value.toFixed(4);
}

function markdown(report: {
  effects: ReturnType<typeof incrementalEffects>;
  results: RevisionResult[];
  settings: Settings;
}): string {
  const lines = [
    '# AI Policy Change Attribution',
    '',
    `Profile: **${report.settings.profile}**; ${report.settings.pairCount} seed pair(s), ${report.settings.scenarioLimit} base fixture(s) plus mirrors, ${report.settings.maxPlies} plies, ${report.settings.nodeBudget} nodes per decision.`,
    '',
    'Every revision runs behind the same current policy harness, current domain, fixed fixtures, fixed candidate/baseline seed schedules, and fixed-node budget. Mirror decisions use identical seeds within each original/mirror comparison.',
    '',
    '| Revision step | Point share | Mirror equivalence | Depth-0 share | Action diversity | Kind switches | Jumps | Exact reuse | Source diversity | Retained turns | Family diversity | Intent switches | Productive progress |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const result of report.results) {
    if (!result.insights) {
      lines.push(
        `| ${result.label} (failed) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |`,
      );
      continue;
    }
    const rich = result.insights.richBehavior.comparisons;
    lines.push(
      `| ${result.label} | ${format(result.insights.strength.adjudicatedCandidatePointShare.mean)} | ${format(result.mirror?.equivalentShare)} | ${format(rich.depthZeroShare?.candidate.mean)} | ${format(result.insights.behavior.actionKindDiversity.candidate.mean)} | ${format(result.insights.behavior.actionKindSwitchRate.candidate.mean)} | ${format(result.insights.behavior.jumpShare.candidate.mean)} | ${format(result.insights.behavior.exactActionReuseRate.candidate.mean)} | ${format(result.insights.behavior.sourceDiversity.candidate.mean)} | ${format(result.insights.behavior.retainedTurnShare.candidate.mean)} | ${format(rich.sourceFamilyDiversity?.candidate.mean)} | ${format(rich.intentSwitchRate?.candidate.mean)} | ${format(rich.productiveProgressShare?.candidate.mean)} |`,
    );
  }
  lines.push('', '## Incremental effects', '');
  for (const effect of report.effects) {
    const ranked = Object.entries(effect.changes)
      .filter((entry): entry is [string, number] => entry[1] !== null)
      .sort((left, right) => Math.abs(right[1]) - Math.abs(left[1]))
      .slice(0, 8);
    lines.push(`### ${effect.before} → ${effect.after}`, '');
    lines.push(
      ranked.length
        ? ranked
            .map(
              ([metric, delta]) =>
                `- ${metric}: ${delta >= 0 ? '+' : ''}${delta.toFixed(4)}`,
            )
            .join('\n')
        : '- No comparable metrics.',
      '',
    );
  }
  const failures = report.results.filter((result) => result.error);
  if (failures.length) {
    lines.push('## Failures', '');
    for (const failure of failures) {
      lines.push(`- ${failure.label}: ${failure.error?.split('\n')[0]}`);
    }
    lines.push('');
  }
  lines.push(
    'This is a causal-screening portfolio, not a release strength gate. Confirm suspected commits with a focused ablation or larger paired run before changing production strategy.',
    '',
  );
  return lines.join('\n');
}

async function main(): Promise<void> {
  const settings = parseArgs(process.argv.slice(2));
  const fixtures = buildFixtures(settings.scenarioLimit);
  const results: RevisionResult[] = [];
  const raw: string[] = [];
  const startedAt = performance.now();

  for (const revision of settings.revisions) {
    process.stdout.write(
      `Attributing ${revision.label} (${revision.ref})...\n`,
    );
    const completed = await runRevision(revision, settings, fixtures);
    results.push(completed.result);
    raw.push(...completed.raw);
  }
  const rawText = raw.length ? `${raw.join('\n')}\n` : '';
  const effects = incrementalEffects(results);
  const report = {
    effects,
    execution: {
      elapsedMs: performance.now() - startedAt,
      failedRevisionCount: results.filter((result) => result.error).length,
      plannedDecisionUpperBound:
        settings.revisions.length *
        (fixtures.all.length * settings.pairCount * 2 * settings.maxPlies +
          fixtures.originals.length * settings.pairCount * 2),
    },
    generatedAt: new Date().toISOString(),
    provenance: {
      harnessRevision: resolveRevision('HEAD'),
      rawSha256: createHash('sha256').update(rawText).digest('hex'),
    },
    results,
    schemaVersion: 1,
    settings: {
      maxPlies: settings.maxPlies,
      nodeBudget: settings.nodeBudget,
      pairCount: settings.pairCount,
      profile: settings.profile,
      revisions: settings.revisions,
      scenarioLimit: settings.scenarioLimit,
    },
  };
  await mkdir(path.dirname(settings.out), { recursive: true });
  await Promise.all([
    writeFile(
      `${settings.out}.json`,
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8',
    ),
    writeFile(
      `${settings.out}.md`,
      `${markdown({ effects, results, settings })}\n`,
      'utf8',
    ),
    writeFile(`${settings.out}.samples.jsonl`, rawText, 'utf8'),
  ]);
  process.stdout.write(
    `${markdown({ effects, results, settings })}\nArtifacts: ${settings.out}.json, ${settings.out}.md, ${settings.out}.samples.jsonl\n`,
  );
  if (report.execution.failedRevisionCount > 0) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
