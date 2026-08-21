import { describe, expect, it } from 'vitest';

import { calibrateSemanticRolloutStabilityV1 } from '@/ai/test/semanticRolloutCalibration';

describe('SemanticRolloutCalibrationV1', () => {
  it('chooses the smallest N passing every frozen stability threshold', () => {
    const observations = ([8, 16, 32, 64] as const).flatMap((rolloutCount) =>
      ([1, 4, 8] as const).map((horizon) => ({
        classKey: rolloutCount === 8 && horizon === 8 ? 'different' : 'stable',
        decisionId: 'decision',
        hill1: rolloutCount === 8 ? 1.2 : 1.05,
        horizon,
        metrics: [0.1, 0.2, 0.3, 0.2, 0.5, 0.4] as [
          number,
          number,
          number,
          number,
          number,
          number,
        ],
        rolloutCount,
      })),
    );
    const result = calibrateSemanticRolloutStabilityV1({
      horizonEffects: [
        { effect: 0.2, horizon: 1, standardDeviation: 1 },
        { effect: 0.3, horizon: 4, standardDeviation: 1 },
        { effect: 0.1, horizon: 8, standardDeviation: 1 },
      ],
      observations,
    });
    expect(result.chosenRolloutCount).toBe(16);
    expect(result.mayBeSoleLead).toBe(true);
  });

  it('blocks sole-lead use on a floored-SD direction reversal', () => {
    const observations = ([8, 16, 32, 64] as const).flatMap((rolloutCount) =>
      ([1, 4, 8] as const).map((horizon) => ({
        classKey: 'stable',
        decisionId: 'decision',
        hill1: 1,
        horizon,
        metrics: [0, 0, 0, 0, 0, 0] as [
          number,
          number,
          number,
          number,
          number,
          number,
        ],
        rolloutCount,
      })),
    );
    expect(
      calibrateSemanticRolloutStabilityV1({
        horizonEffects: [
          { effect: -0.01, horizon: 1, standardDeviation: 0.01 },
          { effect: 0.01, horizon: 4, standardDeviation: 0.01 },
          { effect: 0.01, horizon: 8, standardDeviation: 0.01 },
        ],
        observations,
      }).mayBeSoleLead,
    ).toBe(false);
  });
});
