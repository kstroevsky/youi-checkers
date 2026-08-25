import { describe, expect, it } from 'vitest';

import type { PolicyMatchGame, PolicyMatchPair } from '@/ai/test/policyMatch';
import { summarizePolicyStrengthInsights } from '@/ai/test/policyStrengthInsights';
import type { Player, TurnAction } from '@/domain';

function game(
  id: string,
  policyAColor: Player,
  actions: Array<{
    action: TurnAction;
    actor: Player;
    after: string;
    before: string;
    policyId: string;
  }>,
): PolicyMatchGame {
  const policyByColor = {
    black: policyAColor === 'black' ? 'current' : 'legacy-v0',
    white: policyAColor === 'white' ? 'current' : 'legacy-v0',
  };

  return {
    adjudicatedPolicyAPoints: 0.75,
    adjudicationType: 'horizonDomainTiebreak',
    fixtureId: 'fixture',
    gameId: id,
    plies: actions.map(({ action, actor, after, before, policyId }) => ({
      actionKey:
        action.type === 'jumpSequence'
          ? `${action.type}:${action.source}:${action.path.join('>')}`
          : action.type === 'manualUnfreeze'
            ? `${action.type}:${action.coord}`
            : `${action.type}:${action.source}:${action.target}`,
      actor,
      afterPositionHash: after,
      beforePositionHash: before,
      decision: { action },
      policyId,
    })),
    policyAColor,
    policyAPoints: null,
    policyByColor,
    terminalType: 'unfinished',
    totalPlies: actions.length,
    winner: null,
  };
}

function pair(): PolicyMatchPair {
  const first = game('first', 'white', [
    {
      action: { source: 'A1', target: 'A2', type: 'moveSingleToEmpty' },
      actor: 'white',
      after: 's1',
      before: 's0',
      policyId: 'current',
    },
    {
      action: { source: 'B6', target: 'B5', type: 'moveSingleToEmpty' },
      actor: 'black',
      after: 's2',
      before: 's1',
      policyId: 'legacy-v0',
    },
    {
      action: { path: ['E3'], source: 'C1', type: 'jumpSequence' },
      actor: 'white',
      after: 's3',
      before: 's2',
      policyId: 'current',
    },
    {
      action: { source: 'B6', target: 'B5', type: 'moveSingleToEmpty' },
      actor: 'black',
      after: 's2',
      before: 's3',
      policyId: 'legacy-v0',
    },
  ]);
  const second = game('second', 'black', [
    {
      action: { source: 'B1', target: 'B2', type: 'moveSingleToEmpty' },
      actor: 'white',
      after: 't1',
      before: 't0',
      policyId: 'legacy-v0',
    },
    {
      action: { source: 'F6', target: 'F5', type: 'moveSingleToEmpty' },
      actor: 'black',
      after: 't2',
      before: 't1',
      policyId: 'current',
    },
    {
      action: { source: 'B1', target: 'B2', type: 'moveSingleToEmpty' },
      actor: 'white',
      after: 't3',
      before: 't2',
      policyId: 'legacy-v0',
    },
    {
      action: { path: ['B4'], source: 'D6', type: 'jumpSequence' },
      actor: 'black',
      after: 't4',
      before: 't3',
      policyId: 'current',
    },
  ]);

  return {
    adjudicatedPairScore: 0.75,
    fixtureId: 'fixture',
    games: [first, second],
    pairId: 'fixture/block-0/repeat-0',
    pairScore: null,
    policyAId: 'current',
    policyASeed: 1,
    policyBId: 'legacy-v0',
    policyBSeed: 2,
  };
}

describe('summarizePolicyStrengthInsights', () => {
  it('compares observable policy behavior at the balanced-pair grain', () => {
    const summary = summarizePolicyStrengthInsights([pair()], {
      baselineId: 'legacy-v0',
      candidateId: 'current',
      horizonPlies: 4,
    });

    expect(summary.population).toMatchObject({
      gameCount: 2,
      naturalGameCount: 0,
      pairCount: 1,
      plyCount: 8,
    });
    expect(summary.strength.adjudicatedCandidatePointShare.mean).toBe(0.75);
    expect(summary.strength.candidateBlackMinusWhite.mean).toBe(0);
    expect(summary.behavior.actionKindDiversity.candidate.mean).toBe(1);
    expect(summary.behavior.actionKindDiversity.baseline.mean).toBe(0);
    expect(summary.behavior.sameSourceRepeatRate.delta.mean).toBe(-1);
    expect(summary.behavior.exactActionReuseRate.delta.mean).toBe(-0.5);
    expect(summary.actionKinds.overallShares.current.jumpSequence).toBe(0.5);
    expect(summary.actionKinds.overallShares['legacy-v0'].jumpSequence).toBe(0);
    expect(summary.actionKinds.policyPlyShares.current).toBe(0.5);
    expect(summary.richBehavior.measurementPairCount).toBe(0);
    expect(summary.richBehavior.diagnosticPairCount).toBe(0);
  });

  it('measures joint recurrence without attributing it to one policy', () => {
    const summary = summarizePolicyStrengthInsights([pair()], {
      baselineId: 'legacy-v0',
      candidateId: 'current',
      horizonPlies: 4,
    });

    expect(summary.gameDynamics.twoPlyUndoRate.mean).toBeCloseTo(1 / 6, 5);
    expect(summary.gameDynamics.repeatedPositionPlyShare.mean).toBe(0.1);
    expect(summary.gameDynamics.uniquePositionShare.mean).toBe(0.9);
    expect(summary.strength.naturalCandidatePointShare).toBeNull();
  });

  it('rejects pairs that do not contain the declared policies', () => {
    expect(() =>
      summarizePolicyStrengthInsights([pair()], {
        baselineId: 'missing',
        candidateId: 'current',
        horizonPlies: 4,
      }),
    ).toThrow('Baseline policy missing');
  });
});
