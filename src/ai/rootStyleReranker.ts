import { actionKey } from '@/ai/search/shared';
import type { AiStrategicIntent, AiStrategicTag } from '@/ai/types';
import type { TurnAction } from '@/domain';

export type RootStyleRawFeaturesV1 = {
  action: TurnAction;
  actionKind: TurnAction['type'];
  drawTrapRisk: number | null;
  history: number | null;
  participation: number | null;
  persona: number | null;
  plan: -1 | 0.25 | 1 | null;
  progress: number | null;
  productRegret: number;
  sourceFamily: string;
  strategicIntent: AiStrategicIntent | 'unknown';
  tactical: boolean;
  tags: AiStrategicTag[];
  terminalClass: string;
};

type FeatureName =
  | 'history'
  | 'participation'
  | 'persona'
  | 'plan'
  | 'progress'
  | 'risk'
  | 'strength';
export type RootStyleCalibrationV1 = Record<
  FeatureName,
  { iqr: number; median: number }
>;

export type RootStyleProbabilityV1 = {
  action: TurnAction;
  actionKey: string;
  classKey: string;
  family: string;
  probability: number;
  utility: number;
};

const WEIGHTS: Record<FeatureName, number> = {
  history: 0.25,
  participation: 0.25,
  persona: 0.2,
  plan: 0.3,
  progress: 0.2,
  risk: 0.5,
  strength: 1,
};

function quantile(values: number[], probability: number) {
  const sorted = values.slice().sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const fraction = position - lower;
  return (
    sorted[lower] * (1 - fraction) + sorted[Math.ceil(position)] * fraction
  );
}

/** Fits treatment-independent per-difficulty median/IQR preprocessing. */
export function calibrateRootStyleV1(
  rows: RootStyleRawFeaturesV1[],
): RootStyleCalibrationV1 {
  if (!rows.length) throw new Error('Root style calibration requires rows.');
  const values: Record<FeatureName, number[]> = {
    history: rows.flatMap((row) => (row.history === null ? [] : [row.history])),
    participation: rows.flatMap((row) =>
      row.participation === null ? [] : [row.participation],
    ),
    persona: rows.flatMap((row) => (row.persona === null ? [] : [row.persona])),
    plan: rows.flatMap((row) => (row.plan === null ? [] : [row.plan])),
    progress: rows.flatMap((row) =>
      row.progress === null ? [] : [row.progress],
    ),
    risk: rows.flatMap((row) =>
      row.drawTrapRisk === null ? [] : [1 - row.drawTrapRisk],
    ),
    strength: rows.map((row) => -row.productRegret),
  };
  return Object.fromEntries(
    (Object.keys(values) as FeatureName[]).map((name) => {
      const present = values[name];
      if (!present.length) return [name, { iqr: 0, median: 0 }];
      return [
        name,
        {
          iqr:
            quantile(present, 0.75) - quantile(present, 0.25) === 0
              ? 0
              : quantile(present, 0.75) - quantile(present, 0.25),
          median: quantile(present, 0.5) === 0 ? 0 : quantile(present, 0.5),
        },
      ];
    }),
  ) as RootStyleCalibrationV1;
}

function z(
  value: number | null,
  calibration: { iqr: number; median: number },
): number {
  const resolved = value ?? calibration.median;
  return Math.max(
    -3,
    Math.min(
      3,
      (resolved - calibration.median) / Math.max(calibration.iqr, 1e-6),
    ),
  );
}
function band(value: number, boundaries: number[]): number {
  return boundaries.findIndex((boundary) => value < boundary) < 0
    ? boundaries.length
    : boundaries.findIndex((boundary) => value < boundary);
}
function softmax<T>(
  values: T[],
  score: (value: T) => number,
  temperature: number,
): Map<T, number> {
  const maximum = Math.max(...values.map(score));
  const weights = values.map((value) =>
    Math.exp((score(value) - maximum) / temperature),
  );
  const total = weights.reduce((sum, value) => sum + value, 0);
  return new Map(values.map((value, index) => [value, weights[index] / total]));
}

export function rootStyleEquivalenceClassV1(
  row: RootStyleRawFeaturesV1,
  participationZ: number,
): string {
  return JSON.stringify([
    row.sourceFamily,
    row.actionKind,
    row.terminalClass,
    row.strategicIntent,
    row.tags.slice().sort(),
    row.tactical,
    band(row.progress ?? 0, [-0.02, 0.0200000001]),
    band(row.drawTrapRisk ?? 0, [0.25, 0.72, 0.95]),
    band(participationZ, [-0.5, 0.5000000001]),
  ]);
}

/** Hierarchical family/class/action probabilities invariant to duplicate rows. */
export function rerankRootStyleV1({
  calibration,
  rows,
  temperature,
}: {
  calibration: RootStyleCalibrationV1;
  rows: RootStyleRawFeaturesV1[];
  temperature: 0.25 | 0.5 | 1 | 2;
}): RootStyleProbabilityV1[] {
  if (!rows.length) return [];
  const scored = rows.map((row) => {
    const features: Record<FeatureName, number | null> = {
      history: row.history,
      participation: row.participation,
      persona: row.persona,
      plan: row.plan,
      progress: row.progress,
      risk: row.drawTrapRisk === null ? null : 1 - row.drawTrapRisk,
      strength: -row.productRegret,
    };
    const standardized = Object.fromEntries(
      (Object.keys(WEIGHTS) as FeatureName[]).map((name) => [
        name,
        z(features[name], calibration[name]),
      ]),
    ) as Record<FeatureName, number>;
    const utility = (Object.keys(WEIGHTS) as FeatureName[]).reduce(
      (sum, name) => sum + WEIGHTS[name] * standardized[name],
      0,
    );
    return {
      action: row.action,
      actionKey: actionKey(row.action),
      classKey: rootStyleEquivalenceClassV1(row, standardized.participation),
      family: row.sourceFamily,
      utility,
    };
  });
  const classes = new Map<string, typeof scored>();
  for (const row of scored)
    classes.set(row.classKey, [...(classes.get(row.classKey) ?? []), row]);
  const classRows = [...classes.entries()].map(([classKey, members]) => ({
    classKey,
    family: members[0].family,
    members,
    utility: Math.max(...members.map((member) => member.utility)),
  }));
  const families = [...new Set(classRows.map((entry) => entry.family))];
  const familyUtility = new Map(
    families.map((family) => [
      family,
      Math.max(
        ...classRows
          .filter((entry) => entry.family === family)
          .map((entry) => entry.utility),
      ),
    ]),
  );
  const familyProbabilities = softmax(
    families,
    (family) => familyUtility.get(family)!,
    temperature,
  );
  return classRows.flatMap((classRow) => {
    const siblings = classRows.filter(
      (entry) => entry.family === classRow.family,
    );
    const classProbabilities = softmax(
      siblings,
      (entry) => entry.utility,
      temperature,
    );
    const classMass =
      familyProbabilities.get(classRow.family)! *
      classProbabilities.get(classRow)!;
    return classRow.members.map((member) => ({
      ...member,
      probability: classMass / classRow.members.length,
    }));
  });
}
