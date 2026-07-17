import { describe, expect, it } from 'vitest';

import { getFinishingProgress } from '@/domain/rules/finishingProgress';
import { boardWithPieces, checker, gameStateWithBoard } from '@/test/factories';

describe('finishing progress', () => {
  it('counts only pure height-three front stacks as completed', () => {
    const state = gameStateWithBoard(
      boardWithPieces({
        A1: [checker('black'), checker('black'), checker('black')],
        B1: [checker('black'), checker('white'), checker('black')],
      }),
      { currentPlayer: 'black' },
    );

    const progress = getFinishingProgress(state, 'black', 'sixStack');

    expect(progress).toMatchObject({
      controlledStacks: 2,
      frontCompletedStacks: 1,
      frontForeignCheckers: 1,
      frontOwnCheckers: 5,
      goal: 'sixStack',
    });
  });
});
