import { describe, expect, it } from 'vitest';

import {
  chooseOutcomeContinuationActionV1,
  findNextOpponentDecisionBoundaryV1,
  runOutcomeContinuationV1,
} from '@/ai/test/outcomeContinuation';
import { createHomeFieldWinState } from '@/ai/test/tacticalFixtures';
import { advanceGeneratedEngineState, getLegalActions } from '@/domain';
import {
  boardWithPieces,
  checker,
  gameStateWithBoard,
  withConfig,
} from '@/test/factories';

describe('OutcomeContinuationPolicyV1', () => {
  it('uses deterministic depth-two reference when proof is insufficient', () => {
    const config = withConfig();
    const state = gameStateWithBoard(
      boardWithPieces({ B2: [checker('white')], E5: [checker('black')] }),
    );
    const decision = chooseOutcomeContinuationActionV1({
      config,
      proofSnapshot: new Map(),
      state,
    });
    expect(decision.action).not.toBeNull();
    expect(decision.source).toBe('fixedDepth2');
  });

  it('counts the forced action as ply one and resolves a natural win', () => {
    const config = withConfig();
    const state = createHomeFieldWinState();
    const winning = getLegalActions(state, config).find((action) => {
      const next = advanceGeneratedEngineState(state, action, config);
      return (
        next.status === 'gameOver' &&
        'winner' in next.victory &&
        next.victory.winner === state.currentPlayer
      );
    });
    expect(winning).toBeDefined();
    const result = runOutcomeContinuationV1({
      config,
      forcedAction: winning!,
      proofSnapshot: new Map(),
      root: state,
    });
    expect(result.committedActions).toBe(1);
    expect(result.adjudication).toBe('natural');
  });

  it('stops at the first genuine opponent decision', () => {
    const config = withConfig();
    const state = gameStateWithBoard(
      boardWithPieces({ B2: [checker('white')], E5: [checker('black')] }),
    );
    const initialAction = getLegalActions(state, config)[0];
    const boundary = findNextOpponentDecisionBoundaryV1({
      config,
      initialAction,
      mode: 'counterfactualProjection',
      proofSnapshot: new Map(),
      root: state,
    });
    expect(['opponentDecision', 'terminal']).toContain(boundary.kind);
  });
});
