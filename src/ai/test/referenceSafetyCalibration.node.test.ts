import { describe, expect, it } from 'vitest';

import {
  calibrateReferenceToleranceV1,
  referenceToleranceGridV1,
} from '@/ai/test/referenceSafetyCalibration.node';

describe('ReferenceToleranceV1', () => {
  it('constructs the frozen percentile grid', () => {
    expect(referenceToleranceGridV1([])).toEqual([0]);
    expect(referenceToleranceGridV1([0, 1, 2, 3, 4])).toEqual([0, 1, 2, 3, 4]);
  });

  it('selects the largest cutoff whose simultaneous loss bound passes', () => {
    const trials = Array.from({ length: 12 }, (_, lineage) =>
      [0, 10, 20].map((cutoff) => ({
        cutoff,
        exactWdlDowngrade: false,
        lineageId: `lineage-${lineage}`,
        pointShareLoss: cutoff === 0 ? 0 : cutoff === 10 ? 0.01 : 0.05,
        rootId: `root-${lineage}`,
        worstAdmittedActionKey: `action-${cutoff}`,
      })),
    ).flat();
    const result = calibrateReferenceToleranceV1({
      runSeed: 'calibration',
      trials,
    });
    expect(result.selectedCutoff).toBe(10);
    expect(result.bootstrapResamples).toBe(10_000);
    expect(result.artifactHash).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('rejects any cutoff with an exact WDL downgrade', () => {
    const result = calibrateReferenceToleranceV1({
      runSeed: 'wdl',
      trials: [0, 10].flatMap((cutoff) =>
        ['a', 'b'].map((lineageId) => ({
          cutoff,
          exactWdlDowngrade: cutoff === 10 && lineageId === 'a',
          lineageId,
          pointShareLoss: 0,
          rootId: lineageId,
          worstAdmittedActionKey: String(cutoff),
        })),
      ),
    });
    expect(result.selectedCutoff).toBe(0);
  });
});
