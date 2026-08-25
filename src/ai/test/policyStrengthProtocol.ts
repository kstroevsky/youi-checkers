import type { PolicyMatchPair } from '@/ai/test/policyMatch';

export type PentanomialCounts = [number, number, number, number, number];
export type StrengthQuestion = 'equivalence' | 'nonInferiority' | 'superiority';

export type SequentialStrengthConfig = {
  allocation: Record<string, number>;
  alpha: number;
  beta: number;
  margin: number;
  maxPairs: number;
  minPairs: number;
  question: StrengthQuestion;
};

export type SequentialStrengthVerdict =
  | 'acceptEquivalence'
  | 'acceptNonInferiority'
  | 'acceptSuperiority'
  | 'continue'
  | 'inconclusiveAtMaxPairs'
  | 'rejectEquivalence'
  | 'rejectNonInferiority'
  | 'rejectSuperiority';

export type SequentialStrengthResult = {
  balancedBlock: number | null;
  bounds: { lower: number; upper: number };
  counts: PentanomialCounts;
  eligible: boolean;
  llr: number | null;
  meanPointShare: number | null;
  pairCount: number;
  secondaryLlr: number | null;
  verdict: SequentialStrengthVerdict;
};

const PAIR_POINT_SHARES = [0, 0.25, 0.5, 0.75, 1] as const;
const JEFFREYS_PRIOR = 0.5;

function assertProbability(value: number, name: string): void {
  if (!(value > 0 && value < 1)) {
    throw new RangeError(`${name} must be strictly between zero and one.`);
  }
}

function assertConfig(config: SequentialStrengthConfig): void {
  assertProbability(config.alpha, 'alpha');
  assertProbability(config.beta, 'beta');
  if (!(config.margin > 0 && config.margin < 0.5)) {
    throw new RangeError('margin must be strictly between zero and 0.5.');
  }
  if (!Number.isSafeInteger(config.minPairs) || config.minPairs <= 0) {
    throw new RangeError('minPairs must be a positive safe integer.');
  }
  if (
    !Number.isSafeInteger(config.maxPairs) ||
    config.maxPairs < config.minPairs
  ) {
    throw new RangeError('maxPairs must be a safe integer >= minPairs.');
  }
  const allocations = Object.values(config.allocation);
  if (
    !allocations.length ||
    allocations.some((value) => !Number.isSafeInteger(value) || value <= 0)
  ) {
    throw new RangeError('allocation must contain positive safe integers.');
  }
}

function pairScoreIndex(score: number): number {
  const doubled = Math.round(score * 4);
  if (Math.abs(score * 4 - doubled) > 1e-9 || doubled < 0 || doubled > 4) {
    throw new RangeError(
      `Adjudicated pair score ${score} is not a pentanomial outcome.`,
    );
  }
  return doubled;
}

export function collectPentanomialCounts(
  pairs: Array<Pick<PolicyMatchPair, 'adjudicatedPairScore'>>,
): PentanomialCounts {
  const counts: PentanomialCounts = [0, 0, 0, 0, 0];
  for (const pair of pairs) {
    if (pair.adjudicatedPairScore === null) continue;
    counts[pairScoreIndex(pair.adjudicatedPairScore)] += 1;
  }
  return counts;
}

export function meanPentanomialPointShare(
  counts: PentanomialCounts,
): number | null {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (!total) return null;
  return (
    counts.reduce(
      (sum, count, index) => sum + count * PAIR_POINT_SHARES[index],
      0,
    ) / total
  );
}

/**
 * Exponential tilting preserves the observed pentanomial shape while imposing
 * a hypothesis-specific mean. Jeffreys smoothing keeps rare outcome cells
 * finite at early balanced checkpoints.
 */
function tiltedDistribution(
  counts: PentanomialCounts,
  targetMean: number,
): number[] {
  const smoothed = counts.map((count) => count + JEFFREYS_PRIOR);
  const total = smoothed.reduce((sum, count) => sum + count, 0);
  const base = smoothed.map((count) => count / total);

  const distributionAt = (lambda: number): number[] => {
    const unnormalized = base.map(
      (probability, index) =>
        probability * Math.exp(lambda * PAIR_POINT_SHARES[index]),
    );
    const scale = unnormalized.reduce((sum, value) => sum + value, 0);
    return unnormalized.map((value) => value / scale);
  };
  const meanAt = (lambda: number): number =>
    distributionAt(lambda).reduce(
      (sum, probability, index) => sum + probability * PAIR_POINT_SHARES[index],
      0,
    );
  let low = -64;
  let high = 64;

  for (let iteration = 0; iteration < 100; iteration += 1) {
    const middle = (low + high) / 2;
    if (meanAt(middle) < targetMean) low = middle;
    else high = middle;
  }

  return distributionAt((low + high) / 2);
}

function pentanomialLogLikelihood(
  counts: PentanomialCounts,
  mean: number,
): number {
  const probabilities = tiltedDistribution(counts, mean);
  return counts.reduce(
    (sum, count, index) => sum + count * Math.log(probabilities[index]),
    0,
  );
}

export function pentanomialGeneralizedLlr(
  counts: PentanomialCounts,
  nullMean: number,
  alternativeMean: number,
): number {
  return (
    pentanomialLogLikelihood(counts, alternativeMean) -
    pentanomialLogLikelihood(counts, nullMean)
  );
}

export function getBalancedBlock(
  stratumCounts: Record<string, number>,
  allocation: Record<string, number>,
): number | null {
  const strata = Object.keys(allocation).sort();
  if (
    Object.keys(stratumCounts).some(
      (stratum) => !(stratum in allocation) && stratumCounts[stratum] !== 0,
    )
  ) {
    return null;
  }
  const ratios = strata.map((stratum) => {
    const count = stratumCounts[stratum] ?? 0;
    const ratio = count / allocation[stratum];
    return Number.isSafeInteger(ratio) ? ratio : null;
  });
  const first = ratios[0];
  return first !== null && first > 0 && ratios.every((ratio) => ratio === first)
    ? first
    : null;
}

function stratumCounts(
  pairs: Array<Pick<PolicyMatchPair, 'fixtureId'>>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const pair of pairs) {
    counts[pair.fixtureId] = (counts[pair.fixtureId] ?? 0) + 1;
  }
  return counts;
}

function waldBounds(alpha: number, beta: number) {
  return {
    lower: Math.log(beta / (1 - alpha)),
    upper: Math.log((1 - beta) / alpha),
  };
}

export function evaluateSequentialStrength(
  pairs: PolicyMatchPair[],
  config: SequentialStrengthConfig,
): SequentialStrengthResult {
  assertConfig(config);
  const counts = collectPentanomialCounts(pairs);
  const pairCount = counts.reduce((sum, count) => sum + count, 0);
  const balancedBlock = getBalancedBlock(
    stratumCounts(pairs),
    config.allocation,
  );
  const adjustedAlpha =
    config.question === 'equivalence' ? config.alpha / 2 : config.alpha;
  const bounds = waldBounds(adjustedAlpha, config.beta);
  const eligible = balancedBlock !== null && pairCount >= config.minPairs;
  const resultBase = {
    balancedBlock,
    bounds,
    counts,
    eligible,
    meanPointShare: meanPentanomialPointShare(counts),
    pairCount,
  };

  if (!eligible) {
    return {
      ...resultBase,
      llr: null,
      secondaryLlr: null,
      verdict: 'continue',
    };
  }

  if (config.question === 'equivalence') {
    const lowerLlr = pentanomialGeneralizedLlr(
      counts,
      0.5 - config.margin,
      0.5,
    );
    const upperLlr = pentanomialGeneralizedLlr(
      counts,
      0.5 + config.margin,
      0.5,
    );
    let verdict: SequentialStrengthVerdict = 'continue';
    if (lowerLlr >= bounds.upper && upperLlr >= bounds.upper) {
      verdict = 'acceptEquivalence';
    } else if (lowerLlr <= bounds.lower || upperLlr <= bounds.lower) {
      verdict = 'rejectEquivalence';
    } else if (pairCount >= config.maxPairs) {
      verdict = 'inconclusiveAtMaxPairs';
    }
    return {
      ...resultBase,
      llr: lowerLlr,
      secondaryLlr: upperLlr,
      verdict,
    };
  }

  const nullMean =
    config.question === 'nonInferiority' ? 0.5 - config.margin : 0.5;
  const alternativeMean =
    config.question === 'nonInferiority' ? 0.5 : 0.5 + config.margin;
  const llr = pentanomialGeneralizedLlr(counts, nullMean, alternativeMean);
  let verdict: SequentialStrengthVerdict = 'continue';
  if (llr >= bounds.upper) {
    verdict =
      config.question === 'nonInferiority'
        ? 'acceptNonInferiority'
        : 'acceptSuperiority';
  } else if (llr <= bounds.lower) {
    verdict =
      config.question === 'nonInferiority'
        ? 'rejectNonInferiority'
        : 'rejectSuperiority';
  } else if (pairCount >= config.maxPairs) {
    verdict = 'inconclusiveAtMaxPairs';
  }

  return {
    ...resultBase,
    llr,
    secondaryLlr: null,
    verdict,
  };
}
