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

export function createCell(checkers: Checker[] = []): Cell {
  return { checkers };
}

export function createEmptyBoard(): Board {
  return allCoords().reduce((board, coord) => {
    board[coord] = createCell();
    return board;
  }, {} as Board);
}

export function cloneChecker(checker: Checker): Checker {
  return { ...checker };
}

export function cloneCell(cell: Cell): Cell {
  return { checkers: cell.checkers.map(cloneChecker) };
}

export function cloneBoard(board: Board): Board {
  return allCoords().reduce((nextBoard, coord) => {
    nextBoard[coord] = cloneCell(board[coord]);
    return nextBoard;
  }, {} as Board);
}

export function getCell(board: Board, coord: Coord): Cell {
  return board[coord];
}

export function getCellHeight(board: Board, coord: Coord): number {
  return getCell(board, coord).checkers.length;
}

export function isEmptyCell(board: Board, coord: Coord): boolean {
  return getCellHeight(board, coord) === 0;
}

export function isSingleChecker(board: Board, coord: Coord): boolean {
  return getCellHeight(board, coord) === 1;
}

export function isStack(board: Board, coord: Coord): boolean {
  return getCellHeight(board, coord) >= 2;
}

export function getTopChecker(board: Board, coord: Coord): Checker | null {
  const { checkers } = getCell(board, coord);
  return checkers.at(-1) ?? null;
}

export function getBottomChecker(board: Board, coord: Coord): Checker | null {
  return getCell(board, coord).checkers[0] ?? null;
}

export function getController(board: Board, coord: Coord): Player | null {
  return getTopChecker(board, coord)?.owner ?? null;
}

export function removeTopCheckers(board: Board, coord: Coord, count: number): Checker[] {
  const cell = getCell(board, coord);
  return cell.checkers.splice(cell.checkers.length - count, count);
}

export function addCheckers(board: Board, coord: Coord, checkers: Checker[]): void {
  getCell(board, coord).checkers.push(...checkers.map(cloneChecker));
}

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

export function countCheckersForPlayer(board: Board, player: Player): number {
  return allCoords().reduce((count, coord) => {
    return count + getCell(board, coord).checkers.filter((checker) => checker.owner === player).length;
  }, 0);
}

export function createSnapshot(state: GameState): StateSnapshot {
  return {
    board: cloneBoard(state.board),
    currentPlayer: state.currentPlayer,
    moveNumber: state.moveNumber,
    status: state.status,
    victory: structuredClone(state.victory),
  };
}
