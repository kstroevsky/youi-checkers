export type PairedStrengthObservation = {
  baseline: number | null;
  candidate: number | null;
  pairId: string;
  stratumId: string;
};

export type ConfidenceInterval = { high: number; low: number };

export type NonInferiorityVerdict =
  | 'nonInferior'
  | 'regressed'
  | 'inconclusive';

export type StratifiedEffectSummary = {
  ci95: ConfidenceInterval;
  estimate: number;
  generalizationCi95: ConfidenceInterval;
  margin: number;
  observationCount: number;
  verdict: NonInferiorityVerdict;
};

export type StrengthStratumSummary = {
  eligiblePairCount: number;
  meanDifference: number | null;
  pairCount: number;
  stratumId: string;
};

export type StrengthVarianceComponents = {
  betweenStratumVariance: number;
  fixtureSeedVarianceShare: number;
  withinStratumVariance: number;
};

export type PairedStrengthComparison = {
  censoring: {
    baselineResolvedPairs: number;
    candidateResolvedPairs: number;
    jointlyResolvedPairs: number;
    pairCount: number;
  };
  overallVerdict: NonInferiorityVerdict;
  resolution: StratifiedEffectSummary;
  score: StratifiedEffectSummary;
  strata: StrengthStratumSummary[];
  variance: StrengthVarianceComponents;
};

function roundMetric(value: number, digits = 6): number {
  return Number(value.toFixed(digits));
}

function mean(values: number[]): number {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function sampleVariance(values: number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  return (
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    (values.length - 1)
  );
}

function quantile(sorted: number[], probability: number): number {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function createSeededRandom(seed: number): () => number {
  let current = seed >>> 0;
  return () => {
    current = (current * 1_664_525 + 1_013_904_223) >>> 0;
    return current / 0x1_0000_0000;
  };
}

function groupValues(
  observations: Array<{ difference: number; stratumId: string }>,
): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  for (const observation of observations) {
    const values = groups.get(observation.stratumId) ?? [];
    values.push(observation.difference);
    groups.set(observation.stratumId, values);
  }
  return groups;
}

function equalStratumMean(groups: Map<string, number[]>): number {
  return mean([...groups.values()].map((values) => mean(values)));
}

function bootstrapCi(
  groups: Map<string, number[]>,
  iterations: number,
  resampleStrata: boolean,
): ConfidenceInterval {
  if (!groups.size) return { high: 0, low: 0 };
  const entries = [...groups.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const random = createSeededRandom(
    groups.size * 2_654_435_761 +
      [...groups.values()].reduce((sum, values) => sum + values.length, 0),
  );
  const estimates = new Array<number>(iterations);

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const selectedEntries = resampleStrata
      ? entries.map(() => entries[Math.floor(random() * entries.length)])
      : entries;
    const stratumMeans = selectedEntries.map(([, values]) => {
      const resampled = values.map(
        () => values[Math.floor(random() * values.length)],
      );
      return mean(resampled);
    });
    estimates[iteration] = mean(stratumMeans);
  }

  estimates.sort((left, right) => left - right);
  return {
    high: roundMetric(quantile(estimates, 0.975)),
    low: roundMetric(quantile(estimates, 0.025)),
  };
}

function summarizeEffect(
  observations: Array<{ difference: number; stratumId: string }>,
  margin: number,
  iterations: number,
): StratifiedEffectSummary {
  const groups = groupValues(observations);
  const estimate = roundMetric(equalStratumMean(groups));
  const ci95 = bootstrapCi(groups, iterations, false);
  let verdict: NonInferiorityVerdict = 'inconclusive';
  if (!observations.length) verdict = 'inconclusive';
  else if (ci95.low >= -margin) verdict = 'nonInferior';
  else if (ci95.high < -margin) verdict = 'regressed';

  return {
    ci95,
    estimate,
    generalizationCi95: bootstrapCi(groups, iterations, true),
    margin: roundMetric(margin),
    observationCount: observations.length,
    verdict,
  };
}

/**
 * Compares matched revisions against the same frozen opponents. The fixed-strata
 * interval drives the gate; the hierarchical interval estimates generalization
 * uncertainty across both fixtures and seeds.
 */
export function summarizePairedStrengthNonInferiority(
  observations: PairedStrengthObservation[],
  options: {
    bootstrapIterations?: number;
    resolutionMargin?: number;
    scoreMargin: number;
  },
): PairedStrengthComparison {
  if (!observations.length) throw new Error('No paired strength observations.');
  const iterations = Math.max(100, options.bootstrapIterations ?? 2_000);
  const scoreMargin = Math.max(0, options.scoreMargin);
  const resolutionMargin = Math.max(
    0,
    options.resolutionMargin ?? options.scoreMargin,
  );
  const jointlyResolved = observations.flatMap((observation) =>
    observation.baseline === null || observation.candidate === null
      ? []
      : [
          {
            difference: observation.candidate - observation.baseline,
            stratumId: observation.stratumId,
          },
        ],
  );
  const resolutionObservations = observations.map((observation) => ({
    difference:
      Number(observation.candidate !== null) -
      Number(observation.baseline !== null),
    stratumId: observation.stratumId,
  }));
  const score = summarizeEffect(
    jointlyResolved,
    scoreMargin,
    iterations,
  );
  const resolution = summarizeEffect(
    resolutionObservations,
    resolutionMargin,
    iterations,
  );
  const groupedEligible = groupValues(jointlyResolved);
  const stratumMeans = [...groupedEligible.values()].map((values) => mean(values));
  const withinValues = [...groupedEligible.values()].flatMap((values) =>
    values.length > 1 ? [sampleVariance(values)] : [],
  );
  const betweenStratumVariance = sampleVariance(stratumMeans);
  const withinStratumVariance = mean(withinValues);
  const totalVariance = betweenStratumVariance + withinStratumVariance;
  const strata = [...new Set(observations.map(({ stratumId }) => stratumId))]
    .sort()
    .map((stratumId) => {
      const all = observations.filter(
        (observation) => observation.stratumId === stratumId,
      );
      const eligible = groupedEligible.get(stratumId) ?? [];
      return {
        eligiblePairCount: eligible.length,
        meanDifference: eligible.length ? roundMetric(mean(eligible)) : null,
        pairCount: all.length,
        stratumId,
      };
    });
  const overallVerdict: NonInferiorityVerdict =
    score.verdict === 'regressed' || resolution.verdict === 'regressed'
      ? 'regressed'
      : score.verdict === 'nonInferior' && resolution.verdict === 'nonInferior'
        ? 'nonInferior'
        : 'inconclusive';

  return {
    censoring: {
      baselineResolvedPairs: observations.filter(
        (observation) => observation.baseline !== null,
      ).length,
      candidateResolvedPairs: observations.filter(
        (observation) => observation.candidate !== null,
      ).length,
      jointlyResolvedPairs: jointlyResolved.length,
      pairCount: observations.length,
    },
    overallVerdict,
    resolution,
    score,
    strata,
    variance: {
      betweenStratumVariance: roundMetric(betweenStratumVariance),
      fixtureSeedVarianceShare: roundMetric(
        totalVariance > 0 ? betweenStratumVariance / totalVariance : 0,
      ),
      withinStratumVariance: roundMetric(withinStratumVariance),
    },
  };
}
