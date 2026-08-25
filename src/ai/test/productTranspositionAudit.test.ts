import { describe, expect, it } from 'vitest';

import { makeTableKey } from '@/ai/search/shared';
import { auditProductTranspositionsV1 } from '@/ai/test/productTranspositionAudit';
import {
  boardWithPieces,
  checker,
  gameStateWithBoard,
  withConfig,
} from '@/test/factories';

describe('ProductTranspositionAuditV1', () => {
  it('distinguishes repetition histories only in the repetition-aware mode', () => {
    const state = gameStateWithBoard(
      boardWithPieces({ B2: [checker('white')], E5: [checker('black')] }),
    );
    const repeated = {
      ...state,
      positionCounts: { ...state.positionCounts, another: 2 },
    };
    expect(makeTableKey(state, 'current')).toBe(
      makeTableKey(repeated, 'current'),
    );
    expect(makeTableKey(state, 'repetitionAware')).not.toBe(
      makeTableKey(repeated, 'repetitionAware'),
    );
  });

  it('runs completed finite-tree comparisons at depths two through four', () => {
    const state = gameStateWithBoard(
      boardWithPieces({ B2: [checker('white')], E5: [checker('black')] }),
    );
    const audit = auditProductTranspositionsV1({
      config: withConfig({ drawRule: 'threefold' }),
      difficulty: 'easy',
      roots: [
        { historyVariantId: 'clean', state },
        {
          historyVariantId: 'pressured',
          state: {
            ...state,
            positionCounts: { ...state.positionCounts, another: 2 },
          },
        },
      ],
    });

    expect(audit.cases.map((entry) => entry.depth)).toEqual([2, 3, 4, 2, 3, 4]);
    expect(audit.passed).toBe(true);
    expect(
      audit.cases.every((entry) =>
        entry.observations.every(
          (observation) => observation.completedDepth === entry.depth,
        ),
      ),
    ).toBe(true);
  });
});
