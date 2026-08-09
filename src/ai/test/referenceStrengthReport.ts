import {
  type NumericDistributionSummary,
  summarizeNumericDistribution,
  summarizeProportion,
} from '@/ai/test/measurement';
import type {
  ReferenceStrengthGame,
  ReferenceStrengthPair,
} from '@/ai/test/referenceStrength';

export type RatingDifferenceSummary = {
  ci95: { high: number | null; low: number | null };
  estimate: number | null;
  model: 'logisticElo';
  sampleCount: number;
};

/** Converts expected score against the frozen pool to conventional logistic Elo. */
export function pointShareToEloDifference(pointShare: number): number | null {
  if (!(pointShare > 0 && pointShare < 1)) return null;
  return Number((400 * Math.log10(pointShare / (1 - pointShare))).toFixed(3));
}

function ratingDifference(
  score: NumericDistributionSummary,
): RatingDifferenceSummary {
  return {
    ci95: {
      high: pointShareToEloDifference(score.meanCi95.high),
      low: pointShareToEloDifference(score.meanCi95.low),
    },
    estimate: score.count > 0 ? pointShareToEloDifference(score.mean) : null,
    model: 'logisticElo',
    sampleCount: score.count,
  };
}

function gameOutcome(
  game: ReferenceStrengthGame,
): 'candidateWin' | 'candidateLoss' | 'draw' | null {
  if (game.candidatePoints === 1) return 'candidateWin';
  if (game.candidatePoints === 0) return 'candidateLoss';
  if (game.candidatePoints === 0.5) return 'draw';
  return null;
}

function cumulativeIncidence(games: ReferenceStrengthGame[], maxPlies: number) {
  const defaultHorizons = [32, 64, 96, 128, 160];
  const horizons = [
    ...new Set([
      ...defaultHorizons.filter((value) => value < maxPlies),
      maxPlies,
    ]),
  ];

  return horizons.map((horizon) => {
    const events = games.filter(
      (game) => game.candidatePoints !== null && game.totalPlies <= horizon,
    );
    const count = (outcome: ReturnType<typeof gameOutcome>): number =>
      events.filter((game) => gameOutcome(game) === outcome).length;
    const censored = games.filter(
      (game) => game.candidatePoints === null && game.totalPlies <= horizon,
    ).length;
    const stillPlaying = games.length - events.length - censored;

    return {
      candidateLoss: summarizeProportion(count('candidateLoss'), games.length),
      candidateWin: summarizeProportion(count('candidateWin'), games.length),
      censored: summarizeProportion(censored, games.length),
      draw: summarizeProportion(count('draw'), games.length),
      horizon,
      stillPlaying: summarizeProportion(stillPlaying, games.length),
    };
  });
}

export function summarizeReferenceStrengthPairs(
  pairs: ReferenceStrengthPair[],
  maxPlies: number,
) {
  const games = pairs.flatMap((pair) => pair.games);
  const resolvedGames = games.flatMap((game) =>
    game.candidatePoints === null ? [] : [game.candidatePoints],
  );
  const resolvedPairs = pairs.flatMap((pair) =>
    pair.pairScore === null ? [] : [pair.pairScore],
  );
  const adjudicatedPairs = pairs.flatMap((pair) =>
    pair.adjudicatedPairScore === null ? [] : [pair.adjudicatedPairScore],
  );
  const candidatePlies = games
    .flatMap((game) => game.plies)
    .filter((ply) => ply.actorKind === 'candidate');
  const adjudicatedPointShare = summarizeNumericDistribution(adjudicatedPairs);
  const naturalPointShare = summarizeNumericDistribution(resolvedPairs);
  const strata = Object.fromEntries(
    [...new Set(pairs.map(({ stratumId }) => stratumId))]
      .sort()
      .map((stratumId) => {
        const stratumPairs = pairs.filter(
          (pair) => pair.stratumId === stratumId,
        );
        const values = stratumPairs.flatMap((pair) =>
          pair.pairScore === null ? [] : [pair.pairScore],
        );
        const adjudicatedValues = stratumPairs.flatMap((pair) =>
          pair.adjudicatedPairScore === null ? [] : [pair.adjudicatedPairScore],
        );
        return [
          stratumId,
          {
            adjudicatedPairScore:
              summarizeNumericDistribution(adjudicatedValues),
            pairScore: summarizeNumericDistribution(values),
            resolvedPairs: summarizeProportion(
              values.length,
              stratumPairs.length,
            ),
          },
        ];
      }),
  );

  return {
    candidateDecisionCount: candidatePlies.length,
    candidateFallbackShare: summarizeProportion(
      candidatePlies.filter((ply) => ply.searchResult?.fallbackKind !== 'none')
        .length,
      candidatePlies.length,
    ),
    candidatePointShareByGame: summarizeNumericDistribution(resolvedGames),
    candidatePointShareByAdjudicatedPair: adjudicatedPointShare,
    candidatePointShareByPair: naturalPointShare,
    candidateRatingDifferenceByAdjudicatedPair: ratingDifference(
      adjudicatedPointShare,
    ),
    candidateRatingDifferenceByNaturalPair: ratingDifference(naturalPointShare),
    candidateZeroDepthShare: summarizeProportion(
      candidatePlies.filter((ply) => ply.searchResult?.completedDepth === 0)
        .length,
      candidatePlies.length,
    ),
    cumulativeIncidence: cumulativeIncidence(games, maxPlies),
    resolvedGames: summarizeProportion(resolvedGames.length, games.length),
    resolvedPairs: summarizeProportion(resolvedPairs.length, pairs.length),
    strata,
    terminalCounts: games.reduce<Record<string, number>>((counts, game) => {
      counts[game.terminalType] = (counts[game.terminalType] ?? 0) + 1;
      return counts;
    }, {}),
    terminalPly: summarizeNumericDistribution(
      games.flatMap((game) =>
        game.candidatePoints === null ? [] : [game.totalPlies],
      ),
    ),
    totalGames: games.length,
    totalPairs: pairs.length,
  };
}
