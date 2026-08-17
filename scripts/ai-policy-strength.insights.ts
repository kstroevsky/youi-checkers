import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline';

import type { PolicyMatchPair } from '@/ai/test/policyMatch';
import {
  POLICY_STRENGTH_PHASES,
  summarizePolicyStrengthInsights,
  type PairedMetricComparison,
  type PolicyBehaviorMetric,
  type PolicyStrengthInsights,
} from '@/ai/test/policyStrengthInsights';

type CampaignReport = {
  execution: { completedPairCount: number; status: string };
  primary: {
    bounds: { lower: number; upper: number };
    llr: number | null;
    meanPointShare: number | null;
    pairCount: number;
    verdict: string;
  };
  provenance: {
    campaignId?: string;
    currentPolicyHash: string;
    legacyPolicyHash: string;
    rawHash: string;
  };
  secondary: {
    naturalResolvedGameCount: number;
    naturalResolvedGameShare: number;
  };
  settings: { maxPlies: number };
};

type InsightsReport = {
  analysis: PolicyStrengthInsights;
  generatedAt: string;
  methodology: {
    behaviorComparisonUnit: 'balanced color-swapped pair';
    confidenceIntervals: 'normal 95% interval over pair-level observations';
    limitations: string[];
  };
  protocol: CampaignReport['primary'];
  provenance: CampaignReport['provenance'] & {
    campaignReport: string;
    samples: string;
  };
  sourceCampaignStatus: string;
};

const METRIC_LABELS: Record<PolicyBehaviorMetric, string> = {
  actionKindDiversity: 'Action-kind diversity',
  actionKindSwitchRate: 'Action-kind switch rate',
  exactActionReuseRate: 'Exact-action reuse rate',
  jumpShare: 'Jump share',
  meanDisplacement: 'Mean board displacement',
  multiJumpShare: 'Multi-jump share',
  regionDiversity: 'Source-region diversity',
  retainedTurnShare: 'Retained-turn continuation share',
  sameRegionRepeatRate: 'Same-region repeat rate',
  sameSourceRepeatRate: 'Same-source repeat rate',
  sourceDiversity: 'Source-cell diversity',
  stackManipulationShare: 'Stack-manipulation share',
};

function parseArgs(argv: string[]): {
  out: string;
  report: string;
  samples: string;
} {
  const args = new Map<string, string>();
  const allowed = new Set(['out', 'report', 'samples']);
  for (const entry of argv) {
    if (!entry.startsWith('--')) continue;
    const [key, value = ''] = entry.slice(2).split('=');
    if (!allowed.has(key)) throw new Error(`Unknown argument --${key}.`);
    args.set(key, value);
  }
  const report = args.get('report');
  const samples = args.get('samples');
  if (!report) throw new Error('Missing --report=<campaign.json>.');
  if (!samples) throw new Error('Missing --samples=<campaign.samples.jsonl>.');
  return {
    out:
      args.get('out') ??
      path.join(process.cwd(), 'output', 'ai', 'ai-policy-strength-insights'),
    report,
    samples,
  };
}

async function readPairsAndHash(samplesPath: string): Promise<{
  pairs: PolicyMatchPair[];
  sha256: string;
}> {
  const pairs: PolicyMatchPair[] = [];
  const hash = createHash('sha256');
  const input = createReadStream(samplesPath, { encoding: 'utf8' });
  const lines = createInterface({ crlfDelay: Infinity, input });

  for await (const line of lines) {
    if (!line) continue;
    hash.update(`${line}\n`);
    pairs.push(JSON.parse(line) as PolicyMatchPair);
  }
  return { pairs, sha256: hash.digest('hex') };
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function signed(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(4)}`;
}

function comparisonRow(
  metric: PolicyBehaviorMetric,
  comparison: PairedMetricComparison,
): string {
  return `| ${METRIC_LABELS[metric]} | ${comparison.candidate.mean.toFixed(4)} | ${comparison.baseline.mean.toFixed(4)} | ${signed(comparison.delta.mean)} | [${comparison.delta.ci95.low.toFixed(4)}, ${comparison.delta.ci95.high.toFixed(4)}] |`;
}

function markdown(report: InsightsReport): string {
  const { analysis } = report;
  const behaviorRows = (
    Object.entries(analysis.behavior) as Array<
      [PolicyBehaviorMetric, PairedMetricComparison]
    >
  )
    .sort(
      (left, right) =>
        Math.abs(right[1].delta.mean) - Math.abs(left[1].delta.mean),
    )
    .map(([metric, comparison]) => comparisonRow(metric, comparison));
  const actionKinds = Object.keys(
    analysis.actionKinds.overallShares[analysis.policies.candidate],
  ) as Array<keyof (typeof analysis.actionKinds.overallShares)[string]>;
  const actionRows = actionKinds.map((kind) => {
    const candidate =
      analysis.actionKinds.overallShares[analysis.policies.candidate][kind];
    const baseline =
      analysis.actionKinds.overallShares[analysis.policies.baseline][kind];
    return `| ${kind} | ${percent(candidate)} | ${percent(baseline)} | ${signed(candidate - baseline)} |`;
  });
  const fixtureRows = Object.entries(analysis.fixtures)
    .sort(
      (left, right) =>
        right[1].adjudicatedCandidatePointShare.mean -
        left[1].adjudicatedCandidatePointShare.mean,
    )
    .map(
      ([fixtureId, fixture]) =>
        `| ${fixtureId} | ${fixture.pairCount} | ${percent(fixture.adjudicatedCandidatePointShare.mean)} | ${percent(fixture.naturalResolutionShare)} | ${percent(fixture.repeatedPositionPlyShare)} | ${percent(fixture.twoPlyUndoRate)} |`,
    );
  const phaseRows = POLICY_STRENGTH_PHASES.map((phase) => {
    const candidate =
      analysis.actionKinds.phaseShares[phase][analysis.policies.candidate];
    const baseline =
      analysis.actionKinds.phaseShares[phase][analysis.policies.baseline];
    return `| ${phase} | ${analysis.actionKinds.phaseJensenShannonDivergence[phase].toFixed(4)} | ${percent(candidate.jumpSequence)} | ${percent(baseline.jumpSequence)} | ${percent(candidate.friendlyStackTransfer)} | ${percent(baseline.friendlyStackTransfer)} |`;
  });
  const mirrorRows = Object.entries(analysis.spatialMirrors)
    .sort(
      (left, right) =>
        Math.abs(right[1].mirrorMinusOriginal) -
        Math.abs(left[1].mirrorMinusOriginal),
    )
    .map(
      ([fixtureId, fixture]) =>
        `| ${fixtureId} | ${percent(fixture.originalPointShare)} | ${percent(fixture.mirrorPointShare)} | ${signed(fixture.mirrorMinusOriginal)} | ${percent(fixture.averagePointShare)} |`,
    );

  return [
    '# Current-vs-Legacy Behavioral Insights',
    '',
    '## Executive Summary',
    '',
    `- The current policy scored **${percent(analysis.strength.adjudicatedCandidatePointShare.mean)}** over ${analysis.population.pairCount} balanced pairs; the original sequential protocol remains **${report.protocol.verdict}**.`,
    `- Only **${percent(analysis.gameDynamics.naturalResolutionShare)}** of ${analysis.population.gameCount} games resolved naturally, so the campaign is much stronger evidence about fixed-horizon behavior than about satisfying endings.`,
    `- The saved trace contains ${analysis.population.plyCount.toLocaleString('en-US')} observed plies. Behavioral comparisons below use each color-swapped pair as one observation rather than treating individual moves as independent samples.`,
    `- The current policy scored **${percent(analysis.strength.candidateGamePointShareByColor.black.mean)} as black** and **${percent(analysis.strength.candidateGamePointShareByColor.white.mean)} as white**; the paired black-minus-white gap was **${percent(analysis.strength.candidateBlackMinusWhite.mean)}**.`,
    `- The current policy made **${percent(analysis.actionKinds.policyPlyShares[analysis.policies.candidate])} of all plies**, consistent with its higher jump and retained-turn continuation rates.`,
    '',
    '## Observable Policy Differences',
    '',
    'Positive deltas mean the current policy measured higher; these are exploratory behavioral proxies, not a causal decomposition of enjoyment.',
    '',
    '| Metric | Current | Legacy | Delta | Delta 95% CI |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...behaviorRows,
    '',
    '## Strategic Move Mix',
    '',
    '| Action kind | Current | Legacy | Delta |',
    '| --- | ---: | ---: | ---: |',
    ...actionRows,
    '',
    '## How The Difference Changes By Phase',
    '',
    'Jensen-Shannon divergence is zero for identical move-kind mixtures and grows as the policies use meaningfully different action mixes.',
    '',
    '| Phase | Mix divergence | Current jumps | Legacy jumps | Current transfers | Legacy transfers |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...phaseRows,
    '',
    '## Opening Variety',
    '',
    `- First-action entropy: current **${analysis.opening.firstActionEntropy[analysis.policies.candidate].toFixed(3)}**, legacy **${analysis.opening.firstActionEntropy[analysis.policies.baseline].toFixed(3)}**.`,
    `- Unique first-action share: current **${percent(analysis.opening.firstActionUniqueShare[analysis.policies.candidate])}**, legacy **${percent(analysis.opening.firstActionUniqueShare[analysis.policies.baseline])}**.`,
    `- First-four move-kind line entropy: current **${analysis.opening.firstFourKindLineEntropy[analysis.policies.candidate].toFixed(3)}**, legacy **${analysis.opening.firstFourKindLineEntropy[analysis.policies.baseline].toFixed(3)}**.`,
    '',
    '## Joint Game Dynamics',
    '',
    `- Repeated-position ply share: **${percent(analysis.gameDynamics.repeatedPositionPlyShare.mean)}**.`,
    `- Immediate two-ply undo rate: **${percent(analysis.gameDynamics.twoPlyUndoRate.mean)}**.`,
    `- Unique-position share: **${percent(analysis.gameDynamics.uniquePositionShare.mean)}**.`,
    `- Position recurrence: rate **${analysis.gameDynamics.recurrenceRate.mean.toFixed(4)}**, determinism **${analysis.gameDynamics.recurrenceDeterminism.mean.toFixed(4)}**, laminarity **${analysis.gameDynamics.recurrenceLaminarity.mean.toFixed(4)}**.`,
    `- Normalized Lempel-Ziv complexity: action kinds **${analysis.gameDynamics.actionKindLempelZiv.mean.toFixed(4)}**, positions **${analysis.gameDynamics.positionLempelZiv.mean.toFixed(4)}**.`,
    '',
    'These are properties of current-vs-legacy interaction and cannot be assigned to one policy without additional counterfactual matchups.',
    '',
    '## Spatial Mirror Sensitivity',
    '',
    'Large original-versus-mirror differences mean the relative current-vs-legacy result depends on board orientation. Because both policies play in every game, this identifies a matchup-level equivariance problem but does not identify which policy causes it.',
    '',
    '| Base fixture | Original | Horizontal mirror | Mirror minus original | Balanced average |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...mirrorRows,
    '',
    '## Fixture Sensitivity',
    '',
    '| Fixture | Pairs | Current points | Natural resolution | Repeated positions | Two-ply undo |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...fixtureRows,
    '',
    '## What This Trace Cannot Establish',
    '',
    ...report.methodology.limitations.map((limitation) => `- ${limitation}`),
    '',
    '## Recommended Next Measurement',
    '',
    'Use the existing campaign as a broad safety and behavioral baseline. Replace another full rerun with short, position-seeded counterfactual continuations that compare current-vs-current, legacy-vs-legacy, and current-vs-legacy under the same fixtures. Retain rich decision diagnostics for a small sample so tension, participation by checker identity, legal-choice compression, strategic intent, and avoidable repetition can be attributed rather than approximated.',
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const campaign = JSON.parse(
    await readFile(args.report, 'utf8'),
  ) as CampaignReport;
  const { pairs, sha256 } = await readPairsAndHash(args.samples);
  if (sha256 !== campaign.provenance.rawHash) {
    throw new Error(
      `Raw sample hash mismatch: expected ${campaign.provenance.rawHash}, received ${sha256}.`,
    );
  }
  if (pairs.length !== campaign.execution.completedPairCount) {
    throw new Error(
      `Pair count mismatch: expected ${campaign.execution.completedPairCount}, received ${pairs.length}.`,
    );
  }

  const analysis = summarizePolicyStrengthInsights(pairs, {
    baselineId: 'legacy-v0',
    candidateId: 'current',
    horizonPlies: campaign.settings.maxPlies,
  });
  if (
    campaign.primary.meanPointShare === null ||
    Math.abs(
      analysis.strength.adjudicatedCandidatePointShare.mean -
        campaign.primary.meanPointShare,
    ) > 0.0000005
  ) {
    throw new Error(
      'Offline point share does not reproduce the campaign report.',
    );
  }
  const report: InsightsReport = {
    analysis,
    generatedAt: new Date().toISOString(),
    methodology: {
      behaviorComparisonUnit: 'balanced color-swapped pair',
      confidenceIntervals: 'normal 95% interval over pair-level observations',
      limitations: [
        'The compact strength trace retained chosen actions and position hashes, but not root alternatives, evaluations, strategic tags, legal-move counts, or checker identities.',
        'Source-cell and source-region diversity are observable participation proxies; they are not the production participation score, which follows checker families and moved mass.',
        'Both policies appear in every game, so position recurrence, game length, and resolution are interaction-level metrics rather than policy-specific effects.',
        'Behavioral intervals are exploratory and are not adjusted for the number of metrics inspected.',
        'Fixed-horizon adjudication supplies the strength endpoint for unfinished games; it is not evidence that those games produced satisfying conclusions for a human player.',
      ],
    },
    protocol: campaign.primary,
    provenance: {
      ...campaign.provenance,
      campaignReport: path.resolve(args.report),
      samples: path.resolve(args.samples),
    },
    sourceCampaignStatus: campaign.execution.status,
  };
  await mkdir(path.dirname(args.out), { recursive: true });
  await Promise.all([
    writeFile(
      `${args.out}.json`,
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8',
    ),
    writeFile(`${args.out}.md`, `${markdown(report)}\n`, 'utf8'),
  ]);
  process.stdout.write(
    `${markdown(report)}\nArtifacts: ${args.out}.json, ${args.out}.md\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
