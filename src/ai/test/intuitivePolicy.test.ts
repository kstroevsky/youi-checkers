import { describe, expect, it } from 'vitest';

import {
  calibrateIntuitivePolicyV1,
  chooseIntuitiveActionV1,
  scoreIntuitiveCandidatesV1,
} from '@/ai/test/intuitivePolicy';
import { createHomeFieldWinState } from '@/ai/test/tacticalFixtures';
import { withConfig } from '@/test/factories';

describe('YOUIIntuitiveV1', () => {
  const calibration = calibrateIntuitivePolicyV1({
    opponentDeltas: [-0.1, 0, 0.1, 0.2],
    ownDeltas: [-0.1, 0, 0.1, 0.2],
    sourceCatalogHash: 'a'.repeat(64),
  });

  it('assigns the specified terminal bonus to immediate wins', () => {
    const candidates = scoreIntuitiveCandidatesV1({
      calibration,
      config: withConfig(),
      state: createHomeFieldWinState(),
    });
    expect(candidates.some((candidate) => candidate.terminalTerm === 10)).toBe(
      true,
    );
    expect(
      candidates.reduce((sum, candidate) => sum + candidate.probability, 0),
    ).toBeCloseTo(1);
  });

  it('is reproducible from a purpose-separated named uniform', () => {
    const request = {
      calibration,
      config: withConfig(),
      rngKey: {
        lineageId: 'lineage-1',
        purpose: 'policyDecision' as const,
        replicate: 0,
        runSeed: 'intuitive',
      },
      state: createHomeFieldWinState(),
    };
    expect(chooseIntuitiveActionV1(request).action).toEqual(
      chooseIntuitiveActionV1(request).action,
    );
  });
});
