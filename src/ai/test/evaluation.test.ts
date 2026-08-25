import { describe, expect, it } from 'vitest';

import { AI_DIFFICULTY_PRESETS } from '@/ai/presets';
import { evaluateState, evaluateStructureState } from '@/ai/evaluation';
import {
  getNonterminalDrawTrapBias,
  getTiebreakPressureProfile,
} from '@/ai/risk';
import { createInitialState } from '@/domain';
import { getDynamicDrawScore } from '@/ai/risk';
import {
  boardWithPieces,
  checker,
  gameStateWithBoard,
  withConfig,
} from '@/test/factories';

describe('AI evaluation terminal scoring', () => {
  it('rejects invalid participation-evaluation ablation scales', () => {
    const config = withConfig();
    const state = createInitialState(config);

    expect(() =>
      evaluateState(state, 'white', config, {
        diagnosticAblation: { participationEvaluationScale: -0.1 },
        preset: AI_DIFFICULTY_PRESETS.hard,
      }),
    ).toThrow('participationEvaluationScale');
  });

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

    expect(evaluateStructureState(state, 'white', config)).toBeGreaterThan(
      900_000,
    );
    expect(evaluateStructureState(state, 'black', config)).toBeLessThan(
      -900_000,
    );
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
      getDynamicDrawScore(
        equalDrawState,
        'white',
        AI_DIFFICULTY_PRESETS.medium,
        'normal',
      ),
    ).toBeLessThan(0);
    expect(
      getDynamicDrawScore(
        behindDrawState,
        'white',
        AI_DIFFICULTY_PRESETS.hard,
        'normal',
      ),
    ).toBeGreaterThanOrEqual(0);
    expect(
      getDynamicDrawScore(
        equalDrawState,
        'white',
        AI_DIFFICULTY_PRESETS.medium,
        'late',
      ),
    ).toBeLessThan(
      getDynamicDrawScore(
        equalDrawState,
        'white',
        AI_DIFFICULTY_PRESETS.medium,
        'normal',
      ),
    );
  });

  it('derives checker-first, stack-second tiebreak edges', () => {
    const checkerEdgeState = gameStateWithBoard(
      boardWithPieces({
        A1: [checker('black')],
        B1: [checker('black')],
        A4: [checker('white')],
      }),
      { currentPlayer: 'black' },
    );
    const stackEdgeState = gameStateWithBoard(
      boardWithPieces({
        A1: [checker('black')],
        B1: [checker('black')],
        A4: [checker('white'), checker('white'), checker('white')],
      }),
      { currentPlayer: 'white' },
    );

    expect(
      getTiebreakPressureProfile(checkerEdgeState, 'black', 'normal'),
    ).toMatchObject({
      tiebreakCheckerEdge: 1,
      tiebreakEdgeKind: 'ahead',
      tiebreakStackEdge: 0,
    });
    expect(
      getTiebreakPressureProfile(stackEdgeState, 'white', 'normal'),
    ).toMatchObject({
      tiebreakCheckerEdge: 1,
      tiebreakEdgeKind: 'ahead',
      tiebreakStackEdge: 1,
    });
  });

  it('penalizes adverse nonterminal draw pressure more strongly when the side is behind than when tied', () => {
    const config = withConfig({ drawRule: 'threefold' });
    const tiedState = createInitialState(config);
    const behindState = gameStateWithBoard(
      boardWithPieces({
        A1: [checker('black', true)],
        B4: [checker('black')],
        A4: [checker('white')],
        B5: [checker('white')],
        C5: [checker('white')],
      }),
      {
        currentPlayer: 'black',
        moveNumber: 92,
      },
    );
    const repeatedTiedState = {
      ...tiedState,
      moveNumber: 92,
      positionCounts: {
        ...tiedState.positionCounts,
        [Object.keys(tiedState.positionCounts)[0]]: 2,
      },
    };
    const repeatedBehindState = {
      ...behindState,
      positionCounts: {
        ...behindState.positionCounts,
        [Object.keys(behindState.positionCounts)[0]]: 2,
      },
    };

    expect(
      getNonterminalDrawTrapBias(
        repeatedBehindState,
        'black',
        AI_DIFFICULTY_PRESETS.medium,
        'late',
      ),
    ).toBeLessThan(0);
    expect(
      getNonterminalDrawTrapBias(
        repeatedTiedState,
        'white',
        AI_DIFFICULTY_PRESETS.medium,
        'late',
      ),
    ).toBeLessThan(0);
    expect(
      getNonterminalDrawTrapBias(
        repeatedBehindState,
        'white',
        AI_DIFFICULTY_PRESETS.medium,
        'late',
      ),
    ).toBe(0);
    expect(
      getNonterminalDrawTrapBias(
        repeatedBehindState,
        'black',
        AI_DIFFICULTY_PRESETS.medium,
        'late',
      ),
    ).toBeLessThan(
      getNonterminalDrawTrapBias(
        repeatedTiedState,
        'white',
        AI_DIFFICULTY_PRESETS.medium,
        'late',
      ),
    );
  });
});
