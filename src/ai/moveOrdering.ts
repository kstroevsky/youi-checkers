import {
  advanceGeneratedEngineTransition,
  type EngineState,
  type Player,
  type RuleConfig,
  type TurnAction,
} from '@/domain';
import { evaluateStructureState } from '@/ai/evaluation';
import {
  getCachedLegalActions,
  getPerfAnalysis,
  getPerfEmptyCellCount,
  getPerfLegalActionCount,
  getPerfProgressSnapshot,
  getStatePerfBundle,
  type SearchPerfCache,
} from '@/ai/perf';
import {
  getActionParticipationProfileFromAnalysis,
  type ParticipationState,
  type SourceRegion,
} from '@/ai/participation';
import {
  getRiskCandidateAdjustment,
  getTiebreakPressureProfile,
} from '@/ai/risk';
import { getActionStrategicProfileFromAnalysis } from '@/ai/strategy';
import {
  AI_MODEL_ACTION_COUNT,
  encodeActionIndex,
} from '@/ai/model/actionSpace';
import { throwIfTimedOut } from '@/ai/search/shared';
import { getCellHeight, getTopChecker } from '@/domain/model/board';
import { FRONT_HOME_ROW, HOME_ROWS } from '@/domain/model/constants';
import {
  getAdjacentCoord,
  getJumpDirection,
  parseCoord,
} from '@/domain/model/coordinates';
import type {
  AiDifficultyPreset,
  AiMobilityTransition,
  AiRiskMode,
  AiSearchDiagnostics,
  AiStrategicIntent,
  AiStrategicTag,
  AiTerminalUtility,
  AiTiebreakEdgeKind,
} from '@/ai/types';

export type OrderedAction = {
  action: TurnAction;
  /** Numeric ID in the AI model action space (0..AI_MODEL_ACTION_COUNT-1), or -1 if unrepresentable. */
  actionId: number;
  drawTrapRisk: number;
  emptyCellsDelta: number;
  intent: AiStrategicIntent;
  intentDelta: number;
  isForced: boolean;
  isRepetition: boolean;
  isSelfUndo: boolean;
  isTactical: boolean;
  isTerminal: boolean;
  freezeSwingBonus: number;
  homeFieldDelta: number;
  mobility: AiMobilityTransition;
  mobilityDelta: number;
  movedMass: number;
  nextPositionKey: string;
  nextState: EngineState;
  nextParticipationState: ParticipationState;
  participationDelta: number;
  policyPrior: number;
  repeatedPositionCount: number;
  repeatsSourceFamily: boolean;
  repeatsSourceRegion: boolean;
  score: number;
  sixStackDelta: number;
  sourceFamily: string;
  sourceRegion: SourceRegion;
  tags: AiStrategicTag[];
  terminalUtility: AiTerminalUtility;
  tiebreakEdgeKind: AiTiebreakEdgeKind;
  winsImmediately: boolean;
};

export type PrecomputedOrderedAction = OrderedAction & {
  staticScore: number;
};

export type OrderMovesOptions = {
  actions?: TurnAction[];
  /** Keyed by (previousActionId * AI_MODEL_ACTION_COUNT + actionId). */
  continuationScores?: Map<number, number>;
  deadline?: number;
  diagnostics?: AiSearchDiagnostics | null;
  grandparentPositionKey?: string | null;
  historyScores?: Int32Array;
  includeAllQuietMoves?: boolean;
  /** Numeric action IDs of killer moves at this depth. */
  killerIds?: number[];
  now?: () => number;
  participationState?: ParticipationState | null;
  perfCache?: SearchPerfCache | null;
  policyPriors?: Float32Array | null;
  /** Numeric ID of the previous action by the same player (for continuation heuristic). */
  previousActionId?: number | null;
  policyPriorWeight?: number;
  /** Numeric ID of the PV move at this depth (for PV ordering). */
  pvMoveId?: number | null;
  repetitionPenalty?: number;
  riskMode?: AiRiskMode;
  samePlayerPreviousAction?: TurnAction | null;
  selfUndoPenalty?: number;
  /** Numeric ID of the transposition-table best move (for TT ordering). */
  ttMoveId?: number | null;
};

function classifyTerminalUtility(
  state: EngineState,
  actor: Player,
): AiTerminalUtility {
  if (state.status !== 'gameOver') {
    return null;
  }

  if ('winner' in state.victory) {
    return state.victory.winner === actor ? 'win' : 'loss';
  }

  return 'neutralDraw';
}

/**
 * Move ordering can consume a large fraction of the search budget because it
 * simulates every legal move. This keeps timeout semantics aligned with the
 * main search rather than letting ordering overrun the allocated time.
 */
function throwIfMoveOrderingTimedOut(
  deadline?: number,
  now?: () => number,
): void {
  if (deadline === undefined || !now) {
    return;
  }

  throwIfTimedOut(now, deadline);
}

function getRepeatedPositionCountByKey(
  state: EngineState,
  positionKey: string,
): number {
  return state.positionCounts[positionKey] ?? 0;
}

/**
 * Normalizes "how much material moved" across action kinds.
 *
 * This is used by participation and self-undo heuristics, where the important
 * question is not only which move type fired, but how much mass it reused.
 */
function movedCheckerCount(action: TurnAction): number {
  switch (action.type) {
    case 'splitTwoFromStack':
      return 2;
    case 'jumpSequence':
    case 'manualUnfreeze':
      return 0;
    default:
      return 1;
  }
}

/**
 * Projects heterogeneous action variants onto a simple source/target geometry.
 *
 * Several anti-repetition and self-undo heuristics need a common language that
 * works across jumps, step moves, and manual actions.
 */
function getSourceTarget(
  action: TurnAction,
): { source: string; target: string } | null {
  switch (action.type) {
    case 'manualUnfreeze':
      return null;
    case 'jumpSequence':
      return {
        source: action.source,
        target: action.path.at(-1) ?? action.source,
      };
    default:
      return {
        source: action.source,
        target: action.target,
      };
  }
}

/**
 * Detects the simplest "take back my own previous move" pattern.
 *
 * This exists because a local search without memory can otherwise look tactically
 * competent while oscillating between equivalent geometries on quiet turns.
 */
function isDirectSelfUndo(
  action: TurnAction,
  previousOwnAction: TurnAction | null | undefined,
): boolean {
  if (!previousOwnAction) {
    return false;
  }

  const current = getSourceTarget(action);
  const previous = getSourceTarget(previousOwnAction);

  if (!current || !previous) {
    return false;
  }

  if (
    current.source !== previous.target ||
    current.target !== previous.source ||
    movedCheckerCount(action) !== movedCheckerCount(previousOwnAction)
  ) {
    return false;
  }

  if (
    action.type === 'jumpSequence' ||
    previousOwnAction.type === 'jumpSequence'
  ) {
    return (
      current.source === previous.target && current.target === previous.source
    );
  }

  return true;
}

/** Detects stack-building moves that directly improve a front-row scoring structure. */
function growsFrontRowStack(
  state: EngineState,
  action: TurnAction,
  nextState: EngineState,
  player: Player,
): boolean {
  if (action.type === 'manualUnfreeze') {
    return false;
  }

  const target =
    action.type === 'jumpSequence' ? action.path.at(-1) : action.target;

  if (!target) {
    return false;
  }

  const { row } = parseCoord(target);

  if (row !== FRONT_HOME_ROW[player]) {
    return false;
  }

  return (
    getCellHeight(nextState.board, target) > getCellHeight(state.board, target)
  );
}

/** Flags moves that push material into a player's home field. */
function improvesHomeField(action: TurnAction, player: Player): boolean {
  if (action.type === 'manualUnfreeze') {
    return false;
  }

  const target =
    action.type === 'jumpSequence' ? action.path.at(-1) : action.target;

  if (!target) {
    return false;
  }

  const { row } = parseCoord(target);

  return HOME_ROWS[player].has(row as never);
}

/** Returns a small positive bonus when the jump freezes an enemy or thaws an own frozen single. */
function getFreezeSwingBonus(
  state: EngineState,
  action: TurnAction,
  player: Player,
): number {
  if (action.type !== 'jumpSequence') {
    return 0;
  }

  const landing = action.path[0];
  const direction = landing ? getJumpDirection(action.source, landing) : null;
  const jumpedCoord = direction
    ? getAdjacentCoord(action.source, direction)
    : null;

  if (!jumpedCoord) {
    return 0;
  }

  const jumpedChecker = getTopChecker(state.board, jumpedCoord);

  if (!jumpedChecker) {
    return 0;
  }

  if (jumpedChecker.owner === player) {
    return jumpedChecker.frozen ? 1 : 0;
  }

  return jumpedChecker.frozen ? 0 : 1;
}

/** Keeps numeric ordering terms bounded so outliers do not dominate the move sort. */
function clampScore(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

/** Extracts the dynamic heuristic terms that evolve while the search runs. */
function getDynamicScore(
  entry: Pick<PrecomputedOrderedAction, 'actionId'>,
  {
    continuationScores,
    historyScores,
    killerIds = [],
    previousActionId = null,
    pvMoveId,
    ttMoveId,
  }: Pick<
    OrderMovesOptions,
    | 'continuationScores'
    | 'historyScores'
    | 'killerIds'
    | 'previousActionId'
    | 'pvMoveId'
    | 'ttMoveId'
  >,
): number {
  const id = entry.actionId;
  const historyScore = id >= 0 ? (historyScores?.[id] ?? 0) : 0;
  const continuationScore =
    previousActionId === null || id < 0
      ? 0
      : (continuationScores?.get(
          previousActionId * AI_MODEL_ACTION_COUNT + id,
        ) ?? 0);
  const killerScore = id >= 0 && killerIds.includes(id) ? 9_000 : 0;
  let score = 0;

  if (id >= 0 && ttMoveId === id) {
    score += 200_000;
  }

  if (id >= 0 && pvMoveId === id) {
    score += 150_000;
  }

  score += Math.min(12_000, historyScore);
  score += Math.min(8_000, continuationScore);
  score += killerScore;

  return score;
}

/** Applies the common post-sort trimming rules shared by normal and precomputed ordering. */
function finalizeOrderedActions(
  ordered: OrderedAction[],
  preset: AiDifficultyPreset,
  includeAllQuietMoves = false,
): OrderedAction[] {
  ordered.sort((left, right) => right.score - left.score);

  if (includeAllQuietMoves) {
    return ordered;
  }

  // Harder difficulties search deeper and wider, but tactical moves are always preserved.
  const tacticalMoves: OrderedAction[] = [];
  const quietMoves: OrderedAction[] = [];

  for (const entry of ordered) {
    if (entry.isTactical) {
      tacticalMoves.push(entry);
    } else if (quietMoves.length < preset.quietMoveLimit) {
      quietMoves.push(entry);
    }
  }

  return [...tacticalMoves, ...quietMoves];
}

/** Precomputes the expensive state-derived move features that do not change between root depths. */
export function precomputeOrderedActions(
  state: EngineState,
  _perspectivePlayer: Player,
  ruleConfig: RuleConfig,
  preset: AiDifficultyPreset,
  {
    actions,
    deadline,
    diagnostics = null,
    grandparentPositionKey = null,
    now,
    participationState = null,
    perfCache = null,
    policyPriors = null,
    policyPriorWeight = preset.policyPriorWeight,
    repetitionPenalty = preset.repetitionPenalty,
    riskMode = 'normal',
    samePlayerPreviousAction = null,
    selfUndoPenalty = preset.selfUndoPenalty,
  }: Pick<
    OrderMovesOptions,
    | 'actions'
    | 'deadline'
    | 'diagnostics'
    | 'grandparentPositionKey'
    | 'now'
    | 'participationState'
    | 'perfCache'
    | 'policyPriors'
    | 'policyPriorWeight'
    | 'repetitionPenalty'
    | 'riskMode'
    | 'samePlayerPreviousAction'
    | 'selfUndoPenalty'
  > = {},
): PrecomputedOrderedAction[] {
  const basePerfBundle = getStatePerfBundle(state, ruleConfig, perfCache);
  const actor = state.currentPlayer;
  const candidateActions =
    actions ??
    getCachedLegalActions(state, ruleConfig, basePerfBundle.positionKey);
  const computeRiskSignals =
    riskMode !== 'normal' ||
    candidateActions.some((action) => action.type === 'manualUnfreeze');
  const baseStructureScore = evaluateStructureState(state, actor, ruleConfig, {
    diagnostics,
    perfBundle: basePerfBundle,
    preset,
    riskMode,
  });
  const baseAnalysis = getPerfAnalysis(basePerfBundle, state);
  const baseProgress = computeRiskSignals
    ? getPerfProgressSnapshot(basePerfBundle, state)
    : null;
  const baseLegalMoveCount = actions
    ? getPerfLegalActionCount(basePerfBundle, state, ruleConfig)
    : candidateActions.length;
  const baseEmptyCells = computeRiskSignals
    ? getPerfEmptyCellCount(basePerfBundle, state)
    : 0;
  return candidateActions.map<PrecomputedOrderedAction>((action) => {
    throwIfMoveOrderingTimedOut(deadline, now);

    const transition = advanceGeneratedEngineTransition(
      state,
      action,
      ruleConfig,
      { positionCountStorage: 'overlay' },
    );
    const nextState = transition.state;
    const nextPerfBundle = getStatePerfBundle(
      nextState,
      ruleConfig,
      perfCache,
      nextState.status === 'gameOver' ? undefined : transition.positionHash,
    );
    const nextAnalysis = getPerfAnalysis(nextPerfBundle, nextState);
    const nextPositionKey = nextPerfBundle.positionKey;
    const isTerminal = nextState.status === 'gameOver';
    const terminalUtility = classifyTerminalUtility(nextState, actor);
    const winsImmediately =
      isTerminal &&
      'winner' in nextState.victory &&
      nextState.victory.winner === actor;
    const repeatedPositionCount = getRepeatedPositionCountByKey(
      nextState,
      nextPositionKey,
    );
    const frontRowGrowth = growsFrontRowStack(state, action, nextState, actor);
    const homeProgress = improvesHomeField(action, actor);
    const freezeSwingBonus = getFreezeSwingBonus(state, action, actor);
    const nextProgress = computeRiskSignals
      ? getPerfProgressSnapshot(nextPerfBundle, nextState)
      : null;
    const samePlayerContinuation =
      !isTerminal && nextState.currentPlayer === actor;
    const nextLegalMoveCount =
      computeRiskSignals && !isTerminal
        ? getPerfLegalActionCount(nextPerfBundle, nextState, ruleConfig)
        : null;
    const mobility: AiMobilityTransition = {
      actorBefore: baseLegalMoveCount,
      actorContinuationAfter: samePlayerContinuation
        ? nextLegalMoveCount
        : null,
      opponentReplyAfter:
        !isTerminal && !samePlayerContinuation ? nextLegalMoveCount : null,
      measuredAfter: nextLegalMoveCount !== null,
      samePlayerContinuation,
    };
    const mobilityDelta =
      samePlayerContinuation && nextLegalMoveCount !== null
        ? nextLegalMoveCount - baseLegalMoveCount
        : 0;
    const emptyCellsDelta = computeRiskSignals
      ? getPerfEmptyCellCount(nextPerfBundle, nextState) - baseEmptyCells
      : 0;
    const homeFieldDelta =
      computeRiskSignals && nextProgress && baseProgress
        ? nextProgress.homeFieldProgress[actor] -
          baseProgress.homeFieldProgress[actor]
        : 0;
    const sixStackDelta =
      computeRiskSignals && nextProgress && baseProgress
        ? nextProgress.sixStackProgress[actor] -
          baseProgress.sixStackProgress[actor]
        : 0;
    const strategicProfile = getActionStrategicProfileFromAnalysis(
      state,
      action,
      nextState,
      actor,
      baseAnalysis,
      nextAnalysis,
    );
    const staticPromise =
      evaluateStructureState(nextState, actor, ruleConfig, {
        diagnostics,
        perfBundle: nextPerfBundle,
        preset,
        riskMode,
      }) - baseStructureScore;
    const currentActionId = encodeActionIndex(action) ?? -1;
    const policyPrior =
      policyPriors && currentActionId >= 0
        ? (policyPriors[currentActionId] ?? 0)
        : 0;
    const isRepetition = repeatedPositionCount > 1;
    const isSelfUndo =
      (grandparentPositionKey !== null &&
        nextPositionKey === grandparentPositionKey) ||
      isDirectSelfUndo(action, samePlayerPreviousAction);
    const meaningfulUnfreeze =
      action.type === 'manualUnfreeze' &&
      (mobilityDelta > 0 ||
        homeFieldDelta > 0.01 ||
        sixStackDelta > 0.01 ||
        strategicProfile.tags.includes('decompress') ||
        strategicProfile.tags.includes('openLane'));
    // "Forced" is intentionally narrow: it means the actor can win now. A
    // terminal draw or loss must not bypass safety, novelty, or risk penalties.
    const isForced = winsImmediately;
    const isTactical =
      winsImmediately ||
      action.type === 'jumpSequence' ||
      meaningfulUnfreeze ||
      freezeSwingBonus > 0 ||
      strategicProfile.tags.includes('freezeBlock') ||
      (strategicProfile.tags.includes('rescue') &&
        action.type !== 'manualUnfreeze');
    const tiebreakProfile = getTiebreakPressureProfile(
      nextState,
      actor,
      riskMode,
      {
        emptyCellsDelta,
        freezeSwingBonus,
        homeFieldDelta,
        isForced,
        isManualUnfreeze: action.type === 'manualUnfreeze',
        isRepetition,
        isSelfUndo,
        isTactical,
        mobilityDelta,
        repeatedPositionCount,
        sixStackDelta,
        tags: strategicProfile.tags,
      },
      nextPerfBundle,
    );
    const participationProfile = getActionParticipationProfileFromAnalysis(
      state,
      action,
      nextState,
      actor,
      participationState,
      preset,
      {
        isTactical,
        winsImmediately,
      },
      baseAnalysis,
      nextAnalysis,
    );
    let staticScore = 0;

    if (winsImmediately) {
      staticScore += 100_000;
    }

    if (action.type === 'jumpSequence') {
      staticScore += isRepetition && !isForced ? 0 : 7_500;
    }

    if (frontRowGrowth) {
      staticScore += 5_000;
    }

    if (homeProgress) {
      staticScore += 2_500;
    }

    if (freezeSwingBonus > 0) {
      staticScore += freezeSwingBonus * 1_200;
    }

    staticScore += clampScore(staticPromise, 8_000);
    staticScore += clampScore(strategicProfile.intentDelta, 6_000);
    staticScore += strategicProfile.policyBias;
    staticScore += Math.round(policyPrior * policyPriorWeight);

    if (isRepetition) {
      staticScore -= repetitionPenalty * (repeatedPositionCount - 1);
    }

    if (isSelfUndo && !isForced) {
      staticScore -= selfUndoPenalty;
    }

    if (tiebreakProfile.drawTrapRisk > 0 && !isForced) {
      staticScore -= Math.round(
        (200 + preset.riskLoopPenalty * 0.5) * tiebreakProfile.drawTrapRisk,
      );

      if (diagnostics) {
        diagnostics.adverseDrawTrapPenalties += 1;
      }
    }

    if (riskMode !== 'normal') {
      staticScore += getRiskCandidateAdjustment(
        {
          drawTrapRisk: tiebreakProfile.drawTrapRisk,
          emptyCellsDelta,
          freezeSwingBonus,
          homeFieldDelta,
          isForced,
          isManualUnfreeze: action.type === 'manualUnfreeze',
          isRepetition,
          isSelfUndo,
          isTactical,
          mobilityDelta,
          repeatedPositionCount,
          sixStackDelta,
          tags: strategicProfile.tags,
          tiebreakEdgeKind: tiebreakProfile.tiebreakEdgeKind,
        },
        preset,
        riskMode,
      );
    }

    return {
      action,
      actionId: currentActionId,
      drawTrapRisk: tiebreakProfile.drawTrapRisk,
      emptyCellsDelta,
      intent: strategicProfile.intent,
      intentDelta: strategicProfile.intentDelta,
      isForced,
      isRepetition,
      isSelfUndo,
      isTactical,
      isTerminal,
      freezeSwingBonus,
      homeFieldDelta,
      mobility,
      mobilityDelta,
      movedMass: participationProfile.movedMass,
      nextPositionKey,
      nextState,
      nextParticipationState: participationProfile.nextParticipationState,
      participationDelta: participationProfile.participationDelta,
      policyPrior,
      repeatedPositionCount,
      repeatsSourceFamily: participationProfile.repeatsSourceFamily,
      repeatsSourceRegion: participationProfile.repeatsSourceRegion,
      score: staticScore,
      sourceFamily: participationProfile.sourceFamily,
      sourceRegion: participationProfile.sourceRegion,
      sixStackDelta,
      staticScore,
      tags: strategicProfile.tags,
      terminalUtility,
      tiebreakEdgeKind: tiebreakProfile.tiebreakEdgeKind,
      winsImmediately,
    };
  });
}

/** Re-scores precomputed move entries using the heuristic tables that evolve during search. */
export function orderPrecomputedMoves(
  precomputedActions: PrecomputedOrderedAction[],
  preset: AiDifficultyPreset,
  {
    continuationScores,
    deadline,
    historyScores,
    includeAllQuietMoves = false,
    killerIds = [],
    now,
    previousActionId = null,
    pvMoveId,
    ttMoveId,
  }: Pick<
    OrderMovesOptions,
    | 'continuationScores'
    | 'deadline'
    | 'historyScores'
    | 'includeAllQuietMoves'
    | 'killerIds'
    | 'now'
    | 'previousActionId'
    | 'pvMoveId'
    | 'ttMoveId'
  > = {},
): OrderedAction[] {
  for (const entry of precomputedActions) {
    throwIfMoveOrderingTimedOut(deadline, now);
    entry.score =
      entry.staticScore +
      getDynamicScore(entry, {
        continuationScores,
        historyScores,
        killerIds,
        previousActionId,
        pvMoveId,
        ttMoveId,
      });
  }

  return finalizeOrderedActions(
    precomputedActions,
    preset,
    includeAllQuietMoves,
  );
}

/** Orders moves for alpha-beta search and prunes quiet moves by preset breadth. */
export function orderMoves(
  state: EngineState,
  perspectivePlayer: Player,
  ruleConfig: RuleConfig,
  preset: AiDifficultyPreset,
  options: OrderMovesOptions = {},
): OrderedAction[] {
  const precomputedActions = precomputeOrderedActions(
    state,
    perspectivePlayer,
    ruleConfig,
    preset,
    options,
  );

  return orderPrecomputedMoves(precomputedActions, preset, options);
}
