import {
  getLegalActions,
  getScoreSummary,
  type EngineState,
  type Player,
  type RuleConfig,
} from '@/domain';
import {
  getCell,
  getCellHeight,
  getController,
  getTopChecker,
  isFullStackOwnedByPlayer,
  isStack,
} from '@/domain/model/board';
import { hashPosition } from '@/domain/model/hash';
import { FRONT_HOME_ROW, HOME_ROWS } from '@/domain/model/constants';
import { allCoords, parseCoord } from '@/domain/model/coordinates';

// Fixed v1 evaluation weights. Keeping them together makes tuning deliberate and reviewable.
const TERMINAL_SCORE = 1_000_000;
const FULL_OWNED_FRONT_ROW_STACK = 10_000;
const CONTROLLED_FRONT_ROW_HEIGHT_THREE_STACK = 2_400;
const FRONT_ROW_STACK_HEIGHT = 1_050;
const FRONT_ROW_OWNED_TWO_STACK = 1_200;
const HOME_FIELD_SINGLE = 420;
const HOME_FIELD_THREAT_STEP = 700;
const DISTANCE_TO_HOME = 28;
const CONTROLLED_STACK = 70;
const FROZEN_ENEMY_SINGLE = 210;
const OWN_FROZEN_SINGLE = 240;
const MOBILITY_PER_ACTION = 5;
const MOBILITY_CAP = 18;
const JUMP_BONUS = 55;
const SIX_STACK_THREAT_STEP = 1_500;

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

function getPositionRepetitionCount(state: EngineState): number {
  return state.positionCounts[hashPosition(state)] ?? 0;
}

function getFrontRowOwnedTwoStacks(state: EngineState, player: Player): number {
  return allCoords().reduce((count, coord) => {
    const topChecker = getTopChecker(state.board, coord);

    if (!topChecker || topChecker.owner !== player) {
      return count;
    }

    const { row } = parseCoord(coord);

    if (
      row !== FRONT_HOME_ROW[player] ||
      getCellHeight(state.board, coord) !== 2 ||
      !getCell(state.board, coord).checkers.every((checker) => checker.owner === player)
    ) {
      return count;
    }

    return count + 1;
  }, 0);
}

function getFrontRowControlledHeight(state: EngineState, player: Player): number {
  return allCoords().reduce((height, coord) => {
    const topChecker = getTopChecker(state.board, coord);

    if (!topChecker || topChecker.owner !== player || !isStack(state.board, coord)) {
      return height;
    }

    const { row } = parseCoord(coord);

    if (row !== FRONT_HOME_ROW[player] || getController(state.board, coord) !== player) {
      return height;
    }

    return height + getCellHeight(state.board, coord);
  }, 0);
}

function getTotalDistanceToHome(state: EngineState, player: Player): number {
  return allCoords().reduce((distance, coord) => {
    const { row } = parseCoord(coord);

    return (
      distance +
      getCell(state.board, coord).checkers.reduce((sum, checker) => {
        if (checker.owner !== player) {
          return sum;
        }

        return sum + distanceToHomeRows(player, row);
      }, 0)
    );
  }, 0);
}

function getStructureScore(state: EngineState, player: Player): number {
  const summary = getScoreSummary(state);
  const homeFieldSingles = summary.homeFieldSingles[player];
  const frontRowThreeStacks = summary.controlledHomeRowHeightThreeStacks[player];
  const controlledStacks = summary.controlledStacks[player];
  const frozenEnemySingles = summary.frozenEnemySingles[player];
  const frontRowControlledHeight = getFrontRowControlledHeight(state, player);
  const frontRowOwnedTwoStacks = getFrontRowOwnedTwoStacks(state, player);
  let score = 0;

  score += homeFieldSingles * HOME_FIELD_SINGLE;
  score += Math.max(0, homeFieldSingles - 12) * HOME_FIELD_THREAT_STEP;
  score += controlledStacks * CONTROLLED_STACK;
  score += frozenEnemySingles * FROZEN_ENEMY_SINGLE;
  score += frontRowControlledHeight * FRONT_ROW_STACK_HEIGHT;
  score += frontRowOwnedTwoStacks * FRONT_ROW_OWNED_TWO_STACK;
  score += frontRowThreeStacks * CONTROLLED_FRONT_ROW_HEIGHT_THREE_STACK;
  score += Math.max(0, frontRowThreeStacks - 3) * SIX_STACK_THREAT_STEP;
  score -= getTotalDistanceToHome(state, player) * DISTANCE_TO_HOME;

  for (const coord of allCoords()) {
    const topChecker = getTopChecker(state.board, coord);

    if (!topChecker || topChecker.owner !== player) {
      continue;
    }

    if (isStack(state.board, coord) && isFullStackOwnedByPlayer(state.board, coord, player)) {
      const { row } = parseCoord(coord);

      if (row === FRONT_HOME_ROW[player]) {
        score += FULL_OWNED_FRONT_ROW_STACK;
      }
    }
  }

  return score;
}

/** Cheap structure-only score used by move ordering before deeper search refines it. */
export function evaluateStructureState(
  state: EngineState,
  perspectivePlayer: Player,
  _ruleConfig: RuleConfig,
): number {
  if (state.status === 'gameOver') {
    if (state.victory.type === 'homeField' || state.victory.type === 'sixStacks') {
      return state.victory.winner === perspectivePlayer ? TERMINAL_SCORE : -TERMINAL_SCORE;
    }

    return 0;
  }

  const opponent = getOpponent(perspectivePlayer);
  const ownRepeatedPositionCount = Math.max(0, getPositionRepetitionCount(state) - 1);

  return (
    getStructureScore(state, perspectivePlayer) -
    getStructureScore(state, opponent) -
    ownRepeatedPositionCount * 40
  );
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
  const mobility = getPlayerMobility(state, perspectivePlayer, ruleConfig);
  const opponentMobility = getPlayerMobility(state, opponent, ruleConfig);
  const summary = getScoreSummary(state);
  const ownFrozenSingles = summary.frozenEnemySingles[opponent];
  let score =
    getStructureScore(state, perspectivePlayer) -
    getStructureScore(state, opponent) -
    ownFrozenSingles * (OWN_FROZEN_SINGLE - FROZEN_ENEMY_SINGLE);

  score += Math.max(
    -MOBILITY_CAP,
    Math.min(MOBILITY_CAP, mobility.actionCount - opponentMobility.actionCount),
  ) * MOBILITY_PER_ACTION;
  score += mobility.hasJump ? JUMP_BONUS : 0;
  score -= opponentMobility.hasJump ? JUMP_BONUS : 0;

  return score;
}
