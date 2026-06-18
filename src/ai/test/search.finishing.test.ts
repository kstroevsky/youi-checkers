import { describe, expect, it } from 'vitest';

import { chooseComputerAction } from '@/ai';
import {
  boardWithPieces,
  checker,
  gameStateWithBoard,
  withConfig,
} from '@/test/factories';

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
    expect(result.completedDepth).toBe(1);
    expect(result.timedOut).toBe(false);
  });
});
