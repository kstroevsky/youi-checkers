import { getCellHeight, getController, getTopChecker, isSingleChecker, isStack } from '@/domain/model/board';
import { FRONT_HOME_ROW, HOME_ROWS } from '@/domain/model/constants';
import { allCoords, parseCoord } from '@/domain/model/coordinates';
import type { GameState, Player, ScoreSummary } from '@/domain/model/types';

function createScoreSeed(): ScoreSummary {
  return {
    homeFieldSingles: { white: 0, black: 0 },
    controlledStacks: { white: 0, black: 0 },
    controlledHomeRowHeightThreeStacks: { white: 0, black: 0 },
    frozenEnemySingles: { white: 0, black: 0 },
  };
}

export function getScoreSummary(state: GameState): ScoreSummary {
  const summary = createScoreSeed();

  for (const coord of allCoords()) {
    const topChecker = getTopChecker(state.board, coord);

    if (!topChecker) {
      continue;
    }

    const { row } = parseCoord(coord);

    if (isSingleChecker(state.board, coord) && HOME_ROWS[topChecker.owner].has(row)) {
      summary.homeFieldSingles[topChecker.owner] += 1;
    }

    if (isStack(state.board, coord)) {
      const controller = getController(state.board, coord);

      if (controller) {
        summary.controlledStacks[controller] += 1;

        if (getCellHeight(state.board, coord) === 3 && row === FRONT_HOME_ROW[controller]) {
          summary.controlledHomeRowHeightThreeStacks[controller] += 1;
        }
      }
    }

    if (isSingleChecker(state.board, coord) && topChecker.frozen) {
      const opposingPlayer: Player = topChecker.owner === 'white' ? 'black' : 'white';
      summary.frozenEnemySingles[opposingPlayer] += 1;
    }
  }

  return summary;
}
