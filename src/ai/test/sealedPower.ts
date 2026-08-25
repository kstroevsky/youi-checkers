import { namedInteger } from '@/ai/test/namedRng.node';

export const SEALED_DIFFICULTIES_V1 = ['easy', 'medium', 'hard'] as const;
export const SEALED_PRIMARY_ENDPOINTS_V1 = [
  'avoidableFamilyRepeat',
  'counterplayD1',
  'meaningfulFutureD1',
  'rewardForThinking',
] as const;

export type SealedDifficultyV1 = (typeof SEALED_DIFFICULTIES_V1)[number];
export type SealedPrimaryEndpointV1 =
  (typeof SEALED_PRIMARY_ENDPOINTS_V1)[number];

export type SealedGuardrailObservationV1 = {
  direction: 'atLeast' | 'atMost';
  threshold: number;
  value: number;
};

/** One indivisible resampling block across every endpoint and difficulty. */
export type SealedLineageVectorV1 = {
  endpointZ: Record<
    SealedDifficultyV1,
    Record<SealedPrimaryEndpointV1, number | null>
  >;
  exactWdlDowngrade: boolean;
  guardrails: Record<
    SealedDifficultyV1,
    Record<string, SealedGuardrailObservationV1>
  >;
  lineageId: string;
};

export type SealedExternalGatesV1 = {
  performancePassed: boolean;
  strengthPassed: boolean;
  symmetryPassed: boolean;
};

export type SealedPowerScenarioV1 = {
  externalGates: SealedExternalGatesV1;
  id: string;
  kind: 'guardrailBoundary' | 'noBenefit' | 'niHarmBoundary' | 'powered';
  vectors: SealedLineageVectorV1[];
};

export type CompleteSealedRuleResultV1 = {
  allGuardrailsPass: boolean;
  allNiPass: boolean;
  exactWdlPassed: boolean;
  externalGatesPassed: boolean;
  leadLowerBound: number;
  leadMeanZ: number;
  passed: boolean;
  twelveNiLowerBounds: Record<
    SealedDifficultyV1,
    Record<SealedPrimaryEndpointV1, number>
  >;
  undefinedEndpointCount: number;
};

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function bootstrapBound(
  values: number[],
  direction: 'lower' | 'upper',
  options: {
    lineageIds: string[];
    replicate: number;
    resamples: number;
    runSeed: string;
    variant: string;
  },
) {
  const estimates = Array.from({ length: options.resamples }, (_, resample) =>
    mean(
      values.map(
        (_, draw) =>
          values[
            namedInteger(
              {
                lineageId: options.lineageIds[draw],
                purpose: 'bootstrap',
                replicate: options.replicate,
                runSeed: options.runSeed,
                variant: `${options.variant}:${resample}`,
              },
              values.length,
              draw,
            )
          ],
      ),
    ),
  ).sort((left, right) => left - right);
  const probability = direction === 'lower' ? 0.05 : 0.95;
  return estimates[Math.max(0, Math.ceil(probability * estimates.length) - 1)];
}

/** Recomputes every sealed gate from raw lineage observations. */
export function evaluateCompleteSealedRuleV1({
  bootstrapResamples,
  externalGates,
  frozenLead,
  replicate,
  runSeed,
  vectors,
}: {
  bootstrapResamples: number;
  externalGates: SealedExternalGatesV1;
  frozenLead: SealedPrimaryEndpointV1;
  replicate: number;
  runSeed: string;
  vectors: SealedLineageVectorV1[];
}): CompleteSealedRuleResultV1 {
  const lineageIds = vectors.map((vector) => vector.lineageId);
  let undefinedEndpointCount = 0;
  const twelveNiLowerBounds = Object.fromEntries(
    SEALED_DIFFICULTIES_V1.map((difficulty) => [
      difficulty,
      Object.fromEntries(
        SEALED_PRIMARY_ENDPOINTS_V1.map((endpoint) => {
          const values = vectors.flatMap((vector) => {
            const value = vector.endpointZ[difficulty][endpoint];
            if (value === null || !Number.isFinite(value)) {
              undefinedEndpointCount += 1;
              return [];
            }
            return [value];
          });
          return [
            endpoint,
            values.length === vectors.length
              ? bootstrapBound(values, 'lower', {
                  lineageIds,
                  replicate,
                  resamples: bootstrapResamples,
                  runSeed,
                  variant: `ni:${difficulty}:${endpoint}`,
                })
              : Number.NEGATIVE_INFINITY,
          ];
        }),
      ),
    ]),
  ) as CompleteSealedRuleResultV1['twelveNiLowerBounds'];
  const allNiPass = SEALED_DIFFICULTIES_V1.every((difficulty) =>
    SEALED_PRIMARY_ENDPOINTS_V1.every(
      (endpoint) => twelveNiLowerBounds[difficulty][endpoint] > -1,
    ),
  );
  const leadValues = vectors.flatMap((vector) => {
    const values = SEALED_DIFFICULTIES_V1.map(
      (difficulty) => vector.endpointZ[difficulty][frozenLead],
    );
    return values.some((value) => value === null || !Number.isFinite(value))
      ? []
      : [mean(values as number[])];
  });
  const leadMeanZ =
    leadValues.length === vectors.length
      ? mean(leadValues)
      : Number.NEGATIVE_INFINITY;
  const leadLowerBound =
    leadValues.length === vectors.length
      ? bootstrapBound(leadValues, 'lower', {
          lineageIds,
          replicate,
          resamples: bootstrapResamples,
          runSeed,
          variant: `lead:${frozenLead}`,
        })
      : Number.NEGATIVE_INFINITY;
  let allGuardrailsPass = true;
  for (const difficulty of SEALED_DIFFICULTIES_V1) {
    const names = new Set(
      vectors.flatMap((vector) => Object.keys(vector.guardrails[difficulty])),
    );
    for (const name of names) {
      const rows = vectors.map((vector) => vector.guardrails[difficulty][name]);
      if (
        rows.some(
          (row) =>
            !row ||
            row.direction !== rows[0]?.direction ||
            row.threshold !== rows[0]?.threshold,
        )
      ) {
        allGuardrailsPass = false;
        continue;
      }
      const bound = bootstrapBound(
        rows.map((row) => row.value),
        rows[0].direction === 'atLeast' ? 'lower' : 'upper',
        {
          lineageIds,
          replicate,
          resamples: bootstrapResamples,
          runSeed,
          variant: `guardrail:${difficulty}:${name}`,
        },
      );
      if (
        rows[0].direction === 'atLeast'
          ? bound < rows[0].threshold
          : bound > rows[0].threshold
      )
        allGuardrailsPass = false;
    }
  }
  const exactWdlPassed = vectors.every((vector) => !vector.exactWdlDowngrade);
  const externalGatesPassed =
    externalGates.performancePassed &&
    externalGates.strengthPassed &&
    externalGates.symmetryPassed;
  return {
    allGuardrailsPass,
    allNiPass,
    exactWdlPassed,
    externalGatesPassed,
    leadLowerBound,
    leadMeanZ,
    passed:
      undefinedEndpointCount === 0 &&
      allNiPass &&
      leadMeanZ >= 1 &&
      leadLowerBound > 0 &&
      allGuardrailsPass &&
      exactWdlPassed &&
      externalGatesPassed,
    twelveNiLowerBounds,
    undefinedEndpointCount,
  };
}

export function powerSealedValidationV1({
  bootstrapResamples = 1_000,
  frozenLead,
  runSeed,
  sampleSize,
  scenarios,
  simulations = 10_000,
}: {
  bootstrapResamples?: number;
  frozenLead: SealedPrimaryEndpointV1;
  runSeed: string;
  sampleSize: number;
  scenarios: SealedPowerScenarioV1[];
  simulations?: number;
}) {
  if (sampleSize < 48)
    throw new Error('Sealed validation requires at least 48 complete blocks.');
  for (const kind of [
    'powered',
    'noBenefit',
    'niHarmBoundary',
    'guardrailBoundary',
  ] as const) {
    if (!scenarios.some((scenario) => scenario.kind === kind))
      throw new Error(`Missing sealed power scenario ${kind}.`);
  }
  const scenarioResults = scenarios.map((scenario) => {
    if (scenario.vectors.length < sampleSize)
      throw new Error(
        `Scenario ${scenario.id} has fewer than ${sampleSize} vectors.`,
      );
    let passes = 0;
    for (let replicate = 0; replicate < simulations; replicate += 1) {
      const sampled = Array.from({ length: sampleSize }, (_, draw) => {
        const index = namedInteger(
          {
            lineageId: 'sealed-power',
            purpose: 'powerSimulation',
            replicate,
            runSeed,
            variant: scenario.id,
          },
          scenario.vectors.length,
          draw,
        );
        return scenario.vectors[index];
      });
      if (
        evaluateCompleteSealedRuleV1({
          bootstrapResamples,
          externalGates: scenario.externalGates,
          frozenLead,
          replicate,
          runSeed,
          vectors: sampled,
        }).passed
      )
        passes += 1;
    }
    return {
      id: scenario.id,
      kind: scenario.kind,
      passRate: passes / simulations,
    };
  });
  const poweredPass = Math.min(
    ...scenarioResults
      .filter((result) => result.kind === 'powered')
      .map((result) => result.passRate),
  );
  const falseLeadPass = Math.max(
    ...scenarioResults
      .filter((result) => result.kind === 'noBenefit')
      .map((result) => result.passRate),
  );
  const boundaryFalsePass = Math.max(
    ...scenarioResults
      .filter(
        (result) =>
          result.kind === 'niHarmBoundary' ||
          result.kind === 'guardrailBoundary',
      )
      .map((result) => result.passRate),
  );
  return {
    adequate:
      poweredPass >= 0.8 && falseLeadPass <= 0.05 && boundaryFalsePass <= 0.05,
    boundaryFalsePass,
    falseLeadPass,
    poweredPass,
    sampleSize,
    scenarioResults,
    simulations,
    version: 1 as const,
  };
}
