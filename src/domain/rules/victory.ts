import {
  countCheckersForPlayer,
  getCellHeight,
  getController,
  getTopChecker,
  isSingleChecker,
} from '@/domain/model/board';
import { FRONT_HOME_ROW, HOME_ROWS } from '@/domain/model/constants';
import { allCoords, createCoord, parseCoord } from '@/domain/model/coordinates';
import { hashPosition } from '@/domain/model/hash';
import { withRuleDefaults } from '@/domain/model/ruleConfig';
import type { Coord, GameState, Player, RuleConfig, Victory } from '@/domain/model/types';

function getHomeFieldFrontCoords(player: Player): Coord[] {
  const homeRow = FRONT_HOME_ROW[player];
  return ['A', 'B', 'C', 'D', 'E', 'F'].map((column) => createCoord(column as 'A', homeRow));
}

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

function hasSixStackWin(state: GameState, player: Player): boolean {
  return getHomeFieldFrontCoords(player).every((coord) => {
    return getCellHeight(state.board, coord) === 3 && getController(state.board, coord) === player;
  });
}

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
