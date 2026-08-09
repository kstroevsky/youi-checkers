import { describe, expect, it } from 'vitest';

import {
  chooseFrozenReferenceAction,
  frozenActionKey,
} from '@/ai/test/frozenReferencePool';
import { buildTacticalOracleFixtures } from '@/ai/test/tacticalFixtures';
import {
  applyAction,
  createInitialState,
  getLegalActions,
  withRuleDefaults,
} from '@/domain';

function seededRandom(seed: number): () => number {
  let current = seed >>> 0;
  return () => {
    current = (current * 1_664_525 + 1_013_904_223) >>> 0;
    return current / 0x1_0000_0000;
  };
}

describe('frozen reference pool', () => {
  const ruleConfig = withRuleDefaults({
    drawRule: 'threefold',
    scoringMode: 'off',
  });

  it('selects a legal canonical action deterministically', () => {
    const state = createInitialState(ruleConfig);
    const decision = chooseFrozenReferenceAction({
      random: seededRandom(1),
      referenceId: 'canonical-legal-v1',
      ruleConfig,
      state,
    });
    const legalKeys = getLegalActions(state, ruleConfig)
      .map(frozenActionKey)
      .sort();

    expect(frozenActionKey(decision.action!)).toBe(legalKeys[0]);
    expect(decision.candidates.map(({ actionKey }) => actionKey)).toEqual(
      legalKeys,
    );
  });

  it('replays seeded action selection exactly', () => {
    const state = createInitialState(ruleConfig);
    const select = () =>
      frozenActionKey(
        chooseFrozenReferenceAction({
          random: seededRandom(0xdecafbad),
          referenceId: 'seeded-legal-v1',
          ruleConfig,
          state,
        }).action!,
      );

    expect(select()).toBe(select());
  });

  it('takes immediate tactical wins before the static heuristic', () => {
    const fixture = buildTacticalOracleFixtures(ruleConfig).find(
      ({ id }) => id === 'home-field-win/original',
    )!;
    const decision = chooseFrozenReferenceAction({
      random: seededRandom(7),
      referenceId: 'tactical-greedy-v1',
      ruleConfig,
      state: fixture.state,
    });
    const nextState = applyAction(fixture.state, decision.action!, ruleConfig);

    expect(nextState.status).toBe('gameOver');
    expect(nextState.victory).toMatchObject({
      winner: fixture.state.currentPlayer,
    });
  });
});
