import {
  hashPosition,
  type Board,
  type Coord,
  type GameState,
  type PendingJump,
  type StateSnapshot,
  type TurnAction,
  type TurnRecord,
} from '@/domain';
import { BOARD_COLUMNS } from '@/domain/model/constants';
import { createCoord, parseCoord } from '@/domain/model/coordinates';

/** Reflects a coordinate across the vertical center line of the board. */
export function mirrorCoordHorizontally(coord: Coord): Coord {
  const { column, row } = parseCoord(coord);
  const columnIndex = BOARD_COLUMNS.indexOf(column);
  return createCoord(
    BOARD_COLUMNS[BOARD_COLUMNS.length - 1 - columnIndex],
    row,
  );
}

export function mirrorActionHorizontally(action: TurnAction): TurnAction {
  if (action.type === 'manualUnfreeze') {
    return { ...action, coord: mirrorCoordHorizontally(action.coord) };
  }

  if (action.type === 'jumpSequence') {
    return {
      ...action,
      path: action.path.map(mirrorCoordHorizontally),
      source: mirrorCoordHorizontally(action.source),
    };
  }

  return {
    ...action,
    source: mirrorCoordHorizontally(action.source),
    target: mirrorCoordHorizontally(action.target),
  };
}

function mirrorBoard(board: Board): Board {
  const mirrored = {} as Board;

  for (const [coord, cell] of Object.entries(board) as Array<
    [Coord, Board[Coord]]
  >) {
    mirrored[mirrorCoordHorizontally(coord)] = {
      checkers: cell.checkers.map((checker) => ({ ...checker })),
    };
  }

  return mirrored;
}

function mirrorPendingJump(
  pendingJump: PendingJump | null,
): PendingJump | null {
  if (!pendingJump) return null;

  return {
    ...pendingJump,
    source: mirrorCoordHorizontally(pendingJump.source),
    ...(pendingJump.visitedCoords
      ? {
          visitedCoords: pendingJump.visitedCoords.map(mirrorCoordHorizontally),
        }
      : {}),
    // Legacy state hashes cannot be transformed without their source states.
    // Current rules use jumpedCheckerIds; omit legacy hashes in measurement clones.
    ...(pendingJump.visitedStateKeys ? { visitedStateKeys: [] } : {}),
  };
}

function mirrorSnapshot(snapshot: StateSnapshot): StateSnapshot {
  return {
    ...snapshot,
    board: mirrorBoard(snapshot.board),
    pendingJump: mirrorPendingJump(snapshot.pendingJump),
    victory: structuredClone(snapshot.victory),
  };
}

function mirrorRecord(record: TurnRecord): TurnRecord {
  const beforeState = mirrorSnapshot(record.beforeState);
  const afterState = mirrorSnapshot(record.afterState);

  return {
    ...record,
    action: mirrorActionHorizontally(record.action),
    afterState,
    beforeState,
    positionHash: hashPosition(afterState),
    victoryAfter: structuredClone(record.victoryAfter),
  };
}

/**
 * Creates a true horizontal fixture pair and rebuilds history-derived repetition
 * counts in the mirrored coordinate system.
 */
export function mirrorGameStateHorizontally(state: GameState): GameState {
  const mirroredHistory = state.history.map(mirrorRecord);
  const mirroredState: GameState = {
    ...mirrorSnapshot(state),
    history: mirroredHistory,
    positionCounts: {},
  };
  const positionCounts: Record<string, number> = {};

  if (mirroredHistory[0]) {
    const initialKey = hashPosition(mirroredHistory[0].beforeState);
    positionCounts[initialKey] = 1;

    for (const record of mirroredHistory) {
      const positionKey = hashPosition(record.afterState);
      positionCounts[positionKey] = (positionCounts[positionKey] ?? 0) + 1;
    }
  } else {
    positionCounts[hashPosition(mirroredState)] = 1;
  }

  mirroredState.positionCounts = positionCounts;
  return mirroredState;
}
