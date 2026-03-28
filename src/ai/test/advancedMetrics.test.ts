import {
  computeNormalizedLempelZiv,
  computePermutationEntropy,
  computeRecurrenceQuantification,
  computeSampleEntropy,
  findLoopEscapePly,
} from '@/ai/test/advancedMetrics';
import type { AiGameTrace, AiTracePly } from '@/ai/test/metrics';
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
    beforeLegalMoveCount: 6,
    boardDisplacement: 0.08,
    completedDepth: 1,
    emptyCellCount: 2,
    emptyCellsDelta: 0,
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
    mobilityDelta: 0,
    movedMass: 1,
    normalizedWhiteScore: 0,
    participationDelta: 0,
    ply: 1,
    repeatedPositionCount: 1,
    riskMode: 'normal',
    score: 0,
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
  };
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
    const looping = computeRecurrenceQuantification(['a', 'b', 'a', 'b', 'a', 'b']);
    const diverse = computeRecurrenceQuantification(['a', 'b', 'c', 'd', 'e', 'f']);

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
    expect(computeSampleEntropy([0, 0.2, 0.4, 0.2, 0.4, 0.6, 0.4, 0.6, 0.8])).toBeGreaterThan(0);
  });

  it('gives lower Lempel-Ziv complexity to repeated symbolic loops', () => {
    const looping = computeNormalizedLempelZiv(['a', 'b', 'a', 'b', 'a', 'b']);
    const diverse = computeNormalizedLempelZiv(['a', 'b', 'c', 'd', 'e', 'f']);

    expect(looping).toBeLessThan(diverse);
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
});
