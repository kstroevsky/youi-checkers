import { describe, expect, it } from 'vitest';

import {
  createInitialState,
  type EngineState,
  type Player,
  type Victory,
} from '@/domain';
import {
  countCheckersForPlayer,
  getTopChecker,
  isFullStackOwnedByPlayer,
  isSingleChecker,
} from '@/domain/model/board';
import {
  BOARD_COLUMNS,
  FRONT_HOME_ROW,
  HOME_ROWS,
} from '@/domain/model/constants';
import { allCoords, createCoord, parseCoord } from '@/domain/model/coordinates';
import type { Column } from '@/domain/model/types';
import {
  checkPlayerVictory,
  checkVictoryWithPositionHash,
  checkVictoryWithPositionHashResolved,
} from '@/domain/rules/victory';
import { withConfig } from '@/test/factories';

import { createRandomPlayPerfState } from '../../../scripts/lateGamePerfFixtures';

function legacyCheckPlayerVictory(state: EngineState, player: Player): Victory {
  const checkerCount = allCoords().reduce(
    (count, coord) =>
      count +
      state.board[coord].checkers.filter((checker) => checker.owner === player)
        .length,
    0,
  );
  const hasHomeFieldWin =
    checkerCount === 18 &&
    allCoords().every((coord) => {
      const checker = getTopChecker(state.board, coord);

      if (!checker || checker.owner !== player) {
        return true;
      }

      return (
        HOME_ROWS[player].has(parseCoord(coord).row) &&
        isSingleChecker(state.board, coord)
      );
    });

  if (hasHomeFieldWin) {
    return { type: 'homeField', winner: player };
  }

  const hasSixStackWin = BOARD_COLUMNS.every((column) =>
    isFullStackOwnedByPlayer(
      state.board,
      createCoord(column as Column, FRONT_HOME_ROW[player]),
      player,
    ),
  );

  return hasSixStackWin
    ? { type: 'sixStacks', winner: player }
    : { type: 'none' };
}

describe('victory hot-path equivalence', () => {
  it('matches the frozen player-victory oracle across seeded positions', () => {
    const config = withConfig({ drawRule: 'threefold' });
    const states = [
      createInitialState(config),
      ...[1, 21, 0x1a2b3c, 0x4d5e6f].flatMap((seed) =>
        [1, 5, 20, 40, 80].map((turnCount) =>
          createRandomPlayPerfState(turnCount, config, seed),
        ),
      ),
    ];

    for (const state of states) {
      for (const player of ['white', 'black'] as const) {
        expect(countCheckersForPlayer(state.board, player)).toBe(
          allCoords().reduce(
            (count, coord) =>
              count +
              state.board[coord].checkers.filter(
                (checker) => checker.owner === player,
              ).length,
            0,
          ),
        );
        expect(checkPlayerVictory(state, player)).toEqual(
          legacyCheckPlayerVictory(state, player),
        );
      }

      expect(checkVictoryWithPositionHashResolved(state, config)).toEqual(
        checkVictoryWithPositionHash(state, config),
      );
    }
  });
});
