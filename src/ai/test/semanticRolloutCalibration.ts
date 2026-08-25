export type SemanticRolloutCalibrationObservationV1 = {
  classKey: string;
  decisionId: string;
  hill1: number;
  horizon: 1 | 4 | 8;
  metrics: [number, number, number, number, number, number];
  rolloutCount: 8 | 16 | 32 | 64;
};

export type SemanticRolloutCalibrationV1 = {
  candidates: Array<{
    classAgreement: number;
    hill1Mae: number;
    passed: boolean;
    rmse: number;
    rolloutCount: 8 | 16 | 32;
  }>;
  chosenRolloutCount: 8 | 16 | 32 | 64;
  directionReversal: boolean;
  mayBeSoleLead: boolean;
  version: 1;
};

function compare(
  observations: SemanticRolloutCalibrationObservationV1[],
  rolloutCount: 8 | 16 | 32,
) {
  const candidate = observations.filter(
    (row) => row.rolloutCount === rolloutCount,
  );
  const reference = new Map(
    observations
      .filter((row) => row.rolloutCount === 64)
      .map((row) => [`${row.decisionId}:${row.horizon}`, row]),
  );
  if (
    !candidate.length ||
    candidate.some((row) => !reference.has(`${row.decisionId}:${row.horizon}`))
  )
    throw new Error(`Incomplete semantic calibration for N=${rolloutCount}.`);
  const pairs = candidate.map(
    (row) => [row, reference.get(`${row.decisionId}:${row.horizon}`)!] as const,
  );
  const classAgreement =
    pairs.filter(([left, right]) => left.classKey === right.classKey).length /
    pairs.length;
  const squared = pairs.flatMap(([left, right]) =>
    left.metrics.map((value, index) => (value - right.metrics[index]) ** 2),
  );
  const rmse = Math.sqrt(
    squared.reduce((sum, value) => sum + value, 0) / squared.length,
  );
  const hill1Mae =
    pairs.reduce(
      (sum, [left, right]) => sum + Math.abs(left.hill1 - right.hill1),
      0,
    ) / pairs.length;
  return {
    classAgreement,
    hill1Mae,
    passed: classAgreement >= 0.95 && rmse <= 0.05 && hill1Mae <= 0.1,
    rmse,
    rolloutCount,
  };
}

/** Applies every H1/H4/H8 stability threshold against the frozen N=64 target. */
export function calibrateSemanticRolloutStabilityV1({
  horizonEffects,
  observations,
}: {
  horizonEffects: Array<{
    effect: number;
    horizon: 1 | 4 | 8;
    standardDeviation: number;
  }>;
  observations: SemanticRolloutCalibrationObservationV1[];
}): SemanticRolloutCalibrationV1 {
  for (const horizon of [1, 4, 8] as const) {
    if (
      !observations.some(
        (row) => row.horizon === horizon && row.rolloutCount === 64,
      )
    )
      throw new Error(`Missing N=64 semantic target at H${horizon}.`);
  }
  const candidates = ([8, 16, 32] as const).map((count) =>
    compare(observations, count),
  );
  const normalized = horizonEffects.map((row) => ({
    ...row,
    standardized: row.effect / Math.max(row.standardDeviation, 0.1),
  }));
  const primary = normalized.find((row) => row.horizon === 4);
  if (!primary || normalized.length !== 3)
    throw new Error('H1/H4/H8 effects are required.');
  const directionReversal = normalized.some(
    (row) =>
      row.horizon !== 4 &&
      Math.sign(row.standardized) !== Math.sign(primary.standardized),
  );
  return {
    candidates,
    chosenRolloutCount:
      candidates.find((candidate) => candidate.passed)?.rolloutCount ?? 64,
    directionReversal,
    mayBeSoleLead: !directionReversal,
    version: 1,
  };
}
