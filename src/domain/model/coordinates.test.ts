import { describe, expect, it } from 'vitest';

import { DIRECTION_VECTORS } from '@/domain/model/constants';
import {
  allCoords,
  coordToIndices,
  getAdjacentCoord,
  getDirectionBetween,
  getJumpDirection,
  getJumpLandingCoord,
  parseCoord,
  toCoord,
} from '@/domain/model/coordinates';

describe('precomputed board geometry', () => {
  it('preserves coordinate parsing and index round trips', () => {
    for (const coord of allCoords()) {
      const { column, row } = parseCoord(coord);
      const { fileIndex, rankIndex } = coordToIndices(coord);

      expect(coord).toBe(`${column}${row}`);
      expect(toCoord(fileIndex, rankIndex)).toBe(coord);
    }
  });

  it('matches arithmetic adjacency and jump geometry exhaustively', () => {
    for (const coord of allCoords()) {
      const { fileIndex, rankIndex } = coordToIndices(coord);

      for (const direction of DIRECTION_VECTORS) {
        const adjacent = getAdjacentCoord(coord, direction);
        const landing = getJumpLandingCoord(coord, direction);

        expect(adjacent).toBe(
          toCoord(
            fileIndex + direction.fileDelta,
            rankIndex + direction.rankDelta,
          ),
        );
        expect(landing).toBe(
          toCoord(
            fileIndex + direction.fileDelta * 2,
            rankIndex + direction.rankDelta * 2,
          ),
        );

        if (adjacent) {
          expect(getDirectionBetween(coord, adjacent)).toBe(direction);
        }

        if (landing) {
          expect(getJumpDirection(coord, landing)).toBe(direction);
        }
      }
    }
  });
});
