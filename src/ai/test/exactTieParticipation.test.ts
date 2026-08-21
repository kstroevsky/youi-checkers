import { describe, expect, it } from 'vitest';

import { selectExactTieParticipationV1 } from '@/ai/search/result';
import type { RootRankedAction } from '@/ai/search/types';

function candidate(
  score: number,
  participationDelta: number,
  sourceFamily: string,
): RootRankedAction {
  return {
    action: {
      source: 'A1',
      target: sourceFamily === 'a' ? 'A2' : 'B1',
      type: 'moveSingleToEmpty',
    },
    drawTrapRisk: 0,
    emptyCellsDelta: 0,
    freezeSwingBonus: 0,
    homeFieldDelta: 0,
    intent: 'hybrid',
    intentDelta: 0,
    isForced: false,
    isRepetition: false,
    isSelfUndo: false,
    isTactical: false,
    isTerminal: false,
    mobility: {
      actorBefore: 2,
      actorContinuationAfter: null,
      measuredAfter: true,
      opponentReplyAfter: 2,
      samePlayerContinuation: false,
    },
    mobilityDelta: 0,
    movedMass: 1,
    participationDelta,
    policyPrior: 0,
    repeatedPositionCount: 1,
    score,
    sixStackDelta: 0,
    sourceFamily,
    tags: [],
    terminalUtility: null,
    tiebreakEdgeKind: 'tied',
  };
}

describe('exact root tie participation', () => {
  it('changes only a complete exact-best tie with a unique participation winner', () => {
    const baseline = candidate(100, 0, 'a');
    const preferred = candidate(100, 2, 'b');
    expect(
      selectExactTieParticipationV1([baseline, preferred], baseline, {
        completedDepth: 3,
        completedRootMoves: 2,
        legalRootMoves: 2,
      }),
    ).toMatchObject({ action: preferred, changed: true, eligible: true });
  });

  it('preserves baseline behavior when evidence is partial', () => {
    const baseline = candidate(100, 0, 'a');
    const preferred = candidate(100, 2, 'b');
    expect(
      selectExactTieParticipationV1([baseline, preferred], baseline, {
        completedDepth: 3,
        completedRootMoves: 1,
        legalRootMoves: 2,
      }).action,
    ).toBe(baseline);
  });
});
