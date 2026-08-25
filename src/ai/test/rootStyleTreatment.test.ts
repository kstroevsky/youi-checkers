import { describe, expect, it } from 'vitest';

import { chooseComputerAction } from '@/ai';
import type { RootStyleCalibrationV1 } from '@/ai/rootStyleReranker';
import { getLegalActions } from '@/domain';
import {
  boardWithPieces,
  checker,
  gameStateWithBoard,
  withConfig,
} from '@/test/factories';

const calibration = Object.fromEntries(
  [
    'history',
    'participation',
    'persona',
    'plan',
    'progress',
    'risk',
    'strength',
  ].map((name) => [name, { iqr: 1, median: 0 }]),
) as RootStyleCalibrationV1;

describe('Stage-B root style treatment', () => {
  const config = withConfig();
  const state = gameStateWithBoard(
    boardWithPieces({ B2: [checker('white')], E5: [checker('black')] }),
  );

  it('runs only after complete-root evidence and returns a legal action', () => {
    const result = chooseComputerAction({
      diagnosticAblation: {
        rootStyleReranker: { calibration, temperature: 1 },
      },
      diagnosticRootCandidateLimit: getLegalActions(state, config).length,
      difficulty: 'easy',
      random: () => 0.5,
      ruleConfig: config,
      searchBudget: { depth: 1, type: 'fixedDepth' },
      state,
    });
    expect(result.completedRootMoves).toBe(
      getLegalActions(state, config).length,
    );
    expect(getLegalActions(state, config)).toContainEqual(result.action);
  });

  it('refuses the forbidden exact-tie plus reranker combination', () => {
    expect(() =>
      chooseComputerAction({
        diagnosticAblation: {
          exactTieParticipation: true,
          rootStyleReranker: { calibration, temperature: 1 },
        },
        difficulty: 'easy',
        ruleConfig: config,
        searchBudget: { depth: 1, type: 'fixedDepth' },
        state,
      }),
    ).toThrow(/cannot be combined/u);
  });
});
