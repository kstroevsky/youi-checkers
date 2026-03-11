import {
  getLegalActions,
  getScoreSummary,
  type EngineState,
  type Player,
  type RuleConfig,
} from '@/domain';
import {
  getCellHeight,
  getController,
  getTopChecker,
  isFullStackOwnedByPlayer,
  isSingleChecker,
  isStack,
} from '@/domain/model/board';
import { FRONT_HOME_ROW, HOME_ROWS } from '@/domain/model/constants';
import { allCoords, parseCoord } from '@/domain/model/coordinates';

// Fixed v1 evaluation weights. Keeping them together makes tuning deliberate and reviewable.
const TERMINAL_SCORE = 1_000_000;
const FULL_OWNED_FRONT_ROW_STACK = 8_000;
const FRONT_ROW_STACK_HEIGHT = 900;
const HOME_FIELD_SINGLE = 250;
const DISTANCE_TO_HOME = 35;
const CONTROLLED_STACK = 140;
const FROZEN_ENEMY_SINGLE = 180;
const OWN_FROZEN_SINGLE = 200;
const MOBILITY_PER_ACTION = 6;
const MOBILITY_CAP = 20;
const JUMP_BONUS = 80;

function getOpponent(player: Player): Player {
  return player === 'white' ? 'black' : 'white';
}

/** Measures how many rows a checker still needs to travel before it reaches home territory. */
function distanceToHomeRows(player: Player, row: number): number {
  if (HOME_ROWS[player].has(row as never)) {
    return 0;
  }

  return player === 'white' ? Math.max(0, 4 - row) : Math.max(0, row - 3);
}

/** Estimates mobility and jump pressure for one side in the current position. */
function getPlayerMobility(
  state: EngineState,
  player: Player,
  ruleConfig: RuleConfig,
): { actionCount: number; hasJump: boolean } {
  const actions = getLegalActions(
    {
      ...state,
      currentPlayer: player,
      pendingJump: player === state.currentPlayer ? state.pendingJump : null,
    },
    ruleConfig,
  );

  return {
    actionCount: actions.length,
    hasJump: actions.some((action) => action.type === 'jumpSequence'),
  };
}

/**
 * Scores one engine state from `perspectivePlayer`'s point of view.
 *
 * Positive scores favor `perspectivePlayer`, negative scores favor the opponent.
 * The function stays deliberately lightweight because search calls it many times.
 */
export function evaluateState(
  state: EngineState,
  perspectivePlayer: Player,
  ruleConfig: RuleConfig,
): number {
  if (state.status === 'gameOver') {
    if (state.victory.type === 'homeField' || state.victory.type === 'sixStacks') {
      return state.victory.winner === perspectivePlayer ? TERMINAL_SCORE : -TERMINAL_SCORE;
    }

    return 0;
  }

  const opponent = getOpponent(perspectivePlayer);
  const summary = getScoreSummary(state);
  const mobility = getPlayerMobility(state, perspectivePlayer, ruleConfig);
  const opponentMobility = getPlayerMobility(state, opponent, ruleConfig);

  let score = 0;

  // High-level board summary terms: structure, freezing pressure, and mobility.
  score += summary.homeFieldSingles[perspectivePlayer] * HOME_FIELD_SINGLE;
  score -= summary.homeFieldSingles[opponent] * HOME_FIELD_SINGLE;
  score += summary.controlledStacks[perspectivePlayer] * CONTROLLED_STACK;
  score -= summary.controlledStacks[opponent] * CONTROLLED_STACK;
  score += summary.frozenEnemySingles[perspectivePlayer] * FROZEN_ENEMY_SINGLE;
  score -= summary.frozenEnemySingles[opponent] * FROZEN_ENEMY_SINGLE;
  score -= summary.frozenEnemySingles[opponent] * OWN_FROZEN_SINGLE;
  score += summary.frozenEnemySingles[perspectivePlayer] * OWN_FROZEN_SINGLE;

  score += Math.max(-MOBILITY_CAP, Math.min(MOBILITY_CAP, mobility.actionCount - opponentMobility.actionCount))
    * MOBILITY_PER_ACTION;
  score += mobility.hasJump ? JUMP_BONUS : 0;
  score -= opponentMobility.hasJump ? JUMP_BONUS : 0;

  for (const coord of allCoords()) {
    const topChecker = getTopChecker(state.board, coord);

    if (!topChecker) {
      continue;
    }

    const { row } = parseCoord(coord);
    const sign = topChecker.owner === perspectivePlayer ? 1 : -1;

    score -= sign * distanceToHomeRows(topChecker.owner, row) * DISTANCE_TO_HOME;

    // Front-row stacks are the most valuable long-term structures in this ruleset.
    if (isStack(state.board, coord) && getController(state.board, coord) === topChecker.owner) {
      if (row === FRONT_HOME_ROW[topChecker.owner]) {
        score += sign * getCellHeight(state.board, coord) * FRONT_ROW_STACK_HEIGHT;
      }

      if (isFullStackOwnedByPlayer(state.board, coord, topChecker.owner)) {
        score += sign * FULL_OWNED_FRONT_ROW_STACK;
      }
    }

    if (isSingleChecker(state.board, coord) && topChecker.frozen) {
      score += topChecker.owner === perspectivePlayer ? -OWN_FROZEN_SINGLE : FROZEN_ENEMY_SINGLE;
    }
  }

  return score;
}
