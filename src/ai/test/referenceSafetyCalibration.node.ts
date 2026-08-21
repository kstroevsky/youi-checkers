import { createHash } from 'node:crypto';

import { namedUniform } from '@/ai/test/namedRng.node';

export type ReferenceToleranceTrialV1 = {
  cutoff: number;
  exactWdlDowngrade: boolean;
  lineageId: string;
  pointShareLoss: number;
  rootId: string;
  worstAdmittedActionKey: string;
};

export type ReferenceToleranceCutoffResultV1 = {
  cutoff: number;
  exactWdlDowngradeCount: number;
  lineageCount: number;
  meanPointShareLoss: number;
  simultaneousUpperPointShareLoss: number;
};

export type ReferenceToleranceV1 = {
  artifactHash: string;
  bootstrapResamples: 10_000;
  cutoffResults: ReferenceToleranceCutoffResultV1[];
  maxAllowedPointShareLoss: 0.03;
  selectedCutoff: number;
  version: 1;
};

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(',')}}`;
}

function hash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function quantile(values: number[], probability: number): number {
  if (!values.length) return Number.NaN;
  const sorted = values.slice().sort((left, right) => left - right);
  const index = Math.ceil(probability * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

export function referenceToleranceGridV1(regrets: number[]): number[] {
  const positive = regrets.filter((regret) => regret > 0);
  if (!positive.length) return [0];
  return [
    0,
    ...[0.25, 0.5, 0.75, 0.9, 0.95].map((probability) =>
      quantile(positive, probability),
    ),
  ]
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort((left, right) => left - right);
}

function lineageMeans(
  trials: ReferenceToleranceTrialV1[],
  cutoff: number,
  lineageIds: string[],
): number[] {
  return lineageIds.map((lineageId) => {
    const values = trials.filter(
      (trial) => trial.cutoff === cutoff && trial.lineageId === lineageId,
    );
    if (!values.length)
      throw new Error(`Missing cutoff ${cutoff} for lineage ${lineageId}.`);
    return (
      values.reduce((sum, trial) => sum + trial.pointShareLoss, 0) /
      values.length
    );
  });
}

/**
 * Calibrates the largest safe cutoff with paired lineage max-stat bootstrap.
 * All cutoffs share each resampled lineage index, preserving CRN dependence.
 */
export function calibrateReferenceToleranceV1({
  runSeed,
  trials,
}: {
  runSeed: string;
  trials: ReferenceToleranceTrialV1[];
}): ReferenceToleranceV1 {
  if (!trials.length) throw new Error('Tolerance calibration requires trials.');
  const cutoffs = [...new Set(trials.map((trial) => trial.cutoff))].sort(
    (left, right) => left - right,
  );
  if (cutoffs[0] !== 0) throw new Error('Tolerance grid must include zero.');
  const lineageIds = [
    ...new Set(trials.map((trial) => trial.lineageId)),
  ].sort();
  const values = new Map(
    cutoffs.map((cutoff) => [cutoff, lineageMeans(trials, cutoff, lineageIds)]),
  );
  const means = new Map(
    cutoffs.map((cutoff) => {
      const entries = values.get(cutoff) ?? [];
      return [
        cutoff,
        entries.reduce((sum, value) => sum + value, 0) / entries.length,
      ];
    }),
  );
  const maxCentered: number[] = [];
  for (let replicate = 0; replicate < 10_000; replicate += 1) {
    const sampledIndices = lineageIds.map((lineageId, draw) =>
      Math.floor(
        namedUniform({
          lineageId,
          purpose: 'bootstrap',
          replicate,
          runSeed,
          variant: `reference-tolerance-draw-${draw}`,
        }) * lineageIds.length,
      ),
    );
    let maximum = Number.NEGATIVE_INFINITY;
    for (const cutoff of cutoffs) {
      const entries = values.get(cutoff) ?? [];
      const bootstrapMean =
        sampledIndices.reduce((sum, index) => sum + entries[index], 0) /
        sampledIndices.length;
      maximum = Math.max(maximum, bootstrapMean - (means.get(cutoff) ?? 0));
    }
    maxCentered.push(maximum);
  }
  const criticalValue = quantile(maxCentered, 0.95);
  const cutoffResults = cutoffs.map(
    (cutoff): ReferenceToleranceCutoffResultV1 => ({
      cutoff,
      exactWdlDowngradeCount: trials.filter(
        (trial) => trial.cutoff === cutoff && trial.exactWdlDowngrade,
      ).length,
      lineageCount: lineageIds.length,
      meanPointShareLoss: means.get(cutoff) ?? Number.NaN,
      simultaneousUpperPointShareLoss:
        (means.get(cutoff) ?? Number.NaN) + criticalValue,
    }),
  );
  const eligible = cutoffResults.filter(
    (result) =>
      result.simultaneousUpperPointShareLoss <= 0.03 &&
      result.exactWdlDowngradeCount === 0,
  );
  const body = {
    bootstrapResamples: 10_000 as const,
    cutoffResults,
    maxAllowedPointShareLoss: 0.03 as const,
    selectedCutoff: eligible.at(-1)?.cutoff ?? 0,
    version: 1 as const,
  };
  return { ...body, artifactHash: hash(body) };
}
