import { allCoords } from '@/domain/model/coordinates';
import { getCell } from '@/domain/model/board';
import type { Board, GameState, StateSnapshot } from '@/domain/model/types';

export function hashBoard(board: Board): string {
  return allCoords()
    .map((coord) => {
      const signature = getCell(board, coord).checkers
        .map((checker) => `${checker.owner[0]}${checker.frozen ? 'f' : 'a'}${checker.id}`)
        .join('|');
      return `${coord}:${signature}`;
    })
    .join(';');
}

export function hashPosition(state: Pick<GameState, 'board' | 'currentPlayer'> | StateSnapshot): string {
  return `${state.currentPlayer}::${hashBoard(state.board)}`;
}
