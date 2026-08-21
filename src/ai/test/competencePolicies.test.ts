import { describe, expect, it } from 'vitest';

import { summarizeCompetenceDiagnosticsV1 } from '@/ai/test/competencePolicies';

describe('competence diagnostics', () => {
  it('reports measured monotonicity rather than assuming nominal depth order', () => {
    const points = {
      random: 0.2,
      intuitive: 0.35,
      depth2: 0.5,
      depth4: 0.48,
      depth6: 0.7,
    } as const;
    const result = summarizeCompetenceDiagnosticsV1(
      Object.entries(points).map(([policy, adjudicatedPointShare]) => ({
        adjudicatedPointShare,
        naturalPointShare: adjudicatedPointShare,
        policy: policy as keyof typeof points,
        skillResponse: adjudicatedPointShare,
      })),
    );
    expect(result.intuitiveMinusRandom).toBeCloseTo(0.15);
    expect(result.monotonicityViolations).toEqual(['depth2->depth4']);
    expect(result.reportOrdinalTierSlope).toBe(false);
    expect(result.normalizedSkillResponseAuc).not.toBeNull();
  });
});
