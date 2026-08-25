import { describe, expect, it } from 'vitest';

import { runReferenceStrengthOracleV1 } from '@/ai/referenceOracle';
import { buildRootScoreEvidenceV1 } from '@/ai/test/rootScoreEvidence';
import { chooseComputerAction } from '@/ai';
import { getLegalActions } from '@/domain';
import {
  boardWithPieces,
  checker,
  gameStateWithBoard,
  withConfig,
} from '@/test/factories';

describe('RootScoreEvidenceV1', () => {
  it('keeps reference and product score ownership distinct', () => {
    const config = withConfig();
    const state = gameStateWithBoard(
      boardWithPieces({ B2: [checker('white')], E5: [checker('black')] }),
    );
    const legalActions = getLegalActions(state, config);
    const referenceResult = runReferenceStrengthOracleV1(state, config);
    const productResult = chooseComputerAction({
      difficulty: 'easy',
      random: () => 0,
      ruleConfig: config,
      searchBudget: { maxEvaluatedNodes: 20_000, type: 'fixedNodes' },
      state,
    });
    const evidence = buildRootScoreEvidenceV1({
      legalActions,
      productResult,
      referenceResult,
    });

    expect(evidence.actions).toHaveLength(legalActions.length);
    expect(
      evidence.actions.every(
        (entry) =>
          entry.referenceScoreEvidence?.source === 'referenceStrengthV1',
      ),
    ).toBe(true);
    expect(
      evidence.actions.every(
        (entry) => entry.productScoreEvidence?.source !== 'referenceStrengthV1',
      ),
    ).toBe(true);
  });

  it('records missing product candidates as unknown instead of borrowing a score', () => {
    const config = withConfig();
    const state = gameStateWithBoard(
      boardWithPieces({ B2: [checker('white')], E5: [checker('black')] }),
    );
    const legalActions = getLegalActions(state, config);
    const result = chooseComputerAction({
      diagnosticRootCandidateLimit: 1,
      difficulty: 'easy',
      random: () => 0,
      ruleConfig: config,
      searchBudget: { maxEvaluatedNodes: 20_000, type: 'fixedNodes' },
      state,
    });
    const evidence = buildRootScoreEvidenceV1({
      legalActions,
      productResult: result,
      referenceResult: null,
    });

    expect(
      evidence.actions.filter(
        (entry) => entry.productScoreEvidence?.bound === 'unknown',
      ).length,
    ).toBe(legalActions.length - 1);
  });
});
