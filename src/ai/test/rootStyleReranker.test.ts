import { describe, expect, it } from 'vitest';

import {
  calibrateRootStyleV1,
  rerankRootStyleV1,
  type RootStyleCalibrationV1,
  type RootStyleRawFeaturesV1,
} from '@/ai/rootStyleReranker';

const calibration = Object.fromEntries(
  [
    'history',
    'participation',
    'persona',
    'plan',
    'progress',
    'risk',
    'strength',
  ].map((name) => [name, { iqr: 1, median: 0 }]),
) as RootStyleCalibrationV1;
function row(target: 'A2' | 'B1', family: string): RootStyleRawFeaturesV1 {
  return {
    action: { source: 'A1', target, type: 'moveSingleToEmpty' },
    actionKind: 'moveSingleToEmpty',
    drawTrapRisk: 0.2,
    history: 0,
    participation: 0,
    persona: 0,
    plan: 0.25,
    productRegret: 0,
    progress: 0,
    sourceFamily: family,
    strategicIntent: 'hybrid',
    tactical: false,
    tags: [],
    terminalClass: 'nonterminal',
  };
}

describe('duplicate-invariant root reranker', () => {
  it('freezes treatment-independent median/IQR preprocessing from baseline rows', () => {
    const fitted = calibrateRootStyleV1([
      { ...row('A2', 'family-a'), participation: -2 },
      { ...row('B1', 'family-b'), participation: 0 },
      { ...row('A2', 'family-c'), participation: 2 },
    ]);
    expect(fitted.participation).toEqual({ iqr: 2, median: 0 });
    expect(fitted.strength.median).toBe(0);
  });

  it('preserves family mass when an equivalence-class member is duplicated', () => {
    const a = row('A2', 'family-a');
    const b = row('B1', 'family-b');
    const before = rerankRootStyleV1({
      calibration,
      rows: [a, b],
      temperature: 1,
    });
    const after = rerankRootStyleV1({
      calibration,
      rows: [a, { ...a }, b],
      temperature: 1,
    });
    const mass = (values: typeof before, family: string) =>
      values
        .filter((value) => value.family === family)
        .reduce((sum, value) => sum + value.probability, 0);
    expect(mass(after, 'family-a')).toBeCloseTo(mass(before, 'family-a'));
    expect(
      after.reduce((sum, value) => sum + value.probability, 0),
    ).toBeCloseTo(1);
  });
});
