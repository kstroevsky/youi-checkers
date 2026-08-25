export const HUMAN_CALIBRATION_SCHEMA_VERSION = 1 as const;

export type HumanStudyKind = 'fullGameCrossover' | 'replayPreference';
export type HumanPreference = 'left' | 'right' | 'tie';

export const MINI_PXI_CONSTRUCTS = [
  'audiovisualAppeal',
  'autonomy',
  'challenge',
  'clarityOfGoals',
  'curiosity',
  'easeOfControl',
  'enjoyment',
  'immersion',
  'mastery',
  'meaning',
  'progressFeedback',
] as const;

export type MiniPxiConstruct = (typeof MINI_PXI_CONSTRUCTS)[number];
export type MiniPxiRatings = Record<MiniPxiConstruct, number>;

export type HumanPreferenceObservation = {
  descriptorDifference: Record<string, number>;
  leftPolicyId: string;
  miniPxi?: {
    left: MiniPxiRatings;
    right: MiniPxiRatings;
  };
  observationId: string;
  participantId: string;
  preference: HumanPreference;
  /** Probability with which an active sampler offered this pair. */
  selectionProbability: number;
  scenarioId: string;
  studyKind: HumanStudyKind;
  rightPolicyId: string;
};

export type BlindedAssignment = {
  conditionOrder: ['condition-1', 'condition-2'];
  participantId: string;
  scenarioId: string;
  studyKind: HumanStudyKind;
};

export type PrivateConditionMapping = {
  participantId: string;
  policies: Record<'condition-1' | 'condition-2', string>;
  scenarioId: string;
};

export type PreferenceModel = {
  coefficients: Record<string, number>;
  coefficientVariances: Record<string, number>;
  descriptorKeys: string[];
  heldoutParticipantIds: string[];
  heldoutMetrics: PreferenceMetrics | null;
  participantEffects: Record<string, number>;
  scenarioEffects: Record<string, number>;
  trainingMetrics: PreferenceMetrics;
  trainingParticipantIds: string[];
};

export type PreferenceMetrics = {
  accuracy: number;
  brier: number;
  effectiveWeight: number;
  logLoss: number;
  observationCount: number;
};

export type ReplayPairCandidate = {
  descriptorDifference: Record<string, number>;
  id: string;
  timesShown: number;
};

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function sigmoid(value: number): number {
  if (value >= 0) {
    const exponential = Math.exp(-value);
    return 1 / (1 + exponential);
  }
  const exponential = Math.exp(value);
  return exponential / (1 + exponential);
}

function clampProbability(value: number): number {
  return Math.max(1e-9, Math.min(1 - 1e-9, value));
}

function assertRating(rating: number, label: string): void {
  if (!Number.isInteger(rating) || rating < 1 || rating > 7) {
    throw new RangeError(`${label} must be an integer from 1 through 7.`);
  }
}

export function validateHumanPreferenceObservations(
  observations: HumanPreferenceObservation[],
): void {
  const ids = new Set<string>();
  for (const observation of observations) {
    if (!observation.observationId || ids.has(observation.observationId)) {
      throw new Error('Human observation ids must be present and unique.');
    }
    ids.add(observation.observationId);
    if (!observation.participantId || !observation.scenarioId) {
      throw new Error('Participant and scenario ids are required.');
    }
    if (observation.leftPolicyId === observation.rightPolicyId) {
      throw new Error('A preference observation must compare two policies.');
    }
    if (
      !(observation.selectionProbability > 0) ||
      observation.selectionProbability > 1
    ) {
      throw new RangeError('selectionProbability must be in (0, 1].');
    }
    for (const [key, value] of Object.entries(
      observation.descriptorDifference,
    )) {
      if (!key || !Number.isFinite(value)) {
        throw new Error('Descriptor differences must be finite named values.');
      }
    }
    if (observation.miniPxi) {
      for (const construct of MINI_PXI_CONSTRUCTS) {
        assertRating(
          observation.miniPxi.left[construct],
          `miniPXI.left.${construct}`,
        );
        assertRating(
          observation.miniPxi.right[construct],
          `miniPXI.right.${construct}`,
        );
      }
    }
  }
}

/** Deterministically counterbalances policy order without exposing the mapping. */
export function createBlindedCrossoverAssignments({
  participantIds,
  policyIds,
  scenarioIds,
  seed,
  studyKind = 'fullGameCrossover',
}: {
  participantIds: string[];
  policyIds: [string, string];
  scenarioIds: string[];
  seed: string;
  studyKind?: HumanStudyKind;
}): {
  privateMappings: PrivateConditionMapping[];
  publicAssignments: BlindedAssignment[];
} {
  const publicAssignments: BlindedAssignment[] = [];
  const privateMappings: PrivateConditionMapping[] = [];
  for (const participantId of participantIds) {
    scenarioIds.forEach((scenarioId, scenarioIndex) => {
      const flip =
        (fnv1a(`${seed}/${participantId}`) + scenarioIndex) % 2 === 1;
      privateMappings.push({
        participantId,
        policies: {
          'condition-1': policyIds[flip ? 1 : 0],
          'condition-2': policyIds[flip ? 0 : 1],
        },
        scenarioId,
      });
      publicAssignments.push({
        conditionOrder: ['condition-1', 'condition-2'],
        participantId,
        scenarioId,
        studyKind,
      });
    });
  }
  return { privateMappings, publicAssignments };
}

function outcomeValue(preference: HumanPreference): number {
  return preference === 'left' ? 1 : preference === 'right' ? 0 : 0.5;
}

function inversePropensityWeight(probability: number): number {
  return Math.min(10, 1 / probability);
}

function participantSplit(
  participantIds: string[],
  holdoutShare: number,
  seed: string,
): { heldout: Set<string>; training: Set<string> } {
  const unique = [...new Set(participantIds)].sort();
  const ranked = unique
    .map((id) => ({ id, rank: fnv1a(`${seed}/${id}`) / 0x1_0000_0000 }))
    .sort((left, right) => left.rank - right.rank);
  const heldoutCount =
    unique.length >= 5
      ? Math.max(
          1,
          Math.min(unique.length - 1, Math.round(unique.length * holdoutShare)),
        )
      : 0;
  const heldout = new Set(ranked.slice(0, heldoutCount).map(({ id }) => id));
  return {
    heldout,
    training: new Set(unique.filter((id) => !heldout.has(id))),
  };
}

function linearPredictor(
  observation: HumanPreferenceObservation,
  coefficients: Record<string, number>,
  participantEffects: Record<string, number>,
  scenarioEffects: Record<string, number>,
): number {
  let value = coefficients.intercept ?? 0;
  for (const [key, difference] of Object.entries(
    observation.descriptorDifference,
  )) {
    value += (coefficients[key] ?? 0) * difference;
  }
  value += participantEffects[observation.participantId] ?? 0;
  value += scenarioEffects[observation.scenarioId] ?? 0;
  return value;
}

function metrics(
  observations: HumanPreferenceObservation[],
  coefficients: Record<string, number>,
  participantEffects: Record<string, number>,
  scenarioEffects: Record<string, number>,
): PreferenceMetrics {
  let correct = 0;
  let brier = 0;
  let logLoss = 0;
  let effectiveWeight = 0;
  for (const observation of observations) {
    const target = outcomeValue(observation.preference);
    const probability = clampProbability(
      sigmoid(
        linearPredictor(
          observation,
          coefficients,
          participantEffects,
          scenarioEffects,
        ),
      ),
    );
    const weight = inversePropensityWeight(observation.selectionProbability);
    effectiveWeight += weight;
    brier += weight * (probability - target) ** 2;
    logLoss +=
      -weight *
      (target * Math.log(probability) +
        (1 - target) * Math.log(1 - probability));
    if (
      observation.preference === 'tie' ||
      probability >= 0.5 === (target === 1)
    ) {
      correct += 1;
    }
  }
  return {
    accuracy: observations.length ? correct / observations.length : 0,
    brier: effectiveWeight ? brier / effectiveWeight : 0,
    effectiveWeight,
    logLoss: effectiveWeight ? logLoss / effectiveWeight : 0,
    observationCount: observations.length,
  };
}

/**
 * Penalized logistic MAP approximation to a mixed-effects Bradley-Terry model.
 * Participant and scenario terms are shrunk random intercepts; held-out players
 * are scored with population effects only.
 */
export function fitHumanPreferenceModel(
  observations: HumanPreferenceObservation[],
  options: {
    holdoutSeed?: string;
    holdoutShare?: number;
    iterations?: number;
    randomEffectPenalty?: number;
    ridgePenalty?: number;
  } = {},
): PreferenceModel {
  validateHumanPreferenceObservations(observations);
  if (!observations.length)
    throw new Error('At least one observation is required.');
  const policyIds = [
    ...new Set(
      observations.flatMap(({ leftPolicyId, rightPolicyId }) => [
        leftPolicyId,
        rightPolicyId,
      ]),
    ),
  ].sort();
  const policyAnchor = policyIds.at(-1);
  const modeledObservations = observations.map((observation) => ({
    ...observation,
    descriptorDifference: {
      ...observation.descriptorDifference,
      ...Object.fromEntries(
        policyIds
          .filter((policyId) => policyId !== policyAnchor)
          .map((policyId) => [
            `policy:${policyId}`,
            observation.leftPolicyId === policyId
              ? 1
              : observation.rightPolicyId === policyId
                ? -1
                : 0,
          ]),
      ),
    },
  }));
  const descriptorKeys = [
    ...new Set(
      modeledObservations.flatMap((observation) =>
        Object.keys(observation.descriptorDifference),
      ),
    ),
  ].sort();
  const split = participantSplit(
    modeledObservations.map(({ participantId }) => participantId),
    options.holdoutShare ?? 0.2,
    options.holdoutSeed ?? 'human-calibration-v1',
  );
  const training = modeledObservations.filter((observation) =>
    split.training.has(observation.participantId),
  );
  const heldout = modeledObservations.filter((observation) =>
    split.heldout.has(observation.participantId),
  );
  const coefficients = Object.fromEntries(
    ['intercept', ...descriptorKeys].map((key) => [key, 0]),
  );
  const participantEffects = Object.fromEntries(
    [...split.training].map((id) => [id, 0]),
  );
  const scenarioEffects = Object.fromEntries(
    [...new Set(training.map(({ scenarioId }) => scenarioId))].map((id) => [
      id,
      0,
    ]),
  );
  const ridgePenalty = options.ridgePenalty ?? 0.5;
  const randomEffectPenalty = options.randomEffectPenalty ?? 2;
  const iterations = options.iterations ?? 1_500;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const coefficientGradients = Object.fromEntries(
      Object.keys(coefficients).map((key) => [key, 0]),
    );
    const participantGradients = Object.fromEntries(
      Object.keys(participantEffects).map((key) => [key, 0]),
    );
    const scenarioGradients = Object.fromEntries(
      Object.keys(scenarioEffects).map((key) => [key, 0]),
    );
    let weightSum = 0;

    for (const observation of training) {
      const probability = sigmoid(
        linearPredictor(
          observation,
          coefficients,
          participantEffects,
          scenarioEffects,
        ),
      );
      const weight = inversePropensityWeight(observation.selectionProbability);
      const residual =
        weight * (outcomeValue(observation.preference) - probability);
      weightSum += weight;
      coefficientGradients.intercept += residual;
      for (const key of descriptorKeys) {
        coefficientGradients[key] +=
          residual * (observation.descriptorDifference[key] ?? 0);
      }
      participantGradients[observation.participantId] += residual;
      scenarioGradients[observation.scenarioId] += residual;
    }

    const learningRate = 0.4 / Math.sqrt(iteration + 10);
    const scale = Math.max(1, weightSum);
    for (const key of Object.keys(coefficients)) {
      const penalty =
        key === 'intercept' ? 0 : ridgePenalty * coefficients[key];
      coefficients[key] +=
        (learningRate * (coefficientGradients[key] - penalty)) / scale;
    }
    for (const key of Object.keys(participantEffects)) {
      participantEffects[key] +=
        (learningRate *
          (participantGradients[key] -
            randomEffectPenalty * participantEffects[key])) /
        scale;
    }
    for (const key of Object.keys(scenarioEffects)) {
      scenarioEffects[key] +=
        (learningRate *
          (scenarioGradients[key] -
            randomEffectPenalty * scenarioEffects[key])) /
        scale;
    }
  }

  const coefficientVariances = Object.fromEntries(
    Object.keys(coefficients).map((key) => {
      let information = ridgePenalty;
      for (const observation of training) {
        const probability = sigmoid(
          linearPredictor(
            observation,
            coefficients,
            participantEffects,
            scenarioEffects,
          ),
        );
        const value =
          key === 'intercept'
            ? 1
            : (observation.descriptorDifference[key] ?? 0);
        information +=
          inversePropensityWeight(observation.selectionProbability) *
          probability *
          (1 - probability) *
          value ** 2;
      }
      return [key, 1 / Math.max(1e-9, information)];
    }),
  );

  return {
    coefficients,
    coefficientVariances,
    descriptorKeys,
    heldoutParticipantIds: [...split.heldout].sort(),
    heldoutMetrics: heldout.length
      ? metrics(heldout, coefficients, {}, scenarioEffects)
      : null,
    participantEffects,
    scenarioEffects,
    trainingMetrics: metrics(
      training,
      coefficients,
      participantEffects,
      scenarioEffects,
    ),
    trainingParticipantIds: [...split.training].sort(),
  };
}

/** Chooses uncertain, informative replay pairs while retaining random exploration. */
export function selectActiveReplayPair(
  candidates: ReplayPairCandidate[],
  model: PreferenceModel,
  random: () => number,
  explorationShare = 0.2,
): {
  candidate: ReplayPairCandidate;
  selectionProbability: number;
  strategy: 'explore' | 'uncertainty';
} {
  if (!candidates.length)
    throw new Error('At least one replay pair is required.');
  if (random() < explorationShare) {
    const index = Math.min(
      candidates.length - 1,
      Math.floor(random() * candidates.length),
    );
    return {
      candidate: candidates[index],
      selectionProbability: explorationShare / candidates.length,
      strategy: 'explore',
    };
  }
  const scored = candidates
    .map((candidate) => {
      let linear = model.coefficients.intercept ?? 0;
      let variance = model.coefficientVariances.intercept ?? 0;
      for (const [key, difference] of Object.entries(
        candidate.descriptorDifference,
      )) {
        linear += (model.coefficients[key] ?? 0) * difference;
        variance += (model.coefficientVariances[key] ?? 0) * difference ** 2;
      }
      const probability = sigmoid(linear);
      return {
        candidate,
        score:
          (probability *
            (1 - probability) *
            Math.sqrt(Math.max(variance, 1e-9))) /
          Math.sqrt(candidate.timesShown + 1),
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.candidate.id.localeCompare(right.candidate.id),
    );
  return {
    candidate: scored[0].candidate,
    selectionProbability: 1 - explorationShare,
    strategy: 'uncertainty',
  };
}
