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
  getActionStrategicProfile,
  getNoveltyPenalty,
  type ActionStrategicProfile,
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
  nextState: EngineState;
  policyPrior: number;
  repeatedPositionCount: number;
  score: number;
  tags: AiStrategicTag[];
  winsImmediately: boolean;
};

export type OrderMovesOptions = {
  actions?: TurnAction[];
  deadline?: number;
  grandparentPositionKey?: string | null;
  historyScores?: Map<string, number>;
  includeAllQuietMoves?: boolean;
  killerMoves?: TurnAction[];
  now?: () => number;
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

function getRepeatedPositionCount(state: EngineState): number {
  return state.positionCounts[hashPosition(state)] ?? 0;
}

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

/** Orders moves for alpha-beta search and prunes quiet moves by preset breadth. */
export function orderMoves(
  state: EngineState,
  _perspectivePlayer: Player,
  ruleConfig: RuleConfig,
  preset: AiDifficultyPreset,
  {
    actions,
    deadline,
    grandparentPositionKey = null,
    historyScores,
    includeAllQuietMoves = false,
    killerMoves = [],
    now,
    policyPriors = null,
    previousStrategicTags = null,
    previousActionKey = null,
    policyPriorWeight = preset.policyPriorWeight,
    pvMove,
    repetitionPenalty = preset.repetitionPenalty,
    samePlayerPreviousAction = null,
    selfUndoPenalty = preset.selfUndoPenalty,
    continuationScores,
    ttMove,
  }: OrderMovesOptions = {},
): OrderedAction[] {
  const actor = state.currentPlayer;
  const baseStructureScore = evaluateStructureState(state, actor, ruleConfig);
  const ordered = (actions ?? getLegalActions(state, ruleConfig)).map<OrderedAction>((action) => {
    throwIfMoveOrderingTimedOut(deadline, now);

    const nextState = advanceEngineState(state, action, ruleConfig);
    const nextPositionKey = hashPosition(nextState);
    const winsImmediately =
      nextState.status === 'gameOver' &&
      (nextState.victory.type === 'homeField' || nextState.victory.type === 'sixStacks') &&
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
      frontRowGrowth ||
      homeProgress ||
      freezeSwingBonus > 0 ||
      strategicProfile.tags.includes('freezeBlock') ||
      strategicProfile.tags.includes('rescue');
    const isForced = winsImmediately || nextState.status === 'gameOver';
    const historyScore = historyScores?.get(serializedAction) ?? 0;
    const continuationScore =
      previousActionKey === null
        ? 0
        : continuationScores?.get(`${previousActionKey}->${serializedAction}`) ?? 0;
    const killerScore = killerMoves.some((killer) => isSameAction(killer, action)) ? 9_000 : 0;
    const noveltyPenalty = getNoveltyPenalty(strategicProfile.tags, previousStrategicTags);

    let score = 0;

    if (isSameAction(ttMove, action)) {
      score += 200_000;
    }

    if (isSameAction(pvMove, action)) {
      score += 150_000;
    }

    if (winsImmediately) {
      score += 100_000;
    }

    if (action.type === 'jumpSequence') {
      score += 25_000;
    }

    if (action.type === 'manualUnfreeze') {
      score += 18_000;
    }

    if (frontRowGrowth) {
      score += 8_000;
    }

    if (homeProgress) {
      score += 4_000;
    }

    if (freezeSwingBonus > 0) {
      score += freezeSwingBonus * 2_000;
    }

    score += Math.max(-8_000, Math.min(8_000, staticPromise));
    score += Math.max(-6_000, Math.min(6_000, strategicProfile.intentDelta));
    score += strategicProfile.policyBias;
    score += Math.round(policyPrior * policyPriorWeight);
    score += Math.min(12_000, historyScore);
    score += Math.min(8_000, continuationScore);
    score += killerScore;
    score -= noveltyPenalty;

    if (isRepetition) {
      score -= repetitionPenalty * (repeatedPositionCount - 1);
    }

    if (isSelfUndo && !isTactical) {
      score -= selfUndoPenalty;
    }

    return {
      action,
      intent: strategicProfile.intent,
      intentDelta: strategicProfile.intentDelta,
      isForced,
      isRepetition,
      isSelfUndo,
      isTactical,
      nextState,
      policyPrior,
      repeatedPositionCount,
      score,
      tags: strategicProfile.tags,
      winsImmediately,
    };
  });

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
