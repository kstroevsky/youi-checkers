import { describe, expect, it } from 'vitest';

import { AI_DIFFICULTY_PRESETS } from '@/ai/presets';
import { evaluateState, evaluateStructureState } from '@/ai/evaluation';
import { createInitialState } from '@/domain';
import { getDynamicDrawScore } from '@/ai/risk';
import { boardWithPieces, checker, gameStateWithBoard, withConfig } from '@/test/factories';

describe('AI evaluation terminal scoring', () => {
  it('scores draw-tiebreak wins as decisive terminal outcomes', () => {
    const config = withConfig({ drawRule: 'threefold' });
    const state = {
      ...createInitialState(config),
      status: 'gameOver' as const,
      pendingJump: null,
      victory: {
        type: 'threefoldTiebreakWin' as const,
        winner: 'white' as const,
        ownFieldCheckers: { white: 10, black: 9 },
        completedHomeStacks: { white: 2, black: 1 },
        decidedBy: 'checkers' as const,
      },
    };

    expect(evaluateStructureState(state, 'white', config)).toBeGreaterThan(900_000);
    expect(evaluateStructureState(state, 'black', config)).toBeLessThan(-900_000);
    expect(evaluateState(state, 'white', config)).toBeGreaterThan(900_000);
    expect(evaluateState(state, 'black', config)).toBeLessThan(-900_000);
  });

  it('makes equal draws unattractive and behind draws acceptable', () => {
    const config = withConfig({ drawRule: 'threefold' });
    const equalDrawState = {
      ...createInitialState(config),
      status: 'gameOver' as const,
      pendingJump: null,
      victory: { type: 'stalemateDraw' as const },
    };
    const behindDrawState = {
      ...gameStateWithBoard(
        boardWithPieces({
          A6: [checker('black'), checker('black'), checker('black')],
          B6: [checker('black'), checker('black'), checker('black')],
          C6: [checker('black'), checker('black'), checker('black')],
          D1: [checker('white')],
        }),
      ),
      status: 'gameOver' as const,
      pendingJump: null,
      victory: { type: 'stalemateDraw' as const },
    };

    expect(
      getDynamicDrawScore(equalDrawState, 'white', AI_DIFFICULTY_PRESETS.medium, 'normal'),
    ).toBeLessThan(0);
    expect(
      getDynamicDrawScore(behindDrawState, 'white', AI_DIFFICULTY_PRESETS.hard, 'normal'),
    ).toBeGreaterThanOrEqual(0);
    expect(
      getDynamicDrawScore(equalDrawState, 'white', AI_DIFFICULTY_PRESETS.medium, 'late'),
    ).toBeLessThan(
      getDynamicDrawScore(equalDrawState, 'white', AI_DIFFICULTY_PRESETS.medium, 'normal'),
    );
  });
});
