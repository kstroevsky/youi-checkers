import { describe, expect, it } from 'vitest';

import {
  classifyCalibratedOutcomeV1,
  constrainCalibratedOutcomeV1,
  fitOutcomeCalibrationV1,
  isHighDrawTrapV1,
  selectOutcomeCalibrationCorpusV1,
  type OutcomeCalibrationRowV1,
} from '@/ai/test/outcomeCalibration';

describe('OutcomeCalibrationV1', () => {
  it('fits deterministic nested lineage CV and emits a versioned model', () => {
    const rows: OutcomeCalibrationRowV1[] = Array.from(
      { length: 25 },
      (_, lineage) => {
        const outcome: OutcomeCalibrationRowV1['outcome'] =
          lineage % 3 === 0 ? 'loss' : lineage % 3 === 1 ? 'draw' : 'win';
        const referenceScore =
          outcome === 'loss' ? -3 : outcome === 'draw' ? 0 : 3;
        return ([0, 8, 24] as const).map((ply) => ({
          lineageId: `lineage-${lineage}`,
          outcome,
          phase: ply === 0 ? ('opening' as const) : ('transport' as const),
          ply,
          referenceScore: referenceScore + ply / 100,
          sideToMove: lineage % 2 ? ('black' as const) : ('white' as const),
        }));
      },
    ).flat();
    const first = fitOutcomeCalibrationV1(rows);
    const second = fitOutcomeCalibrationV1(rows);
    expect(first.artifactHash).toBe(second.artifactHash);
    expect(first.outerFoldSelectedL2).toHaveLength(5);
    expect(first.validationBrier).toBeLessThan(first.priorBrier);
  });

  it('uses the frozen class thresholds and WDL disallowed-mass rule', () => {
    expect(
      classifyCalibratedOutcomeV1({ draw: 0.1, loss: 0.1, win: 0.8 }),
    ).toBe('win');
    expect(
      constrainCalibratedOutcomeV1(
        { draw: 0.1, loss: 0.6, win: 0.3 },
        { lower: 'draw', upper: 'win' },
      ).class,
    ).toBe('unknown');
    expect(isHighDrawTrapV1(0.1, { draw: 0.72, loss: 0.14, win: 0.14 })).toBe(
      true,
    );
  });

  it('selects only root and the five frozen continuation plies per lineage', () => {
    const row = (
      ply: OutcomeCalibrationRowV1['ply'],
    ): OutcomeCalibrationRowV1 => ({
      lineageId: 'lineage',
      outcome: 'draw',
      phase: 'transport',
      ply,
      referenceScore: 0,
      sideToMove: 'white',
    });
    expect(
      selectOutcomeCalibrationCorpusV1([
        {
          lineageId: 'lineage',
          states: [0, 8, 24, 48, 80, 120].map((ply) =>
            row(ply as OutcomeCalibrationRowV1['ply']),
          ),
        },
      ]).map((entry) => entry.ply),
    ).toEqual([0, 8, 24, 48, 80, 120]);
  });
});
