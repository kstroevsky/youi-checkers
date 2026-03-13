import { describe, expect, it } from 'vitest';

import { AI_DIFFICULTY_PRESETS, chooseComputerAction, orderMoves } from '@/ai';
import { createInitialState, getLegalActions } from '@/domain';
import { withConfig } from '@/test/factories';

import {
  actionKey,
  createOpponentThreatState,
  createTickingClock,
  createTimeoutClock,
} from '@/ai/test/searchTestUtils';

describe('computer opponent search timeouts', () => {
  it('searches every legal root move even when quiet-move trimming is active below the root', () => {
    const config = withConfig();
    const state = createInitialState(config);
    const legalActions = getLegalActions(state, config);
    const originalHardPreset = { ...AI_DIFFICULTY_PRESETS.hard };
    let result;

    AI_DIFFICULTY_PRESETS.hard.maxDepth = 1;
    AI_DIFFICULTY_PRESETS.hard.timeBudgetMs = 10_000;

    try {
      result = chooseComputerAction({
        difficulty: 'hard',
        now: createTickingClock(0.01),
        random: () => 0,
        ruleConfig: config,
        state,
      });
    } finally {
      Object.assign(AI_DIFFICULTY_PRESETS.hard, originalHardPreset);
    }

    expect(legalActions.length).toBeGreaterThan(AI_DIFFICULTY_PRESETS.hard.quietMoveLimit);
    expect(result.completedDepth).toBe(1);
    expect(result.completedRootMoves).toBe(legalActions.length);
    expect(result.fallbackKind).toBe('none');
    expect(result.timedOut).toBe(false);
  }, 15_000);

  it('falls back to partial current-depth search work instead of blind legal-order fallback on timeout', () => {
    const config = withConfig();
    const state = createOpponentThreatState();
    const legalActions = getLegalActions(state, config);
    const orderedRootMoves = orderMoves(
      state,
      state.currentPlayer,
      config,
      AI_DIFFICULTY_PRESETS.hard,
      {
        actions: legalActions,
        includeAllQuietMoves: true,
      },
    );
    const originalHardPreset = { ...AI_DIFFICULTY_PRESETS.hard };
    let result;

    AI_DIFFICULTY_PRESETS.hard.maxDepth = 2;
    AI_DIFFICULTY_PRESETS.hard.timeBudgetMs = 10_000;

    try {
      result = chooseComputerAction({
        difficulty: 'hard',
        now: createTimeoutClock(220, 20_000),
        random: () => 0,
        ruleConfig: config,
        state,
      });
    } finally {
      Object.assign(AI_DIFFICULTY_PRESETS.hard, originalHardPreset);
    }

    expect(actionKey(orderedRootMoves[0]?.action ?? null)).not.toBe(
      actionKey(legalActions[0] ?? null),
    );
    expect(result.timedOut).toBe(true);
    expect(['orderedRoot', 'partialCurrentDepth']).toContain(result.fallbackKind);
    if (result.fallbackKind === 'partialCurrentDepth') {
      expect(result.completedRootMoves).toBeGreaterThan(0);
      expect(actionKey(result.action)).not.toBe(actionKey(legalActions[0] ?? null));
    } else {
      expect(actionKey(result.action)).toBe(actionKey(orderedRootMoves[0]?.action ?? null));
    }
  });
});
