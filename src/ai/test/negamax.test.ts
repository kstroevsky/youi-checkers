import { describe, expect, it } from 'vitest';

import { AI_MODEL_ACTION_COUNT } from '@/ai/model/actionSpace';
import { createSearchPerfCache } from '@/ai/perf';
import type { ParticipationState } from '@/ai/participation';
import { AI_DIFFICULTY_PRESETS } from '@/ai/presets';
import { negamax } from '@/ai/search/negamax';
import { makeTableKey } from '@/ai/search/shared';
import type { SearchContext, SearchStack } from '@/ai/search/types';
import { createInitialState } from '@/domain';
import { withConfig } from '@/test/factories';

function context(): SearchContext {
  return {
    behaviorProfile: null,
    budgetExhaustion: 'none',
    continuationScores: new Map(),
    deadline: Number.POSITIVE_INFINITY,
    diagnosticAblation: null,
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
      rootPreparationTransitions: 0,
      selfUndoPenalties: 0,
      sourceFamilyCollisions: 0,
      stagnationRiskTriggers: 0,
      transpositionHits: 0,
    },
    evaluatedNodes: 0,
    historyScores: new Int32Array(AI_MODEL_ACTION_COUNT),
    killerMovesByDepth: new Map(),
    maxEvaluatedNodes: null,
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
