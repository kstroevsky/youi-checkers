import { describe, expect, it } from 'vitest';

import {
  createBlindedCrossoverAssignments,
  fitHumanPreferenceModel,
  selectActiveReplayPair,
  type HumanPreferenceObservation,
} from '@/ai/test/humanCalibration';

function observation(
  participantIndex: number,
  difference: number,
  preference: HumanPreferenceObservation['preference'],
  scenarioId = 'scenario-a',
): HumanPreferenceObservation {
  return {
    descriptorDifference: { productiveParticipation: difference },
    leftPolicyId: 'current',
    observationId: `observation-${participantIndex}-${scenarioId}`,
    participantId: `participant-${participantIndex}`,
    preference,
    rightPolicyId: 'legacy-v0',
    scenarioId,
    selectionProbability: 1,
    studyKind: 'replayPreference',
  };
}

describe('human calibration infrastructure', () => {
  it('counterbalances blinded conditions without exposing policies publicly', () => {
    const design = createBlindedCrossoverAssignments({
      participantIds: ['p1', 'p2'],
      policyIds: ['current', 'legacy-v0'],
      scenarioIds: ['s1', 's2'],
      seed: 'study-v1',
    });

    expect(design.publicAssignments).toHaveLength(4);
    expect(JSON.stringify(design.publicAssignments)).not.toContain('current');
    expect(
      design.privateMappings.every(
        ({ policies }) => new Set(Object.values(policies)).size === 2,
      ),
    ).toBe(true);
    expect(design.privateMappings[0].policies).not.toEqual(
      design.privateMappings[1].policies,
    );
  });

  it('learns descriptor preference while evaluating unseen players without their random effects', () => {
    const observations = Array.from({ length: 20 }, (_, participantIndex) => [
      observation(participantIndex, 1, 'left', 'scenario-a'),
      observation(participantIndex, -1, 'right', 'scenario-b'),
    ]).flat();
    const model = fitHumanPreferenceModel(observations, {
      holdoutSeed: 'fixed-split',
      iterations: 2_000,
    });

    expect(model.coefficients.productiveParticipation).toBeGreaterThan(0);
    expect(model.heldoutParticipantIds.length).toBeGreaterThan(0);
    expect(model.heldoutMetrics?.accuracy).toBe(1);
    expect(
      model.heldoutParticipantIds.every(
        (participantId) => !(participantId in model.participantEffects),
      ),
    ).toBe(true);
  });

  it('selects uncertain under-sampled replays and retains random exploration propensity', () => {
    const model = fitHumanPreferenceModel([
      observation(1, 1, 'left'),
      observation(2, -1, 'right'),
    ]);
    const candidates = [
      {
        descriptorDifference: { productiveParticipation: 0 },
        id: 'uncertain',
        timesShown: 0,
      },
      {
        descriptorDifference: { productiveParticipation: 4 },
        id: 'obvious',
        timesShown: 4,
      },
    ];
    const active = selectActiveReplayPair(candidates, model, () => 0.9);
    const exploreRandom = [0.1, 0.75];
    const explored = selectActiveReplayPair(
      candidates,
      model,
      () => exploreRandom.shift() ?? 0,
    );

    expect(active.candidate.id).toBe('uncertain');
    expect(active.strategy).toBe('uncertainty');
    expect(explored.strategy).toBe('explore');
    expect(explored.selectionProbability).toBe(0.1);
  });
});
