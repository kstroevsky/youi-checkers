import {
  advanceEngineState,
  getLegalActions,
  type EngineState,
  type Player,
  type RuleConfig,
  type TurnAction,
} from '@/domain';
import { getCellHeight } from '@/domain/model/board';
import { FRONT_HOME_ROW, HOME_ROWS } from '@/domain/model/constants';
import { parseCoord } from '@/domain/model/coordinates';
import { evaluateState } from '@/ai/evaluation';
import type { AiDifficultyPreset } from '@/ai/types';

export type OrderedAction = {
  action: TurnAction;
  isTactical: boolean;
  nextState: EngineState;
  score: number;
};

/** Serializes one action into a comparable key used for PV/TT move matching. */
function actionKey(action: TurnAction): string {
  switch (action.type) {
    case 'manualUnfreeze':
      return `${action.type}:${action.coord}`;
    case 'jumpSequence':
      return `${action.type}:${action.source}:${action.path.join('>')}`;
    default:
      return `${action.type}:${action.source}:${action.target}`;
  }
}

/** Matches previously preferred moves against freshly generated legal actions. */
function isSameAction(left: TurnAction | null | undefined, right: TurnAction): boolean {
  if (!left) {
    return false;
  }

  return actionKey(left) === actionKey(right);
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

/**
 * Freezing/unfreezing is only produced by jumps, so a board-shape change after a jump is enough
 * for this small board to treat the move as tactically sharp.
 */
function causesFreezeSwing(state: EngineState, nextState: EngineState, action: TurnAction): boolean {
  if (action.type !== 'jumpSequence') {
    return false;
  }

  return JSON.stringify(state.board) !== JSON.stringify(nextState.board);
}

/** Orders moves for alpha-beta search and prunes quiet moves by preset breadth. */
export function orderMoves(
  state: EngineState,
  perspectivePlayer: Player,
  ruleConfig: RuleConfig,
  preset: AiDifficultyPreset,
  pvMove?: TurnAction | null,
  ttMove?: TurnAction | null,
): OrderedAction[] {
  const baseScore = evaluateState(state, perspectivePlayer, ruleConfig);
  const actor = state.currentPlayer;
  const ordered = getLegalActions(state, ruleConfig).map<OrderedAction>((action) => {
    const nextState = advanceEngineState(state, action, ruleConfig);
    const delta = evaluateState(nextState, perspectivePlayer, ruleConfig) - baseScore;
    const winsImmediately =
      nextState.status === 'gameOver' &&
      (nextState.victory.type === 'homeField' || nextState.victory.type === 'sixStacks') &&
      nextState.victory.winner === actor;
    const frontRowGrowth = growsFrontRowStack(state, action, nextState, actor);
    const homeProgress = improvesHomeField(action, actor);
    const freezeSwing = causesFreezeSwing(state, nextState, action);
    const isTactical =
      winsImmediately ||
      action.type === 'jumpSequence' ||
      action.type === 'manualUnfreeze' ||
      frontRowGrowth ||
      homeProgress ||
      freezeSwing;

    let score = delta;

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

    if (freezeSwing) {
      score += 2_000;
    }

    return {
      action,
      isTactical,
      nextState,
      score,
    };
  });

  ordered.sort((left, right) => right.score - left.score);

  // Harder difficulties search deeper and wider, but tactical moves are always preserved.
  const tacticalMoves = ordered.filter((entry) => entry.isTactical);
  const quietMoves = ordered
    .filter((entry) => !entry.isTactical)
    .slice(0, preset.quietMoveLimit);

  return [...tacticalMoves, ...quietMoves];
}
