import { describe, expect, it } from 'vitest';

import { AI_DIFFICULTY_PRESETS, chooseComputerAction } from '@/ai';
import {
  advanceFinishingEngineState,
  hashPosition,
  type EngineState,
} from '@/domain';
import {
  boardWithPieces,
  checker,
  gameStateWithBoard,
  withConfig,
} from '@/test/factories';

function reportedFinishingState() {
  return gameStateWithBoard(
    boardWithPieces({
      A1: [checker('black'), checker('black'), checker('black')],
      C1: [checker('black'), checker('black'), checker('black')],
      E1: [checker('black'), checker('black'), checker('black')],
      F1: [checker('black'), checker('black'), checker('black')],
      A2: [checker('black')],
      D2: [checker('black')],
      E2: [checker('black')],
      F2: [checker('black')],
      B3: [checker('black')],
      E3: [checker('black')],
      A6: [checker('white'), checker('white'), checker('white')],
      B6: [checker('white'), checker('white'), checker('white')],
      C6: [checker('white'), checker('white'), checker('white')],
      D6: [checker('white'), checker('white'), checker('white')],
      E6: [checker('white'), checker('white'), checker('white')],
      F6: [checker('white'), checker('white'), checker('white')],
    }),
    { currentPlayer: 'black', moveNumber: 157 },
  );
}

describe('computer finishing search', () => {
  it('finishes in one action after the opponent has already won', () => {
    const state = gameStateWithBoard(
      boardWithPieces({
        A1: [checker('black'), checker('black'), checker('black')],
        B1: [checker('black'), checker('black'), checker('black')],
        C1: [checker('black'), checker('black'), checker('black')],
        D1: [checker('black'), checker('black'), checker('black')],
        E1: [checker('black'), checker('black'), checker('black')],
        F1: [checker('black'), checker('black'), checker('black')],
        A5: [checker('white')],
        A6: [checker('white'), checker('white')],
        B6: [checker('white'), checker('white'), checker('white')],
        C6: [checker('white'), checker('white'), checker('white')],
        D6: [checker('white'), checker('white'), checker('white')],
        E6: [checker('white'), checker('white'), checker('white')],
        F6: [checker('white'), checker('white'), checker('white')],
      }),
    );

    const result = chooseComputerAction({
      difficulty: 'easy',
      now: () => 0,
      random: () => 0,
      ruleConfig: withConfig(),
      searchMode: 'finishing',
      state,
    });

    expect(result.action).toEqual({
      type: 'climbOne',
      source: 'A5',
      target: 'A6',
    });
    expect(result.completionPlan).toEqual([result.action]);
    expect(result.completedDepth).toBe(1);
    expect(result.timedOut).toBe(false);
  });

  it('plans the reported finishing board once without revisiting a position', () => {
    const ruleConfig = withConfig();
    let state: EngineState = reportedFinishingState();
    const visited = new Set([hashPosition(state)]);
    const decision = chooseComputerAction({
      difficulty: 'easy',
      random: () => 0,
      ruleConfig,
      searchMode: 'finishing',
      state,
    });

    expect(decision.completionPlan).toBeDefined();
    expect(decision.completionPlan?.length).toBeGreaterThan(1);

    for (const [move, action] of decision.completionPlan!.entries()) {
      const nextState = advanceFinishingEngineState(
        state,
        action,
        'black',
        ruleConfig,
      );
      const selectedPosition = hashPosition(nextState);

      expect(visited.has(selectedPosition), `move ${move + 1}`).toBe(false);
      visited.add(selectedPosition);
      state = nextState;
    }

    expect(state.status).toBe('gameOver');
    expect(state.victory).toEqual({ type: 'sixStacks', winner: 'black' });
  });

  it('keeps repetition avoidance when Easy planning exhausts its budget', () => {
    const ruleConfig = withConfig();
    let state: EngineState = reportedFinishingState();

    for (let move = 0; move < 2; move += 1) {
      const decision = chooseComputerAction({
        difficulty: 'easy',
        now: () => 0,
        random: () => 0,
        ruleConfig,
        searchMode: 'finishing',
        state,
      });

      state = advanceFinishingEngineState(
        state,
        decision.action!,
        'black',
        ruleConfig,
      );
    }

    let nowCalls = 0;
    const decision = chooseComputerAction({
      difficulty: 'easy',
      now: () =>
        nowCalls++ === 0 ? 0 : AI_DIFFICULTY_PRESETS.easy.timeBudgetMs,
      random: () => 0,
      ruleConfig,
      searchMode: 'finishing',
      state,
    });
    const nextState = advanceFinishingEngineState(
      state,
      decision.action!,
      'black',
      ruleConfig,
    );

    expect(decision.timedOut).toBe(true);
    expect(decision.completionPlan).toBeUndefined();
    expect(state.positionCounts[hashPosition(nextState)] ?? 0).toBe(0);
  });
});
