import { describe, expect, it } from 'vitest';

import {
  measureCounterplayAndSuppressionV1,
  rewardForThinkingEffectV1,
} from '@/ai/test/counterplayMetrics';

describe('counterplay and suppression metrics', () => {
  it('measures semantic reply diversity and avoidable suppression', () => {
    const result = measureCounterplayAndSuppressionV1([
      {
        actionKey: 'selected',
        boundary: 'opponentDecision',
        completeComparableEvidence: true,
        projectedReplyClasses: ['same', 'same'],
        safe: true,
        selected: true,
      },
      {
        actionKey: 'alternative',
        boundary: 'opponentDecision',
        completeComparableEvidence: true,
        projectedReplyClasses: ['a', 'b'],
        safe: true,
        selected: false,
      },
    ]);
    expect(result.eligible).toBe(true);
    expect(result.suppressionRegret).toBeCloseTo(1);
    expect(result.suppression).toBe(true);
  });

  it('computes paired difference-in-differences reward for thinking', () => {
    expect(
      rewardForThinkingEffectV1([
        {
          baselineIntuitivePointShare: 0.6,
          baselineRandomPointShare: 0.5,
          candidateIntuitivePointShare: 0.8,
          candidateRandomPointShare: 0.4,
          pairingKey: 'lineage/color/orbit/persona/rng',
        },
      ])?.effect,
    ).toBeCloseTo(0.3);
  });
});
