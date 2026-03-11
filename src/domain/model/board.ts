import { allCoords } from '@/domain/model/coordinates';
import type {
  Board,
  Cell,
  Checker,
  Coord,
  GameState,
  Player,
  StateSnapshot,
} from '@/domain/model/types';

/** Creates a cell object with an optional pre-filled checker array. */
export function createCell(checkers: Checker[] = []): Cell {
  return { checkers };
}

/** Builds an empty 6x6 board with all coordinates initialized. */
export function createEmptyBoard(): Board {
  return allCoords().reduce((board, coord) => {
    board[coord] = createCell();
    return board;
  }, {} as Board);
}

/** Clones checker data so move operations stay immutable at the API boundary. */
export function cloneChecker(checker: Checker): Checker {
  return { ...checker };
}

/** Clones a cell and all nested checkers. */
export function cloneCell(cell: Cell): Cell {
  return { checkers: cell.checkers.map(cloneChecker) };
}

/** Clones only the board record so untouched cells can keep their original references. */
export function cloneBoardStructure(board: Board): Board {
  return { ...board };
}

/** Deep-clones the full board by coordinates. */
export function cloneBoard(board: Board): Board {
  return allCoords().reduce((nextBoard, coord) => {
    nextBoard[coord] = cloneCell(board[coord]);
    return nextBoard;
  }, {} as Board);
}

/** Clones a cell on demand the first time a mutable move path touches it. */
export function ensureMutableCell(board: Board, coord: Coord, clonedCoords: Set<Coord>): Cell {
  if (!clonedCoords.has(coord)) {
    board[coord] = cloneCell(board[coord]);
    clonedCoords.add(coord);
  }

  return board[coord];
}

/** Returns the cell at a concrete coordinate. */
export function getCell(board: Board, coord: Coord): Cell {
  return board[coord];
}

/** Returns the checker stack height of a cell. */
export function getCellHeight(board: Board, coord: Coord): number {
  return getCell(board, coord).checkers.length;
}

/** Checks whether a coordinate contains no checkers. */
export function isEmptyCell(board: Board, coord: Coord): boolean {
  return getCellHeight(board, coord) === 0;
}

/** Checks whether a coordinate contains exactly one checker. */
export function isSingleChecker(board: Board, coord: Coord): boolean {
  return getCellHeight(board, coord) === 1;
}

/** Checks whether a coordinate contains a stack (height 2 or 3). */
export function isStack(board: Board, coord: Coord): boolean {
  return getCellHeight(board, coord) >= 2;
}

/** Returns the top checker of a stack, or null for an empty cell. */
export function getTopChecker(board: Board, coord: Coord): Checker | null {
  const { checkers } = getCell(board, coord);
  return checkers.at(-1) ?? null;
}

/** Returns the bottom checker of a stack, or null for an empty cell. */
export function getBottomChecker(board: Board, coord: Coord): Checker | null {
  return getCell(board, coord).checkers[0] ?? null;
}

/** Returns stack controller (top checker owner) or null for empty cells. */
export function getController(board: Board, coord: Coord): Player | null {
  return getTopChecker(board, coord)?.owner ?? null;
}

/** True when a height-3 stack contains only checkers owned by the same player. */
export function isFullStackOwnedByPlayer(board: Board, coord: Coord, player: Player): boolean {
  const { checkers } = getCell(board, coord);

  return checkers.length === 3 && checkers.every((checker) => checker.owner === player);
}

/** Removes and returns `count` top checkers from a cell (mutable board helper). */
export function removeTopCheckers(board: Board, coord: Coord, count: number): Checker[] {
  const cell = getCell(board, coord);
  return cell.checkers.splice(cell.checkers.length - count, count);
}

/** Appends checkers to a cell while cloning each checker object. */
export function addCheckers(board: Board, coord: Coord, checkers: Checker[]): void {
  getCell(board, coord).checkers.push(...checkers.map(cloneChecker));
}

/** Sets frozen status on a single checker cell. No-op for empty cells. */
export function setSingleCheckerFrozen(
  board: Board,
  coord: Coord,
  frozen: boolean,
): void {
  const checker = getTopChecker(board, coord);

  if (!checker) {
    return;
  }

  checker.frozen = frozen;
}

/** Counts all checkers owned by a player across the board. */
export function countCheckersForPlayer(board: Board, player: Player): number {
  return allCoords().reduce((count, coord) => {
    return count + getCell(board, coord).checkers.filter((checker) => checker.owner === player).length;
  }, 0);
}

/** Creates a serializable snapshot of runtime state without history/position counters. */
export function createSnapshot(state: GameState): StateSnapshot {
  return {
    board: cloneBoard(state.board),
    currentPlayer: state.currentPlayer,
    moveNumber: state.moveNumber,
    status: state.status,
    victory: structuredClone(state.victory),
  };
}
