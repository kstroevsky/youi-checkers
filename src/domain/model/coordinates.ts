import { BOARD_COLUMNS, BOARD_ROWS, DIRECTION_VECTORS } from '@/domain/model/constants';
import type { Column, Coord, Row } from '@/domain/model/types';

export type DirectionVector = (typeof DIRECTION_VECTORS)[number];

export function createCoord(column: Column, row: Row): Coord {
  return `${column}${row}`;
}

export function parseCoord(coord: Coord): { column: Column; row: Row } {
  return {
    column: coord[0] as Column,
    row: Number(coord.slice(1)) as Row,
  };
}

export function coordToIndices(coord: Coord): { fileIndex: number; rankIndex: number } {
  const { column, row } = parseCoord(coord);

  return {
    fileIndex: BOARD_COLUMNS.indexOf(column),
    rankIndex: BOARD_ROWS.indexOf(row),
  };
}

export function isInsideBoardPosition(fileIndex: number, rankIndex: number): boolean {
  return (
    fileIndex >= 0 &&
    fileIndex < BOARD_COLUMNS.length &&
    rankIndex >= 0 &&
    rankIndex < BOARD_ROWS.length
  );
}

export function toCoord(fileIndex: number, rankIndex: number): Coord | null {
  if (!isInsideBoardPosition(fileIndex, rankIndex)) {
    return null;
  }

  return createCoord(BOARD_COLUMNS[fileIndex], BOARD_ROWS[rankIndex]);
}

export function getAdjacentCoord(coord: Coord, direction: DirectionVector): Coord | null {
  const { fileIndex, rankIndex } = coordToIndices(coord);

  return toCoord(fileIndex + direction.fileDelta, rankIndex + direction.rankDelta);
}

export function getJumpLandingCoord(coord: Coord, direction: DirectionVector): Coord | null {
  const { fileIndex, rankIndex } = coordToIndices(coord);

  return toCoord(fileIndex + direction.fileDelta * 2, rankIndex + direction.rankDelta * 2);
}

export function isAdjacent(source: Coord, target: Coord): boolean {
  const sourceIndices = coordToIndices(source);
  const targetIndices = coordToIndices(target);
  const fileDelta = Math.abs(sourceIndices.fileIndex - targetIndices.fileIndex);
  const rankDelta = Math.abs(sourceIndices.rankIndex - targetIndices.rankIndex);

  return (fileDelta > 0 || rankDelta > 0) && fileDelta <= 1 && rankDelta <= 1;
}

export function getDirectionBetween(source: Coord, target: Coord): DirectionVector | null {
  const sourceIndices = coordToIndices(source);
  const targetIndices = coordToIndices(target);
  const fileDelta = targetIndices.fileIndex - sourceIndices.fileIndex;
  const rankDelta = targetIndices.rankIndex - sourceIndices.rankIndex;

  if (Math.abs(fileDelta) > 1 || Math.abs(rankDelta) > 1 || (fileDelta === 0 && rankDelta === 0)) {
    return null;
  }

  return DIRECTION_VECTORS.find(
    (candidate) =>
      candidate.fileDelta === Math.sign(fileDelta) &&
      candidate.rankDelta === Math.sign(rankDelta),
  ) as DirectionVector | null;
}

export function getJumpDirection(source: Coord, landing: Coord): DirectionVector | null {
  const sourceIndices = coordToIndices(source);
  const targetIndices = coordToIndices(landing);
  const fileDelta = targetIndices.fileIndex - sourceIndices.fileIndex;
  const rankDelta = targetIndices.rankIndex - sourceIndices.rankIndex;

  if (
    Math.abs(fileDelta) > 2 ||
    Math.abs(rankDelta) > 2 ||
    Math.max(Math.abs(fileDelta), Math.abs(rankDelta)) !== 2 ||
    (fileDelta !== 0 && Math.abs(fileDelta) !== 2) ||
    (rankDelta !== 0 && Math.abs(rankDelta) !== 2)
  ) {
    return null;
  }

  return DIRECTION_VECTORS.find(
    (candidate) =>
      candidate.fileDelta === Math.sign(fileDelta) &&
      candidate.rankDelta === Math.sign(rankDelta),
  ) as DirectionVector | null;
}

export function allCoords(): Coord[] {
  return BOARD_ROWS.flatMap((row) =>
    BOARD_COLUMNS.map((column) => createCoord(column, row)),
  );
}
