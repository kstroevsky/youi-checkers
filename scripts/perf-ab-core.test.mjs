import { describe, expect, it } from 'vitest';

import {
  assertCompatibleReports,
  buildPairedSchedule,
  buildExperimentSummary,
  normalizeDomainReport,
  normalizeFullReport,
  parsePerfAbArgs,
  summarizePairedMetric,
} from './perf-ab-core.mjs';

describe('performance A/B experiment contract', () => {
  it('counterbalances each consecutive pair to limit order drift', () => {
    expect(buildPairedSchedule(4)).toEqual([
      { order: ['baseline', 'candidate'], pairIndex: 0 },
      { order: ['candidate', 'baseline'], pairIndex: 1 },
      { order: ['baseline', 'candidate'], pairIndex: 2 },
      { order: ['candidate', 'baseline'], pairIndex: 3 },
    ]);
  });

  it('accepts a lower-is-better win only when its paired interval clears materiality', () => {
    const summary = summarizePairedMetric({
      baseline: [100, 100, 100, 100],
      candidate: [80, 80, 80, 80],
      direction: 'lower',
      minimumImprovementPercent: 5,
    });

    expect(summary).toMatchObject({
      baselineMedian: 100,
      candidateMedian: 80,
      confidenceIntervalPercent: { high: 20, low: 20 },
      medianImprovementPercent: 20,
      sampleCount: 4,
      verdict: 'confirmed-win',
    });
  });

  it('classifies a higher-is-better slowdown as a regression', () => {
    const summary = summarizePairedMetric({
      baseline: [100, 100, 100, 100],
      candidate: [90, 90, 90, 90],
      direction: 'higher',
      minimumImprovementPercent: 5,
    });

    expect(summary.medianImprovementPercent).toBe(-10);
    expect(summary.verdict).toBe('regression');
  });

  it('rejects reports that exercised different correctness workloads', () => {
    const baseline = {
      contract: { schemaVersion: 1, workloadId: 'domain-ai-v1' },
      guardrails: { fixtures: [{ label: 'midGame20', legalActionCount: 12 }] },
    };
    const candidate = {
      contract: { schemaVersion: 1, workloadId: 'domain-ai-v1' },
      guardrails: { fixtures: [{ label: 'midGame20', legalActionCount: 11 }] },
    };

    expect(() => assertCompatibleReports(baseline, candidate)).toThrow(
      /guardrail fixture mismatch/i,
    );
  });

  it('normalizes historical domain reports into an external workload contract', () => {
    const normalized = normalizeDomainReport({
      ai: {
        hard: {
          avgDepthEfficiency: 0.5,
          avgNodesPerSecond: 1_200,
          avgWallTimeMs: 500,
          states: [
            {
              completedDepth: 2,
              label: 'midGame20',
              legalActionCount: 12,
              nodesPerSecond: 1_100,
              wallTimeMs: 500,
            },
          ],
        },
      },
      domain: {
        getLegalActions: { avgMs: 0.4, iterations: 750, totalMs: 300 },
      },
      rootOrderingCacheBenchmark: [
        { label: 'late20', optimizedMs: 4.5, turnCount: 20 },
      ],
    });

    expect(normalized.contract).toEqual({
      schemaVersion: 1,
      workloadId: 'domain-ai-v1',
    });
    expect(normalized.guardrails.fixtures).toEqual([
      { difficulty: 'hard', label: 'midGame20', legalActionCount: 12 },
    ]);
    expect(normalized.metrics['ai.hard.avgNodesPerSecond']).toEqual({
      direction: 'higher',
      role: 'decision',
      unit: 'nodes/s',
      value: 1_200,
    });
    expect(normalized.metrics['domain.getLegalActions.avgMs']).toEqual({
      direction: 'lower',
      role: 'diagnostic',
      unit: 'ms',
      value: 0.4,
    });
  });

  it('requires two immutable, distinct Git references', () => {
    expect(
      parsePerfAbArgs([
        '--baseline=main',
        '--candidate=perf-candidate',
        '--pairs=12',
        '--minimum-improvement=7.5',
      ]),
    ).toMatchObject({
      baseline: 'main',
      candidate: 'perf-candidate',
      minimumImprovementPercent: 7.5,
      pairCount: 12,
    });
    expect(() =>
      parsePerfAbArgs(['--baseline=main', '--candidate=main']),
    ).toThrow(/must be different/i);
    expect(() =>
      parsePerfAbArgs(['--baseline=HEAD', '--candidate=working']),
    ).toThrow(/immutable git ref/i);
  });

  it('adds browser and delivered-artifact metrics to a full report', () => {
    const domain = {
      ai: {
        hard: {
          avgDepthEfficiency: 0.5,
          avgNodesPerSecond: 1_200,
          avgWallTimeMs: 500,
          states: [],
        },
      },
      domain: {},
    };
    const normalized = normalizeFullReport({
      chunkSizes: { initialJsBytes: 100_000, totalJsBytes: 200_000 },
      desktop: {
        load: { largestContentfulPaintMs: 120 },
        ui: { commitMove: { elapsedMs: 25 } },
      },
      domain,
      mobile: {
        load: { largestContentfulPaintMs: 180 },
        ui: { commitMove: { elapsedMs: 40 } },
      },
    });

    expect(normalized.contract.workloadId).toBe('full-app-v1');
    expect(
      normalized.metrics['browser.mobile.ui.commitMove.elapsedMs'],
    ).toEqual({
      direction: 'lower',
      role: 'diagnostic',
      unit: 'ms',
      value: 40,
    });
    expect(normalized.metrics['artifact.totalJsBytes'].value).toBe(200_000);
  });

  it('bases the overall verdict on decision metrics and quality guardrails', () => {
    const makeReport = (nodesPerSecond, completedDepth) => ({
      contract: { schemaVersion: 1, workloadId: 'domain-ai-v1' },
      guardrails: {
        fixtures: [
          { difficulty: 'hard', label: 'midGame20', legalActionCount: 12 },
        ],
      },
      metrics: {
        'ai.hard.avgNodesPerSecond': {
          direction: 'higher',
          role: 'decision',
          unit: 'nodes/s',
          value: nodesPerSecond,
        },
      },
      observations: {
        quality: [{ completedDepth, difficulty: 'hard', label: 'midGame20' }],
        selectedActions: [],
      },
    });
    const pairs = Array.from({ length: 4 }, () => ({
      baseline: makeReport(1_000, 2),
      candidate: makeReport(1_100, 2),
    }));
    const summary = buildExperimentSummary(pairs, {
      bootstrapSamples: 200,
      minimumImprovementPercent: 5,
    });

    expect(summary.overallVerdict).toBe('confirmed-win');
    expect(summary.qualityGuardrails.passed).toBe(true);
    expect(summary.metrics['ai.hard.avgNodesPerSecond'].verdict).toBe(
      'confirmed-win',
    );
  });
});
