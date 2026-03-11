import {
  isFullStackOwnedByPlayer,
  countCheckersForPlayer,
  getTopChecker,
  isSingleChecker,
} from '@/domain/model/board';
import { BOARD_COLUMNS, FRONT_HOME_ROW, HOME_ROWS } from '@/domain/model/constants';
import { allCoords, createCoord, parseCoord } from '@/domain/model/coordinates';
import { hashPosition } from '@/domain/model/hash';
import { withRuleDefaults } from '@/domain/model/ruleConfig';
import type { Column, Coord, GameState, Player, RuleConfig, Victory } from '@/domain/model/types';

const FRONT_HOME_COORDS: Record<Player, Coord[]> = {
  white: BOARD_COLUMNS.map((column) => createCoord(column as Column, FRONT_HOME_ROW.white)),
  black: BOARD_COLUMNS.map((column) => createCoord(column as Column, FRONT_HOME_ROW.black)),
};

/** True when all 18 player checkers are singles inside that player's home rows. */
function hasHomeFieldWin(state: GameState, player: Player): boolean {
  if (countCheckersForPlayer(state.board, player) !== 18) {
    return false;
  }

  return allCoords().every((coord) => {
    const checker = getTopChecker(state.board, coord);

    if (!checker || checker.owner !== player) {
      return true;
    }

    const { row } = parseCoord(coord);
    return HOME_ROWS[player].has(row) && isSingleChecker(state.board, coord);
  });
}

/** True when six front-row stacks are full height and contain only the player's own checkers. */
function hasSixStackWin(state: GameState, player: Player): boolean {
  return FRONT_HOME_COORDS[player].every((coord) =>
    isFullStackOwnedByPlayer(state.board, coord, player),
  );
}

/** Evaluates deterministic terminal status for current state under provided rules. */
export function checkVictory(
  state: GameState,
  config: Partial<RuleConfig> = {},
): Victory {
  const resolvedConfig = withRuleDefaults(config);

  for (const player of ['white', 'black'] as const) {
    if (hasHomeFieldWin(state, player)) {
      return { type: 'homeField', winner: player };
    }

    if (hasSixStackWin(state, player)) {
      return { type: 'sixStacks', winner: player };
    }
  }

  if (resolvedConfig.drawRule === 'threefold') {
    const positionHash = hashPosition(state);

    if ((state.positionCounts[positionHash] ?? 0) >= 3) {
      return { type: 'threefoldDraw' };
    }
  }

  return { type: 'none' };
}
