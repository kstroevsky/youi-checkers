import { describe, expect, it } from 'vitest';

import { createAiBehaviorProfile } from '@/ai/behavior';
import { chooseComputerAction } from '@/ai';
import type { RootStyleCalibrationV1 } from '@/ai/rootStyleReranker';
import { selectRootStyleTreatmentV1 } from '@/ai/test/rootStyleTreatment';
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
  const behaviorProfile = createAiBehaviorProfile('root-style-test');
  const result = chooseComputerAction({
    behaviorProfile,
    diagnosticRootCandidateLimit: getLegalActions(state, config).length,
    difficulty: 'easy',
    random: () => 0.5,
    ruleConfig: config,
    searchBudget: { depth: 1, type: 'fixedDepth' },
    state,
  });

  it('post-processes complete product-root evidence into a legal action', () => {
    const selected = selectRootStyleTreatmentV1({
      behaviorProfile,
      calibration,
      difficulty: 'easy',
      random: () => 0.5,
      result,
      ruleConfig: config,
      state,
      temperature: 1,
    });
    expect(result.completedRootMoves).toBe(
      getLegalActions(state, config).length,
    );
    expect(getLegalActions(state, config)).toContainEqual(selected);
  });

  it('fails closed to baseline when complete-root evidence is unavailable', () => {
    expect(
      selectRootStyleTreatmentV1({
        behaviorProfile,
        calibration,
        difficulty: 'easy',
        random: () => 0,
        result: { ...result, completedDepth: 0 },
        ruleConfig: config,
        state,
        temperature: 1,
      }),
    ).toEqual(result.action);
  });
});
