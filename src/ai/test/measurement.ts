import type { AiFallbackKind, AiSearchBudget } from '@/ai';
import type {
  AiGameTrace,
  AiTerminalType,
  AiTracePly,
} from '@/ai/test/metrics';

export const AI_MEASUREMENT_SCHEMA_VERSION = 1 as const;

export type ConfidenceInterval = {
  high: number;
  low: number;
};

export type NumericDistributionSummary = {
  count: number;
  maximum: number;
  mean: number;
  meanCi95: ConfidenceInterval;
  median: number;
  medianCi95: ConfidenceInterval;
  minimum: number;
  p90: number;
  p95: number;
};

export type ProportionSummary = {
  count: number;
  share: number;
  total: number;
  wilsonCi95: ConfidenceInterval;
};

export type PairedDifferenceSummary = {
  baseline: NumericDistributionSummary;
  candidate: NumericDistributionSummary;
  direction: 'higherIsBetter' | 'lowerIsBetter';
  difference: NumericDistributionSummary;
  improvementProbability: number;
  materialDifference: number;
  orientedMeanDifference: number;
  orientedMeanDifferenceCi95: ConfidenceInterval;
  pairCount: number;
  verdict: 'improved' | 'inconclusive' | 'regressed';
};

export type EffectiveDiversitySummary = {
  hill0Richness: number;
  hill1EffectiveBehaviors: number;
  hill2EffectiveBehaviors: number;
  millerMadowEntropyNats: number;
  pluginEntropyNats: number;
  sampleSize: number;
};

export type SearchPathSummary = {
  assertions: {
    missingBudgetMetadataCount: number;
    unexpectedBudgetTypeCount: number;
  };
  budgetExhaustionCounts: Record<'none' | 'nodes' | 'time' | 'unknown', number>;
  budgetTypeCounts: Record<string, number>;
  completedDepth: NumericDistributionSummary;
  completedRootMoves: NumericDistributionSummary;
  elapsedMs: NumericDistributionSummary;
  evaluatedNodes: NumericDistributionSummary;
  fallbackCounts: Record<AiFallbackKind, number>;
  fallbackShare: ProportionSummary;
  quiescenceNodes: NumericDistributionSummary;
  rootScoreRegret: NumericDistributionSummary;
  timedOutShare: ProportionSummary;
  zeroDepthShare: ProportionSummary;
};

export type SearchExecutionSample = Pick<
  AiTracePly,
  | 'completedDepth'
  | 'completedRootMoves'
  | 'diagnostics'
  | 'elapsedMs'
  | 'evaluatedNodes'
  | 'fallbackKind'
  | 'rootScoreRegret'
  | 'searchBudget'
  | 'timedOut'
>;

export type ExpectedSearchBudget = AiSearchBudget | { type: 'presetTime' };

export type OutcomeSummary = {
  actualDraws: ProportionSummary;
  normalGoalWins: ProportionSummary;
  tiebreakWins: ProportionSummary;
  terminalCounts: Record<AiTerminalType, number>;
  unfinished: ProportionSummary;
};

export type BehaviorMeasurementSummary = {
  actionKindDiversity: EffectiveDiversitySummary;
  boardDisplacement: NumericDistributionSummary;
  firstMoveDiversity: EffectiveDiversitySummary;
  firstMoveSourceFamilyDiversity: EffectiveDiversitySummary;
  participationDelta: NumericDistributionSummary;
  positiveParticipationShare: ProportionSummary;
  repetitionShare: ProportionSummary;
  strategicIntentDiversity: EffectiveDiversitySummary;
  twoPlyUndoShare: ProportionSummary;
};

function roundMetric(value: number, digits = 6): number {
  return Number(value.toFixed(digits));
}

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function quantile(sortedValues: number[], probability: number): number {
  if (!sortedValues.length) return 0;
  if (sortedValues.length === 1) return sortedValues[0];

  const position = (sortedValues.length - 1) * probability;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);

  if (lowerIndex === upperIndex) return sortedValues[lowerIndex];

  const weight = position - lowerIndex;
  return (
    sortedValues[lowerIndex] * (1 - weight) + sortedValues[upperIndex] * weight
  );
}

function createSeededRandom(seed: number): () => number {
  let current = seed >>> 0;

  return () => {
    current = (current * 1_664_525 + 1_013_904_223) >>> 0;
    return current / 0x1_0000_0000;
  };
}

function bootstrapInterval(
  values: number[],
  statistic: (sample: number[]) => number,
  iterations = 1_000,
): ConfidenceInterval {
  if (!values.length) return { high: 0, low: 0 };
  if (values.length === 1) {
    const value = roundMetric(values[0]);
    return { high: value, low: value };
  }

  const random = createSeededRandom(values.length * 2_654_435_761);
  const estimates = new Array<number>(iterations);

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const sample = new Array<number>(values.length);

    for (let index = 0; index < values.length; index += 1) {
      sample[index] = values[Math.floor(random() * values.length)];
    }

    estimates[iteration] = statistic(sample);
  }

  estimates.sort((left, right) => left - right);
  return {
    high: roundMetric(quantile(estimates, 0.975)),
    low: roundMetric(quantile(estimates, 0.025)),
  };
}

/**
 * Summarizes matched observations. Positive oriented differences are always
 * improvements, regardless of whether the source metric is higher- or
 * lower-is-better.
 */
export function summarizePairedDifference(
  pairs: Array<{ baseline: number; candidate: number }>,
  options: {
    direction: PairedDifferenceSummary['direction'];
    materialDifference?: number;
  },
): PairedDifferenceSummary {
  const finitePairs = pairs.filter(
    ({ baseline, candidate }) =>
      Number.isFinite(baseline) && Number.isFinite(candidate),
  );
  const rawDifferences = finitePairs.map(
    ({ baseline, candidate }) => candidate - baseline,
  );
  const orientation = options.direction === 'higherIsBetter' ? 1 : -1;
  const orientedDifferences = rawDifferences.map(
    (difference) => difference * orientation,
  );
  const materialDifference = Math.max(0, options.materialDifference ?? 0);
  const orientedMeanDifference = roundMetric(mean(orientedDifferences));
  const orientedMeanDifferenceCi95 = bootstrapInterval(
    orientedDifferences,
    mean,
  );
  let verdict: PairedDifferenceSummary['verdict'] = 'inconclusive';

  if (orientedMeanDifferenceCi95.low > materialDifference) {
    verdict = 'improved';
  } else if (orientedMeanDifferenceCi95.high < -materialDifference) {
    verdict = 'regressed';
  }

  return {
    baseline: summarizeNumericDistribution(
      finitePairs.map(({ baseline }) => baseline),
    ),
    candidate: summarizeNumericDistribution(
      finitePairs.map(({ candidate }) => candidate),
    ),
    difference: summarizeNumericDistribution(rawDifferences),
    direction: options.direction,
    improvementProbability: roundMetric(
      orientedDifferences.filter((difference) => difference > 0).length /
        Math.max(1, orientedDifferences.length),
    ),
    materialDifference,
    orientedMeanDifference,
    orientedMeanDifferenceCi95,
    pairCount: finitePairs.length,
    verdict,
  };
}

/** Summarizes raw numeric samples without discarding their uncertainty. */
export function summarizeNumericDistribution(
  rawValues: number[],
): NumericDistributionSummary {
  const values = rawValues.filter(Number.isFinite);
  const sorted = [...values].sort((left, right) => left - right);
  const medianStatistic = (sample: number[]): number =>
    quantile(
      [...sample].sort((left, right) => left - right),
      0.5,
    );

  if (!values.length) {
    return {
      count: 0,
      maximum: 0,
      mean: 0,
      meanCi95: { high: 0, low: 0 },
      median: 0,
      medianCi95: { high: 0, low: 0 },
      minimum: 0,
      p90: 0,
      p95: 0,
    };
  }

  return {
    count: values.length,
    maximum: roundMetric(sorted.at(-1) ?? 0),
    mean: roundMetric(mean(values)),
    meanCi95: bootstrapInterval(values, mean),
    median: roundMetric(quantile(sorted, 0.5)),
    medianCi95: bootstrapInterval(values, medianStatistic),
    minimum: roundMetric(sorted[0]),
    p90: roundMetric(quantile(sorted, 0.9)),
    p95: roundMetric(quantile(sorted, 0.95)),
  };
}

/** Uses a Wilson interval so small suites do not report false zero uncertainty. */
export function summarizeProportion(
  count: number,
  total: number,
): ProportionSummary {
  if (total <= 0) {
    return {
      count: 0,
      share: 0,
      total: 0,
      wilsonCi95: { high: 0, low: 0 },
    };
  }

  const boundedCount = Math.max(0, Math.min(total, count));
  const proportion = boundedCount / total;
  const z = 1.959963984540054;
  const denominator = 1 + (z * z) / total;
  const center = (proportion + (z * z) / (2 * total)) / denominator;
  const margin =
    (z / denominator) *
    Math.sqrt(
      (proportion * (1 - proportion)) / total + (z * z) / (4 * total * total),
    );

  return {
    count: boundedCount,
    share: roundMetric(proportion),
    total,
    wilsonCi95: {
      high: roundMetric(Math.min(1, center + margin)),
      low: roundMetric(Math.max(0, center - margin)),
    },
  };
}

/** Reports entropy as effective behavior counts at Hill orders 0, 1, and 2. */
export function summarizeEffectiveDiversity(
  distribution: Record<string, number>,
): EffectiveDiversitySummary {
  const counts = Object.values(distribution).filter((value) => value > 0);
  const sampleSize = counts.reduce((sum, value) => sum + value, 0);
  const richness = counts.length;

  if (!sampleSize) {
    return {
      hill0Richness: 0,
      hill1EffectiveBehaviors: 0,
      hill2EffectiveBehaviors: 0,
      millerMadowEntropyNats: 0,
      pluginEntropyNats: 0,
      sampleSize: 0,
    };
  }

  const probabilities = counts.map((count) => count / sampleSize);
  const pluginEntropy = -probabilities.reduce(
    (sum, probability) => sum + probability * Math.log(probability),
    0,
  );
  const correctedEntropy = pluginEntropy + (richness - 1) / (2 * sampleSize);
  const concentration = probabilities.reduce(
    (sum, probability) => sum + probability * probability,
    0,
  );

  return {
    hill0Richness: richness,
    hill1EffectiveBehaviors: roundMetric(
      Math.min(richness, Math.exp(correctedEntropy)),
    ),
    hill2EffectiveBehaviors: roundMetric(1 / concentration),
    millerMadowEntropyNats: roundMetric(correctedEntropy),
    pluginEntropyNats: roundMetric(pluginEntropy),
    sampleSize,
  };
}

function increment(distribution: Record<string, number>, key: string): void {
  distribution[key] = (distribution[key] ?? 0) + 1;
}

function allPlies(traces: AiGameTrace[]): AiTracePly[] {
  return traces.flatMap((trace) => trace.plies);
}

export function summarizeSearchExecutions(
  plies: SearchExecutionSample[],
  expectedBudget?: ExpectedSearchBudget,
): SearchPathSummary {
  const fallbackCounts: Record<AiFallbackKind, number> = {
    legalOrder: 0,
    none: 0,
    orderedRoot: 0,
    partialCurrentDepth: 0,
    previousDepth: 0,
  };
  const budgetExhaustionCounts = {
    none: 0,
    nodes: 0,
    time: 0,
    unknown: 0,
  };
  const budgetTypeCounts: Record<string, number> = {};
  let missingBudgetMetadataCount = 0;
  let unexpectedBudgetTypeCount = 0;

  for (const ply of plies) {
    fallbackCounts[ply.fallbackKind] += 1;

    if (!ply.searchBudget) {
      missingBudgetMetadataCount += 1;
      budgetExhaustionCounts.unknown += 1;
      increment(budgetTypeCounts, 'unknown');
      continue;
    }

    budgetExhaustionCounts[ply.searchBudget.exhaustedBy] += 1;
    increment(budgetTypeCounts, ply.searchBudget.type);

    if (expectedBudget && ply.searchBudget.type !== expectedBudget.type) {
      unexpectedBudgetTypeCount += 1;
    }
  }

  return {
    assertions: {
      missingBudgetMetadataCount,
      unexpectedBudgetTypeCount,
    },
    budgetExhaustionCounts,
    budgetTypeCounts,
    completedDepth: summarizeNumericDistribution(
      plies.map((ply) => ply.completedDepth),
    ),
    completedRootMoves: summarizeNumericDistribution(
      plies.map((ply) => ply.completedRootMoves),
    ),
    elapsedMs: summarizeNumericDistribution(plies.map((ply) => ply.elapsedMs)),
    evaluatedNodes: summarizeNumericDistribution(
      plies.map((ply) => ply.evaluatedNodes),
    ),
    fallbackCounts,
    fallbackShare: summarizeProportion(
      plies.filter((ply) => ply.fallbackKind !== 'none').length,
      plies.length,
    ),
    quiescenceNodes: summarizeNumericDistribution(
      plies.map((ply) => ply.diagnostics.quiescenceNodes),
    ),
    rootScoreRegret: summarizeNumericDistribution(
      plies.map((ply) => ply.rootScoreRegret),
    ),
    timedOutShare: summarizeProportion(
      plies.filter((ply) => ply.timedOut).length,
      plies.length,
    ),
    zeroDepthShare: summarizeProportion(
      plies.filter((ply) => ply.completedDepth === 0).length,
      plies.length,
    ),
  };
}

export function summarizeSearchPaths(
  traces: AiGameTrace[],
  expectedBudget?: ExpectedSearchBudget,
): SearchPathSummary {
  return summarizeSearchExecutions(allPlies(traces), expectedBudget);
}

export function summarizeOutcomes(traces: AiGameTrace[]): OutcomeSummary {
  const terminalCounts: Record<AiTerminalType, number> = {
    homeField: 0,
    sixStacks: 0,
    stalemateDraw: 0,
    stalemateTiebreakWin: 0,
    threefoldDraw: 0,
    threefoldTiebreakWin: 0,
    unfinished: 0,
  };

  for (const trace of traces) terminalCounts[trace.terminalType] += 1;

  return {
    actualDraws: summarizeProportion(
      terminalCounts.threefoldDraw + terminalCounts.stalemateDraw,
      traces.length,
    ),
    normalGoalWins: summarizeProportion(
      terminalCounts.homeField + terminalCounts.sixStacks,
      traces.length,
    ),
    terminalCounts,
    tiebreakWins: summarizeProportion(
      terminalCounts.threefoldTiebreakWin + terminalCounts.stalemateTiebreakWin,
      traces.length,
    ),
    unfinished: summarizeProportion(terminalCounts.unfinished, traces.length),
  };
}

export function summarizeMeasuredBehavior(
  traces: AiGameTrace[],
): BehaviorMeasurementSummary {
  const plies = allPlies(traces);
  const actionKinds: Record<string, number> = {};
  const firstMoves: Record<string, number> = {};
  const firstMoveSourceFamilies: Record<string, number> = {};
  const intents: Record<string, number> = {};

  for (const trace of traces) {
    if (trace.plies[0]) {
      increment(firstMoves, trace.plies[0].actionKey);
      increment(firstMoveSourceFamilies, trace.plies[0].sourceFamily);
    }
  }

  for (const ply of plies) {
    increment(actionKinds, ply.actionKind);
    increment(intents, ply.strategicIntent);
  }

  return {
    actionKindDiversity: summarizeEffectiveDiversity(actionKinds),
    boardDisplacement: summarizeNumericDistribution(
      plies.map((ply) => ply.boardDisplacement),
    ),
    firstMoveDiversity: summarizeEffectiveDiversity(firstMoves),
    firstMoveSourceFamilyDiversity: summarizeEffectiveDiversity(
      firstMoveSourceFamilies,
    ),
    participationDelta: summarizeNumericDistribution(
      plies.map((ply) => ply.participationDelta),
    ),
    positiveParticipationShare: summarizeProportion(
      plies.filter((ply) => ply.participationDelta > 0).length,
      plies.length,
    ),
    repetitionShare: summarizeProportion(
      plies.filter((ply) => ply.isRepetition).length,
      plies.length,
    ),
    strategicIntentDiversity: summarizeEffectiveDiversity(intents),
    twoPlyUndoShare: summarizeProportion(
      plies.filter((ply) => ply.isSelfUndo).length,
      plies.length,
    ),
  };
}
