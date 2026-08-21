import { describe, expect, it } from 'vitest';
import { rerankerCoefficientNeighborhoodV1 } from '@/ai/test/rerankerNeighborhood';

describe('reranker coefficient neighborhoods', () => {
  it('crosses base and one-at-a-time adjacent weights with all temperatures', () => {
    const grid = rerankerCoefficientNeighborhoodV1();
    expect(grid).toHaveLength((1 + 7 * 2) * 4);
    expect(new Set(grid.map((entry) => entry.id)).size).toBe(grid.length);
  });
});
