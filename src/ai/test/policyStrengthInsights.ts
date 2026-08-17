import {
  computeNormalizedLempelZiv,
  computeRecurrenceQuantification,
} from '@/ai/test/advancedMetrics';
import type {
  PolicyMatchGame,
  PolicyMatchPair,
  PolicyMatchPly,
} from '@/ai/test/policyMatch';
import type { ActionKind, Player, TurnAction } from '@/domain';

export const POLICY_STRENGTH_INSIGHTS_SCHEMA_VERSION = 1;

export const POLICY_STRENGTH_PHASES = [
  'opening',
  'earlyMidgame',
  'lateMidgame',
  'endgame',
] as const;

export type PolicyStrengthPhase = (typeof POLICY_STRENGTH_PHASES)[number];

const ACTION_KINDS: ActionKind[] = [
  'jumpSequence',
  'manualUnfreeze',
  'climbOne',
  'moveSingleToEmpty',
  'splitOneFromStack',
  'splitTwoFromStack',
  'friendlyStackTransfer',
];

const BEHAVIOR_METRICS = [
  'actionKindDiversity',
  'actionKindSwitchRate',
  'exactActionReuseRate',
  'jumpShare',
  'meanDisplacement',
  'multiJumpShare',
  'regionDiversity',
  'retainedTurnShare',
  'sameRegionRepeatRate',
  'sameSourceRepeatRate',
  'sourceDiversity',
  'stackManipulationShare',
] as const;

export type PolicyBehaviorMetric = (typeof BEHAVIOR_METRICS)[number];

export type ConfidenceInterval = {
  high: number;
  low: number;
};

export type DistributionSummary = {
  ci95: ConfidenceInterval;
  count: number;
  mean: number;
  standardError: number;
};

export type PairedMetricComparison = {
  baseline: DistributionSummary;
  candidate: DistributionSummary;
  delta: DistributionSummary;
};

export type PolicyStrengthInsights = {
  actionKinds: {
    overallShares: Record<string, Record<ActionKind, number>>;
    policyPlyShares: Record<string, number>;
    phaseJensenShannonDivergence: Record<PolicyStrengthPhase, number>;
    phaseShares: Record<
      PolicyStrengthPhase,
      Record<string, Record<ActionKind, number>>
    >;
  };
  behavior: Record<PolicyBehaviorMetric, PairedMetricComparison>;
  fixtures: Record<
    string,
    {
      adjudicatedCandidatePointShare: DistributionSummary;
      gameCount: number;
      naturalResolutionShare: number;
      pairCount: number;
      repeatedPositionPlyShare: number;
      twoPlyUndoRate: number;
    }
  >;
  gameDynamics: {
    actionKindLempelZiv: DistributionSummary;
    naturalResolutionShare: number;
    positionLempelZiv: DistributionSummary;
    recurrenceDeterminism: DistributionSummary;
    recurrenceLaminarity: DistributionSummary;
    recurrenceRate: DistributionSummary;
    repeatedPositionPlyShare: DistributionSummary;
    twoPlyUndoRate: DistributionSummary;
    uniquePositionShare: DistributionSummary;
  };
  opening: {
    firstActionEntropy: Record<string, number>;
    firstActionUniqueShare: Record<string, number>;
    firstFourKindLineEntropy: Record<string, number>;
    firstFourKindLineUniqueShare: Record<string, number>;
  };
  spatialMirrors: Record<
    string,
    {
      averagePointShare: number;
      mirrorMinusOriginal: number;
      mirrorPointShare: number;
      originalPointShare: number;
      seedScheduleIdentical: boolean;
    }
  >;
  policies: {
    baseline: string;
    candidate: string;
  };
  population: {
    gameCount: number;
    naturalGameCount: number;
    pairCount: number;
    plyCount: number;
    terminalCounts: Record<string, number>;
  };
  schemaVersion: number;
  strength: {
    adjudicatedCandidatePointShare: DistributionSummary;
    candidateBlackMinusWhite: DistributionSummary;
    candidateGamePointShareByColor: Record<Player, DistributionSummary>;
    naturalCandidatePointShare: DistributionSummary | null;
    naturallyResolvedPairCount: number;
  };
};

type PolicyGameBehavior = Record<PolicyBehaviorMetric, number>;

type GameDynamics = {
  actionKindLempelZiv: number;
  positionLempelZiv: number;
  recurrenceDeterminism: number;
  recurrenceLaminarity: number;
  recurrenceRate: number;
  repeatedPositionPlyShare: number;
  twoPlyUndoRate: number;
  uniquePositionShare: number;
};

type PairObservation = {
  baseline: PolicyGameBehavior;
  candidate: PolicyGameBehavior;
  candidateAdjudicatedScore: number | null;
  candidateNaturalScore: number | null;
  dynamics: GameDynamics;
};

type FixtureAccumulator = {
  adjudicatedScores: number[];
  gameCount: number;
  naturalGameCount: number;
  pairCount: number;
  policyASeeds: number[];
  policyBSeeds: number[];
  repeatedPositionPlyShares: number[];
  twoPlyUndoRates: number[];
};

function round(value: number, digits = 6): number {
  return Number(value.toFixed(digits));
}

function average(values: number[]): number {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function summarize(values: number[]): DistributionSummary {
  const mean = average(values);
  const variance =
    values.length > 1
      ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
        (values.length - 1)
      : 0;
  const standardError = Math.sqrt(variance / Math.max(1, values.length));
  const radius = 1.96 * standardError;

  return {
    ci95: { high: round(mean + radius), low: round(mean - radius) },
    count: values.length,
    mean: round(mean),
    standardError: round(standardError),
  };
}

function normalizedEntropy(values: string[], supportSize?: number): number {
  if (values.length <= 1) return 0;
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const entropy = [...counts.values()].reduce((sum, count) => {
    const probability = count / values.length;
    return sum - probability * Math.log2(probability);
  }, 0);
  const maximum = Math.log2(
    Math.max(2, Math.min(values.length, supportSize ?? counts.size)),
  );
  return round(entropy / maximum);
}

function distributionEntropy(values: string[]): number {
  if (!values.length) return 0;
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return round(
    [...counts.values()].reduce((sum, count) => {
      const probability = count / values.length;
      return sum - probability * Math.log2(probability);
    }, 0),
  );
}

function transitionRate(
  values: string[],
  predicate: (a: string, b: string) => boolean,
): number {
  if (values.length <= 1) return 0;
  let matches = 0;
  for (let index = 1; index < values.length; index += 1) {
    if (predicate(values[index - 1], values[index])) matches += 1;
  }
  return round(matches / (values.length - 1));
}

function actionSource(action: TurnAction): string {
  return action.type === 'manualUnfreeze' ? action.coord : action.source;
}

function actionRegion(action: TurnAction, player: Player): string {
  const source = actionSource(action);
  const column = source[0];
  const row = Number(source[1]);
  const fileBand =
    column === 'A' || column === 'B'
      ? 'left'
      : column === 'E' || column === 'F'
        ? 'right'
        : 'center';
  const relativeRow = player === 'white' ? row : 7 - row;
  const rankBand =
    relativeRow <= 2 ? 'rear' : relativeRow <= 4 ? 'mid' : 'front';
  return `${fileBand}-${rankBand}`;
}

function coordDistance(from: string, to: string): number {
  return (
    Math.abs(from.charCodeAt(0) - to.charCodeAt(0)) +
    Math.abs(Number(from[1]) - Number(to[1]))
  );
}

function actionDisplacement(action: TurnAction): number {
  if (action.type === 'manualUnfreeze') return 0;
  if (action.type !== 'jumpSequence')
    return coordDistance(action.source, action.target);

  let distance = 0;
  let previous = action.source;
  for (const destination of action.path) {
    distance += coordDistance(previous, destination);
    previous = destination;
  }
  return distance;
}

function getAction(ply: PolicyMatchPly): TurnAction | null {
  return ply.decision.action;
}

function analyzePolicyBehavior(
  game: PolicyMatchGame,
  policyId: string,
): PolicyGameBehavior {
  const policyPlies = game.plies.filter((ply) => ply.policyId === policyId);
  const actions = policyPlies
    .map(getAction)
    .filter((action): action is TurnAction => action !== null);
  const kinds = actions.map((action) => action.type);
  const sources = actions.map(actionSource);
  const regions = actions.map((action, index) =>
    actionRegion(action, policyPlies[index].actor),
  );
  const exactActions = policyPlies.map((ply) => ply.actionKey);
  const moveCount = Math.max(1, actions.length);
  const retainedTurns = game.plies.filter(
    (ply, index) =>
      ply.policyId === policyId && game.plies[index - 1]?.policyId === policyId,
  ).length;

  return {
    actionKindDiversity: normalizedEntropy(kinds, ACTION_KINDS.length),
    actionKindSwitchRate: transitionRate(
      kinds,
      (before, after) => before !== after,
    ),
    exactActionReuseRate: round(
      1 - new Set(exactActions).size / Math.max(1, exactActions.length),
    ),
    jumpShare: round(
      actions.filter((action) => action.type === 'jumpSequence').length /
        moveCount,
    ),
    meanDisplacement: round(average(actions.map(actionDisplacement))),
    multiJumpShare: round(
      actions.filter(
        (action) => action.type === 'jumpSequence' && action.path.length > 1,
      ).length / moveCount,
    ),
    regionDiversity: normalizedEntropy(regions, 9),
    retainedTurnShare: round(retainedTurns / moveCount),
    sameRegionRepeatRate: transitionRate(
      regions,
      (before, after) => before === after,
    ),
    sameSourceRepeatRate: transitionRate(
      sources,
      (before, after) => before === after,
    ),
    sourceDiversity: normalizedEntropy(sources, 36),
    stackManipulationShare: round(
      actions.filter((action) =>
        [
          'climbOne',
          'friendlyStackTransfer',
          'splitOneFromStack',
          'splitTwoFromStack',
        ].includes(action.type),
      ).length / moveCount,
    ),
  };
}

function analyzeGameDynamics(game: PolicyMatchGame): GameDynamics {
  const positions = [
    game.plies[0]?.beforePositionHash,
    ...game.plies.map((ply) => ply.afterPositionHash),
  ].filter((value): value is string => Boolean(value));
  const seen = new Set<string>();
  let repeatedPositions = 0;
  for (const position of positions) {
    if (seen.has(position)) repeatedPositions += 1;
    seen.add(position);
  }
  let twoPlyUndos = 0;
  for (let index = 1; index < game.plies.length; index += 1) {
    if (
      game.plies[index].afterPositionHash ===
      game.plies[index - 1].beforePositionHash
    ) {
      twoPlyUndos += 1;
    }
  }
  const recurrence = computeRecurrenceQuantification(positions);
  return {
    actionKindLempelZiv: computeNormalizedLempelZiv(
      game.plies.map((ply) => getAction(ply)?.type ?? 'none'),
    ),
    positionLempelZiv: computeNormalizedLempelZiv(positions),
    recurrenceDeterminism: recurrence.determinism,
    recurrenceLaminarity: recurrence.laminarity,
    recurrenceRate: recurrence.recurrenceRate,
    repeatedPositionPlyShare: round(
      repeatedPositions / Math.max(1, positions.length),
    ),
    twoPlyUndoRate: round(twoPlyUndos / Math.max(1, game.plies.length - 1)),
    uniquePositionShare: round(seen.size / Math.max(1, positions.length)),
  };
}

function candidatePairScore(
  pair: PolicyMatchPair,
  candidateId: string,
  natural: boolean,
): number | null {
  const score = natural ? pair.pairScore : pair.adjudicatedPairScore;
  if (score === null) return null;
  return pair.policyAId === candidateId ? score : 1 - score;
}

function candidateGameScore(
  game: PolicyMatchGame,
  candidateId: string,
  natural: boolean,
): number | null {
  const policyAScore = natural
    ? game.policyAPoints
    : game.adjudicatedPolicyAPoints;
  if (policyAScore === null) return null;
  const policyAId = game.policyByColor[game.policyAColor];
  return policyAId === candidateId ? policyAScore : 1 - policyAScore;
}

function averageBehavior(
  games: PolicyMatchGame[],
  policyId: string,
): PolicyGameBehavior {
  const observations = games.map((game) =>
    analyzePolicyBehavior(game, policyId),
  );
  return Object.fromEntries(
    BEHAVIOR_METRICS.map((metric) => [
      metric,
      average(observations.map((entry) => entry[metric])),
    ]),
  ) as PolicyGameBehavior;
}

function averageDynamics(games: PolicyMatchGame[]): GameDynamics {
  const observations = games.map(analyzeGameDynamics);
  return Object.fromEntries(
    (Object.keys(observations[0] ?? {}) as Array<keyof GameDynamics>).map(
      (metric) => [metric, average(observations.map((entry) => entry[metric]))],
    ),
  ) as GameDynamics;
}

function zeroActionCounts(): Record<ActionKind, number> {
  return Object.fromEntries(ACTION_KINDS.map((kind) => [kind, 0])) as Record<
    ActionKind,
    number
  >;
}

function actionShares(
  counts: Record<ActionKind, number>,
): Record<ActionKind, number> {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return Object.fromEntries(
    ACTION_KINDS.map((kind) => [
      kind,
      round(counts[kind] / Math.max(1, total)),
    ]),
  ) as Record<ActionKind, number>;
}

function jensenShannon(
  left: Record<ActionKind, number>,
  right: Record<ActionKind, number>,
): number {
  const kl = (
    distribution: Record<ActionKind, number>,
    midpoint: Record<ActionKind, number>,
  ) =>
    ACTION_KINDS.reduce((sum, kind) => {
      const probability = distribution[kind];
      return probability > 0
        ? sum + probability * Math.log2(probability / midpoint[kind])
        : sum;
    }, 0);
  const midpoint = Object.fromEntries(
    ACTION_KINDS.map((kind) => [kind, (left[kind] + right[kind]) / 2]),
  ) as Record<ActionKind, number>;
  return round((kl(left, midpoint) + kl(right, midpoint)) / 2);
}

function phaseForPly(index: number, horizonPlies: number): PolicyStrengthPhase {
  return POLICY_STRENGTH_PHASES[
    Math.min(3, Math.floor((index * 4) / Math.max(1, horizonPlies)))
  ];
}

export function summarizePolicyStrengthInsights(
  pairs: Iterable<PolicyMatchPair>,
  options: { baselineId: string; candidateId: string; horizonPlies: number },
): PolicyStrengthInsights {
  const pairObservations: PairObservation[] = [];
  const actionCounts: Record<string, Record<ActionKind, number>> = {
    [options.baselineId]: zeroActionCounts(),
    [options.candidateId]: zeroActionCounts(),
  };
  const phaseCounts = Object.fromEntries(
    POLICY_STRENGTH_PHASES.map((phase) => [
      phase,
      {
        [options.baselineId]: zeroActionCounts(),
        [options.candidateId]: zeroActionCounts(),
      },
    ]),
  ) as Record<PolicyStrengthPhase, Record<string, Record<ActionKind, number>>>;
  const firstActions: Record<string, string[]> = {
    [options.baselineId]: [],
    [options.candidateId]: [],
  };
  const firstFourKindLines: Record<string, string[]> = {
    [options.baselineId]: [],
    [options.candidateId]: [],
  };
  const fixtureAccumulators: Record<string, FixtureAccumulator> = {};
  const terminalCounts: Record<string, number> = {};
  const colorScores: Record<Player, number[]> = { black: [], white: [] };
  const pairColorDeltas: number[] = [];
  let gameCount = 0;
  let naturalGameCount = 0;
  let plyCount = 0;

  for (const pair of pairs) {
    if (![pair.policyAId, pair.policyBId].includes(options.candidateId)) {
      throw new Error(
        `Candidate policy ${options.candidateId} is missing from ${pair.pairId}.`,
      );
    }
    if (![pair.policyAId, pair.policyBId].includes(options.baselineId)) {
      throw new Error(
        `Baseline policy ${options.baselineId} is missing from ${pair.pairId}.`,
      );
    }

    const games = [...pair.games];
    const candidate = averageBehavior(games, options.candidateId);
    const baseline = averageBehavior(games, options.baselineId);
    const dynamics = averageDynamics(games);
    const adjudicatedScore = candidatePairScore(
      pair,
      options.candidateId,
      false,
    );
    const naturalScore = candidatePairScore(pair, options.candidateId, true);
    pairObservations.push({
      baseline,
      candidate,
      candidateAdjudicatedScore: adjudicatedScore,
      candidateNaturalScore: naturalScore,
      dynamics,
    });

    const fixture = (fixtureAccumulators[pair.fixtureId] ??= {
      adjudicatedScores: [],
      gameCount: 0,
      naturalGameCount: 0,
      pairCount: 0,
      policyASeeds: [],
      policyBSeeds: [],
      repeatedPositionPlyShares: [],
      twoPlyUndoRates: [],
    });
    fixture.pairCount += 1;
    fixture.policyASeeds.push(pair.policyASeed);
    fixture.policyBSeeds.push(pair.policyBSeed);
    if (adjudicatedScore !== null)
      fixture.adjudicatedScores.push(adjudicatedScore);
    const pairScoresByCandidateColor: Partial<Record<Player, number>> = {};

    for (const game of games) {
      gameCount += 1;
      fixture.gameCount += 1;
      plyCount += game.plies.length;
      terminalCounts[game.terminalType] =
        (terminalCounts[game.terminalType] ?? 0) + 1;
      const natural = game.terminalType !== 'unfinished';
      if (natural) {
        naturalGameCount += 1;
        fixture.naturalGameCount += 1;
      }
      const gameDynamics = analyzeGameDynamics(game);
      fixture.repeatedPositionPlyShares.push(
        gameDynamics.repeatedPositionPlyShare,
      );
      fixture.twoPlyUndoRates.push(gameDynamics.twoPlyUndoRate);
      const colorScore = candidateGameScore(game, options.candidateId, false);
      const candidateColor = (Object.entries(game.policyByColor).find(
        ([, policyId]) => policyId === options.candidateId,
      )?.[0] ?? 'white') as Player;
      if (colorScore !== null) colorScores[candidateColor].push(colorScore);
      if (colorScore !== null)
        pairScoresByCandidateColor[candidateColor] = colorScore;

      for (const policyId of [options.candidateId, options.baselineId]) {
        const policyPlies = game.plies.filter(
          (ply) => ply.policyId === policyId,
        );
        const policyActions = policyPlies
          .map(getAction)
          .filter((action): action is TurnAction => action !== null);
        if (policyPlies[0])
          firstActions[policyId].push(policyPlies[0].actionKey);
        firstFourKindLines[policyId].push(
          policyActions
            .slice(0, 4)
            .map((action) => action.type)
            .join('>'),
        );
      }

      game.plies.forEach((ply, index) => {
        const action = getAction(ply);
        if (!action || !actionCounts[ply.policyId]) return;
        actionCounts[ply.policyId][action.type] += 1;
        phaseCounts[phaseForPly(index, options.horizonPlies)][ply.policyId][
          action.type
        ] += 1;
      });
    }
    if (
      pairScoresByCandidateColor.black !== undefined &&
      pairScoresByCandidateColor.white !== undefined
    ) {
      pairColorDeltas.push(
        pairScoresByCandidateColor.black - pairScoresByCandidateColor.white,
      );
    }
  }

  const behavior = Object.fromEntries(
    BEHAVIOR_METRICS.map((metric) => {
      const candidateValues = pairObservations.map(
        (entry) => entry.candidate[metric],
      );
      const baselineValues = pairObservations.map(
        (entry) => entry.baseline[metric],
      );
      return [
        metric,
        {
          baseline: summarize(baselineValues),
          candidate: summarize(candidateValues),
          delta: summarize(
            candidateValues.map(
              (value, index) => value - baselineValues[index],
            ),
          ),
        },
      ];
    }),
  ) as Record<PolicyBehaviorMetric, PairedMetricComparison>;

  const dynamics = <TKey extends keyof GameDynamics>(key: TKey) =>
    summarize(pairObservations.map((entry) => entry.dynamics[key]));
  const phaseShares = Object.fromEntries(
    POLICY_STRENGTH_PHASES.map((phase) => [
      phase,
      {
        [options.baselineId]: actionShares(
          phaseCounts[phase][options.baselineId],
        ),
        [options.candidateId]: actionShares(
          phaseCounts[phase][options.candidateId],
        ),
      },
    ]),
  ) as PolicyStrengthInsights['actionKinds']['phaseShares'];
  const fixtures = Object.fromEntries(
    Object.entries(fixtureAccumulators).map(([fixtureId, fixture]) => [
      fixtureId,
      {
        adjudicatedCandidatePointShare: summarize(fixture.adjudicatedScores),
        gameCount: fixture.gameCount,
        naturalResolutionShare: round(
          fixture.naturalGameCount / Math.max(1, fixture.gameCount),
        ),
        pairCount: fixture.pairCount,
        repeatedPositionPlyShare: round(
          average(fixture.repeatedPositionPlyShares),
        ),
        twoPlyUndoRate: round(average(fixture.twoPlyUndoRates)),
      },
    ]),
  ) as PolicyStrengthInsights['fixtures'];
  const spatialMirrors = Object.fromEntries(
    Object.entries(fixtures)
      .filter(([fixtureId]) => !fixtureId.endsWith('-mirror-horizontal'))
      .flatMap(([fixtureId, original]) => {
        const mirror = fixtures[`${fixtureId}-mirror-horizontal`];
        if (!mirror) return [];
        return [
          [
            fixtureId,
            {
              averagePointShare: round(
                (original.adjudicatedCandidatePointShare.mean +
                  mirror.adjudicatedCandidatePointShare.mean) /
                  2,
              ),
              mirrorMinusOriginal: round(
                mirror.adjudicatedCandidatePointShare.mean -
                  original.adjudicatedCandidatePointShare.mean,
              ),
              mirrorPointShare: mirror.adjudicatedCandidatePointShare.mean,
              originalPointShare: original.adjudicatedCandidatePointShare.mean,
              seedScheduleIdentical:
                JSON.stringify(fixtureAccumulators[fixtureId].policyASeeds) ===
                  JSON.stringify(
                    fixtureAccumulators[`${fixtureId}-mirror-horizontal`]
                      .policyASeeds,
                  ) &&
                JSON.stringify(fixtureAccumulators[fixtureId].policyBSeeds) ===
                  JSON.stringify(
                    fixtureAccumulators[`${fixtureId}-mirror-horizontal`]
                      .policyBSeeds,
                  ),
            },
          ],
        ];
      }),
  ) as PolicyStrengthInsights['spatialMirrors'];

  return {
    actionKinds: {
      overallShares: {
        [options.baselineId]: actionShares(actionCounts[options.baselineId]),
        [options.candidateId]: actionShares(actionCounts[options.candidateId]),
      },
      policyPlyShares: {
        [options.baselineId]: round(
          Object.values(actionCounts[options.baselineId]).reduce(
            (sum, count) => sum + count,
            0,
          ) / Math.max(1, plyCount),
        ),
        [options.candidateId]: round(
          Object.values(actionCounts[options.candidateId]).reduce(
            (sum, count) => sum + count,
            0,
          ) / Math.max(1, plyCount),
        ),
      },
      phaseJensenShannonDivergence: Object.fromEntries(
        POLICY_STRENGTH_PHASES.map((phase) => [
          phase,
          jensenShannon(
            phaseShares[phase][options.candidateId],
            phaseShares[phase][options.baselineId],
          ),
        ]),
      ) as Record<PolicyStrengthPhase, number>,
      phaseShares,
    },
    behavior,
    fixtures,
    gameDynamics: {
      actionKindLempelZiv: dynamics('actionKindLempelZiv'),
      naturalResolutionShare: round(naturalGameCount / Math.max(1, gameCount)),
      positionLempelZiv: dynamics('positionLempelZiv'),
      recurrenceDeterminism: dynamics('recurrenceDeterminism'),
      recurrenceLaminarity: dynamics('recurrenceLaminarity'),
      recurrenceRate: dynamics('recurrenceRate'),
      repeatedPositionPlyShare: dynamics('repeatedPositionPlyShare'),
      twoPlyUndoRate: dynamics('twoPlyUndoRate'),
      uniquePositionShare: dynamics('uniquePositionShare'),
    },
    opening: {
      firstActionEntropy: {
        [options.baselineId]: distributionEntropy(
          firstActions[options.baselineId],
        ),
        [options.candidateId]: distributionEntropy(
          firstActions[options.candidateId],
        ),
      },
      firstActionUniqueShare: {
        [options.baselineId]: round(
          new Set(firstActions[options.baselineId]).size /
            Math.max(1, firstActions[options.baselineId].length),
        ),
        [options.candidateId]: round(
          new Set(firstActions[options.candidateId]).size /
            Math.max(1, firstActions[options.candidateId].length),
        ),
      },
      firstFourKindLineEntropy: {
        [options.baselineId]: distributionEntropy(
          firstFourKindLines[options.baselineId],
        ),
        [options.candidateId]: distributionEntropy(
          firstFourKindLines[options.candidateId],
        ),
      },
      firstFourKindLineUniqueShare: {
        [options.baselineId]: round(
          new Set(firstFourKindLines[options.baselineId]).size /
            Math.max(1, firstFourKindLines[options.baselineId].length),
        ),
        [options.candidateId]: round(
          new Set(firstFourKindLines[options.candidateId]).size /
            Math.max(1, firstFourKindLines[options.candidateId].length),
        ),
      },
    },
    policies: { baseline: options.baselineId, candidate: options.candidateId },
    population: {
      gameCount,
      naturalGameCount,
      pairCount: pairObservations.length,
      plyCount,
      terminalCounts,
    },
    schemaVersion: POLICY_STRENGTH_INSIGHTS_SCHEMA_VERSION,
    spatialMirrors,
    strength: {
      adjudicatedCandidatePointShare: summarize(
        pairObservations
          .map((entry) => entry.candidateAdjudicatedScore)
          .filter((value): value is number => value !== null),
      ),
      candidateBlackMinusWhite: summarize(pairColorDeltas),
      candidateGamePointShareByColor: {
        black: summarize(colorScores.black),
        white: summarize(colorScores.white),
      },
      naturalCandidatePointShare: pairObservations.some(
        (entry) => entry.candidateNaturalScore !== null,
      )
        ? summarize(
            pairObservations
              .map((entry) => entry.candidateNaturalScore)
              .filter((value): value is number => value !== null),
          )
        : null,
      naturallyResolvedPairCount: pairObservations.filter(
        (entry) => entry.candidateNaturalScore !== null,
      ).length,
    },
  };
}
