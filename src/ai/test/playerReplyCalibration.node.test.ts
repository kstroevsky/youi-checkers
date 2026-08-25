import { describe, expect, it } from 'vitest';

import {
  calibratePlayerReplyToleranceV1,
  evaluatePlayerReplySensitivityV1,
} from '@/ai/test/playerReplyCalibration.node';

describe('PlayerReplyToleranceV1', () => {
  it('permits a sole counterplay lead only under stable direction and spread', () => {
    expect(
      evaluatePlayerReplySensitivityV1([
        { effect: 0.5, scale: 0.5, standardDeviation: 1 },
        { effect: 0.6, scale: 1, standardDeviation: 1 },
        { effect: 0.65, scale: 2, standardDeviation: 1 },
      ]).counterplayMayBeSoleLead,
    ).toBe(true);
    expect(
      evaluatePlayerReplySensitivityV1([
        { effect: 0.5, scale: 0.5, standardDeviation: 1 },
        { effect: -0.1, scale: 1, standardDeviation: 1 },
        { effect: 0.7, scale: 2, standardDeviation: 1 },
      ]).counterplayMayBeSoleLead,
    ).toBe(false);
  });

  it('calibrates replies with the lineage bootstrap contract', () => {
    const trials = [0, 5].flatMap((cutoff) =>
      Array.from({ length: 8 }, (_, lineage) => ({
        cutoff,
        exactWdlDowngrade: false,
        lineageId: `lineage-${lineage}`,
        pointShareLoss: cutoff === 0 ? 0 : 0.01,
        rootId: `root-${lineage}`,
        worstAdmittedActionKey: `action-${cutoff}`,
      })),
    );
    const result = calibratePlayerReplyToleranceV1({
      runSeed: 'reply',
      sensitivityRecords: [
        { effect: 0.5, scale: 0.5, standardDeviation: 1 },
        { effect: 0.55, scale: 1, standardDeviation: 1 },
        { effect: 0.6, scale: 2, standardDeviation: 1 },
      ],
      trials,
    });
    expect(result.selectedCutoff).toBe(5);
    expect(result.artifactHash).toMatch(/^[a-f0-9]{64}$/u);
  });
});
