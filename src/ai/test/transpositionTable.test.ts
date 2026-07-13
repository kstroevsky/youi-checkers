import { describe, expect, it } from 'vitest';

import { buildParticipationState } from '@/ai/participation';
import { AI_DIFFICULTY_PRESETS } from '@/ai/presets';
import {
  findTranspositionEntry,
  storeTranspositionEntry,
  type TranspositionTable,
} from '@/ai/search/transpositionTable';
import { createInitialState } from '@/domain';
import { withConfig } from '@/test/factories';

describe('collision-verified transposition table', () => {
  it('isolates equal boards with different repetition counts', () => {
    const state = createInitialState(withConfig());
    const participationState = buildParticipationState(
      state,
      AI_DIFFICULTY_PRESETS.hard.participationWindow,
    );
    const repeatedState = {
      ...state,
      positionCounts: {
        ...state.positionCounts,
        repeated: 2,
      },
    };
    const semanticContext = {
      currentDepth: 1,
      participationState,
      previousActionId: null,
      previousOwnAction: null,
      previousOwnPositionKey: null,
    };
    const table: TranspositionTable = new Map();

    storeTranspositionEntry(table, repeatedState, semanticContext, {
      bestAction: null,
      depth: 3,
      flag: 'exact',
      score: 42,
    });

    expect(findTranspositionEntry(table, state, semanticContext)).toBeNull();
    expect(
      findTranspositionEntry(table, repeatedState, semanticContext)?.score,
    ).toBe(42);
  });
});
