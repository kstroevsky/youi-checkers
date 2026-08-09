import { describe, expect, it } from 'vitest';

import { createSearchDiagnostics } from '@/ai/search/result';
import {
  summarizeEffectiveDiversity,
  summarizeNumericDistribution,
  summarizePairedDifference,
  summarizeProportion,
  summarizeSearchExecutions,
} from '@/ai/test/measurement';

describe('AI measurement statistics', () => {
  it('preserves distribution shape and deterministic uncertainty intervals', () => {
    const summary = summarizeNumericDistribution([1, 2, 3, 4, 100]);

    expect(summary).toMatchObject({
      count: 5,
      maximum: 100,
      mean: 22,
      median: 3,
      minimum: 1,
    });
    expect(summary.meanCi95.low).toBeLessThanOrEqual(summary.mean);
    expect(summary.meanCi95.high).toBeGreaterThanOrEqual(summary.mean);
    expect(summary.medianCi95.low).toBeLessThanOrEqual(summary.median);
    expect(summary.medianCi95.high).toBeGreaterThanOrEqual(summary.median);
    expect(summarizeNumericDistribution([1, 2, 3, 4, 100])).toEqual(summary);
  });

  it('uses Wilson intervals so an observed zero is not reported as certainty', () => {
    const summary = summarizeProportion(0, 10);

    expect(summary.share).toBe(0);
    expect(summary.wilsonCi95.low).toBe(0);
    expect(summary.wilsonCi95.high).toBeGreaterThan(0);
  });

  it('reports effective behavior counts at multiple Hill orders', () => {
    const balanced = summarizeEffectiveDiversity({ a: 10, b: 10, c: 10 });
    const concentrated = summarizeEffectiveDiversity({ a: 28, b: 1, c: 1 });

    expect(balanced.hill0Richness).toBe(3);
    expect(balanced.hill1EffectiveBehaviors).toBe(3);
    expect(balanced.hill2EffectiveBehaviors).toBe(3);
    expect(concentrated.hill0Richness).toBe(3);
    expect(concentrated.hill1EffectiveBehaviors).toBeLessThan(3);
    expect(concentrated.hill2EffectiveBehaviors).toBeLessThan(
      concentrated.hill1EffectiveBehaviors,
    );
  });

  it('uses paired uncertainty and a practical threshold for verdicts', () => {
    const improved = summarizePairedDifference(
      [
        { baseline: 10, candidate: 7 },
        { baseline: 12, candidate: 8 },
        { baseline: 11, candidate: 8 },
        { baseline: 13, candidate: 9 },
      ],
      { direction: 'lowerIsBetter', materialDifference: 1 },
    );
    const noisy = summarizePairedDifference(
      [
        { baseline: 10, candidate: 9 },
        { baseline: 10, candidate: 11 },
        { baseline: 10, candidate: 10 },
      ],
      { direction: 'lowerIsBetter', materialDifference: 0.5 },
    );

    expect(improved.verdict).toBe('improved');
    expect(improved.orientedMeanDifference).toBeGreaterThan(0);
    expect(improved.pairCount).toBe(4);
    expect(noisy.verdict).toBe('inconclusive');
  });

  it('keeps partial-depth evidence separate and nullable', () => {
    const base = {
      completedDepth: 1,
      completedRootMoves: 12,
      diagnostics: createSearchDiagnostics(),
      elapsedMs: 1,
      evaluatedNodes: 100,
      fallbackKind: 'none' as const,
      partialDepth: null,
      partialRootMoves: 0,
      rootScoreRegret: 0,
      searchBudget: {
        exhaustedBy: 'none' as const,
        maxDepth: 2,
        maxEvaluatedNodes: 100,
        timeBudgetMs: null,
        type: 'fixedNodes' as const,
      },
      timedOut: false,
    };
    const withoutPartial = summarizeSearchExecutions([base]);
    const withPartial = summarizeSearchExecutions([
      base,
      {
        ...base,
        fallbackKind: 'partialCurrentDepth',
        partialDepth: 2,
        partialRootMoves: 7,
        timedOut: true,
      },
    ]);

    expect(withoutPartial.partialDepth).toBeNull();
    expect(withoutPartial.partialRootMoves).toBeNull();
    expect(withPartial.partialDepth).toMatchObject({ count: 1, mean: 2 });
    expect(withPartial.partialRootMoves).toMatchObject({ count: 1, mean: 7 });
    expect(withPartial.partialDepthShare).toMatchObject({ count: 1, total: 2 });
  });
});
