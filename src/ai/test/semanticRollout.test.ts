import { describe, expect, it } from 'vitest';

import {
  classifySemanticFutureV1,
  measureSemanticFutureChoicesV1,
  type SemanticRolloutSnapshotV1,
} from '@/ai/test/semanticRollout';
import { createHomeFieldWinState } from '@/ai/test/tacticalFixtures';
import {
  boardWithPieces,
  checker,
  gameStateWithBoard,
  withConfig,
} from '@/test/factories';

describe('SemanticRolloutPolicyV1', () => {
  it('carries terminal states through all later horizons', () => {
    const result = measureSemanticFutureChoicesV1({
      calibration: {
        opponentDelta: { iqr: 1, median: 0 },
        ownDelta: { iqr: 1, median: 0 },
        sourceCatalogHash: 'a'.repeat(64),
        version: 1,
      },
      config: withConfig(),
      lineageId: 'lineage-1',
      proofSnapshot: new Map(),
      root: createHomeFieldWinState(),
      rolloutCount: 2,
      runSeed: 'semantic',
    });
    const terminal = result.find(
      (action) => action.horizons[1][0].state.status === 'gameOver',
    );
    expect(terminal).toBeDefined();
    expect(terminal?.horizons[4]).toHaveLength(2);
    expect(
      terminal?.horizons[8].every((entry) => entry.terminalCarriedForward),
    ).toBe(true);
  });

  it('uses exact phase thresholds, 25% risk aggregation, and lower-median reply classes', () => {
    const state = gameStateWithBoard(
      boardWithPieces({
        A6: [checker('white'), checker('white'), checker('white')],
        B6: [checker('white'), checker('white')],
        C6: [checker('white'), checker('white')],
      }),
    );
    const snapshots = Array.from({ length: 4 }, (_, index) => ({
      horizon: 4 as const,
      opponentReadinessDelta: 0,
      outcome: { draw: 0.6, loss: 0.2, unknown: 0, win: 0.2 },
      ownReadinessDelta: 0.03,
      replyClassCountNormalized: 0.5,
      repetitionRiskBitset:
        index === 0 ? (['repetition'] as const) : ([] as const),
      rootPlayer: 'white' as const,
      state,
      strategicIntent: index < 2 ? ('home' as const) : ('hybrid' as const),
      structuralReplyClasses: Array.from(
        { length: [2, 3, 3, 4][index] },
        (_, reply) => `reply-${reply}`,
      ),
      terminalCarriedForward: false,
    })) satisfies SemanticRolloutSnapshotV1[];
    const signature = classifySemanticFutureV1(snapshots);
    expect(signature.phase).toBe('conversion');
    expect(signature.repetitionRiskBitset).toEqual(['repetition']);
    expect(signature.strategicIntent).toBe('home');
    expect(signature.structuralCounterplayClass).toBe('3+');
  });
});
