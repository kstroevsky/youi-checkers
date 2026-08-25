import {
  computeNearCycleRate,
  computeNormalizedLempelZiv,
  computePermutationEntropy,
  computeRecurrenceQuantification,
  computeSampleEntropy,
  findLoopEscapePly,
  summarizeAdvancedTraceMetrics,
} from '@/ai/test/advancedMetrics';
import type { AiGameTrace, AiTracePly } from '@/ai/test/metrics';
import { createSearchDiagnostics } from '@/ai/search/result';
import { describe, expect, it } from 'vitest';

function createPly(overrides: Partial<AiTracePly> = {}): AiTracePly {
  return {
    action: { source: 'A1', target: 'A2', type: 'climbOne' },
    actionKey: 'climbOne:A1:A2',
    actionKind: 'climbOne',
    actor: 'white',
    afterLegalMoveCount: 6,
    afterPositionKey: `position-${overrides.ply ?? 1}`,
    behaviorProfileId: 'expander',
    bestSearchScore: 0,
    beforeLegalMoveCount: 6,
    boardDisplacement: 0.08,
    completedDepth: 1,
    completedRootMoves: 2,
    diagnostics: createSearchDiagnostics(),
    emptyCellCount: 2,
    emptyCellsDelta: 0,
    elapsedMs: 1,
    evaluatedNodes: 4,
    fallbackKind: 'none',
    freezeSwingBonus: 0,
    frozenCountChurn: 0,
    frozenSingles: { black: 0, white: 0 },
    homeFieldDelta: 0,
    homeFieldProgress: { black: 0, white: 0 },
    isRepetition: false,
    isRiskProgressCertified: false,
    isSelfUndo: false,
    isTactical: false,
    legalRootCandidateCount: 2,
    mobility: {
      actorBefore: 6,
      actorContinuationAfter: null,
      measuredAfter: true,
      opponentReplyAfter: 6,
      samePlayerContinuation: false,
    },
    mobilityDelta: 0,
    movedMass: 1,
    normalizedWhiteScore: 0,
    opponentReplyCompression: null,
    participationDelta: 0,
    partialDepth: null,
    partialRootMoves: 0,
    ply: 1,
    repeatedPositionCount: 1,
    rootCandidates: [],
    rootScoreRegret: 0,
    riskMode: 'normal',
    score: 0,
    selectedActionScore: 0,
    selectionRegret: 0,
    searchBudget: null,
    sixStackDelta: 0,
    sixStackProgress: { black: 0, white: 0 },
    sourceFamily: 'A',
    stackHeightHistogram: [30, 4, 2, 0],
    stackProfileChurn: 0,
    strategicIntent: 'hybrid',
    tags: [],
    timedOut: false,
    whitePerspectiveScore: 0,
    ...overrides,
  } as AiTracePly;
}

function createTrace(plies: AiTracePly[]): AiGameTrace {
  return {
    difficulty: 'hard',
    finalVictory: { type: 'none' },
    firstMoveKey: plies[0]?.actionKey ?? null,
    gameIndex: 0,
    maxTurns: plies.length,
    mirrorIndex: 0,
    pairIndex: 0,
    plies,
    seedPair: { black: 2, white: 1 },
    sideDifficulties: { black: 'hard', white: 'hard' },
    sideProfiles: { black: 'hunter', white: 'expander' },
    terminalType: 'unfinished',
    totalPlies: plies.length,
  };
}

describe('advanced trace analytics', () => {
  it('reports higher recurrence structure for looping sequences', () => {
    const looping = computeRecurrenceQuantification([
      'a',
      'b',
      'a',
      'b',
      'a',
      'b',
    ]);
    const diverse = computeRecurrenceQuantification([
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
    ]);

    expect(looping.recurrenceRate).toBeGreaterThan(diverse.recurrenceRate);
    expect(looping.determinism).toBeGreaterThan(diverse.determinism);
    expect(looping.laminarity).toBeGreaterThanOrEqual(diverse.laminarity);
  });

  it('gives higher permutation entropy to less ordered score sequences', () => {
    const ordered = computePermutationEntropy([0, 1, 2, 3, 4, 5]);
    const varied = computePermutationEntropy([0, 1, 0, -1, 1, 0, -1, 1]);

    expect(varied).toBeGreaterThan(ordered);
  });

  it('drops sample entropy toward zero for constant score sequences', () => {
    expect(computeSampleEntropy([0, 0, 0, 0, 0, 0])).toBe(0);
    expect(
      computeSampleEntropy([0, 1, 0, 1, 0, 2, 0, 1, 0, 1]),
    ).toBeGreaterThan(0);
  });

  it('marks sample entropy as unavailable when evidence is insufficient', () => {
    expect(computeSampleEntropy([0, 1, 2])).toBeNull();
    expect(computeSampleEntropy([0, 1, 4, 9, 16])).toBeNull();
  });

  it('gives lower Lempel-Ziv complexity to repeated symbolic loops', () => {
    const looping = computeNormalizedLempelZiv(['a', 'b', 'a', 'b', 'a', 'b']);
    const diverse = computeNormalizedLempelZiv(['a', 'b', 'c', 'd', 'e', 'f']);

    expect(looping).toBeLessThan(diverse);
  });

  it('detects approximate structural cycles without counting exact repeats', () => {
    const cycling = [
      createPly({ actor: 'white', emptyCellCount: 2, ply: 1 }),
      createPly({ actor: 'black', emptyCellCount: 4, ply: 2 }),
      createPly({ actor: 'white', emptyCellCount: 2, ply: 3 }),
      createPly({ actor: 'black', emptyCellCount: 4, ply: 4 }),
      createPly({ actor: 'white', emptyCellCount: 2, ply: 5 }),
    ];
    const dispersing = cycling.map((ply, index) =>
      createPly({
        ...ply,
        emptyCellCount: 2 + index * 4,
        homeFieldProgress: { black: index * 0.15, white: index * 0.2 },
        sixStackProgress: { black: index * 0.15, white: index * 0.2 },
        stackHeightHistogram: [
          30 - index * 3,
          4 + index,
          2 + index,
          index,
        ],
      }),
    );

    const nearCycle = computeNearCycleRate(cycling);
    const progressive = computeNearCycleRate(dispersing);

    expect(nearCycle.sampleCount).toBeGreaterThan(0);
    expect(nearCycle.rate).toBe(1);
    expect(progressive.rate).toBe(0);
    expect(
      cycling.every(
        (ply, index) =>
          cycling.findIndex(
            (candidate) => candidate.afterPositionKey === ply.afterPositionKey,
          ) === index,
      ),
    ).toBe(true);
  });

  it('keeps token Lempel-Ziv invariant under symbolic relabeling', () => {
    expect(computeNormalizedLempelZiv(['a', 'b', 'a', 'b', 'a', 'b'])).toBe(
      computeNormalizedLempelZiv([
        'long-token-with-shared-characters',
        'another|token',
        'long-token-with-shared-characters',
        'another|token',
        'long-token-with-shared-characters',
        'another|token',
      ]),
    );
  });

  it('detects a loop escape once repetition and self-undo pressure stop', () => {
    const trace = createTrace([
      createPly({
        afterPositionKey: 'a',
        boardDisplacement: 0.04,
        emptyCellCount: 1,
        isRepetition: true,
        isSelfUndo: true,
        ply: 1,
        riskMode: 'stagnation',
      }),
      createPly({
        afterPositionKey: 'b',
        boardDisplacement: 0.04,
        emptyCellCount: 1,
        isRepetition: true,
        ply: 2,
        riskMode: 'stagnation',
      }),
      createPly({
        afterPositionKey: 'c',
        boardDisplacement: 0.09,
        emptyCellCount: 2,
        isRiskProgressCertified: true,
        ply: 3,
        riskMode: 'late',
      }),
      createPly({
        afterPositionKey: 'd',
        boardDisplacement: 0.08,
        emptyCellCount: 2,
        isRiskProgressCertified: true,
        ply: 4,
        riskMode: 'late',
      }),
      createPly({
        afterPositionKey: 'e',
        boardDisplacement: 0.08,
        emptyCellCount: 3,
        isRiskProgressCertified: true,
        ply: 5,
        riskMode: 'late',
      }),
      createPly({
        afterPositionKey: 'f',
        boardDisplacement: 0.08,
        emptyCellCount: 3,
        isRiskProgressCertified: true,
        ply: 6,
        riskMode: 'late',
      }),
    ]);

    expect(findLoopEscapePly(trace)).toBe(3);
  });

  it('conditions loop-escape rates on traces that actually enter loop pressure', () => {
    const pressureTrace = createTrace([
      createPly({ isRepetition: true, ply: 1, riskMode: 'stagnation' }),
      createPly({ boardDisplacement: 0.08, ply: 2 }),
      createPly({ boardDisplacement: 0.08, ply: 3 }),
      createPly({ boardDisplacement: 0.08, ply: 4 }),
      createPly({ boardDisplacement: 0.08, ply: 5 }),
    ]);
    const ordinaryTrace = createTrace([
      createPly({ ply: 1 }),
      createPly({ ply: 2 }),
      createPly({ ply: 3 }),
      createPly({ ply: 4 }),
      createPly({ ply: 5 }),
    ]);
    const summary = summarizeAdvancedTraceMetrics([
      pressureTrace,
      ordinaryTrace,
    ]);

    expect(summary.loopEscapeEligibleTraceCount).toBe(1);
    expect(summary.loopEscapeObservedCount).toBe(1);
    expect(summary.loopEscapeRate8).toBe(1);
    expect(summary.nearCycleSampleCount).toBeGreaterThan(0);
    expect(summary.frontierCompressionSampleCount).toBe(0);
    expect(summary.frontierCompressionRate).toBeNull();

    const noPressureSummary = summarizeAdvancedTraceMetrics([ordinaryTrace]);
    expect(noPressureSummary.loopEscapeEligibleTraceCount).toBe(0);
    expect(noPressureSummary.loopEscapeRate8).toBeNull();
  });

  it('measures pressure from opponent restriction, not actor continuation mobility', () => {
    const actorContinuation = createPly({
      mobility: {
        actorBefore: 6,
        actorContinuationAfter: 2,
        measuredAfter: true,
        opponentReplyAfter: null,
        samePlayerContinuation: true,
      },
      mobilityDelta: -4,
      opponentReplyCompression: null,
    });
    const opponentRestriction = createPly({
      opponentReplyCompression: 0.7,
      ply: 2,
    });

    const continuationOnly = summarizeAdvancedTraceMetrics([
      createTrace([actorContinuation]),
    ]);
    const restrictedOpponent = summarizeAdvancedTraceMetrics([
      createTrace([opponentRestriction]),
    ]);

    expect(continuationOnly.pressureEventRate).toBe(0);
    expect(continuationOnly.frontierCompressionSampleCount).toBe(0);
    expect(continuationOnly.frontierCompressionRate).toBeNull();
    expect(restrictedOpponent.pressureEventRate).toBe(1);
    expect(restrictedOpponent.frontierCompressionSampleCount).toBe(1);
    expect(restrictedOpponent.frontierCompressionRate).toBe(0.7);
  });
});
