import { allCoords } from '@/domain/model/coordinates';
import { getCell } from '@/domain/model/board';
import { getPendingJumpTrail } from '@/domain/model/pendingJump';
import type { Board, PendingJump, StateSnapshot } from '@/domain/model/types';

/** Produces deterministic board hash used for history and threefold detection. */
export function hashBoard(board: Board): string {
  return allCoords()
    .map((coord) => {
      const signature = getCell(board, coord).checkers
        .map((checker) => `${checker.owner[0]}${checker.frozen ? 'f' : 'a'}`)
        .join('|');
      return `${coord}:${signature}`;
    })
    .join(';');
}

/** Produces full position hash (board + side to move). */
export function hashPosition(
  state: Pick<StateSnapshot, 'board' | 'currentPlayer'> & { pendingJump?: PendingJump | null },
): string {
  const pendingJumpKey = state.pendingJump
    ? `${state.pendingJump.source}::${getPendingJumpTrail(state.pendingJump).join(',')}`
    : '-';

  return `${state.currentPlayer}::${pendingJumpKey}::${hashBoard(state.board)}`;
}
