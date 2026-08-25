import type { AiGameTrace, AiTracePly } from '@/ai/test/metrics';

export type RecurrenceQuantification = {
  determinism: number;
  laminarity: number;
  maxDiagonalLine: number;
  maxVerticalLine: number;
  recurrenceRate: number;
  trappingTime: number;
};

export type AdvancedTraceSummary = {
  frontierCompressionRate: number | null;
  frontierCompressionSampleCount: number;
  loopEscapeEligibleTraceCount: number;
  loopEscapeObservedCount: number;
  loopEscapeRate16: number | null;
  loopEscapeRate24: number | null;
  loopEscapeRate8: number | null;
  meanLoopEscapePly: number | null;
  nearCycleRate: number | null;
  nearCycleSampleCount: number;
  pressureEventRate: number;
  positionLempelZiv: number;
  recurrenceDeterminism: number;
  recurrenceLaminarity: number;
  recurrenceRate: number;
  riskProgressShare: number;
  scorePermutationEntropy: number;
  scoreSampleEntropy: number | null;
  scoreSampleEntropyTraceCount: number;
  trappingTime: number;
};

const LOOP_ESCAPE_WINDOW = 4;
const NEAR_CYCLE_MAX_LAG = 12;
const NEAR_CYCLE_MIN_LAG = 2;
const NEAR_CYCLE_DISTANCE_THRESHOLD = 0.08;

function roundMetric(value: number, digits = 6): number {
  return Number(value.toFixed(digits));
}

function roundOptionalMetric(value: number | null, digits = 6): number | null {
  return value === null ? null : roundMetric(value, digits);
}

function average(values: number[]): number {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length <= 1) {
    return 0;
  }

  const mean = average(values);
  const variance = average(
    values.map((value) => {
      const delta = value - mean;
      return delta * delta;
    }),
  );

  return Math.sqrt(variance);
}

function getPlanProgress(ply: AiTracePly): number {
  return ply.homeFieldDelta + ply.sixStackDelta;
}

function isPressureEvent(ply: AiTracePly): boolean {
  return (
    ply.freezeSwingBonus > 0 ||
    ply.tags.includes('captureControl') ||
    ply.tags.includes('freezeBlock') ||
    (ply.opponentReplyCompression ?? 0) >= 0.15 ||
    getPlanProgress(ply) >= 0.04
  );
}

function getStructuralFeatureVector(ply: AiTracePly): number[] {
  return [
    ply.emptyCellCount / 36,
    ...ply.stackHeightHistogram.map((count) => count / 36),
    ply.frozenSingles.white / 18,
    ply.frozenSingles.black / 18,
    ply.homeFieldProgress.white,
    ply.homeFieldProgress.black,
    ply.sixStackProgress.white,
    ply.sixStackProgress.black,
  ];
}

function getMeanAbsoluteDistance(left: number[], right: number[]): number {
  return average(
    left.map((value, index) => Math.abs(value - (right[index] ?? value))),
  );
}

/**
 * Detects local structural oscillation that exact position hashes cannot see.
 * Each eligible ply is counted once when it nearly revisits a distinct earlier
 * position with the same actor inside a bounded temporal window.
 */
export function computeNearCycleRate(
  plies: AiTracePly[],
  options: {
    distanceThreshold?: number;
    maxLag?: number;
    minLag?: number;
  } = {},
): { rate: number | null; sampleCount: number } {
  const distanceThreshold =
    options.distanceThreshold ?? NEAR_CYCLE_DISTANCE_THRESHOLD;
  const maxLag = options.maxLag ?? NEAR_CYCLE_MAX_LAG;
  const minLag = options.minLag ?? NEAR_CYCLE_MIN_LAG;

  if (
    distanceThreshold < 0 ||
    !Number.isFinite(distanceThreshold) ||
    !Number.isInteger(minLag) ||
    !Number.isInteger(maxLag) ||
    minLag < 1 ||
    maxLag < minLag
  ) {
    throw new RangeError('Invalid near-cycle measurement options.');
  }

  const vectors = plies.map(getStructuralFeatureVector);
  let nearCycleCount = 0;
  let sampleCount = 0;

  for (let index = 0; index < plies.length; index += 1) {
    const candidates: number[] = [];

    for (
      let previous = Math.max(0, index - maxLag);
      previous <= index - minLag;
      previous += 1
    ) {
      if (plies[previous].actor === plies[index].actor) {
        candidates.push(previous);
      }
    }

    if (!candidates.length) {
      continue;
    }

    sampleCount += 1;
    const isNearCycle = candidates.some(
      (previous) =>
        plies[previous].afterPositionKey !== plies[index].afterPositionKey &&
        getMeanAbsoluteDistance(vectors[previous], vectors[index]) <=
          distanceThreshold,
    );

    if (isNearCycle) {
      nearCycleCount += 1;
    }
  }

  return {
    rate: sampleCount ? roundMetric(nearCycleCount / sampleCount) : null,
    sampleCount,
  };
}

function buildRecurrenceMatrix(sequence: string[]): boolean[][] {
  return sequence.map((left, row) =>
    sequence.map((right, column) => row !== column && left === right),
  );
}

function collectRunLengths(values: boolean[]): number[] {
  const lengths: number[] = [];
  let current = 0;

  for (const value of values) {
    if (value) {
      current += 1;
      continue;
    }

    if (current > 0) {
      lengths.push(current);
      current = 0;
    }
  }

  if (current > 0) {
    lengths.push(current);
  }

  return lengths;
}

/**
 * RQA treats a trace as a symbolic trajectory and measures how often it revisits
 * prior states, whether those recurrences form diagonal "predictable replay"
 * structures, and whether the system gets trapped in vertical dwell segments.
 */
export function computeRecurrenceQuantification(
  sequence: string[],
  minLineLength = 2,
): RecurrenceQuantification {
  if (sequence.length <= 1) {
    return {
      determinism: 0,
      laminarity: 0,
      maxDiagonalLine: 0,
      maxVerticalLine: 0,
      recurrenceRate: 0,
      trappingTime: 0,
    };
  }

  const matrix = buildRecurrenceMatrix(sequence);
  const totalPossible = sequence.length * sequence.length - sequence.length;
  let recurrencePoints = 0;

  for (const row of matrix) {
    for (const value of row) {
      if (value) {
        recurrencePoints += 1;
      }
    }
  }

  const diagonalLengths: number[] = [];
  const verticalLengths: number[] = [];

  for (
    let offset = -(sequence.length - 1);
    offset <= sequence.length - 1;
    offset += 1
  ) {
    if (offset === 0) {
      continue;
    }

    const diagonal: boolean[] = [];

    for (let row = 0; row < sequence.length; row += 1) {
      const column = row + offset;

      if (column < 0 || column >= sequence.length) {
        continue;
      }

      diagonal.push(matrix[row][column]);
    }

    diagonalLengths.push(...collectRunLengths(diagonal));
  }

  for (let column = 0; column < sequence.length; column += 1) {
    const vertical: boolean[] = [];

    for (let row = 0; row < sequence.length; row += 1) {
      vertical.push(matrix[row][column]);
    }

    verticalLengths.push(...collectRunLengths(vertical));
  }

  const longDiagonal = diagonalLengths.filter(
    (length) => length >= minLineLength,
  );
  const longVertical = verticalLengths.filter(
    (length) => length >= minLineLength,
  );
  const deterministicPoints = longDiagonal.reduce(
    (sum, length) => sum + length,
    0,
  );
  const laminarPoints = longVertical.reduce((sum, length) => sum + length, 0);

  return {
    determinism: roundMetric(
      deterministicPoints / Math.max(1, recurrencePoints),
    ),
    laminarity: roundMetric(laminarPoints / Math.max(1, recurrencePoints)),
    maxDiagonalLine: Math.max(0, ...diagonalLengths),
    maxVerticalLine: Math.max(0, ...verticalLengths),
    recurrenceRate: roundMetric(recurrencePoints / Math.max(1, totalPossible)),
    trappingTime: roundMetric(average(longVertical)),
  };
}

export function computeSampleEntropy(
  values: number[],
  embedding = 2,
  toleranceScale = 0.2,
): number | null {
  if (values.length <= embedding + 1) {
    return null;
  }

  const deviation = standardDeviation(values);

  if (deviation === 0) {
    return 0;
  }

  const tolerance = deviation * toleranceScale;
  let mMatches = 0;
  let mPlusOneMatches = 0;

  for (let left = 0; left < values.length - embedding; left += 1) {
    for (let right = left + 1; right < values.length - embedding; right += 1) {
      let matches = true;

      for (let offset = 0; offset < embedding; offset += 1) {
        if (
          Math.abs(values[left + offset] - values[right + offset]) > tolerance
        ) {
          matches = false;
          break;
        }
      }

      if (!matches) {
        continue;
      }

      mMatches += 1;

      if (
        Math.abs(values[left + embedding] - values[right + embedding]) <=
        tolerance
      ) {
        mPlusOneMatches += 1;
      }
    }
  }

  if (mMatches === 0) {
    return null;
  }

  if (mPlusOneMatches === 0) {
    return null;
  }

  return roundMetric(Math.max(0, -Math.log(mPlusOneMatches / mMatches)));
}

function factorial(value: number): number {
  let result = 1;

  for (let index = 2; index <= value; index += 1) {
    result *= index;
  }

  return result;
}

/**
 * Permutation entropy ignores exact score magnitudes and only tracks the ordinal
 * pattern inside short windows, which makes it useful for detecting "same shape,
 * different scale" oscillations in AI score traces.
 */
export function computePermutationEntropy(
  values: number[],
  order = 3,
  delay = 1,
): number {
  const windowCount = values.length - (order - 1) * delay;

  if (windowCount <= 0) {
    return 0;
  }

  const distribution: Record<string, number> = {};

  for (let start = 0; start < windowCount; start += 1) {
    const pattern = Array.from({ length: order }, (_, index) => ({
      index,
      value: values[start + index * delay],
    }))
      .sort((left, right) => {
        if (left.value !== right.value) {
          return left.value - right.value;
        }

        return left.index - right.index;
      })
      .map((entry) => entry.index)
      .join('-');

    distribution[pattern] = (distribution[pattern] ?? 0) + 1;
  }

  const total = Object.values(distribution).reduce(
    (sum, value) => sum + value,
    0,
  );

  if (total <= 0) {
    return 0;
  }

  const entropy = -Object.values(distribution).reduce((sum, value) => {
    const probability = value / total;
    return sum + probability * Math.log2(probability);
  }, 0);

  return roundMetric(entropy / Math.log2(factorial(order)));
}

/**
 * Symbolic Lempel-Ziv complexity estimates how much genuinely new structure
 * appears in the visited-state sequence instead of replaying old motifs.
 */
export function computeNormalizedLempelZiv(sequence: string[]): number {
  const n = sequence.length;

  if (n <= 1) {
    return 0;
  }

  let complexity = 0;
  let start = 0;

  while (start < n) {
    let phraseLength = 1;

    while (start + phraseLength <= n) {
      const candidate = sequence.slice(start, start + phraseLength);
      let seen = false;

      for (
        let searchStart = 0;
        searchStart + phraseLength <= start;
        searchStart += 1
      ) {
        if (
          candidate.every(
            (token, offset) => sequence[searchStart + offset] === token,
          )
        ) {
          seen = true;
          break;
        }
      }

      if (!seen) {
        break;
      }

      phraseLength += 1;
    }

    complexity += 1;
    start += Math.min(phraseLength, n - start);
  }

  return roundMetric((complexity * Math.log2(n)) / n);
}

export function findLoopEscapePly(
  trace: AiGameTrace,
  window = LOOP_ESCAPE_WINDOW,
): number | null {
  if (trace.plies.length < window) {
    return null;
  }

  const activationIndex = trace.plies.findIndex(
    (ply) => ply.riskMode !== 'normal' || ply.isRepetition || ply.isSelfUndo,
  );

  if (activationIndex < 0) {
    return null;
  }

  const baseline = trace.plies[activationIndex];
  const baselineProgress = Math.max(
    baseline.homeFieldProgress.white,
    baseline.homeFieldProgress.black,
    baseline.sixStackProgress.white,
    baseline.sixStackProgress.black,
  );

  for (
    let start = activationIndex;
    start <= trace.plies.length - window;
    start += 1
  ) {
    const slice = trace.plies.slice(start, start + window);
    const last = slice.at(-1) as AiTracePly;
    const noRepeat = slice.every((ply) => !ply.isRepetition);
    const noUndo = slice.every((ply) => !ply.isSelfUndo);
    const displacement = average(slice.map((ply) => ply.boardDisplacement));
    const progressed =
      last.emptyCellCount > baseline.emptyCellCount ||
      Math.max(
        last.homeFieldProgress.white,
        last.homeFieldProgress.black,
        last.sixStackProgress.white,
        last.sixStackProgress.black,
      ) >=
        baselineProgress + 0.04;

    if (noRepeat && noUndo && (progressed || displacement >= 0.075)) {
      return start - activationIndex + 1;
    }
  }

  return null;
}

function hasLoopPressureActivation(trace: AiGameTrace): boolean {
  return trace.plies.some(
    (ply) => ply.riskMode !== 'normal' || ply.isRepetition || ply.isSelfUndo,
  );
}

export function summarizeAdvancedTraceMetrics(
  traces: AiGameTrace[],
): AdvancedTraceSummary {
  const recurrence = traces.map((trace) =>
    computeRecurrenceQuantification(
      trace.plies.map((ply) => ply.afterPositionKey),
    ),
  );
  const positionLempelZiv = average(
    traces.map((trace) =>
      computeNormalizedLempelZiv(
        trace.plies.map((ply) => ply.afterPositionKey),
      ),
    ),
  );
  const scoreSampleEntropyValues = traces
    .map((trace) =>
      computeSampleEntropy(trace.plies.map((ply) => ply.normalizedWhiteScore)),
    )
    .filter((value): value is number => value !== null);
  const scoreSampleEntropy = scoreSampleEntropyValues.length
    ? average(scoreSampleEntropyValues)
    : null;
  const scorePermutationEntropy = average(
    traces.map((trace) =>
      computePermutationEntropy(
        trace.plies.map((ply) => ply.normalizedWhiteScore),
      ),
    ),
  );
  const loopEligibleTraces = traces.filter(hasLoopPressureActivation);
  const loopEscapePlies = loopEligibleTraces
    .map((trace) => findLoopEscapePly(trace))
    .filter((value): value is number => value !== null);
  const allPlies = traces.flatMap((trace) => trace.plies);
  const riskPlies = allPlies.filter((ply) => ply.riskMode !== 'normal');
  const pressureEventRate = average(
    traces.map((trace) =>
      average(trace.plies.map((ply) => (isPressureEvent(ply) ? 1 : 0))),
    ),
  );
  const frontierCompressionSamples = allPlies
    .map((ply) => ply.opponentReplyCompression)
    .filter((value): value is number => value !== null)
    .map((value) => Math.max(0, value));
  const frontierCompressionRate = frontierCompressionSamples.length
    ? average(frontierCompressionSamples)
    : null;
  const nearCycles = traces.map((trace) => computeNearCycleRate(trace.plies));
  const nearCycleSampleCount = nearCycles.reduce(
    (sum, entry) => sum + entry.sampleCount,
    0,
  );
  const nearCycleWeightedTotal = nearCycles.reduce(
    (sum, entry) => sum + (entry.rate ?? 0) * entry.sampleCount,
    0,
  );
  const loopEscapeRate = (limit: number): number | null =>
    loopEligibleTraces.length
      ? loopEscapePlies.filter((value) => value <= limit).length /
        loopEligibleTraces.length
      : null;

  return {
    frontierCompressionRate: roundOptionalMetric(frontierCompressionRate),
    frontierCompressionSampleCount: frontierCompressionSamples.length,
    loopEscapeEligibleTraceCount: loopEligibleTraces.length,
    loopEscapeObservedCount: loopEscapePlies.length,
    loopEscapeRate16: roundOptionalMetric(loopEscapeRate(16)),
    loopEscapeRate24: roundOptionalMetric(loopEscapeRate(24)),
    loopEscapeRate8: roundOptionalMetric(loopEscapeRate(8)),
    meanLoopEscapePly: loopEscapePlies.length
      ? roundMetric(average(loopEscapePlies))
      : null,
    nearCycleRate: roundOptionalMetric(
      nearCycleSampleCount
        ? nearCycleWeightedTotal / nearCycleSampleCount
        : null,
    ),
    nearCycleSampleCount,
    pressureEventRate: roundMetric(pressureEventRate),
    positionLempelZiv: roundMetric(positionLempelZiv),
    recurrenceDeterminism: roundMetric(
      average(recurrence.map((entry) => entry.determinism)),
    ),
    recurrenceLaminarity: roundMetric(
      average(recurrence.map((entry) => entry.laminarity)),
    ),
    recurrenceRate: roundMetric(
      average(recurrence.map((entry) => entry.recurrenceRate)),
    ),
    riskProgressShare: roundMetric(
      riskPlies.filter((ply) => ply.isRiskProgressCertified).length /
        Math.max(1, riskPlies.length),
    ),
    scorePermutationEntropy: roundMetric(scorePermutationEntropy),
    scoreSampleEntropy: roundOptionalMetric(scoreSampleEntropy),
    scoreSampleEntropyTraceCount: scoreSampleEntropyValues.length,
    trappingTime: roundMetric(
      average(recurrence.map((entry) => entry.trappingTime)),
    ),
  };
}
