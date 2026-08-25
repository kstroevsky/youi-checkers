import { describe, expect, it } from 'vitest';

import {
  evaluateCompleteSealedRuleV1,
  powerSealedValidationV1,
  SEALED_DIFFICULTIES_V1,
  SEALED_PRIMARY_ENDPOINTS_V1,
  type SealedLineageVectorV1,
  type SealedPowerScenarioV1,
} from '@/ai/test/sealedPower';

function vector(
  lineageId: string,
  options: {
    guardrailValue?: number;
    niHarm?: boolean;
    wdl?: boolean;
    z: number;
  },
): SealedLineageVectorV1 {
  const guardrails = {} as SealedLineageVectorV1['guardrails'];
  for (const difficulty of SEALED_DIFFICULTIES_V1) {
    guardrails[difficulty] = {
      suppressionIncrease: {
        direction: 'atMost',
        threshold: 0.1,
        value: options.guardrailValue ?? 0,
      },
    };
  }
  return {
    endpointZ: Object.fromEntries(
      SEALED_DIFFICULTIES_V1.map((difficulty) => [
        difficulty,
        Object.fromEntries(
          SEALED_PRIMARY_ENDPOINTS_V1.map((endpoint) => [
            endpoint,
            options.niHarm &&
            difficulty === 'hard' &&
            endpoint === 'counterplayD1'
              ? -1.2
              : options.z,
          ]),
        ),
      ]),
    ) as SealedLineageVectorV1['endpointZ'],
    exactWdlDowngrade: options.wdl ?? false,
    guardrails,
    lineageId,
  };
}

const externalGates = {
  performancePassed: true,
  strengthPassed: true,
  symmetryPassed: true,
};

describe('sealed validation power', () => {
  it('recomputes all twelve NI gates, lead, guardrails, and WDL from vectors', () => {
    const result = evaluateCompleteSealedRuleV1({
      bootstrapResamples: 20,
      externalGates,
      frozenLead: 'meaningfulFutureD1',
      replicate: 0,
      runSeed: 'complete-rule',
      vectors: Array.from({ length: 48 }, (_, index) =>
        vector(`lineage-${index}`, { z: 1.2 }),
      ),
    });
    expect(result.passed).toBe(true);
    expect(
      SEALED_DIFFICULTIES_V1.flatMap((difficulty) =>
        SEALED_PRIMARY_ENDPOINTS_V1.map(
          (endpoint) => result.twelveNiLowerBounds[difficulty][endpoint],
        ),
      ),
    ).toHaveLength(12);
  });

  it('powers every required scenario from complete correlated lineage blocks', () => {
    const scenario = (
      id: string,
      kind: SealedPowerScenarioV1['kind'],
      options: Parameters<typeof vector>[1],
    ): SealedPowerScenarioV1 => ({
      externalGates,
      id,
      kind,
      vectors: Array.from({ length: 48 }, (_, index) =>
        vector(`${id}-${index}`, options),
      ),
    });
    const result = powerSealedValidationV1({
      bootstrapResamples: 10,
      frozenLead: 'meaningfulFutureD1',
      runSeed: 'power',
      sampleSize: 48,
      scenarios: [
        scenario('powered', 'powered', { z: 1.2 }),
        scenario('null', 'noBenefit', { z: 0 }),
        scenario('ni-harm', 'niHarmBoundary', { niHarm: true, z: 1.2 }),
        scenario('guardrail', 'guardrailBoundary', {
          guardrailValue: 0.2,
          z: 1.2,
        }),
      ],
      simulations: 20,
    });
    expect(result).toMatchObject({
      adequate: true,
      boundaryFalsePass: 0,
      falseLeadPass: 0,
      poweredPass: 1,
    });
    expect(() =>
      powerSealedValidationV1({
        frozenLead: 'meaningfulFutureD1',
        runSeed: 'power',
        sampleSize: 47,
        scenarios: [],
      }),
    ).toThrow(/at least 48/u);
  });
});
