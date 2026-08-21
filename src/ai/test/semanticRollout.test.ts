import { describe, expect, it } from 'vitest';

import { measureSemanticFutureChoicesV1 } from '@/ai/test/semanticRollout';
import { createHomeFieldWinState } from '@/ai/test/tacticalFixtures';
import { withConfig } from '@/test/factories';

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
});
