import { describe, expect, it } from 'vitest';
import { powerSealedValidationV1 } from '@/ai/test/sealedPower';

describe('sealed validation power', () => {
  it('enforces the minimum complete-block size and both error targets', () => {
    const powered = Array.from({ length: 48 }, () => ({
      allNiPass: true,
      guardrailsPass: true,
      leadLowerPositive: true,
      leadZ: 1.2,
      zeroHarm: true,
    }));
    const nulls = Array.from({ length: 48 }, () => ({
      allNiPass: true,
      guardrailsPass: true,
      leadLowerPositive: false,
      leadZ: 0,
      zeroHarm: true,
    }));
    const result = powerSealedValidationV1({
      noBenefitVectors: nulls,
      poweredVectors: powered,
      runSeed: 'power',
      sampleSize: 48,
      simulations: 100,
    });
    expect(result.adequate).toBe(true);
    expect(() =>
      powerSealedValidationV1({
        noBenefitVectors: nulls,
        poweredVectors: powered,
        runSeed: 'power',
        sampleSize: 47,
      }),
    ).toThrow();
  });
});
