import type { Coord, PendingJump } from '@/domain/model/types';

export type TurnContinuation =
  | { type: 'none' }
  | { type: 'jump'; source: Coord; jumpedCheckerIds: string[] };

/** Returns the canonical tracking trail for runtime or legacy pending-jump payloads. */
export function getPendingJumpTrail(pendingJump: PendingJump | null | undefined): string[] {
  if (!pendingJump) {
    return [];
  }

  if (pendingJump.jumpedCheckerIds.length) {
    return pendingJump.jumpedCheckerIds;
  }

  if (pendingJump.visitedCoords?.length) {
    return pendingJump.visitedCoords;
  }

  return pendingJump.visitedStateKeys ?? [];
}

/** True when the payload carries any continuation-tracking information. */
export function hasPendingJumpTrail(pendingJump: PendingJump | null | undefined): boolean {
  return getPendingJumpTrail(pendingJump).length > 0;
}

/** Builds the engine's native jump-continuation state from checker ids. */
export function createJumpContinuation(
  source: Coord,
  jumpedCheckerIds: Iterable<string>,
): TurnContinuation {
  return {
    type: 'jump',
    source,
    jumpedCheckerIds: [...new Set(jumpedCheckerIds)],
  };
}

/** Normalizes the persisted pending-jump payload into the engine continuation model. */
export function normalizePendingJump(
  pendingJump: PendingJump | null | undefined,
): TurnContinuation {
  if (!pendingJump) {
    return { type: 'none' };
  }

  return createJumpContinuation(pendingJump.source, pendingJump.jumpedCheckerIds);
}

/** Projects the engine continuation model back to the persisted state shape. */
export function toPendingJump(continuation: TurnContinuation): PendingJump | null {
  if (continuation.type === 'none') {
    return null;
  }

  return {
    source: continuation.source,
    jumpedCheckerIds: continuation.jumpedCheckerIds.slice(),
  };
}
