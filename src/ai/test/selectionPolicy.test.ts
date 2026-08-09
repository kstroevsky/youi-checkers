import { AI_DIFFICULTY_PRESETS } from '@/ai/presets';
import {
  getSelectionRegretBudget,
  selectCandidateAction,
} from '@/ai/search/result';
import type { RootRankedAction } from '@/ai/search/types';
import type { AiTerminalUtility } from '@/ai/types';
import type { Coord } from '@/domain';

import { describe, expect, it } from 'vitest';

function candidate(
  coord: Coord,
  score: number,
  options: {
    isForced?: boolean;
    isRepetition?: boolean;
    participationDelta?: number;
    terminalUtility?: AiTerminalUtility;
  } = {},
): RootRankedAction {
  return {
    action: { coord, type: 'manualUnfreeze' },
    drawTrapRisk: 0,
    emptyCellsDelta: 0,
    freezeSwingBonus: 0,
    homeFieldDelta: 0,
    intent: 'hybrid',
    intentDelta: 0,
    isForced: options.isForced ?? false,
    isRepetition: options.isRepetition ?? false,
    isSelfUndo: false,
    isTactical: false,
    isTerminal: options.terminalUtility !== undefined,
    mobility: {
      actorBefore: 1,
      actorContinuationAfter: null,
      measuredAfter: false,
      opponentReplyAfter: null,
      samePlayerContinuation: false,
    },
    mobilityDelta: 0,
    movedMass: 1,
    participationDelta: options.participationDelta ?? 0,
    policyPrior: 0,
    repeatedPositionCount: options.isRepetition ? 2 : 1,
    score,
    sixStackDelta: 0,
    sourceFamily: coord,
    tags: [],
    terminalUtility: options.terminalUtility ?? null,
    tiebreakEdgeKind: 'tied',
  };
}

describe('root selection safety and strength budget', () => {
  it('preserves an immediate win before applying style', () => {
    const selected = selectCandidateAction(
      [
        candidate('A1', 1_000_000, {
          isForced: true,
          terminalUtility: 'win',
        }),
        candidate('B1', 999_999, { participationDelta: 100_000 }),
      ],
      AI_DIFFICULTY_PRESETS.easy,
      () => 0.99,
      { bandBoost: 10_000 },
    );

    expect(selected.action).toEqual({ coord: 'A1', type: 'manualUnfreeze' });
  });

  it('rejects an avoidable terminal loss even when it has the highest score', () => {
    const selected = selectCandidateAction(
      [
        candidate('A1', 1_000, { terminalUtility: 'loss' }),
        candidate('B1', 900),
      ],
      AI_DIFFICULTY_PRESETS.easy,
      () => 0,
    );

    expect(selected.action).toEqual({ coord: 'B1', type: 'manualUnfreeze' });
  });

  it('caps low-confidence style regret by difficulty', () => {
    const best = candidate('A1', 8_000);
    const stylish = candidate('B1', 7_700, { participationDelta: 10_000 });

    expect(
      selectCandidateAction(
        [best, stylish],
        AI_DIFFICULTY_PRESETS.hard,
        () => 0,
        { bandBoost: 4_000 },
      ),
    ).toBe(best);
    expect(
      selectCandidateAction(
        [best, stylish],
        AI_DIFFICULTY_PRESETS.easy,
        () => 0,
        { bandBoost: 4_000 },
      ),
    ).toBe(stylish);
  });

  it('reports the enforced budget rather than the widened raw band', () => {
    expect(
      getSelectionRegretBudget(8_000, AI_DIFFICULTY_PRESETS.hard, {
        bandBoost: 4_000,
        riskMode: 'late',
      }),
    ).toBe(240);
    expect(getSelectionRegretBudget(8_000, AI_DIFFICULTY_PRESETS.easy)).toBe(
      640,
    );
  });
});
