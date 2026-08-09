import { describe, expect, it } from 'vitest';

import { summarizePairedStrengthNonInferiority } from '@/ai/test/referenceStrengthStats';

describe('paired frozen-reference strength statistics', () => {
  it('passes identical revisions inside the predeclared margin', () => {
    const summary = summarizePairedStrengthNonInferiority(
      [
        { baseline: 0.5, candidate: 0.5, pairId: 'a1', stratumId: 'a' },
        { baseline: 1, candidate: 1, pairId: 'a2', stratumId: 'a' },
        { baseline: 0, candidate: 0, pairId: 'b1', stratumId: 'b' },
        { baseline: 0.5, candidate: 0.5, pairId: 'b2', stratumId: 'b' },
      ],
      { bootstrapIterations: 200, scoreMargin: 0.03 },
    );

    expect(summary.score.estimate).toBe(0);
    expect(summary.score.verdict).toBe('nonInferior');
    expect(summary.resolution.verdict).toBe('nonInferior');
    expect(summary.overallVerdict).toBe('nonInferior');
  });

  it('weights fixture-reference strata equally despite unequal seed counts', () => {
    const summary = summarizePairedStrengthNonInferiority(
      [
        ...Array.from({ length: 10 }, (_, index) => ({
          baseline: 0.5,
          candidate: 0.5,
          pairId: `large-${index}`,
          stratumId: 'large',
        })),
        {
          baseline: 0.5,
          candidate: 0.4,
          pairId: 'small-0',
          stratumId: 'small',
        },
      ],
      { bootstrapIterations: 200, scoreMargin: 0.03 },
    );

    expect(summary.score.estimate).toBe(-0.05);
    expect(summary.variance.betweenStratumVariance).toBeGreaterThan(0);
  });

  it('keeps censoring out of score and fails the resolution guardrail separately', () => {
    const summary = summarizePairedStrengthNonInferiority(
      [
        { baseline: 0.5, candidate: null, pairId: 'a1', stratumId: 'a' },
        { baseline: 1, candidate: null, pairId: 'a2', stratumId: 'a' },
      ],
      { bootstrapIterations: 200, resolutionMargin: 0.03, scoreMargin: 0.03 },
    );

    expect(summary.censoring.jointlyResolvedPairs).toBe(0);
    expect(summary.score.observationCount).toBe(0);
    expect(summary.score.verdict).toBe('inconclusive');
    expect(summary.resolution.verdict).toBe('regressed');
    expect(summary.overallVerdict).toBe('regressed');
    expect(summary.power.status).toBe('insufficientPilotVariance');
  });

  it('estimates campaign power only from replicated within-stratum variance', () => {
    const summary = summarizePairedStrengthNonInferiority(
      [
        { baseline: 0.5, candidate: 0.6, pairId: 'a1', stratumId: 'a' },
        { baseline: 0.5, candidate: 0.4, pairId: 'a2', stratumId: 'a' },
        { baseline: 0.5, candidate: 0.55, pairId: 'b1', stratumId: 'b' },
        { baseline: 0.5, candidate: 0.45, pairId: 'b2', stratumId: 'b' },
      ],
      { bootstrapIterations: 200, scoreMargin: 0.03 },
    );

    expect(summary.power.status).toBe('estimated');
    expect(summary.power.currentStandardError).toBeGreaterThan(0);
    expect(summary.power.minimumDetectableDifference80).toBeGreaterThan(0);
    expect(summary.power.requiredPairsPerStratum80).toBeGreaterThan(1);
  });

  it('keeps natural resolution separate from an available adjudicated endpoint', () => {
    const summary = summarizePairedStrengthNonInferiority(
      [
        {
          baseline: 0.5,
          baselineResolved: false,
          candidate: 0.75,
          candidateResolved: false,
          pairId: 'a1',
          stratumId: 'a',
        },
      ],
      { bootstrapIterations: 200, scoreMargin: 0.03 },
    );

    expect(summary.score.observationCount).toBe(1);
    expect(summary.censoring.baselineResolvedPairs).toBe(0);
    expect(summary.censoring.candidateResolvedPairs).toBe(0);
    expect(summary.censoring.jointlyResolvedPairs).toBe(0);
  });
});
