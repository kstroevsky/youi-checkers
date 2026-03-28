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
  frontierCompressionRate: number;
  loopEscapeRate16: number;
  loopEscapeRate24: number;
  loopEscapeRate8: number;
  meanLoopEscapePly: number;
  pressureEventRate: number;
  positionLempelZiv: number;
  recurrenceDeterminism: number;
  recurrenceLaminarity: number;
  recurrenceRate: number;
  riskProgressShare: number;
  scorePermutationEntropy: number;
  scoreSampleEntropy: number;
  trappingTime: number;
};

const LOOP_ESCAPE_WINDOW = 4;

function roundMetric(value: number, digits = 6): number {
  return Number(value.toFixed(digits));
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
  const variance = average(values.map((value) => {
    const delta = value - mean;
    return delta * delta;
  }));

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
    ply.mobilityDelta <= -2 ||
    getPlanProgress(ply) >= 0.04
  );
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

  for (let offset = -(sequence.length - 1); offset <= sequence.length - 1; offset += 1) {
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

  const longDiagonal = diagonalLengths.filter((length) => length >= minLineLength);
  const longVertical = verticalLengths.filter((length) => length >= minLineLength);
  const deterministicPoints = longDiagonal.reduce((sum, length) => sum + length, 0);
  const laminarPoints = longVertical.reduce((sum, length) => sum + length, 0);

  return {
    determinism: roundMetric(deterministicPoints / Math.max(1, recurrencePoints)),
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
): number {
  if (values.length <= embedding + 1) {
    return 0;
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
        if (Math.abs(values[left + offset] - values[right + offset]) > tolerance) {
          matches = false;
          break;
        }
      }

      if (!matches) {
        continue;
      }

      mMatches += 1;

      if (Math.abs(values[left + embedding] - values[right + embedding]) <= tolerance) {
        mPlusOneMatches += 1;
      }
    }
  }

  if (mMatches === 0) {
    return 0;
  }

  const smoothedRatio = (mPlusOneMatches + 1e-9) / (mMatches + 1e-9);
  return roundMetric(Math.max(0, -Math.log(smoothedRatio)));
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

  const total = Object.values(distribution).reduce((sum, value) => sum + value, 0);

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

  const joined = sequence.join('|');
  let complexity = 1;
  let start = 0;
  let substringLength = 1;
  let maxMatched = 1;

  while (true) {
    if (start + substringLength > joined.length) {
      complexity += 1;
      break;
    }

    const candidate = joined.slice(start, start + substringLength);
    const searchSpace = joined.slice(0, start);

    if (searchSpace.includes(candidate)) {
      substringLength += 1;
      maxMatched = Math.max(maxMatched, substringLength);
      continue;
    }

    complexity += 1;
    start += maxMatched;
    substringLength = 1;
    maxMatched = 1;

    if (start >= joined.length) {
      break;
    }
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

  for (let start = activationIndex; start <= trace.plies.length - window; start += 1) {
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
      ) >= baselineProgress + 0.04;

    if (noRepeat && noUndo && (progressed || displacement >= 0.075)) {
      return start - activationIndex + 1;
    }
  }

  return null;
}

export function summarizeAdvancedTraceMetrics(traces: AiGameTrace[]): AdvancedTraceSummary {
  const recurrence = traces.map((trace) =>
    computeRecurrenceQuantification(trace.plies.map((ply) => ply.afterPositionKey)),
  );
  const positionLempelZiv = average(
    traces.map((trace) => computeNormalizedLempelZiv(trace.plies.map((ply) => ply.afterPositionKey))),
  );
  const scoreSampleEntropy = average(
    traces.map((trace) => computeSampleEntropy(trace.plies.map((ply) => ply.normalizedWhiteScore))),
  );
  const scorePermutationEntropy = average(
    traces.map((trace) => computePermutationEntropy(trace.plies.map((ply) => ply.normalizedWhiteScore))),
  );
  const loopEscapePlies = traces
    .map((trace) => findLoopEscapePly(trace))
    .filter((value): value is number => value !== null);
  const allPlies = traces.flatMap((trace) => trace.plies);
  const riskPlies = allPlies.filter((ply) => ply.riskMode !== 'normal');
  const pressureEventRate = average(
    traces.map((trace) => average(trace.plies.map((ply) => (isPressureEvent(ply) ? 1 : 0)))),
  );
  const frontierCompressionRate = average(
    traces.map((trace) =>
      average(
        trace.plies.map((ply) => Math.max(0, -ply.mobilityDelta) / Math.max(1, ply.beforeLegalMoveCount)),
      ),
    ),
  );

  return {
    frontierCompressionRate: roundMetric(frontierCompressionRate),
    loopEscapeRate16: roundMetric(loopEscapePlies.filter((value) => value <= 16).length / Math.max(1, traces.length)),
    loopEscapeRate24: roundMetric(loopEscapePlies.filter((value) => value <= 24).length / Math.max(1, traces.length)),
    loopEscapeRate8: roundMetric(loopEscapePlies.filter((value) => value <= 8).length / Math.max(1, traces.length)),
    meanLoopEscapePly: roundMetric(average(loopEscapePlies)),
    pressureEventRate: roundMetric(pressureEventRate),
    positionLempelZiv: roundMetric(positionLempelZiv),
    recurrenceDeterminism: roundMetric(average(recurrence.map((entry) => entry.determinism))),
    recurrenceLaminarity: roundMetric(average(recurrence.map((entry) => entry.laminarity))),
    recurrenceRate: roundMetric(average(recurrence.map((entry) => entry.recurrenceRate))),
    riskProgressShare: roundMetric(
      riskPlies.filter((ply) => ply.isRiskProgressCertified).length / Math.max(1, riskPlies.length),
    ),
    scorePermutationEntropy: roundMetric(scorePermutationEntropy),
    scoreSampleEntropy: roundMetric(scoreSampleEntropy),
    trappingTime: roundMetric(average(recurrence.map((entry) => entry.trappingTime))),
  };
}
