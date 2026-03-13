import { chooseComputerAction, type AiStrategicIntent, type AiStrategicTag } from '@/ai';
import { analyzePosition } from '@/ai/strategy';
import { getLegalActions, getScoreSummary, applyAction, createInitialState, hashPosition } from '@/domain';
import type { ActionKind, GameState, Player, RuleConfig, TurnAction, Victory } from '@/domain/model/types';
import { getCellHeight } from '@/domain/model/board';
import { allCoords } from '@/domain/model/coordinates';
import type { AiDifficulty } from '@/shared/types/session';

import { actionKey, createSeededRandom, createTimeoutClock } from '@/ai/test/searchTestUtils';

export type AiTracePly = {
  action: TurnAction;
  actionKey: string;
  actionKind: ActionKind;
  actor: Player;
  afterLegalMoveCount: number;
  beforeLegalMoveCount: number;
  boardDisplacement: number;
  completedDepth: number;
  emptyCellCount: number;
  fallbackKind: ReturnType<typeof chooseComputerAction>['fallbackKind'];
  frozenCountChurn: number;
  frozenSingles: Record<Player, number>;
  homeFieldProgress: Record<Player, number>;
  isRepetition: boolean;
  isSelfUndo: boolean;
  isTactical: boolean;
  legalRootCandidateCount: number;
  normalizedWhiteScore: number;
  ply: number;
  repeatedPositionCount: number;
  score: number;
  sixStackProgress: Record<Player, number>;
  stackHeightHistogram: [number, number, number, number];
  stackProfileChurn: number;
  strategicIntent: AiStrategicIntent;
  tags: AiStrategicTag[];
  timedOut: boolean;
  whitePerspectiveScore: number;
};

export type AiGameTrace = {
  difficulty: AiDifficulty;
  finalVictory: Victory;
  firstMoveKey: string | null;
  gameIndex: number;
  maxTurns: number;
  mirrorIndex: 0 | 1;
  pairIndex: number;
  plies: AiTracePly[];
  seedPair: {
    black: number;
    white: number;
  };
  terminalType: AiTerminalType;
  totalPlies: number;
};

export type AiTerminalType =
  | 'homeField'
  | 'sixStacks'
  | 'threefoldDraw'
  | 'stalemateDraw'
  | 'unfinished';

export type AiVarietyMetricKey =
  | 'behaviorSpaceCoverage'
  | 'compositeInterestingness'
  | 'decisiveResultShare'
  | 'decompressionSlope'
  | 'drama'
  | 'firstFourActionKindEntropy'
  | 'firstFourTagEntropy'
  | 'frozenCountChurn'
  | 'gameRefinement'
  | 'homeProgressAuc'
  | 'intentSwitchRate'
  | 'lateSuspense'
  | 'leadChangeRate'
  | 'maxRepeatedStateRun'
  | 'meanBoardDisplacement'
  | 'mobilityReleaseSlope'
  | 'normalizedLempelZiv'
  | 'noveltyScore'
  | 'openingEntropy'
  | 'openingJsDivergence'
  | 'openingSimpsonDiversity'
  | 'repetitionPlyShare'
  | 'sixStackProgressAuc'
  | 'stackProfileChurn'
  | 'stagnationWindowRate'
  | 'stalemateDrawShare'
  | 'tension'
  | 'threefoldDrawShare'
  | 'twoPlyUndoRate'
  | 'uniqueOpeningLineShare';

export type AiVarietySummary = {
  gameCount: number;
  games: {
    averagePlies: number;
    terminalCounts: Record<AiTerminalType, number>;
  };
  metadata: {
    difficulty: AiDifficulty;
    gameCount: number;
    maxTurns: number;
    mirrorPairCount: number;
    stableCalls: number;
  };
  metrics: Record<AiVarietyMetricKey, number>;
  samples: {
    firstMoveDistribution: Record<string, number>;
    firstFourActionKindDistribution: Record<string, number>;
    firstFourTagDistribution: Record<string, number>;
    firstTenLineDistribution: Record<string, number>;
    strategicIntentDistribution: Record<AiStrategicIntent, number>;
    terminalDistribution: Record<AiTerminalType, number>;
  };
};

export type AiVarietyBaseline = {
  summary: AiVarietySummary;
  version: number;
};

export type AiVarietyTargetBand = {
  direction: 'higher' | 'lower';
  good: number;
  warn: number;
};

export type AiVarietyTargetBands = {
  version: number;
  metrics: Partial<Record<AiVarietyMetricKey, AiVarietyTargetBand>>;
};

export type RunAiVarietySuiteOptions = {
  difficulty: AiDifficulty;
  initialState?: GameState;
  maxTurns?: number;
  pairCount: number;
  ruleConfig: RuleConfig;
  stableCalls?: number;
};

type BehaviorDescriptor = {
  emptyCellsAtPly6: number;
  gameLength: number;
  homeProgressAuc: number;
  intentSwitchCount: number;
  mobilityAtPly6: number;
  repetitionPlyShare: number;
  sixStackProgressAuc: number;
  tagHistogram: Record<AiStrategicTag, number>;
  terminalType: AiTerminalType;
  twoPlyUndoRate: number;
};

const MAX_SCORE_FOR_TENSION = 1_200;
const STAGNATION_WINDOW = 6;
const DEFAULT_MAX_TURNS = 80;

const TAGS: AiStrategicTag[] = [
  'advanceMass',
  'captureControl',
  'decompress',
  'freezeBlock',
  'frontBuild',
  'openLane',
  'rescue',
];

const TERMINAL_TYPES: AiTerminalType[] = [
  'homeField',
  'sixStacks',
  'threefoldDraw',
  'stalemateDraw',
  'unfinished',
];

const STABLE_CALLS_BY_DIFFICULTY: Record<AiDifficulty, number> = {
  easy: 8,
  medium: 10,
  hard: 12,
};

function roundMetric(value: number, digits = 6): number {
  return Number(value.toFixed(digits));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeVictory(victory: Victory): AiTerminalType {
  switch (victory.type) {
    case 'homeField':
      return 'homeField';
    case 'sixStacks':
      return 'sixStacks';
    case 'threefoldDraw':
      return 'threefoldDraw';
    case 'stalemateDraw':
      return 'stalemateDraw';
    default:
      return 'unfinished';
  }
}

function zeroTerminalCounts(): Record<AiTerminalType, number> {
  return {
    homeField: 0,
    sixStacks: 0,
    threefoldDraw: 0,
    stalemateDraw: 0,
    unfinished: 0,
  };
}

function zeroIntentCounts(): Record<AiStrategicIntent, number> {
  return {
    home: 0,
    hybrid: 0,
    sixStack: 0,
  };
}

function zeroTagHistogram(): Record<AiStrategicTag, number> {
  return {
    advanceMass: 0,
    captureControl: 0,
    decompress: 0,
    freezeBlock: 0,
    frontBuild: 0,
    openLane: 0,
    rescue: 0,
  };
}

function createScoreProgress(
  state: GameState,
): {
  frozenSingles: Record<Player, number>;
  homeFieldProgress: Record<Player, number>;
  sixStackProgress: Record<Player, number>;
} {
  const summary = getScoreSummary(state);

  return {
    frozenSingles: {
      white: summary.frozenEnemySingles.black,
      black: summary.frozenEnemySingles.white,
    },
    homeFieldProgress: {
      white: summary.homeFieldSingles.white / 18,
      black: summary.homeFieldSingles.black / 18,
    },
    sixStackProgress: {
      white: summary.controlledHomeRowHeightThreeStacks.white / 6,
      black: summary.controlledHomeRowHeightThreeStacks.black / 6,
    },
  };
}

function createStackHeightHistogram(state: GameState): [number, number, number, number] {
  const histogram: [number, number, number, number] = [0, 0, 0, 0];

  for (const coord of allCoords()) {
    const height = getCellHeight(state.board, coord);
    histogram[height] += 1;
  }

  return histogram;
}

function countChangedCells(before: GameState, after: GameState): number {
  let changed = 0;

  for (const coord of allCoords()) {
    const beforeCell = before.board[coord].checkers;
    const afterCell = after.board[coord].checkers;

    if (beforeCell.length !== afterCell.length) {
      changed += 1;
      continue;
    }

    if (
      beforeCell.some(
        (checker, index) =>
          checker.id !== afterCell[index]?.id ||
          checker.owner !== afterCell[index]?.owner ||
          checker.frozen !== afterCell[index]?.frozen,
      )
    ) {
      changed += 1;
    }
  }

  return changed;
}

function computeDistributionEntropy(distribution: Record<string, number>): number {
  const entries = Object.values(distribution);
  const total = entries.reduce((sum, count) => sum + count, 0);

  if (total <= 0) {
    return 0;
  }

  return roundMetric(
    -entries.reduce((sum, count) => {
      if (count === 0) {
        return sum;
      }

      const probability = count / total;
      return sum + probability * Math.log2(probability);
    }, 0),
  );
}

function computeSimpsonDiversity(distribution: Record<string, number>): number {
  const entries = Object.values(distribution);
  const total = entries.reduce((sum, count) => sum + count, 0);

  if (total <= 0) {
    return 0;
  }

  return roundMetric(
    1 -
      entries.reduce((sum, count) => {
        const probability = count / total;
        return sum + probability * probability;
      }, 0),
  );
}

function normalizeDistribution(distribution: Record<string, number>): Record<string, number> {
  const keys = Object.keys(distribution);
  const total = keys.reduce((sum, key) => sum + distribution[key], 0);

  if (total <= 0) {
    return Object.fromEntries(keys.map((key) => [key, 0]));
  }

  return Object.fromEntries(keys.map((key) => [key, distribution[key] / total]));
}

function computeJensenShannonDivergence(
  current: Record<string, number>,
  baseline: Record<string, number>,
): number {
  const keys = new Set([...Object.keys(current), ...Object.keys(baseline)]);
  const normalizedCurrent = normalizeDistribution(
    Object.fromEntries([...keys].map((key) => [key, current[key] ?? 0])),
  );
  const normalizedBaseline = normalizeDistribution(
    Object.fromEntries([...keys].map((key) => [key, baseline[key] ?? 0])),
  );
  const mean = Object.fromEntries(
    [...keys].map((key) => [key, (normalizedCurrent[key] + normalizedBaseline[key]) / 2]),
  );

  const divergencePart = (
    left: Record<string, number>,
    right: Record<string, number>,
  ): number =>
    [...keys].reduce((sum, key) => {
      const leftValue = left[key];
      const rightValue = right[key];

      if (leftValue <= 0 || rightValue <= 0) {
        return sum;
      }

      return sum + leftValue * Math.log2(leftValue / rightValue);
    }, 0);

  return roundMetric(
    0.5 * divergencePart(normalizedCurrent, mean) + 0.5 * divergencePart(normalizedBaseline, mean),
  );
}

function computeSlope(values: number[]): number {
  if (values.length <= 1) {
    return 0;
  }

  const count = values.length;
  const meanX = (count - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / count;
  let numerator = 0;
  let denominator = 0;

  for (let index = 0; index < count; index += 1) {
    const xDelta = index - meanX;
    const yDelta = values[index] - meanY;

    numerator += xDelta * yDelta;
    denominator += xDelta * xDelta;
  }

  return denominator === 0 ? 0 : numerator / denominator;
}

function computeNormalizedLempelZiv(sequence: string[]): number {
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

function average(values: number[]): number {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function integrateAverage(values: number[]): number {
  return average(values);
}

function countLeadChanges(scores: number[]): number {
  let changes = 0;
  let previousSign = 0;

  for (const score of scores) {
    const sign = score === 0 ? 0 : score > 0 ? 1 : -1;

    if (sign === 0) {
      continue;
    }

    if (previousSign !== 0 && sign !== previousSign) {
      changes += 1;
    }

    previousSign = sign;
  }

  return changes;
}

function createBehaviorDescriptor(trace: AiGameTrace): BehaviorDescriptor {
  const firstSix = trace.plies.slice(0, 6);
  const tags = zeroTagHistogram();
  let selfUndoCount = 0;
  let repetitionCount = 0;
  let intentSwitchCount = 0;

  for (let index = 0; index < trace.plies.length; index += 1) {
    const ply = trace.plies[index];

    if (ply.isSelfUndo) {
      selfUndoCount += 1;
    }

    if (ply.isRepetition) {
      repetitionCount += 1;
    }

    if (
      index > 0 &&
      trace.plies[index - 1].strategicIntent !== ply.strategicIntent
    ) {
      intentSwitchCount += 1;
    }

    for (const tag of ply.tags) {
      tags[tag] += 1;
    }
  }

  const totalTags = Object.values(tags).reduce((sum, value) => sum + value, 0) || 1;

  return {
    emptyCellsAtPly6: (firstSix.at(-1)?.emptyCellCount ?? 0) / 36,
    gameLength: trace.totalPlies / Math.max(1, trace.maxTurns),
    homeProgressAuc: integrateAverage(
      trace.plies.map((ply) => Math.max(ply.homeFieldProgress.white, ply.homeFieldProgress.black)),
    ),
    intentSwitchCount,
    mobilityAtPly6: (firstSix.at(-1)?.afterLegalMoveCount ?? 0) / 24,
    repetitionPlyShare: repetitionCount / Math.max(1, trace.totalPlies),
    sixStackProgressAuc: integrateAverage(
      trace.plies.map((ply) => Math.max(ply.sixStackProgress.white, ply.sixStackProgress.black)),
    ),
    tagHistogram: Object.fromEntries(
      TAGS.map((tag) => [tag, tags[tag] / totalTags]),
    ) as Record<AiStrategicTag, number>,
    terminalType: trace.terminalType,
    twoPlyUndoRate: selfUndoCount / Math.max(1, trace.totalPlies),
  };
}

function behaviorVector(descriptor: BehaviorDescriptor): number[] {
  const terminalVector = TERMINAL_TYPES.map((terminalType) =>
    descriptor.terminalType === terminalType ? 1 : 0,
  );

  return [
    descriptor.gameLength,
    descriptor.twoPlyUndoRate,
    descriptor.repetitionPlyShare,
    descriptor.intentSwitchCount / 20,
    descriptor.homeProgressAuc,
    descriptor.sixStackProgressAuc,
    descriptor.emptyCellsAtPly6,
    descriptor.mobilityAtPly6,
    ...terminalVector,
    ...TAGS.map((tag) => descriptor.tagHistogram[tag]),
  ];
}

function euclideanDistance(left: number[], right: number[]): number {
  let sum = 0;

  for (let index = 0; index < left.length; index += 1) {
    const delta = left[index] - right[index];
    sum += delta * delta;
  }

  return Math.sqrt(sum);
}

function computeNoveltyScore(traces: AiGameTrace[]): number {
  if (traces.length <= 1) {
    return 0;
  }

  const vectors = traces.map((trace) => behaviorVector(createBehaviorDescriptor(trace)));

  return roundMetric(
    average(
      vectors.map((vector, index) => {
        const distances = vectors
          .map((candidate, candidateIndex) =>
            candidateIndex === index ? Number.POSITIVE_INFINITY : euclideanDistance(vector, candidate),
          )
          .filter(Number.isFinite)
          .sort((left, right) => left - right)
          .slice(0, Math.min(5, vectors.length - 1));

        return average(distances);
      }),
    ),
  );
}

function bucketIndex(value: number, thresholds: number[]): number {
  for (let index = 0; index < thresholds.length; index += 1) {
    if (value <= thresholds[index]) {
      return index;
    }
  }

  return thresholds.length;
}

function behaviorSpaceBin(trace: AiGameTrace): string {
  const plies = trace.plies.slice(0, 6);
  const emptyCells = plies.map((ply) => ply.emptyCellCount / 36);
  const decompressionBucket = bucketIndex(computeSlope(emptyCells), [0, 0.08, 0.16]);
  const intentSwitches = trace.plies.reduce((count, ply, index) => {
    if (index === 0 || trace.plies[index - 1].strategicIntent === ply.strategicIntent) {
      return count;
    }

    return count + 1;
  }, 0);
  const intentBucket = bucketIndex(intentSwitches, [0, 1]);
  const lengthBucket = bucketIndex(trace.totalPlies, [20, 40, 60]);

  return `${decompressionBucket}|${intentBucket}|${trace.terminalType}|${lengthBucket}`;
}

function computeBehaviorSpaceCoverage(traces: AiGameTrace[]): number {
  if (!traces.length) {
    return 0;
  }

  const occupied = new Set(traces.map(behaviorSpaceBin));
  const reachableBins = 4 * 3 * TERMINAL_TYPES.length * 4;

  return roundMetric(occupied.size / reachableBins);
}

function computeGameRefinement(traces: AiGameTrace[]): number {
  const decisive = traces.filter(
    (trace) => trace.terminalType === 'homeField' || trace.terminalType === 'sixStacks',
  );

  if (!decisive.length) {
    return 0;
  }

  const averageBranchingFactor = average(
    decisive.flatMap((trace) => trace.plies.map((ply) => ply.beforeLegalMoveCount)),
  );
  const averageLength = average(decisive.map((trace) => trace.totalPlies));

  if (averageBranchingFactor <= 0 || averageLength <= 0) {
    return 0;
  }

  return roundMetric(Math.sqrt(averageBranchingFactor) / averageLength);
}

function compareAgainstBand(value: number, baseline: number, band: AiVarietyTargetBand): number {
  const epsilon = 1e-9;

  if (band.direction === 'higher') {
    if (value >= band.good) {
      return 1;
    }

    const floor = Math.min(baseline, band.warn);
    if (value <= floor) {
      return 0;
    }

    return clamp((value - floor) / Math.max(epsilon, band.good - floor), 0, 1);
  }

  if (value <= band.good) {
    return 1;
  }

  const ceiling = Math.max(baseline, band.warn);
  if (value >= ceiling) {
    return 0;
  }

  return clamp((ceiling - value) / Math.max(epsilon, ceiling - band.good), 0, 1);
}

function computeCompositeInterestingness(
  metrics: AiVarietySummary['metrics'],
  baseline: AiVarietySummary['metrics'] | null,
  targetBands: AiVarietyTargetBands | null,
): number {
  if (!baseline || !targetBands) {
    return 0;
  }

  const components: AiVarietyMetricKey[] = [
    'openingEntropy',
    'uniqueOpeningLineShare',
    'repetitionPlyShare',
    'decompressionSlope',
    'drama',
    'decisiveResultShare',
  ];

  const scores = components
    .map((metricKey) => {
      const band = targetBands.metrics[metricKey];

      if (!band) {
        return null;
      }

      return compareAgainstBand(metrics[metricKey], baseline[metricKey], band);
    })
    .filter((value): value is number => value !== null)
    .map((value) => Math.max(0.001, value));

  if (!scores.length) {
    return 0;
  }

  return roundMetric(
    Math.exp(scores.reduce((sum, value) => sum + Math.log(value), 0) / scores.length),
  );
}

function makeOpeningLine(trace: AiGameTrace, length = 10): string {
  return trace.plies
    .slice(0, length)
    .map((ply) => ply.actionKey)
    .join(' | ');
}

function traceWindowMetric(
  trace: AiGameTrace,
  selector: (ply: AiTracePly) => number,
  length = 6,
): number[] {
  return trace.plies.slice(0, length).map(selector);
}

function countStagnationWindows(trace: AiGameTrace): { stagnation: number; total: number } {
  if (trace.plies.length < STAGNATION_WINDOW) {
    return { stagnation: 0, total: 0 };
  }

  let stagnation = 0;

  for (let index = 0; index <= trace.plies.length - STAGNATION_WINDOW; index += 1) {
    const window = trace.plies.slice(index, index + STAGNATION_WINDOW);
    const start = window[0];
    const final = window.at(-1) as AiTracePly;
    const emptyCellsChanged = final.emptyCellCount > start.emptyCellCount;
    const homeProgressChanged =
      Math.max(final.homeFieldProgress.white, final.homeFieldProgress.black) >
      Math.max(start.homeFieldProgress.white, start.homeFieldProgress.black);
    const sixStackChanged =
      Math.max(final.sixStackProgress.white, final.sixStackProgress.black) >
      Math.max(start.sixStackProgress.white, start.sixStackProgress.black);

    if (!emptyCellsChanged && !homeProgressChanged && !sixStackChanged) {
      stagnation += 1;
    }
  }

  return {
    stagnation,
    total: trace.plies.length - STAGNATION_WINDOW + 1,
  };
}

export function getStableCallsForDifficulty(difficulty: AiDifficulty): number {
  return STABLE_CALLS_BY_DIFFICULTY[difficulty];
}

export function runAiGameTrace({
  blackSeed,
  difficulty,
  gameIndex,
  initialState,
  maxTurns = DEFAULT_MAX_TURNS,
  mirrorIndex,
  pairIndex,
  ruleConfig,
  stableCalls = getStableCallsForDifficulty(difficulty),
  whiteSeed,
}: {
  blackSeed: number;
  difficulty: AiDifficulty;
  gameIndex: number;
  initialState?: GameState;
  maxTurns?: number;
  mirrorIndex: 0 | 1;
  pairIndex: number;
  ruleConfig: RuleConfig;
  stableCalls?: number;
  whiteSeed: number;
}): AiGameTrace {
  const whiteRandom = createSeededRandom(whiteSeed);
  const blackRandom = createSeededRandom(blackSeed);
  let state = initialState
    ? {
        ...initialState,
        board: structuredClone(initialState.board),
        history: structuredClone(initialState.history),
        pendingJump: structuredClone(initialState.pendingJump),
        positionCounts: structuredClone(initialState.positionCounts),
        victory: structuredClone(initialState.victory),
      }
    : createInitialState(ruleConfig);
  const plies: AiTracePly[] = [];
  const seenPositionCounts: Record<string, number> = {
    [hashPosition(state)]: 1,
  };

  for (let plyIndex = 0; plyIndex < maxTurns && state.status !== 'gameOver'; plyIndex += 1) {
    const beforeLegalMoveCount = getLegalActions(state, ruleConfig).length;
    const beforeProgress = createScoreProgress(state);
    const beforeHistogram = createStackHeightHistogram(state);
    const result = chooseComputerAction({
      difficulty,
      now: createTimeoutClock(stableCalls, 100_000),
      random: state.currentPlayer === 'white' ? whiteRandom : blackRandom,
      ruleConfig,
      state,
    });

    if (!result.action) {
      break;
    }

    const selectedCandidate =
      result.rootCandidates.find((candidate) => actionKey(candidate.action) === actionKey(result.action)) ??
      null;
    const nextState = applyAction(state, result.action, ruleConfig);
    const afterProgress = createScoreProgress(nextState);
    const afterHistogram = createStackHeightHistogram(nextState);
    const afterLegalMoveCount =
      nextState.status === 'gameOver' ? 0 : getLegalActions(nextState, ruleConfig).length;
    const nextPositionKey = hashPosition(nextState);
    const repeatedPositionCount = (seenPositionCounts[nextPositionKey] ?? 0) + 1;
    const whitePerspectiveScore =
      state.currentPlayer === 'white' ? result.score : -result.score;

    seenPositionCounts[nextPositionKey] = repeatedPositionCount;

    plies.push({
      action: result.action,
      actionKey: actionKey(result.action),
      actionKind: result.action.type,
      actor: state.currentPlayer,
      afterLegalMoveCount,
      beforeLegalMoveCount,
      boardDisplacement: roundMetric(countChangedCells(state, nextState) / 36),
      completedDepth: result.completedDepth,
      emptyCellCount: analyzePosition(nextState).emptyCells,
      fallbackKind: result.fallbackKind,
      frozenCountChurn: roundMetric(
        Math.abs(
          afterProgress.frozenSingles.white +
            afterProgress.frozenSingles.black -
            beforeProgress.frozenSingles.white -
            beforeProgress.frozenSingles.black,
        ) / 36,
      ),
      frozenSingles: afterProgress.frozenSingles,
      homeFieldProgress: afterProgress.homeFieldProgress,
      isRepetition: Boolean(selectedCandidate?.isRepetition) || repeatedPositionCount > 1,
      isSelfUndo: selectedCandidate?.isSelfUndo ?? false,
      isTactical: selectedCandidate?.isTactical ?? false,
      legalRootCandidateCount: result.rootCandidates.length,
      normalizedWhiteScore: roundMetric(
        clamp(whitePerspectiveScore / MAX_SCORE_FOR_TENSION, -1, 1),
      ),
      ply: plyIndex + 1,
      repeatedPositionCount,
      score: result.score,
      sixStackProgress: afterProgress.sixStackProgress,
      stackHeightHistogram: afterHistogram,
      stackProfileChurn: roundMetric(
        afterHistogram.reduce(
          (sum, value, index) => sum + Math.abs(value - beforeHistogram[index]),
          0,
        ) / 72,
      ),
      strategicIntent: result.strategicIntent,
      tags: selectedCandidate?.tags ?? [],
      timedOut: result.timedOut,
      whitePerspectiveScore,
    });

    state = nextState;
  }

  return {
    difficulty,
    finalVictory: state.status === 'gameOver' ? state.victory : { type: 'none' },
    firstMoveKey: plies[0]?.actionKey ?? null,
    gameIndex,
    maxTurns,
    mirrorIndex,
    pairIndex,
    plies,
    seedPair: {
      black: blackSeed,
      white: whiteSeed,
    },
    terminalType: state.status === 'gameOver' ? normalizeVictory(state.victory) : 'unfinished',
    totalPlies: plies.length,
  };
}

export function runAiVarietySuite({
  difficulty,
  initialState,
  maxTurns = DEFAULT_MAX_TURNS,
  pairCount,
  ruleConfig,
  stableCalls = getStableCallsForDifficulty(difficulty),
}: RunAiVarietySuiteOptions): AiGameTrace[] {
  const traces: AiGameTrace[] = [];

  for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
    const baseWhiteSeed = pairIndex * 2 + 1;
    const baseBlackSeed = pairIndex * 2 + 2;

    traces.push(
      runAiGameTrace({
        blackSeed: baseBlackSeed,
        difficulty,
        gameIndex: traces.length,
        initialState,
        maxTurns,
        mirrorIndex: 0,
        pairIndex,
        ruleConfig,
        stableCalls,
        whiteSeed: baseWhiteSeed,
      }),
    );
    traces.push(
      runAiGameTrace({
        blackSeed: baseWhiteSeed,
        difficulty,
        gameIndex: traces.length,
        initialState,
        maxTurns,
        mirrorIndex: 1,
        pairIndex,
        ruleConfig,
        stableCalls,
        whiteSeed: baseBlackSeed,
      }),
    );
  }

  return traces;
}

export function summarizeAiVariety(
  traces: AiGameTrace[],
  options: {
    baselineSummary?: AiVarietySummary | null;
    difficulty: AiDifficulty;
    maxTurns: number;
    pairCount: number;
    stableCalls: number;
    targetBands?: AiVarietyTargetBands | null;
  },
): AiVarietySummary {
  const terminalCounts = zeroTerminalCounts();
  const strategicIntentDistribution = zeroIntentCounts();
  const firstMoveDistribution: Record<string, number> = {};
  const firstTenLineDistribution: Record<string, number> = {};
  const firstFourActionKindDistribution: Record<string, number> = {};
  const firstFourTagDistribution: Record<string, number> = {};
  const totalPlies = traces.reduce((sum, trace) => sum + trace.totalPlies, 0);
  let selfUndoCount = 0;
  let repetitionCount = 0;
  let maxRepeatedStateRun = 0;
  let decisiveCount = 0;
  let intentSwitchCount = 0;

  for (const trace of traces) {
    terminalCounts[trace.terminalType] += 1;
    firstTenLineDistribution[makeOpeningLine(trace)] =
      (firstTenLineDistribution[makeOpeningLine(trace)] ?? 0) + 1;

    if (trace.firstMoveKey) {
      firstMoveDistribution[trace.firstMoveKey] =
        (firstMoveDistribution[trace.firstMoveKey] ?? 0) + 1;
    }

    if (trace.terminalType === 'homeField' || trace.terminalType === 'sixStacks') {
      decisiveCount += 1;
    }

    for (const ply of trace.plies) {
      strategicIntentDistribution[ply.strategicIntent] += 1;

      if (ply.isSelfUndo) {
        selfUndoCount += 1;
      }

      if (ply.isRepetition) {
        repetitionCount += 1;
      }
    }

    for (let index = 1; index < trace.plies.length; index += 1) {
      if (trace.plies[index - 1].strategicIntent !== trace.plies[index].strategicIntent) {
        intentSwitchCount += 1;
      }
    }

    for (const ply of trace.plies.slice(0, 4)) {
      firstFourActionKindDistribution[ply.actionKind] =
        (firstFourActionKindDistribution[ply.actionKind] ?? 0) + 1;

      for (const tag of ply.tags) {
        firstFourTagDistribution[tag] = (firstFourTagDistribution[tag] ?? 0) + 1;
      }
    }

    let repeatedRun = 0;

    for (const ply of trace.plies) {
      if (ply.isRepetition) {
        repeatedRun += 1;
        maxRepeatedStateRun = Math.max(maxRepeatedStateRun, repeatedRun);
      } else {
        repeatedRun = 0;
      }
    }
  }

  const stagnation = traces.map(countStagnationWindows);
  const normalizedScores = traces.flatMap((trace) =>
    trace.plies.map((ply) => ply.normalizedWhiteScore),
  );
  const dramaValues = traces.flatMap((trace) =>
    trace.plies.slice(1).map((ply, index) =>
      Math.abs(ply.normalizedWhiteScore - trace.plies[index].normalizedWhiteScore),
    ),
  );
  const lateSuspenseValues = traces.map((trace) => {
    if (!trace.plies.length) {
      return 0;
    }

    const totalWeight = trace.plies.reduce((sum, _ply, index) => sum + index + 1, 0);

    return trace.plies.reduce((sum, ply, index) => {
      return sum + (1 - Math.abs(ply.normalizedWhiteScore)) * ((index + 1) / totalWeight);
    }, 0);
  });
  const leadChangeRate = average(
    traces.map((trace) =>
      trace.totalPlies <= 1 ? 0 : countLeadChanges(trace.plies.map((ply) => ply.normalizedWhiteScore)) / (trace.totalPlies - 1),
    ),
  );
  const decompressionSlope = average(
    traces.map((trace) =>
      computeSlope(traceWindowMetric(trace, (ply) => ply.emptyCellCount / 36)),
    ),
  );
  const mobilityReleaseSlope = average(
    traces.map((trace) =>
      computeSlope(traceWindowMetric(trace, (ply) => ply.afterLegalMoveCount / 24)),
    ),
  );
  const homeProgressAuc = average(
    traces.map((trace) =>
      integrateAverage(
        trace.plies.map((ply) => Math.max(ply.homeFieldProgress.white, ply.homeFieldProgress.black)),
      ),
    ),
  );
  const sixStackProgressAuc = average(
    traces.map((trace) =>
      integrateAverage(
        trace.plies.map((ply) => Math.max(ply.sixStackProgress.white, ply.sixStackProgress.black)),
      ),
    ),
  );
  const metrics: AiVarietySummary['metrics'] = {
    behaviorSpaceCoverage: computeBehaviorSpaceCoverage(traces),
    compositeInterestingness: 0,
    decisiveResultShare: roundMetric(decisiveCount / Math.max(1, traces.length)),
    decompressionSlope: roundMetric(decompressionSlope),
    drama: roundMetric(average(dramaValues)),
    firstFourActionKindEntropy: computeDistributionEntropy(firstFourActionKindDistribution),
    firstFourTagEntropy: computeDistributionEntropy(firstFourTagDistribution),
    frozenCountChurn: roundMetric(
      average(traces.flatMap((trace) => trace.plies.map((ply) => ply.frozenCountChurn))),
    ),
    gameRefinement: computeGameRefinement(traces),
    homeProgressAuc: roundMetric(homeProgressAuc),
    intentSwitchRate: roundMetric(intentSwitchCount / Math.max(1, totalPlies - traces.length)),
    lateSuspense: roundMetric(average(lateSuspenseValues)),
    leadChangeRate: roundMetric(leadChangeRate),
    maxRepeatedStateRun: roundMetric(maxRepeatedStateRun),
    meanBoardDisplacement: roundMetric(
      average(traces.flatMap((trace) => trace.plies.map((ply) => ply.boardDisplacement))),
    ),
    mobilityReleaseSlope: roundMetric(mobilityReleaseSlope),
    normalizedLempelZiv: roundMetric(
      average(
        traces.map((trace) =>
          computeNormalizedLempelZiv(trace.plies.map((ply) => ply.actionKind)),
        ),
      ),
    ),
    noveltyScore: computeNoveltyScore(traces),
    openingEntropy: computeDistributionEntropy(firstMoveDistribution),
    openingJsDivergence: options.baselineSummary
      ? computeJensenShannonDivergence(
          firstMoveDistribution,
          options.baselineSummary.samples.firstMoveDistribution,
        )
      : 0,
    openingSimpsonDiversity: computeSimpsonDiversity(firstMoveDistribution),
    repetitionPlyShare: roundMetric(repetitionCount / Math.max(1, totalPlies)),
    sixStackProgressAuc: roundMetric(sixStackProgressAuc),
    stackProfileChurn: roundMetric(
      average(traces.flatMap((trace) => trace.plies.map((ply) => ply.stackProfileChurn))),
    ),
    stagnationWindowRate: roundMetric(
      stagnation.reduce((sum, entry) => sum + entry.stagnation, 0) /
        Math.max(
          1,
          stagnation.reduce((sum, entry) => sum + entry.total, 0),
        ),
    ),
    stalemateDrawShare: roundMetric(terminalCounts.stalemateDraw / Math.max(1, traces.length)),
    tension: roundMetric(average(normalizedScores.map((score) => 1 - Math.abs(score)))),
    threefoldDrawShare: roundMetric(terminalCounts.threefoldDraw / Math.max(1, traces.length)),
    twoPlyUndoRate: roundMetric(selfUndoCount / Math.max(1, totalPlies)),
    uniqueOpeningLineShare: roundMetric(
      Object.keys(firstTenLineDistribution).filter(Boolean).length / Math.max(1, traces.length),
    ),
  };

  metrics.compositeInterestingness = computeCompositeInterestingness(
    metrics,
    options.baselineSummary?.metrics ?? null,
    options.targetBands ?? null,
  );

  return {
    gameCount: traces.length,
    games: {
      averagePlies: roundMetric(totalPlies / Math.max(1, traces.length)),
      terminalCounts,
    },
    metadata: {
      difficulty: options.difficulty,
      gameCount: traces.length,
      maxTurns: options.maxTurns,
      mirrorPairCount: options.pairCount,
      stableCalls: options.stableCalls,
    },
    metrics: {
      ...metrics,
    },
    samples: {
      firstMoveDistribution,
      firstFourActionKindDistribution,
      firstFourTagDistribution,
      firstTenLineDistribution,
      strategicIntentDistribution,
      terminalDistribution: terminalCounts,
    },
  };
}

export function compareSummaryToBaseline(
  summary: AiVarietySummary,
  baseline: AiVarietySummary,
): Array<{ current: number; direction: 'higher' | 'lower'; metric: AiVarietyMetricKey; threshold: number }> {
  const regressions: Array<{ current: number; direction: 'higher' | 'lower'; metric: AiVarietyMetricKey; threshold: number }> = [];
  const lowerIsBetter: AiVarietyMetricKey[] = [
    'maxRepeatedStateRun',
    'repetitionPlyShare',
    'stagnationWindowRate',
    'stalemateDrawShare',
    'threefoldDrawShare',
    'twoPlyUndoRate',
  ];
  const higherIsBetter: AiVarietyMetricKey[] = [
    'decompressionSlope',
    'meanBoardDisplacement',
    'mobilityReleaseSlope',
    'openingEntropy',
    'openingSimpsonDiversity',
  ];

  for (const metric of lowerIsBetter) {
    const baselineValue = baseline.metrics[metric];
    const threshold = roundMetric(baselineValue * 1.1 + 1e-6);

    if (summary.metrics[metric] > threshold) {
      regressions.push({
        current: summary.metrics[metric],
        direction: 'lower',
        metric,
        threshold,
      });
    }
  }

  for (const metric of higherIsBetter) {
    const baselineValue = baseline.metrics[metric];
    const threshold =
      baselineValue === 0
        ? 0
        : roundMetric(baselineValue - Math.abs(baselineValue) * 0.1 - 1e-6);

    if (summary.metrics[metric] < threshold) {
      regressions.push({
        current: summary.metrics[metric],
        direction: 'higher',
        metric,
        threshold,
      });
    }
  }

  return regressions;
}
