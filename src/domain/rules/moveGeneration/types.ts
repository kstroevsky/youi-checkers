import type { ActionKind, Board, Coord, PendingJump } from '@/domain/model/types';

export type PartialJumpResolution = {
  board: Board;
  currentCoord: Coord;
  jumpedCheckerIds: Set<string>;
};

export type AppliedActionState = {
  board: Board;
  continuationTargets?: Coord[];
  pendingJump: PendingJump | null;
};

export type TargetMap = Record<ActionKind, Coord[]>;
