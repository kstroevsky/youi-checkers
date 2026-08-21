import { namedInteger } from '@/ai/test/namedRng.node';

export type SealedPowerVectorV1 = {
  allNiPass: boolean;
  guardrailsPass: boolean;
  leadLowerPositive: boolean;
  leadZ: number;
  zeroHarm: boolean;
};

export function powerSealedValidationV1({
  noBenefitVectors,
  poweredVectors,
  runSeed,
  sampleSize,
  simulations = 10_000,
}: {
  noBenefitVectors: SealedPowerVectorV1[];
  poweredVectors: SealedPowerVectorV1[];
  runSeed: string;
  sampleSize: number;
  simulations?: number;
}) {
  if (sampleSize < 48)
    throw new Error('Sealed validation requires at least 48 complete blocks.');
  const estimate = (vectors: SealedPowerVectorV1[], variant: string) => {
    let passes = 0;
    for (let replicate = 0; replicate < simulations; replicate += 1) {
      const sampled = Array.from(
        { length: sampleSize },
        (_, draw) =>
          vectors[
            namedInteger(
              {
                lineageId: 'sealed-power',
                purpose: 'powerSimulation',
                replicate,
                runSeed,
                variant,
              },
              vectors.length,
              draw,
            )
          ],
      );
      const passShare =
        sampled.filter(
          (row) =>
            row.zeroHarm &&
            row.allNiPass &&
            row.guardrailsPass &&
            row.leadZ >= 1 &&
            row.leadLowerPositive,
        ).length / sampled.length;
      if (passShare >= 0.8) passes += 1;
    }
    return passes / simulations;
  };
  const completeRulePass = estimate(poweredVectors, 'powered');
  const falseLeadPass = estimate(noBenefitVectors, 'no-benefit');
  return {
    adequate: completeRulePass >= 0.8 && falseLeadPass <= 0.05,
    completeRulePass,
    falseLeadPass,
    sampleSize,
    simulations,
    version: 1 as const,
  };
}
