import { describe, expect, it } from 'vitest';

import { AI_DIFFICULTY_PRESETS, chooseComputerAction, orderMoves } from '@/ai';
import { createInitialState, getLegalActions } from '@/domain';
import { withConfig } from '@/test/factories';

import {
  actionKey,
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

    expect(legalActions.length).toBeGreaterThan(
      AI_DIFFICULTY_PRESETS.hard.quietMoveLimit,
    );
    expect(result.completedDepth).toBe(1);
    expect(result.completedRootMoves).toBe(legalActions.length);
    expect(result.fallbackKind).toBe('none');
    expect(result.timedOut).toBe(false);
  }, 30_000);

  it('falls back to partial current-depth search work instead of blind legal-order fallback on timeout', () => {
    const config = withConfig();
    const state = createInitialState(config);
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
    expect(['orderedRoot', 'partialCurrentDepth']).toContain(
      result.fallbackKind,
    );
    if (result.fallbackKind === 'partialCurrentDepth') {
      expect(result.completedRootMoves).toBeGreaterThan(0);
      expect(actionKey(result.action)).not.toBe(
        actionKey(legalActions[0] ?? null),
      );
    } else {
      expect(actionKey(result.action)).toBe(
        actionKey(orderedRootMoves[0]?.action ?? null),
      );
    }
  });

  it('keeps completed-root evidence separate from the interrupted next depth', () => {
    const config = withConfig();
    const state = createInitialState(config);
    const legalActionCount = getLegalActions(state, config).length;
    const result = chooseComputerAction({
      difficulty: 'hard',
      random: () => 0,
      ruleConfig: config,
      searchBudget: {
        maxDepth: 6,
        // Root preparation now consumes more explicitly-accounted nodes. Leave
        // enough budget to enter depth two before asserting partial evidence.
        maxEvaluatedNodes: 3_000,
        type: 'fixedNodes',
      },
      state,
    });

    expect(result.completedDepth).toBe(1);
    expect(result.completedRootMoves).toBe(legalActionCount);
    expect(result.partialDepth).toBe(2);
    expect(result.partialRootMoves).toBeGreaterThan(0);
    expect(result.fallbackKind).toBe('partialCurrentDepth');
    expect(result.timedOut).toBe(true);
  }, 30_000);
});
