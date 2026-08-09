import { describe, expect, it } from 'vitest';

import {
  runReferenceStrengthGame,
  runReferenceStrengthPair,
  type StrengthFixture,
} from '@/ai/test/referenceStrength';
import { buildTacticalOracleFixtures } from '@/ai/test/tacticalFixtures';
import { createInitialState, withRuleDefaults } from '@/domain';

describe('reference strength horizon adjudication', () => {
  const ruleConfig = withRuleDefaults({
    drawRule: 'threefold',
    scoringMode: 'off',
  });
  const opening: StrengthFixture = {
    bucket: 'opening',
    id: 'opening-test',
    split: 'development',
    state: createInitialState(ruleConfig),
  };

  it('keeps an unfinished natural result while scoring the separate horizon endpoint', () => {
    const game = runReferenceStrengthGame({
      adjudicateHorizon: true,
      candidateColor: 'white',
      candidateDifficulty: 'hard',
      candidateSeed: 1,
      fixture: opening,
      gameId: 'opening/white',
      maxPlies: 0,
      nodeBudget: 1,
      referenceId: 'canonical-legal-v1',
      referenceSeed: 2,
      ruleConfig,
    });

    expect(game.candidatePoints).toBeNull();
    expect(game.terminalType).toBe('unfinished');
    expect(game.adjudicatedCandidatePoints).toBe(0.5);
    expect(game.adjudicationType).toBe('horizonDomainTiebreak');
  });

  it('uses the natural terminal result instead of re-adjudicating it', () => {
    const tactical = buildTacticalOracleFixtures(ruleConfig).find(
      ({ id }) => id === 'home-field-win/original',
    )!;
    const game = runReferenceStrengthGame({
      adjudicateHorizon: true,
      candidateColor: tactical.state.currentPlayer,
      candidateDifficulty: 'hard',
      candidateSeed: 3,
      fixture: {
        bucket: 'tactical',
        id: tactical.id,
        split: 'development',
        state: tactical.state,
      },
      gameId: 'tactical/natural',
      maxPlies: 1,
      nodeBudget: 1,
      referenceId: 'canonical-legal-v1',
      referenceSeed: 4,
      ruleConfig,
    });

    expect(game.candidatePoints).toBe(1);
    expect(game.adjudicatedCandidatePoints).toBe(1);
    expect(game.adjudicationType).toBe('natural');
  });

  it('produces a complete color-swapped horizon pair without changing natural censoring', () => {
    const pair = runReferenceStrengthPair({
      adjudicateHorizon: true,
      candidateDifficulty: 'hard',
      candidateSeed: 5,
      fixture: opening,
      maxPlies: 0,
      nodeBudget: 1,
      pairIndex: 0,
      referenceId: 'canonical-legal-v1',
      referenceSeed: 6,
      ruleConfig,
    });

    expect(pair.pairScore).toBeNull();
    expect(pair.resolvedGameCount).toBe(0);
    expect(pair.adjudicatedPairScore).toBe(0.5);
  });
});
