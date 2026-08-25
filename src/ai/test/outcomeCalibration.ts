import { createHash } from 'node:crypto';

import type { Player } from '@/domain';
import type { WdlBoundsV1 } from '@/ai/test/rootScoreEvidence';

export type OutcomeClassV1 = 'loss' | 'draw' | 'win';
export type OutcomeCalibrationPhaseV1 =
  | 'opening'
  | 'transport'
  | 'conversion'
  | 'finishing';

export type OutcomeCalibrationRowV1 = {
  lineageId: string;
  outcome: OutcomeClassV1;
  phase: OutcomeCalibrationPhaseV1;
  ply: 0 | 8 | 24 | 48 | 80 | 120;
  referenceScore: number;
  sideToMove: Player;
};

type FeatureTransformV1 = {
  means: number[];
  scoreMean: number;
  scoreSd: number;
  scoreKnots: [number, number, number, number];
  sds: number[];
};

export type OutcomeCalibrationModelV1 = {
  featureTransform: FeatureTransformV1;
  l2: 0.01 | 0.1 | 1 | 10;
  weights: number[][];
};

export type OutcomeCalibrationV1 = {
  accepted: boolean;
  artifactHash: string;
  classEce: Record<OutcomeClassV1, number>;
  macroEce: number;
  model: OutcomeCalibrationModelV1;
  outerFoldSelectedL2: Array<0.01 | 0.1 | 1 | 10>;
  priorBrier: number;
  software: 'youi-outcome-calibration-ts-v1';
  validationBrier: number;
  version: 1;
};

const CLASSES: OutcomeClassV1[] = ['loss', 'draw', 'win'];
const L2_GRID = [0.01, 0.1, 1, 10] as const;
const CORPUS_PLIES = [0, 8, 24, 48, 80, 120] as const;

export function selectOutcomeCalibrationCorpusV1(
  traces: Array<{
    lineageId: string;
    states: OutcomeCalibrationRowV1[];
  }>,
): OutcomeCalibrationRowV1[] {
  return traces.flatMap((trace) => {
    const byPly = new Map(trace.states.map((row) => [row.ply, row]));
    return CORPUS_PLIES.flatMap((ply) => {
      const row = byPly.get(ply);
      if (!row) return [];
      if (row.lineageId !== trace.lineageId)
        throw new Error('Outcome corpus lineage identity mismatch.');
      return [row];
    }).slice(0, 6);
  });
}

function hashText(value: string): number {
  const digest = createHash('sha256').update(value).digest();
  return digest.readUInt32BE(0);
}

function quantile(values: number[], probability: number): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const fraction = position - lower;
  return (
    sorted[lower] * (1 - fraction) + sorted[Math.ceil(position)] * fraction
  );
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sd(values: number[], center = mean(values)): number {
  return Math.max(
    1e-9,
    Math.sqrt(
      values.reduce((sum, value) => sum + (value - center) ** 2, 0) /
        Math.max(1, values.length - 1),
    ),
  );
}

function naturalSpline3(x: number, knots: [number, number, number, number]) {
  const cube = (value: number) => Math.max(0, value) ** 3;
  const d = (index: 0 | 1 | 2) =>
    (cube(x - knots[index]) - cube(x - knots[3])) /
    Math.max(1e-9, knots[3] - knots[index]);
  const anchor = d(2);
  return [x, d(0) - anchor, d(1) - anchor];
}

function rawFeatures(
  row: Pick<OutcomeCalibrationRowV1, 'phase' | 'referenceScore' | 'sideToMove'>,
  scoreMean: number,
  scoreSd: number,
  knots: [number, number, number, number],
): number[] {
  const score = (row.referenceScore - scoreMean) / scoreSd;
  return [
    ...naturalSpline3(score, knots),
    row.phase === 'transport' ? 1 : 0,
    row.phase === 'conversion' ? 1 : 0,
    row.phase === 'finishing' ? 1 : 0,
    row.sideToMove === 'black' ? 1 : 0,
  ];
}

function fitTransform(rows: OutcomeCalibrationRowV1[]): FeatureTransformV1 {
  const scores = rows.map((row) => row.referenceScore);
  const scoreMean = mean(scores);
  const scoreSd = sd(scores, scoreMean);
  const normalized = scores.map((score) => (score - scoreMean) / scoreSd);
  const scoreKnots: [number, number, number, number] = [
    Math.min(...normalized),
    quantile(normalized, 1 / 3),
    quantile(normalized, 2 / 3),
    Math.max(...normalized),
  ];
  const raw = rows.map((row) =>
    rawFeatures(row, scoreMean, scoreSd, scoreKnots),
  );
  const means = raw[0].map((_, index) => mean(raw.map((row) => row[index])));
  const sds = means.map((center, index) =>
    sd(
      raw.map((row) => row[index]),
      center,
    ),
  );
  return { means, scoreMean, scoreSd, scoreKnots, sds };
}

function features(
  row: Pick<OutcomeCalibrationRowV1, 'phase' | 'referenceScore' | 'sideToMove'>,
  transform: FeatureTransformV1,
) {
  const raw = rawFeatures(
    row,
    transform.scoreMean,
    transform.scoreSd,
    transform.scoreKnots,
  );
  return [
    1,
    ...raw.map(
      (value, index) => (value - transform.means[index]) / transform.sds[index],
    ),
  ];
}

function softmax(logits: number[]): number[] {
  const maximum = Math.max(...logits);
  const exponentials = logits.map((value) => Math.exp(value - maximum));
  const total = exponentials.reduce((sum, value) => sum + value, 0);
  return exponentials.map((value) => value / total);
}

function lineageWeights(rows: OutcomeCalibrationRowV1[]) {
  const counts = new Map<string, number>();
  for (const row of rows)
    counts.set(row.lineageId, (counts.get(row.lineageId) ?? 0) + 1);
  const lineageCount = counts.size;
  return rows.map(
    (row) => rows.length / (lineageCount * (counts.get(row.lineageId) ?? 1)),
  );
}

function trainingWeights(rows: OutcomeCalibrationRowV1[]) {
  const base = lineageWeights(rows);
  const classMass = new Map(
    CLASSES.map((value) => [
      value,
      rows.reduce(
        (sum, row, index) => sum + (row.outcome === value ? base[index] : 0),
        0,
      ),
    ]),
  );
  const raw = rows.map(
    (row, index) =>
      base[index] * (rows.length / (3 * (classMass.get(row.outcome) ?? 1))),
  );
  const scale = mean(raw);
  return raw.map((value) => Math.min(5, value / scale));
}

function fitModel(
  rows: OutcomeCalibrationRowV1[],
  l2: (typeof L2_GRID)[number],
): OutcomeCalibrationModelV1 {
  const featureTransform = fitTransform(rows);
  const x = rows.map((row) => features(row, featureTransform));
  const weights = CLASSES.map(() => Array(x[0].length).fill(0));
  const priors = CLASSES.map(
    (value) => rows.filter((row) => row.outcome === value).length / rows.length,
  );
  priors.forEach((prior, index) => {
    weights[index][0] = Math.log(Math.max(1e-9, prior));
  });
  const sampleWeights = trainingWeights(rows);
  let learningRate = 0.2;
  let previousLoss = Number.POSITIVE_INFINITY;
  for (let iteration = 0; iteration < 600; iteration += 1) {
    const gradient = weights.map((row) => row.map(() => 0));
    let loss = 0;
    rows.forEach((row, rowIndex) => {
      const probabilities = softmax(
        weights.map((classWeightsRow) =>
          classWeightsRow.reduce(
            (sum, value, index) => sum + value * x[rowIndex][index],
            0,
          ),
        ),
      );
      const target = CLASSES.indexOf(row.outcome);
      loss -=
        sampleWeights[rowIndex] *
        Math.log(Math.max(1e-12, probabilities[target]));
      for (let classIndex = 0; classIndex < CLASSES.length; classIndex += 1) {
        const residual =
          probabilities[classIndex] - (classIndex === target ? 1 : 0);
        for (let feature = 0; feature < x[rowIndex].length; feature += 1) {
          gradient[classIndex][feature] +=
            sampleWeights[rowIndex] * residual * x[rowIndex][feature];
        }
      }
    });
    for (let classIndex = 0; classIndex < weights.length; classIndex += 1) {
      for (
        let feature = 1;
        feature < weights[classIndex].length;
        feature += 1
      ) {
        loss += 0.5 * l2 * weights[classIndex][feature] ** 2;
        gradient[classIndex][feature] += l2 * weights[classIndex][feature];
      }
    }
    if (loss > previousLoss) learningRate *= 0.5;
    previousLoss = loss;
    const scale = learningRate / rows.length;
    let maximumStep = 0;
    for (let classIndex = 0; classIndex < weights.length; classIndex += 1) {
      for (
        let feature = 0;
        feature < weights[classIndex].length;
        feature += 1
      ) {
        const step = scale * gradient[classIndex][feature];
        weights[classIndex][feature] -= step;
        maximumStep = Math.max(maximumStep, Math.abs(step));
      }
    }
    if (maximumStep < 1e-8) break;
  }
  return { featureTransform, l2, weights };
}

export function predictOutcomeProbabilitiesV1(
  model: OutcomeCalibrationModelV1,
  row: Pick<OutcomeCalibrationRowV1, 'phase' | 'referenceScore' | 'sideToMove'>,
): Record<OutcomeClassV1, number> {
  const x = features(row, model.featureTransform);
  const probabilities = softmax(
    model.weights.map((rowWeights) =>
      rowWeights.reduce((sum, value, index) => sum + value * x[index], 0),
    ),
  );
  return {
    loss: probabilities[0],
    draw: probabilities[1],
    win: probabilities[2],
  };
}

function brier(
  rows: OutcomeCalibrationRowV1[],
  probabilities: Array<Record<OutcomeClassV1, number>>,
) {
  const weights = lineageWeights(rows);
  return (
    rows.reduce(
      (total, row, index) =>
        total +
        weights[index] *
          CLASSES.reduce(
            (sum, value) =>
              sum +
              (probabilities[index][value] - (row.outcome === value ? 1 : 0)) **
                2,
            0,
          ),
      0,
    ) / weights.reduce((sum, value) => sum + value, 0)
  );
}

function empiricalPrior(rows: OutcomeCalibrationRowV1[]) {
  const weights = lineageWeights(rows);
  const total = weights.reduce((sum, value) => sum + value, 0);
  return Object.fromEntries(
    CLASSES.map((value) => [
      value,
      rows.reduce(
        (sum, row, index) => sum + (row.outcome === value ? weights[index] : 0),
        0,
      ) / total,
    ]),
  ) as Record<OutcomeClassV1, number>;
}

function ece(
  rows: OutcomeCalibrationRowV1[],
  probabilities: Array<Record<OutcomeClassV1, number>>,
  outcome: OutcomeClassV1,
) {
  const lineageWeight = lineageWeights(rows);
  const ordered = rows
    .map((row, index) => ({
      observed: row.outcome === outcome ? 1 : 0,
      probability: probabilities[index][outcome],
      weight: lineageWeight[index],
    }))
    .sort((a, b) => a.probability - b.probability);
  const bins = Math.min(15, ordered.length);
  const totalWeight = ordered.reduce((sum, entry) => sum + entry.weight, 0);
  let total = 0;
  for (let bin = 0; bin < bins; bin += 1) {
    const start = Math.floor((bin * ordered.length) / bins);
    const end = Math.floor(((bin + 1) * ordered.length) / bins);
    const entries = ordered.slice(start, end);
    const binWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
    total +=
      (binWeight / totalWeight) *
      Math.abs(
        entries.reduce(
          (sum, entry) => sum + entry.weight * entry.probability,
          0,
        ) /
          binWeight -
          entries.reduce(
            (sum, entry) => sum + entry.weight * entry.observed,
            0,
          ) /
            binWeight,
      );
  }
  return total;
}

function chooseL2(rows: OutcomeCalibrationRowV1[], outerFold: number) {
  const scores = L2_GRID.map((l2) => {
    const foldScores: number[] = [];
    for (let fold = 0; fold < 4; fold += 1) {
      const validation = rows.filter(
        (row) => hashText(`${outerFold}:${row.lineageId}`) % 4 === fold,
      );
      const training = rows.filter(
        (row) => hashText(`${outerFold}:${row.lineageId}`) % 4 !== fold,
      );
      if (!training.length || !validation.length) continue;
      const model = fitModel(training, l2);
      foldScores.push(
        brier(
          validation,
          validation.map((row) => predictOutcomeProbabilitiesV1(model, row)),
        ),
      );
    }
    return {
      l2,
      score: foldScores.length ? mean(foldScores) : Number.POSITIVE_INFINITY,
    };
  });
  return scores.sort((a, b) => a.score - b.score || a.l2 - b.l2)[0].l2;
}

export function fitOutcomeCalibrationV1(
  rows: OutcomeCalibrationRowV1[],
): OutcomeCalibrationV1 {
  const lineages = new Set(rows.map((row) => row.lineageId));
  if (lineages.size < 20)
    throw new Error('Outcome calibration requires at least 20 lineages.');
  const predictions: Array<Record<OutcomeClassV1, number> | null> = rows.map(
    () => null,
  );
  const priors: Array<Record<OutcomeClassV1, number> | null> = rows.map(
    () => null,
  );
  const outerFoldSelectedL2: Array<(typeof L2_GRID)[number]> = [];
  for (let fold = 0; fold < 5; fold += 1) {
    const training = rows.filter((row) => hashText(row.lineageId) % 5 !== fold);
    const validationIndices = rows.flatMap((row, index) =>
      hashText(row.lineageId) % 5 === fold ? [index] : [],
    );
    if (!training.length || !validationIndices.length) continue;
    const selected = chooseL2(training, fold);
    outerFoldSelectedL2.push(selected);
    const model = fitModel(training, selected);
    const prior = empiricalPrior(training);
    for (const index of validationIndices) {
      predictions[index] = predictOutcomeProbabilitiesV1(model, rows[index]);
      priors[index] = prior;
    }
  }
  if (predictions.some((value) => value === null))
    throw new Error('Outer lineage CV did not predict every row.');
  const resolvedPredictions = predictions as Array<
    Record<OutcomeClassV1, number>
  >;
  const resolvedPriors = priors as Array<Record<OutcomeClassV1, number>>;
  const counts = new Map(
    L2_GRID.map((l2) => [
      l2,
      outerFoldSelectedL2.filter((value) => value === l2).length,
    ]),
  );
  const selectedL2 = L2_GRID.slice().sort(
    (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a - b,
  )[0];
  const validationBrier = brier(rows, resolvedPredictions);
  const priorBrier = brier(rows, resolvedPriors);
  const classEce = Object.fromEntries(
    CLASSES.map((value) => [value, ece(rows, resolvedPredictions, value)]),
  ) as Record<OutcomeClassV1, number>;
  const macroEce = mean(Object.values(classEce));
  const model = fitModel(rows, selectedL2);
  const body = {
    accepted:
      validationBrier < priorBrier &&
      macroEce <= 0.05 &&
      Object.values(classEce).every((value) => value <= 0.075),
    classEce,
    macroEce,
    model,
    outerFoldSelectedL2,
    priorBrier,
    software: 'youi-outcome-calibration-ts-v1' as const,
    validationBrier,
    version: 1 as const,
  };
  return {
    ...body,
    artifactHash: createHash('sha256')
      .update(JSON.stringify(body))
      .digest('hex'),
  };
}

export function classifyCalibratedOutcomeV1(
  probabilities: Record<OutcomeClassV1, number>,
): OutcomeClassV1 | 'uncertain' {
  const ordered = CLASSES.map((value) => ({
    value,
    probability: probabilities[value],
  })).sort((a, b) => b.probability - a.probability);
  const best = ordered[0];
  const margin = best.probability - ordered[1].probability;
  if (best.value === 'draw')
    return best.probability >= 0.5 && margin >= 0.1 ? 'draw' : 'uncertain';
  return best.probability >= 0.6 && margin >= 0.15 ? best.value : 'uncertain';
}

export function constrainCalibratedOutcomeV1(
  probabilities: Record<OutcomeClassV1, number>,
  bounds: WdlBoundsV1,
): {
  class: OutcomeClassV1 | 'uncertain' | 'unknown';
  probabilities: Record<OutcomeClassV1, number>;
} {
  const rank = { loss: 0, draw: 1, win: 2 } as const;
  const allowed = CLASSES.filter(
    (value) =>
      rank[value] >= rank[bounds.lower] && rank[value] <= rank[bounds.upper],
  );
  const disallowedMass = CLASSES.filter(
    (value) => !allowed.includes(value),
  ).reduce((sum, value) => sum + probabilities[value], 0);
  if (disallowedMass > 0.25) return { class: 'unknown', probabilities };
  const retained = allowed.reduce(
    (sum, value) => sum + probabilities[value],
    0,
  );
  const masked = Object.fromEntries(
    CLASSES.map((value) => [
      value,
      allowed.includes(value) ? probabilities[value] / retained : 0,
    ]),
  ) as Record<OutcomeClassV1, number>;
  return { class: classifyCalibratedOutcomeV1(masked), probabilities: masked };
}

export function isHighDrawTrapV1(
  drawRisk: number,
  probabilities: Record<OutcomeClassV1, number>,
) {
  return Math.max(drawRisk, probabilities.draw) >= 0.72;
}
