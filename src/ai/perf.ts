import { getCellHeight } from '@/domain/model/board';
import { allCoords } from '@/domain/model/coordinates';
import type {
  EngineState,
  Player,
  RuleConfig,
  ScoreSummary,
  TurnAction,
} from '@/domain/model/types';
import { getLegalActions, hashPosition } from '@/domain';
import { getScoreSummaryByKey } from '@/domain/rules/scoring';
import { getDrawTiebreakMetricsByKey } from '@/domain/rules/victory';

import {
  analyzePositionByKey,
  getStrategicIntentFromAnalysis,
  getStrategicScoreFromAnalysis,
  type PositionAnalysis,
} from '@/ai/strategy';
import type { AiRiskMode, AiTiebreakEdgeKind } from '@/ai/types';

const PERF_CACHE_LIMIT = 50_000;
const LEGAL_ACTIONS_CACHE_LIMIT = 8_000;
const legalActionsCache = new Map<string, TurnAction[]>();

export type CachedProgressSnapshot = {
  frozenSingles: Record<Player, number>;
  homeFieldProgress: Record<Player, number>;
  sixStackProgress: Record<Player, number>;
};

export type CachedDrawTiebreakMetrics = ReturnType<typeof getDrawTiebreakMetricsByKey>;

export type CachedTiebreakPressureBase = {
  drawPressure: number;
  tiebreakCheckerEdge: number;
  tiebreakEdgeKind: AiTiebreakEdgeKind;
  tiebreakStackEdge: number;
};

export type StatePerfBundle = {
  analysis?: PositionAnalysis;
  drawTiebreakMetrics?: CachedDrawTiebreakMetrics;
  emptyCellCount?: number;
  legalActionCount?: number;
  positionKey: string;
  progressSnapshot?: CachedProgressSnapshot;
  scoreSummary?: ScoreSummary;
  strategicIntents: Partial<Record<Player, ReturnType<typeof getStrategicIntentFromAnalysis>>>;
  strategicScores: Partial<Record<Player, number>>;
  tiebreakPressureBase: Partial<Record<Player, Partial<Record<AiRiskMode, CachedTiebreakPressureBase>>>>;
};

export type SearchPerfCache = {
  states: Map<string, StatePerfBundle>;
};

function getRuleConfigCacheKey(ruleConfig: RuleConfig): string {
  return `${ruleConfig.allowNonAdjacentFriendlyStackTransfer ? 1 : 0}:${ruleConfig.drawRule}:${ruleConfig.scoringMode}`;
}

function buildProgressSnapshot(scoreSummary: ScoreSummary): CachedProgressSnapshot {
  return {
    frozenSingles: {
      white: scoreSummary.frozenEnemySingles.black,
      black: scoreSummary.frozenEnemySingles.white,
    },
    homeFieldProgress: {
      white: scoreSummary.homeFieldSingles.white / 18,
      black: scoreSummary.homeFieldSingles.black / 18,
    },
    sixStackProgress: {
      white: scoreSummary.controlledHomeRowHeightThreeStacks.white / 6,
      black: scoreSummary.controlledHomeRowHeightThreeStacks.black / 6,
    },
  };
}

function buildEmptyCellCount(state: Pick<EngineState, 'board'>): number {
  return allCoords().reduce(
    (sum, coord) => sum + (getCellHeight(state.board, coord) === 0 ? 1 : 0),
    0,
  );
}

function rememberBundle(
  perfCache: SearchPerfCache | null | undefined,
  key: string,
  bundle: StatePerfBundle,
): StatePerfBundle {
  if (!perfCache) {
    return bundle;
  }

  if (perfCache.states.size >= PERF_CACHE_LIMIT) {
    const oldestKey = perfCache.states.keys().next().value;

    if (oldestKey) {
      perfCache.states.delete(oldestKey);
    }
  }

  perfCache.states.set(key, bundle);
  return bundle;
}

function rememberLegalActions(key: string, actions: TurnAction[]): TurnAction[] {
  if (legalActionsCache.size >= LEGAL_ACTIONS_CACHE_LIMIT) {
    const oldestKey = legalActionsCache.keys().next().value;

    if (oldestKey) {
      legalActionsCache.delete(oldestKey);
    }
  }

  legalActionsCache.set(key, actions);
  return actions;
}

export function createSearchPerfCache(): SearchPerfCache {
  return {
    states: new Map<string, StatePerfBundle>(),
  };
}

/** Returns the per-search lazy state bundle keyed by canonical position hash. */
export function getStatePerfBundle(
  state: EngineState,
  _ruleConfig: RuleConfig,
  perfCache: SearchPerfCache | null | undefined = null,
): StatePerfBundle {
  const positionKey = hashPosition(state);
  const cached = perfCache?.states.get(positionKey);

  if (cached) {
    return cached;
  }

  const bundle: StatePerfBundle = {
    positionKey,
    strategicIntents: {},
    strategicScores: {},
    tiebreakPressureBase: {},
  };

  return rememberBundle(perfCache, positionKey, bundle);
}

/** Reuses full legal-action generation across repeated states without changing legality. */
export function getCachedLegalActions(
  state: EngineState,
  ruleConfig: RuleConfig,
  positionKey = hashPosition(state),
): TurnAction[] {
  if (state.status === 'gameOver') {
    return [];
  }

  const cacheKey = `${state.status}:${positionKey}|${getRuleConfigCacheKey(ruleConfig)}`;
  const cached = legalActionsCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  return rememberLegalActions(cacheKey, getLegalActions(state, ruleConfig));
}

/** Materializes the informational score summary lazily inside one search bundle. */
export function getPerfScoreSummary(
  bundle: StatePerfBundle,
  state: EngineState,
): ScoreSummary {
  if (!bundle.scoreSummary) {
    bundle.scoreSummary = getScoreSummaryByKey(state, bundle.positionKey);
  }

  return bundle.scoreSummary;
}

/** Materializes tiebreak metrics lazily for draw-aware evaluation and risk shaping. */
export function getPerfDrawTiebreakMetrics(
  bundle: StatePerfBundle,
  state: EngineState,
): CachedDrawTiebreakMetrics {
  if (!bundle.drawTiebreakMetrics) {
    bundle.drawTiebreakMetrics = getDrawTiebreakMetricsByKey(state, bundle.positionKey);
  }

  return bundle.drawTiebreakMetrics;
}

/** Reuses the structural analysis cache through the already-known position key. */
export function getPerfAnalysis(
  bundle: StatePerfBundle,
  state: EngineState,
): PositionAnalysis {
  if (!bundle.analysis) {
    bundle.analysis = analyzePositionByKey(state, bundle.positionKey);
  }

  return bundle.analysis;
}

/** Derives progress-only features once from the cached score summary. */
export function getPerfProgressSnapshot(
  bundle: StatePerfBundle,
  state: EngineState,
): CachedProgressSnapshot {
  if (!bundle.progressSnapshot) {
    bundle.progressSnapshot = buildProgressSnapshot(getPerfScoreSummary(bundle, state));
  }

  return bundle.progressSnapshot;
}

/** Counts empty cells lazily because ordering and risk use it more than the domain does. */
export function getPerfEmptyCellCount(
  bundle: StatePerfBundle,
  state: EngineState,
): number {
  if (bundle.emptyCellCount === undefined) {
    bundle.emptyCellCount = buildEmptyCellCount(state);
  }

  return bundle.emptyCellCount;
}

/** Computes legal-action count from the cached action list instead of regenerating it repeatedly. */
export function getPerfLegalActionCount(
  bundle: StatePerfBundle,
  state: EngineState,
  ruleConfig: RuleConfig,
): number {
  if (bundle.legalActionCount === undefined) {
    bundle.legalActionCount =
      state.status === 'gameOver' ? 0 : getCachedLegalActions(state, ruleConfig, bundle.positionKey).length;
  }

  return bundle.legalActionCount;
}

/** Memoizes the strategic scalar score per player within one searched position. */
export function getPerfStrategicScore(
  bundle: StatePerfBundle,
  state: EngineState,
  player: Player,
): number {
  const cached = bundle.strategicScores[player];

  if (cached !== undefined) {
    return cached;
  }

  const score = getStrategicScoreFromAnalysis(getPerfAnalysis(bundle, state), player);
  bundle.strategicScores[player] = score;
  return score;
}

/** Memoizes the higher-level strategic intent per player within one searched position. */
export function getPerfStrategicIntent(
  bundle: StatePerfBundle,
  state: EngineState,
  player: Player,
): ReturnType<typeof getStrategicIntentFromAnalysis> {
  const cached = bundle.strategicIntents[player];

  if (cached) {
    return cached;
  }

  const intent = getStrategicIntentFromAnalysis(getPerfAnalysis(bundle, state), player);
  bundle.strategicIntents[player] = intent;
  return intent;
}
