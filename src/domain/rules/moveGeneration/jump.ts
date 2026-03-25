import {
  addCheckers,
  cloneBoardStructure,
  ensureMutableCell,
  getCellHeight,
  getTopChecker,
  isEmptyCell,
  isStack,
  removeTopCheckers,
  setSingleCheckerFrozen,
} from '@/domain/model/board';
import { DIRECTION_VECTORS } from '@/domain/model/constants';
import {
  getAdjacentCoord,
  getJumpDirection,
  getJumpLandingCoord,
} from '@/domain/model/coordinates';
import { hashBoard } from '@/domain/model/hash';
import type {
  Board,
  Coord,
  EngineState,
  GameState,
  Player,
  ValidationResult,
} from '@/domain/model/types';
import { canJumpOverCell, validateBoard } from '@/domain/validators/stateValidators';

import type { PartialJumpResolution } from '@/domain/rules/moveGeneration/types';

/** Builds a board-sensitive jump-state key used by tests and perf helpers. */
export function createJumpStateKey(coord: Coord, board: Board): string {
  return `${coord}::${hashBoard(board)}`;
}

/** Resolves the middle coordinate for one jump segment. */
function getJumpMiddleCoord(source: Coord, landing: Coord): Coord | null {
  const direction = getJumpDirection(source, landing);

  return direction ? getAdjacentCoord(source, direction) : null;
}

/** Resolves the jumped checker id for one segment on the current board. */
function getJumpedCheckerId(board: Board, source: Coord, landing: Coord): string | null {
  const middleCoord = getJumpMiddleCoord(source, landing);

  return middleCoord ? getTopChecker(board, middleCoord)?.id ?? null : null;
}

/** Rebuilds jumped-checker ids from a committed chain when history is available. */
function getCommittedJumpedCheckerIds(
  state: Pick<GameState, 'history'>,
  source: Coord,
  movingPlayer: Player,
): Set<string> {
  const chain: Array<{
    source: Coord;
    landing: Coord;
    beforeBoard: Board;
  }> = [];
  let expectedLanding = source;

  for (let index = state.history.length - 1; index >= 0; index -= 1) {
    const record = state.history[index];

    if (record.actor !== movingPlayer || record.action.type !== 'jumpSequence') {
      break;
    }

    const landing = record.action.path.at(-1);

    if (!landing || landing !== expectedLanding) {
      break;
    }

    chain.push({
      source: record.action.source,
      landing,
      beforeBoard: record.beforeState.board,
    });
    expectedLanding = record.action.source;
  }

  if (!chain.length) {
    return new Set();
  }

  const jumpedCheckerIds = new Set<string>();
  const orderedChain = chain.reverse();

  for (const segment of orderedChain) {
    const jumpedCheckerId = getJumpedCheckerId(
      segment.beforeBoard,
      segment.source,
      segment.landing,
    );

    if (!jumpedCheckerId) {
      continue;
    }

    jumpedCheckerIds.add(jumpedCheckerId);
  }

  return jumpedCheckerIds;
}

/** Rebuilds jumped-checker ids from legacy visited landing coordinates. */
function getJumpedCheckerIdsFromVisitedCoords(board: Board, visitedCoords: Coord[]): Set<string> {
  const jumpedCheckerIds = new Set<string>();

  for (let index = 1; index < visitedCoords.length; index += 1) {
    const jumpedCheckerId = getJumpedCheckerId(
      board,
      visitedCoords[index - 1],
      visitedCoords[index],
    );

    if (!jumpedCheckerId) {
      continue;
    }

    jumpedCheckerIds.add(jumpedCheckerId);
  }

  return jumpedCheckerIds;
}

/** Returns owner of the top checker at source coordinate. */
export function getMovingPlayer(board: Board, source: Coord): Player | null {
  return getTopChecker(board, source)?.owner ?? null;
}

/** Jumping from stacks moves the whole stack as one unit. */
function isWholeStackJump(board: Board, source: Coord): boolean {
  return isStack(board, source);
}

/** Applies one jump segment, including freeze/unfreeze side effects on the jumped checker. */
function applySingleJumpSegment(
  board: Board,
  source: Coord,
  landing: Coord,
  movingPlayer: Player,
  clonedCoords: Set<Coord>,
): ValidationResult {
  const direction = getJumpDirection(source, landing);

  if (!direction) {
    return { valid: false, reason: `Target ${landing} is not a legal jump landing from ${source}.` };
  }

  const middleCoord = getAdjacentCoord(source, direction);

  if (!middleCoord) {
    return { valid: false, reason: 'Jump segment has no middle coordinate.' };
  }

  if (!canJumpOverCell(board, middleCoord)) {
    return { valid: false, reason: `Cannot jump over ${middleCoord}.` };
  }

  if (!isEmptyCell(board, landing)) {
    return { valid: false, reason: `Jump landing ${landing} must be empty.` };
  }

  ensureMutableCell(board, source, clonedCoords);
  ensureMutableCell(board, landing, clonedCoords);
  ensureMutableCell(board, middleCoord, clonedCoords);

  const movingCount = isWholeStackJump(board, source) ? getCellHeight(board, source) : 1;
  const movingCheckers = removeTopCheckers(board, source, movingCount);

  addCheckers(board, landing, movingCheckers);

  const middleChecker = getTopChecker(board, middleCoord);

  if (!middleChecker) {
    return { valid: false, reason: `Middle checker missing at ${middleCoord}.` };
  }

  if (middleChecker.frozen) {
    setSingleCheckerFrozen(board, middleCoord, false);
  } else if (middleChecker.owner !== movingPlayer) {
    setSingleCheckerFrozen(board, middleCoord, true);
  }

  return validateBoard(board);
}

/** Resolves an entire jump path and blocks jumping the same checker twice. */
export function resolveJumpPath(
  board: Board,
  source: Coord,
  path: Coord[],
  movingPlayer: Player,
  jumpedSeed?: Set<string>,
): ValidationResult | PartialJumpResolution {
  const nextBoard = cloneBoardStructure(board);
  const clonedCoords = new Set<Coord>();
  let currentCoord = source;
  const jumpedCheckerIds = new Set(jumpedSeed ?? []);

  for (const landing of path) {
    const middleCoord = getJumpMiddleCoord(currentCoord, landing);
    const jumpedCheckerId = middleCoord ? getTopChecker(nextBoard, middleCoord)?.id ?? null : null;

    if (jumpedCheckerId && jumpedCheckerIds.has(jumpedCheckerId)) {
      return {
        valid: false,
        reason: `Jump path cannot jump over ${middleCoord} twice during the same jump chain.`,
      };
    }

    const stepResult = applySingleJumpSegment(
      nextBoard,
      currentCoord,
      landing,
      movingPlayer,
      clonedCoords,
    );

    if (!stepResult.valid) {
      return stepResult;
    }

    if (!jumpedCheckerId) {
      return {
        valid: false,
        reason: `Middle checker missing at ${middleCoord ?? 'unknown'}.`,
      };
    }

    currentCoord = landing;
    jumpedCheckerIds.add(jumpedCheckerId);
  }

  return {
    board: nextBoard,
    currentCoord,
    jumpedCheckerIds,
  };
}

/** Returns immediate legal jump landings from a coordinate on a specific board. */
function getJumpTargetsOnBoard(board: Board, source: Coord, _movingPlayer: Player): Coord[] {
  const targets: Coord[] = [];

  for (const direction of DIRECTION_VECTORS) {
    const jumpedCoord = getAdjacentCoord(source, direction);
    const landingCoord = getJumpLandingCoord(source, direction);

    if (!jumpedCoord || !landingCoord) {
      continue;
    }

    if (!canJumpOverCell(board, jumpedCoord)) {
      continue;
    }

    if (!isEmptyCell(board, landingCoord)) {
      continue;
    }

    targets.push(landingCoord);
  }

  return targets;
}

/** Returns jumped-checker ids carried by the engine state or reconstructed from history. */
export function getVisitedJumpedCheckerIds(
  state: Pick<EngineState, 'board' | 'pendingJump'> & Partial<Pick<GameState, 'history'>>,
  source: Coord,
): Set<string> {
  const pendingJump = state.pendingJump;

  if (pendingJump?.source === source) {
    if (pendingJump.jumpedCheckerIds.length) {
      return new Set(pendingJump.jumpedCheckerIds);
    }

    if (pendingJump.visitedCoords?.length) {
      return getJumpedCheckerIdsFromVisitedCoords(state.board, pendingJump.visitedCoords);
    }
  }

  if (state.history?.length) {
    const movingPlayer = getMovingPlayer(state.board, source);

    if (movingPlayer) {
      const committedVisited = getCommittedJumpedCheckerIds(
        { history: state.history },
        source,
        movingPlayer,
      );

      if (committedVisited.size) {
        return committedVisited;
      }
    }
  }

  return new Set();
}

/** Returns filtered legal jump continuation targets for one board/jumped-checker context. */
export function getJumpTargetsForContext(
  board: Board,
  source: Coord,
  movingPlayer: Player,
  jumpedCheckerIds: Set<string>,
): Coord[] {
  const targets: Coord[] = [];

  for (const target of getJumpTargetsOnBoard(board, source, movingPlayer)) {
    const jumpedCheckerId = getJumpedCheckerId(board, source, target);

    if (!jumpedCheckerId || jumpedCheckerIds.has(jumpedCheckerId)) {
      continue;
    }

    targets.push(target);
  }

  return targets;
}

/** Returns next legal jump targets from a source plus optional pre-applied draft path. */
export function getJumpContinuationTargets(
  state: Pick<EngineState, 'board' | 'pendingJump'> &
    Partial<Pick<GameState, 'history' | 'currentPlayer'>>,
  source: Coord,
  draftPath: Coord[],
): Coord[] {
  const movingPlayer = getMovingPlayer(state.board, source);

  if (!movingPlayer) {
    return [];
  }

  let currentCoord = source;
  let currentBoard = state.board;
  let jumpedCheckerIds = getVisitedJumpedCheckerIds(state, source);

  for (const landing of draftPath) {
    const partial = resolveJumpPath(
      currentBoard,
      currentCoord,
      [landing],
      movingPlayer,
      jumpedCheckerIds,
    );

    if (!('board' in partial)) {
      return [];
    }

    currentBoard = partial.board;
    currentCoord = partial.currentCoord;
    jumpedCheckerIds = partial.jumpedCheckerIds;
  }

  return getJumpTargetsForContext(currentBoard, currentCoord, movingPlayer, jumpedCheckerIds);
}
