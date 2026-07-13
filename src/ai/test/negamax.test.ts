import { describe, expect, it } from 'vitest';

import { AI_MODEL_ACTION_COUNT } from '@/ai/model/actionSpace';
import { createSearchPerfCache } from '@/ai/perf';
import {
  buildParticipationState,
  type ParticipationState,
} from '@/ai/participation';
import { AI_DIFFICULTY_PRESETS } from '@/ai/presets';
import { negamax } from '@/ai/search/negamax';
import { makeSearchTableKey, makeTableKey } from '@/ai/search/shared';
import type { SearchContext, SearchStack } from '@/ai/search/types';
import { createInitialState } from '@/domain';
import { withConfig } from '@/test/factories';

function context(): SearchContext {
  return {
    behaviorProfile: null,
    continuationScores: new Map(),
    deadline: Number.POSITIVE_INFINITY,
    diagnostics: {
      adverseDrawTrapPenalties: 0,
      aspirationResearches: 0,
      betaCutoffs: 0,
      drawAversionApplications: 0,
      lateRiskTriggers: 0,
      orderedFallbacks: 0,
      participationPenalties: 0,
      policyPriorHits: 0,
      pvsResearches: 0,
      quiescenceNodes: 0,
      repetitionPenalties: 0,
      selfUndoPenalties: 0,
      sourceFamilyCollisions: 0,
      stagnationRiskTriggers: 0,
      transpositionHits: 0,
    },
    evaluatedNodes: 0,
    historyScores: new Int32Array(AI_MODEL_ACTION_COUNT),
    killerMovesByDepth: new Map(),
    moveHints: new Map(),
    now: () => 0,
    perfCache: createSearchPerfCache(),
    policyPriors: null,
    preset: AI_DIFFICULTY_PRESETS.hard,
    pvMoveByDepth: new Map(),
    quiescenceDepthLimit: 8,
    riskMode: 'normal',
    rootParticipationState: {} as ParticipationState,
    rootPlayer: 'white',
    rootPreviousOwnAction: null,
    rootPreviousStrategicTags: null,
    rootSelfUndoPositionKey: null,
    rootStrategicIntent: 'hybrid',
    ruleConfig: withConfig(),
    table: new Map(),
  };
}

describe('negamax terminal handling', () => {
  it('evaluates terminal state before consulting a colliding table entry', () => {
    const state = {
      ...createInitialState(withConfig()),
      status: 'gameOver' as const,
      victory: { type: 'homeField' as const, winner: 'white' as const },
    };
    const searchContext = context();
    searchContext.table.set(makeTableKey(state), {
      bestAction: null,
      depth: 99,
      flag: 'exact',
      score: -123,
    });
    const stack: SearchStack = { entries: [], depth: 0 };

    expect(
      negamax(
        state,
        3,
        Number.NEGATIVE_INFINITY,
        Number.POSITIVE_INFINITY,
        0,
        stack,
        null,
        {} as ParticipationState,
        searchContext,
      ),
    ).toBe(1_000_000);
    expect(searchContext.diagnostics.transpositionHits).toBe(0);
  });
});

describe('transposition-table key isolation', () => {
  it('does not share a score key when repetition counts differ', () => {
    const state = createInitialState(withConfig());
    const participationState = buildParticipationState(
      state,
      AI_DIFFICULTY_PRESETS.hard.participationWindow,
    );
    const repeatedState = {
      ...state,
      positionCounts: {
        ...state.positionCounts,
        [makeTableKey(state)]:
          (state.positionCounts[makeTableKey(state)] ?? 0) + 1,
      },
    };
    const keyContext = {
      currentDepth: 1,
      participationState,
      previousActionId: null,
      previousOwnAction: null,
      previousOwnPositionKey: null,
    };

    expect(makeSearchTableKey(state, keyContext)).not.toBe(
      makeSearchTableKey(repeatedState, keyContext),
    );
  });

  it('does not consume a structural move-hint entry as an exact score', () => {
    const state = createInitialState(withConfig());
    const searchContext = context();
    searchContext.table.set(makeTableKey(state), {
      bestAction: null,
      depth: 99,
      flag: 'exact',
      score: 123_456,
    });

    const score = negamax(
      state,
      1,
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      0,
      { entries: [], depth: 0 },
      null,
      buildParticipationState(state, searchContext.preset.participationWindow),
      searchContext,
    );

    expect(score).not.toBe(123_456);
    expect(searchContext.diagnostics.transpositionHits).toBe(0);
  });

  it('reuses an exact score when all semantic inputs match', () => {
    const state = createInitialState(withConfig());
    const searchContext = context();
    const participationState = buildParticipationState(
      state,
      searchContext.preset.participationWindow,
    );
    const scoreKey = makeSearchTableKey(state, {
      currentDepth: 0,
      participationState,
      previousActionId: null,
      previousOwnAction: null,
      previousOwnPositionKey: null,
    });
    searchContext.table.set(scoreKey, {
      bestAction: null,
      depth: 1,
      flag: 'exact',
      score: 7_654,
    });

    expect(
      negamax(
        state,
        1,
        Number.NEGATIVE_INFINITY,
        Number.POSITIVE_INFINITY,
        0,
        { entries: [], depth: 0 },
        null,
        participationState,
        searchContext,
      ),
    ).toBe(7_654);
    expect(searchContext.diagnostics.transpositionHits).toBe(1);
  });
});
