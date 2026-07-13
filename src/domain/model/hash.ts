import { allCoords } from '@/domain/model/coordinates';
import { getCell } from '@/domain/model/board';
import { getPendingJumpTrail } from '@/domain/model/pendingJump';
import type { Board, PendingJump, StateSnapshot } from '@/domain/model/types';

/** Produces deterministic board hash used for history and threefold detection. */
export function hashBoard(board: Board): string {
  return allCoords()
    .map((coord) => {
      const signature = getCell(board, coord)
        .checkers.map(
          (checker) => `${checker.owner[0]}${checker.frozen ? 'f' : 'a'}`,
        )
        .join('|');
      return `${coord}:${signature}`;
    })
    .join(';');
}

/**
 * Encodes only the checker-identity placement that changes jump continuation
 * legality. Checker ids remain interchangeable outside a pending jump.
 */
function hashJumpedCheckerPlacement(
  board: Board,
  jumpedCheckerIds: string[],
): string {
  if (!jumpedCheckerIds.length) {
    return '-';
  }

  const jumpedCheckerIdSet = new Set(jumpedCheckerIds);
  const occupiedSlots: string[] = [];

  for (const coord of allCoords()) {
    const { checkers } = getCell(board, coord);

    for (let stackIndex = 0; stackIndex < checkers.length; stackIndex += 1) {
      if (jumpedCheckerIdSet.has(checkers[stackIndex].id)) {
        occupiedSlots.push(`${coord}.${stackIndex}`);
      }
    }
  }

  return occupiedSlots.join(',');
}

/** Produces full position hash (board + side to move). */
export function hashPosition(
  state: Pick<StateSnapshot, 'board' | 'currentPlayer'> & {
    pendingJump?: PendingJump | null;
  },
): string {
  const pendingJumpKey = state.pendingJump
    ? `${state.pendingJump.source}::${state.pendingJump.firstJumpedOwner ?? '?'}::${getPendingJumpTrail(state.pendingJump).join(',')}::${hashJumpedCheckerPlacement(state.board, state.pendingJump.jumpedCheckerIds)}`
    : '-';

  return `${state.currentPlayer}::${pendingJumpKey}::${hashBoard(state.board)}`;
}
