import { describe, expect, it } from 'vitest';

import type {
  ReferenceStrengthGame,
  ReferenceStrengthPair,
} from '@/ai/test/referenceStrength';
import { summarizeReferenceStrengthPairs } from '@/ai/test/referenceStrengthReport';

function game(
  id: string,
  candidatePoints: number | null,
  totalPlies: number,
): ReferenceStrengthGame {
  return {
    candidatePoints,
    gameId: id,
    plies: [],
    terminalType: candidatePoints === null ? 'unfinished' : 'homeField',
    totalPlies,
  } as ReferenceStrengthGame;
}

function pair(
  id: string,
  games: [ReferenceStrengthGame, ReferenceStrengthGame],
): ReferenceStrengthPair {
  return {
    games,
    kind: 'strengthPair',
    pairId: id,
    pairScore: games.some(({ candidatePoints }) => candidatePoints === null)
      ? null
      : games.reduce(
          (sum, entry) => sum + (entry.candidatePoints as number),
          0,
        ) / 2,
    stratumId: 'fixture::reference',
  } as ReferenceStrengthPair;
}

describe('reference strength outcome summaries', () => {
  it('keeps competing terminal events, ongoing games, and censoring separate', () => {
    const summary = summarizeReferenceStrengthPairs(
      [
        pair('one', [game('win', 1, 20), game('loss', 0, 50)]),
        pair('two', [game('draw', 0.5, 70), game('censored', null, 96)]),
      ],
      96,
    );
    const at32 = summary.cumulativeIncidence.find(
      ({ horizon }) => horizon === 32,
    )!;
    const at96 = summary.cumulativeIncidence.find(
      ({ horizon }) => horizon === 96,
    )!;

    expect(at32.candidateWin.share).toBe(0.25);
    expect(at32.stillPlaying.share).toBe(0.75);
    expect(at32.censored.share).toBe(0);
    expect(at96.candidateLoss.share).toBe(0.25);
    expect(at96.draw.share).toBe(0.25);
    expect(at96.censored.share).toBe(0.25);
    expect(at96.stillPlaying.share).toBe(0);
    expect(summary.resolvedPairs.share).toBe(0.5);
  });
});
