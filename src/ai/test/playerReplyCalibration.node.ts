import { createHash } from 'node:crypto';

import {
  calibrateReferenceToleranceV1,
  type ReferenceToleranceTrialV1,
  type ReferenceToleranceV1,
} from '@/ai/test/referenceSafetyCalibration.node';

export type PlayerReplySensitivityV1 = {
  counterplayMayBeSoleLead: boolean;
  directionRetained: boolean;
  records: Array<{
    effect: number;
    scale: 0.5 | 1 | 2;
    standardDeviation: number;
    standardizedEffect: number;
  }>;
  standardizedSpread: number;
};

export type PlayerReplyToleranceV1 = {
  artifactHash: string;
  calibration: ReferenceToleranceV1;
  selectedCutoff: number;
  sensitivity: PlayerReplySensitivityV1;
  version: 1;
};

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function evaluatePlayerReplySensitivityV1(
  records: Array<{
    effect: number;
    scale: 0.5 | 1 | 2;
    standardDeviation: number;
  }>,
): PlayerReplySensitivityV1 {
  const scales = records.map((record) => record.scale).sort();
  if (JSON.stringify(scales) !== JSON.stringify([0.5, 1, 2])) {
    throw new Error('Reply sensitivity requires exactly 0.5T, T, and 2T.');
  }
  const normalized = records
    .slice()
    .sort((left, right) => left.scale - right.scale)
    .map((record) => {
      if (!(record.standardDeviation > 0))
        throw new Error('Sensitivity standard deviations must be positive.');
      return {
        ...record,
        standardizedEffect: record.effect / record.standardDeviation,
      };
    });
  const signs = normalized.map((record) => Math.sign(record.effect));
  const directionRetained = signs.every(
    (sign) => sign !== 0 && sign === signs[0],
  );
  const standardized = normalized.map((record) => record.standardizedEffect);
  const standardizedSpread =
    Math.max(...standardized) - Math.min(...standardized);
  return {
    counterplayMayBeSoleLead: directionRetained && standardizedSpread <= 0.2,
    directionRetained,
    records: normalized,
    standardizedSpread,
  };
}

/** Uses the same worst-admitted/lineage bootstrap rule as reference safety. */
export function calibratePlayerReplyToleranceV1({
  runSeed,
  sensitivityRecords,
  trials,
}: {
  runSeed: string;
  sensitivityRecords: Parameters<typeof evaluatePlayerReplySensitivityV1>[0];
  trials: ReferenceToleranceTrialV1[];
}): PlayerReplyToleranceV1 {
  const calibration = calibrateReferenceToleranceV1({
    runSeed: `${runSeed}:player-reply`,
    trials,
  });
  const sensitivity = evaluatePlayerReplySensitivityV1(sensitivityRecords);
  const body = {
    calibration,
    selectedCutoff: calibration.selectedCutoff,
    sensitivity,
    version: 1 as const,
  };
  return { ...body, artifactHash: hash(body) };
}
