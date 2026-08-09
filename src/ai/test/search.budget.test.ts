import { describe, expect, it } from 'vitest';

import { chooseComputerAction } from '@/ai';
import { createInitialState } from '@/domain';
import { withConfig } from '@/test/factories';

import { actionKey, createSeededRandom } from '@/ai/test/searchTestUtils';

describe('computer opponent measurement budgets', () => {
  it('completes an exact fixed-depth search without consulting a wall-clock deadline', () => {
    const ruleConfig = withConfig();
    const state = createInitialState(ruleConfig);
    let clockCalls = 0;
    const result = chooseComputerAction({
      difficulty: 'easy',
      now: () => {
        clockCalls += 1;
        return clockCalls * 1_000_000;
      },
      random: createSeededRandom(1),
      ruleConfig,
      searchBudget: { depth: 1, type: 'fixedDepth' },
      state,
    });

    expect(result.completedDepth).toBe(1);
    expect(result.fallbackKind).toBe('none');
    expect(result.timedOut).toBe(false);
    expect(result.searchBudget).toEqual({
      exhaustedBy: 'none',
      maxDepth: 1,
      maxEvaluatedNodes: null,
      timeBudgetMs: null,
      type: 'fixedDepth',
    });
  }, 30_000);

  it('stops deterministically at the evaluated-node limit and reports the exercised path', () => {
    const ruleConfig = withConfig();
    const state = createInitialState(ruleConfig);
    const request = {
      difficulty: 'hard' as const,
      random: createSeededRandom(9),
      ruleConfig,
      searchBudget: {
        maxDepth: 4,
        maxEvaluatedNodes: 1,
        type: 'fixedNodes' as const,
      },
      state,
    };
    const first = chooseComputerAction({ ...request, now: () => 0 });
    const second = chooseComputerAction({
      ...request,
      now: () => Number.MAX_SAFE_INTEGER,
      random: createSeededRandom(9),
    });

    expect(first.evaluatedNodes).toBe(1);
    expect(second.evaluatedNodes).toBe(1);
    expect(first.diagnostics.rootPreparationTransitions).toBeGreaterThan(0);
    expect(second.diagnostics.rootPreparationTransitions).toBe(
      first.diagnostics.rootPreparationTransitions,
    );
    expect(actionKey(first.action)).toBe(actionKey(second.action));
    expect(first.searchBudget).toEqual({
      exhaustedBy: 'nodes',
      maxDepth: 4,
      maxEvaluatedNodes: 1,
      timeBudgetMs: null,
      type: 'fixedNodes',
    });
    expect(first.timedOut).toBe(true);
  });

  it('rejects invalid measurement budgets instead of silently changing the workload', () => {
    const ruleConfig = withConfig();
    const state = createInitialState(ruleConfig);

    expect(() =>
      chooseComputerAction({
        difficulty: 'easy',
        ruleConfig,
        searchBudget: { depth: 0, type: 'fixedDepth' },
        state,
      }),
    ).toThrow(/positive safe integer/);
  });

  it('rejects an explicit normal-search budget in finishing mode instead of ignoring it', () => {
    const ruleConfig = withConfig();
    const state = createInitialState(ruleConfig);

    expect(() =>
      chooseComputerAction({
        difficulty: 'easy',
        ruleConfig,
        searchBudget: { depth: 1, type: 'fixedDepth' },
        searchMode: 'finishing',
        state,
      }),
    ).toThrow(/normal search only/);
  });
});
