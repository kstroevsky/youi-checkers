import {
  advanceEngineState,
  getLegalActions,
  hashPosition,
  type EngineState,
  type Player,
  type RuleConfig,
  type TurnAction,
} from '@/domain';
import { evaluateStructureState } from '@/ai/evaluation';
import {
  getActionParticipationProfile,
  type ParticipationState,
  type SourceRegion,
} from '@/ai/participation';
import {
  getActionStrategicProfile,
  getNoveltyPenalty,
} from '@/ai/strategy';
import { actionKey, throwIfTimedOut } from '@/ai/search/shared';
import { getCellHeight, getTopChecker } from '@/domain/model/board';
import { FRONT_HOME_ROW, HOME_ROWS } from '@/domain/model/constants';
import { getAdjacentCoord, getJumpDirection, parseCoord } from '@/domain/model/coordinates';
import type { AiDifficultyPreset, AiStrategicIntent, AiStrategicTag } from '@/ai/types';

export type OrderedAction = {
  action: TurnAction;
  intent: AiStrategicIntent;
  intentDelta: number;
  isForced: boolean;
  isRepetition: boolean;
  isSelfUndo: boolean;
  isTactical: boolean;
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
  serializedAction: string;
  sourceFamily: string;
  sourceRegion: SourceRegion;
  tags: AiStrategicTag[];
  winsImmediately: boolean;
};

export type PrecomputedOrderedAction = Omit<OrderedAction, 'score'> & {
  staticScore: number;
};

export type OrderMovesOptions = {
  actions?: TurnAction[];
  deadline?: number;
  grandparentPositionKey?: string | null;
  historyScores?: Map<string, number>;
  includeAllQuietMoves?: boolean;
  killerMoves?: TurnAction[];
  now?: () => number;
  participationState?: ParticipationState | null;
  policyPriors?: Record<string, number> | null;
  previousStrategicTags?: AiStrategicTag[] | null;
  previousActionKey?: string | null;
  policyPriorWeight?: number;
  pvMove?: TurnAction | null;
  repetitionPenalty?: number;
  samePlayerPreviousAction?: TurnAction | null;
  selfUndoPenalty?: number;
  continuationScores?: Map<string, number>;
  ttMove?: TurnAction | null;
};

/**
 * Move ordering can consume a large fraction of the search budget because it
 * simulates every legal move. This keeps timeout semantics aligned with the
 * main search rather than letting ordering overrun the allocated time.
 */
function throwIfMoveOrderingTimedOut(deadline?: number, now?: () => number): void {
  if (deadline === undefined || !now) {
    return;
  }

  throwIfTimedOut(now, deadline);
}

/** Matches previously preferred moves against freshly generated legal actions. */
function isSameAction(left: TurnAction | null | undefined, right: TurnAction): boolean {
  if (!left) {
    return false;
  }

  return actionKey(left) === actionKey(right);
}

/** Repetition pressure is evaluated on the post-move state so drawish lines sink in ordering. */
function getRepeatedPositionCount(state: EngineState): number {
  return state.positionCounts[hashPosition(state)] ?? 0;
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

  if (action.type === 'jumpSequence' || previousOwnAction.type === 'jumpSequence') {
    return current.source === previous.target && current.target === previous.source;
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

  const target = action.type === 'jumpSequence' ? action.path.at(-1) : action.target;

  if (!target) {
    return false;
  }

  const { row } = parseCoord(target);

  if (row !== FRONT_HOME_ROW[player]) {
    return false;
  }

  return getCellHeight(nextState.board, target) > getCellHeight(state.board, target);
}

/** Flags moves that push material into a player's home field. */
function improvesHomeField(action: TurnAction, player: Player): boolean {
  if (action.type === 'manualUnfreeze') {
    return false;
  }

  const target = action.type === 'jumpSequence' ? action.path.at(-1) : action.target;

  if (!target) {
    return false;
  }

  const { row } = parseCoord(target);

  return HOME_ROWS[player].has(row as never);
}

/** Returns a small positive bonus when the jump freezes an enemy or thaws an own frozen single. */
function getFreezeSwingBonus(state: EngineState, action: TurnAction, player: Player): number {
  if (action.type !== 'jumpSequence') {
    return 0;
  }

  const landing = action.path[0];
  const direction = landing ? getJumpDirection(action.source, landing) : null;
  const jumpedCoord = direction ? getAdjacentCoord(action.source, direction) : null;

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
  entry: Pick<PrecomputedOrderedAction, 'action' | 'serializedAction'>,
  {
    continuationScores,
    historyScores,
    killerMoves = [],
    previousActionKey = null,
    pvMove,
    ttMove,
  }: Pick<
    OrderMovesOptions,
    'continuationScores' | 'historyScores' | 'killerMoves' | 'previousActionKey' | 'pvMove' | 'ttMove'
  >,
): number {
  const historyScore = historyScores?.get(entry.serializedAction) ?? 0;
  const continuationScore =
    previousActionKey === null
      ? 0
      : continuationScores?.get(`${previousActionKey}->${entry.serializedAction}`) ?? 0;
  const killerScore = killerMoves.some((killer) => isSameAction(killer, entry.action)) ? 9_000 : 0;
  let score = 0;

  if (isSameAction(ttMove, entry.action)) {
    score += 200_000;
  }

  if (isSameAction(pvMove, entry.action)) {
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
  const tacticalMoves = ordered.filter((entry) => entry.isTactical);
  const quietMoves = ordered
    .filter((entry) => !entry.isTactical)
    .slice(0, preset.quietMoveLimit);

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
    grandparentPositionKey = null,
    now,
    participationState = null,
    policyPriors = null,
    previousStrategicTags = null,
    policyPriorWeight = preset.policyPriorWeight,
    repetitionPenalty = preset.repetitionPenalty,
    samePlayerPreviousAction = null,
    selfUndoPenalty = preset.selfUndoPenalty,
  }: Pick<
    OrderMovesOptions,
    | 'actions'
    | 'deadline'
    | 'grandparentPositionKey'
    | 'now'
    | 'participationState'
    | 'policyPriors'
    | 'policyPriorWeight'
    | 'previousStrategicTags'
    | 'repetitionPenalty'
    | 'samePlayerPreviousAction'
    | 'selfUndoPenalty'
  > = {},
): PrecomputedOrderedAction[] {
  const actor = state.currentPlayer;
  const baseStructureScore = evaluateStructureState(state, actor, ruleConfig);
  return (actions ?? getLegalActions(state, ruleConfig)).map<PrecomputedOrderedAction>((action) => {
    throwIfMoveOrderingTimedOut(deadline, now);

    const nextState = advanceEngineState(state, action, ruleConfig);
    const nextPositionKey = hashPosition(nextState);
    const winsImmediately =
      nextState.status === 'gameOver' &&
      'winner' in nextState.victory &&
      nextState.victory.winner === actor;
    const repeatedPositionCount = getRepeatedPositionCount(nextState);
    const frontRowGrowth = growsFrontRowStack(state, action, nextState, actor);
    const homeProgress = improvesHomeField(action, actor);
    const freezeSwingBonus = getFreezeSwingBonus(state, action, actor);
    const strategicProfile = getActionStrategicProfile(
      state,
      action,
      nextState,
      actor,
    );
    const staticPromise =
      evaluateStructureState(nextState, actor, ruleConfig) - baseStructureScore;
    const serializedAction = actionKey(action);
    const policyPrior = policyPriors?.[serializedAction] ?? 0;
    const isRepetition = repeatedPositionCount > 1;
    const isSelfUndo =
      (grandparentPositionKey !== null && nextPositionKey === grandparentPositionKey) ||
      isDirectSelfUndo(action, samePlayerPreviousAction);
    const isTactical =
      winsImmediately ||
      action.type === 'jumpSequence' ||
      action.type === 'manualUnfreeze' ||
      freezeSwingBonus > 0 ||
      strategicProfile.tags.includes('freezeBlock') ||
      strategicProfile.tags.includes('rescue');
    const participationProfile = getActionParticipationProfile(
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
    );
    const isForced = winsImmediately || nextState.status === 'gameOver';
    const noveltyPenalty = getNoveltyPenalty(strategicProfile.tags, previousStrategicTags);
    let staticScore = 0;

    if (winsImmediately) {
      staticScore += 100_000;
    }

    if (action.type === 'jumpSequence') {
      staticScore += 7_500;
    }

    if (action.type === 'manualUnfreeze') {
      staticScore += 5_500;
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
    staticScore += clampScore(participationProfile.participationDelta, 2_400);
    staticScore += strategicProfile.policyBias;
    staticScore += Math.round(policyPrior * policyPriorWeight);
    staticScore -= noveltyPenalty;

    if (isRepetition) {
      staticScore -= repetitionPenalty * (repeatedPositionCount - 1);
    }

    if (isSelfUndo && !isTactical) {
      staticScore -= selfUndoPenalty;
    }

    return {
      action,
      intent: strategicProfile.intent,
      intentDelta: strategicProfile.intentDelta,
      isForced,
      isRepetition,
      isSelfUndo,
      isTactical,
      movedMass: participationProfile.movedMass,
      nextPositionKey,
      nextState,
      nextParticipationState: participationProfile.nextParticipationState,
      participationDelta: participationProfile.participationDelta,
      policyPrior,
      repeatedPositionCount,
      repeatsSourceFamily: participationProfile.repeatsSourceFamily,
      repeatsSourceRegion: participationProfile.repeatsSourceRegion,
      sourceFamily: participationProfile.sourceFamily,
      sourceRegion: participationProfile.sourceRegion,
      serializedAction,
      staticScore,
      tags: strategicProfile.tags,
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
    killerMoves = [],
    now,
    previousActionKey = null,
    pvMove,
    ttMove,
  }: Pick<
    OrderMovesOptions,
    | 'continuationScores'
    | 'deadline'
    | 'historyScores'
    | 'includeAllQuietMoves'
    | 'killerMoves'
    | 'now'
    | 'previousActionKey'
    | 'pvMove'
    | 'ttMove'
  > = {},
): OrderedAction[] {
  const ordered = precomputedActions.map<OrderedAction>((entry) => {
    throwIfMoveOrderingTimedOut(deadline, now);

    return {
      ...entry,
      score:
        entry.staticScore +
        getDynamicScore(entry, {
          continuationScores,
          historyScores,
          killerMoves,
          previousActionKey,
          pvMove,
          ttMove,
        }),
    };
  });

  return finalizeOrderedActions(ordered, preset, includeAllQuietMoves);
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
