import {
  BOARD_COLUMNS,
  BOARD_ROWS,
  DIRECTION_VECTORS,
} from '@/domain/model/constants';
import type { Column, Coord, Row } from '@/domain/model/types';

export type DirectionVector = (typeof DIRECTION_VECTORS)[number];

const ALL_COORDS = BOARD_ROWS.flatMap((row) =>
  BOARD_COLUMNS.map((column) => createCoord(column, row)),
);
const DISPLAY_COORDS = [...BOARD_ROWS]
  .reverse()
  .flatMap((row) => BOARD_COLUMNS.map((column) => createCoord(column, row)));
const BOARD_WIDTH = BOARD_COLUMNS.length;
const DIRECTION_LATTICE_WIDTH = 3;
const DIRECTION_LATTICE_SIZE =
  DIRECTION_LATTICE_WIDTH * DIRECTION_LATTICE_WIDTH;
const COORD_INDEX: Record<string, number> = Object.create(null);
const DIRECTION_BY_DELTA_INDEX: Array<DirectionVector | null> = Array.from(
  { length: DIRECTION_LATTICE_SIZE },
  () => null,
);
const ADJACENT_COORDS: Array<Coord | null> = Array.from(
  { length: ALL_COORDS.length * DIRECTION_LATTICE_SIZE },
  () => null,
);
const JUMP_LANDING_COORDS: Array<Coord | null> = Array.from(
  { length: ALL_COORDS.length * DIRECTION_LATTICE_SIZE },
  () => null,
);

function directionDeltaIndex(fileDelta: number, rankDelta: number): number {
  return (fileDelta + 1) * DIRECTION_LATTICE_WIDTH + rankDelta + 1;
}

for (let coordIndex = 0; coordIndex < ALL_COORDS.length; coordIndex += 1) {
  const coord = ALL_COORDS[coordIndex];
  const fileIndex = coordIndex % BOARD_WIDTH;
  const rankIndex = Math.floor(coordIndex / BOARD_WIDTH);
  COORD_INDEX[coord] = coordIndex;

  for (const direction of DIRECTION_VECTORS) {
    const deltaIndex = directionDeltaIndex(
      direction.fileDelta,
      direction.rankDelta,
    );
    const tableIndex = coordIndex * DIRECTION_LATTICE_SIZE + deltaIndex;
    DIRECTION_BY_DELTA_INDEX[deltaIndex] = direction;
    ADJACENT_COORDS[tableIndex] = toCoord(
      fileIndex + direction.fileDelta,
      rankIndex + direction.rankDelta,
    );
    JUMP_LANDING_COORDS[tableIndex] = toCoord(
      fileIndex + direction.fileDelta * 2,
      rankIndex + direction.rankDelta * 2,
    );
  }
}

/** Converts typed column+row parts into canonical coordinate string (e.g. A1). */
export function createCoord(column: Column, row: Row): Coord {
  return `${column}${row}`;
}

/** Parses coordinate string into typed column and row parts. */
export function parseCoord(coord: Coord): { column: Column; row: Row } {
  return {
    column: coord[0] as Column,
    row: (coord.charCodeAt(1) - 48) as Row,
  };
}

/** Converts coordinate to zero-based array indices used by vector math helpers. */
export function coordToIndices(coord: Coord): {
  fileIndex: number;
  rankIndex: number;
} {
  const coordIndex = COORD_INDEX[coord];

  if (coordIndex === undefined) {
    return { fileIndex: -1, rankIndex: -1 };
  }

  return {
    fileIndex: coordIndex % BOARD_WIDTH,
    rankIndex: Math.floor(coordIndex / BOARD_WIDTH),
  };
}

/** Validates that integer indices stay inside the 6x6 board bounds. */
export function isInsideBoardPosition(
  fileIndex: number,
  rankIndex: number,
): boolean {
  return (
    fileIndex >= 0 &&
    fileIndex < BOARD_COLUMNS.length &&
    rankIndex >= 0 &&
    rankIndex < BOARD_ROWS.length
  );
}

/** Converts board indices back to coordinate, or null if outside board. */
export function toCoord(fileIndex: number, rankIndex: number): Coord | null {
  if (!isInsideBoardPosition(fileIndex, rankIndex)) {
    return null;
  }

  return ALL_COORDS[rankIndex * BOARD_WIDTH + fileIndex] ?? null;
}

/** Returns adjacent coordinate in the provided direction vector. */
export function getAdjacentCoord(
  coord: Coord,
  direction: DirectionVector,
): Coord | null {
  const coordIndex = COORD_INDEX[coord];
  const deltaIndex = directionDeltaIndex(
    direction.fileDelta,
    direction.rankDelta,
  );
  return coordIndex === undefined
    ? null
    : (ADJACENT_COORDS[coordIndex * DIRECTION_LATTICE_SIZE + deltaIndex] ??
        null);
}

/** Returns jump landing coordinate that is two vector steps away. */
export function getJumpLandingCoord(
  coord: Coord,
  direction: DirectionVector,
): Coord | null {
  const coordIndex = COORD_INDEX[coord];
  const deltaIndex = directionDeltaIndex(
    direction.fileDelta,
    direction.rankDelta,
  );
  return coordIndex === undefined
    ? null
    : (JUMP_LANDING_COORDS[coordIndex * DIRECTION_LATTICE_SIZE + deltaIndex] ??
        null);
}

/** Checks whether two coordinates are orthogonally/diagonally adjacent. */
export function isAdjacent(source: Coord, target: Coord): boolean {
  const sourceIndices = coordToIndices(source);
  const targetIndices = coordToIndices(target);
  const fileDelta = Math.abs(sourceIndices.fileIndex - targetIndices.fileIndex);
  const rankDelta = Math.abs(sourceIndices.rankIndex - targetIndices.rankIndex);

  return (fileDelta > 0 || rankDelta > 0) && fileDelta <= 1 && rankDelta <= 1;
}

/** Returns the single-step direction from source to target, or null if invalid. */
export function getDirectionBetween(
  source: Coord,
  target: Coord,
): DirectionVector | null {
  const sourceIndices = coordToIndices(source);
  const targetIndices = coordToIndices(target);
  const fileDelta = targetIndices.fileIndex - sourceIndices.fileIndex;
  const rankDelta = targetIndices.rankIndex - sourceIndices.rankIndex;

  if (
    Math.abs(fileDelta) > 1 ||
    Math.abs(rankDelta) > 1 ||
    (fileDelta === 0 && rankDelta === 0)
  ) {
    return null;
  }

  return (
    DIRECTION_BY_DELTA_INDEX[
      directionDeltaIndex(Math.sign(fileDelta), Math.sign(rankDelta))
    ] ?? null
  );
}

/** Returns jump direction (two-step move) between source and landing coordinates. */
export function getJumpDirection(
  source: Coord,
  landing: Coord,
): DirectionVector | null {
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

  return (
    DIRECTION_BY_DELTA_INDEX[
      directionDeltaIndex(Math.sign(fileDelta), Math.sign(rankDelta))
    ] ?? null
  );
}

/** Returns all board coordinates in row-major ascending order (A1..F6). */
export function allCoords(): Coord[] {
  return ALL_COORDS;
}

/** Returns board coordinates in top-down display order (A6..F1). */
export function displayCoords(): Coord[] {
  return DISPLAY_COORDS;
}
