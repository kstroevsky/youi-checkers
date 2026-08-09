import {
  summarizeNumericDistribution,
  summarizeProportion,
} from '@/ai/test/measurement';
import type {
  ReferenceStrengthGame,
  ReferenceStrengthPair,
} from '@/ai/test/referenceStrength';

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
    candidatePointShareByAdjudicatedPair:
      summarizeNumericDistribution(adjudicatedPairs),
    candidatePointShareByPair: summarizeNumericDistribution(resolvedPairs),
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
