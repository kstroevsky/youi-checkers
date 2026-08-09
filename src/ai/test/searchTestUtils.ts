import { expect } from 'vitest';

import { AI_DIFFICULTY_PRESETS, chooseComputerAction } from '@/ai';
import { applyAction, createInitialState, getLegalActions } from '@/domain';
import type { TurnAction } from '@/domain/model/types';
import { validateGameState } from '@/domain/validators/stateValidators';
import { withConfig } from '@/test/factories';

export {
  createHomeFieldWinState,
  createOpponentThreatState,
  createSixStackWinState,
} from '@/ai/test/tacticalFixtures';

/** Serializes nullable actions into compact test assertions. */
export function actionKey(action: TurnAction | null): string {
  if (!action) {
    return 'none';
  }

  switch (action.type) {
    case 'manualUnfreeze':
      return `${action.type}:${action.coord}`;
    case 'jumpSequence':
      return `${action.type}:${action.source}:${action.path.join('>')}`;
    default:
      return `${action.type}:${action.source}:${action.target}`;
  }
}

/** Creates a deterministic clock that advances by a fixed amount per call. */
export function createTickingClock(step = 0.01): () => number {
  let tick = 0;

  return () => {
    const value = tick;
    tick += step;
    return value;
  };
}

/** Creates a clock that eventually jumps beyond the search deadline. */
export function createTimeoutClock(
  stableCalls: number,
  expiredValue: number,
): () => number {
  let calls = 0;

  return () => {
    calls += 1;
    return calls <= stableCalls ? 0 : expiredValue;
  };
}

/** Creates deterministic randomness for soak tests and balanced-move selection. */
export function createSeededRandom(seed = 1): () => number {
  let current = seed >>> 0;

  return () => {
    current = (current * 1_664_525 + 1_013_904_223) >>> 0;
    return current / 0x1_0000_0000;
  };
}

export type SoakStats = {
  /** Nodes evaluated per second averaged across all turns (wall-clock time). */
  avgNodesPerSecond: number;
  /** Minimum completedDepth observed across all turns. */
  minCompletedDepth: number;
  /** Number of turns actually completed (may be less than turnLimit on early exit). */
  turnsCompleted: number;
};

/** Runs a deterministic AI-vs-AI playout and asserts state validity throughout. */
export function runAiSoakPlayout(
  difficulty: keyof typeof AI_DIFFICULTY_PRESETS,
  turnLimit: number,
  stableCalls: number,
): SoakStats {
  const config = withConfig({ drawRule: 'none' });
  const random = createSeededRandom(turnLimit + stableCalls * 100);
  let state = createInitialState(config);

  let totalNodes = 0;
  let totalWallMs = 0;
  let minDepth = Number.MAX_SAFE_INTEGER;
  let turnsCompleted = 0;

  for (let turn = 0; turn < turnLimit; turn += 1) {
    const legalActions = getLegalActions(state, config);

    expect(legalActions.length).toBeGreaterThan(0);

    const startedAt = performance.now();
    const result = chooseComputerAction({
      difficulty,
      now: createTimeoutClock(stableCalls, 100_000),
      random,
      ruleConfig: config,
      state,
    });
    const wallTimeMs = performance.now() - startedAt;
    const wallTimeSlackMs = 250;

    expect(wallTimeMs).toBeLessThanOrEqual(
      AI_DIFFICULTY_PRESETS[difficulty].timeBudgetMs + wallTimeSlackMs,
    );
    expect(result.action).not.toBeNull();
    expect(legalActions.map(actionKey)).toContain(actionKey(result.action));

    totalNodes += result.evaluatedNodes;
    totalWallMs += wallTimeMs;
    if (result.completedDepth < minDepth) {
      minDepth = result.completedDepth;
    }
    turnsCompleted += 1;

    state = applyAction(state, result.action as TurnAction, config);

    const validation = validateGameState(state);

    expect(validation.valid).toBe(true);
    expect(state.pendingJump === null || state.pendingJump.jumpedCheckerIds.length > 0).toBe(true);

    if (state.status === 'gameOver') {
      state = createInitialState(config);
    }
  }

  return {
    avgNodesPerSecond: totalWallMs > 0 ? Math.round(totalNodes / totalWallMs * 1000) : 0,
    minCompletedDepth: minDepth === Number.MAX_SAFE_INTEGER ? 0 : minDepth,
    turnsCompleted,
  };
}
