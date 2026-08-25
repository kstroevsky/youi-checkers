import { describe, expect, it } from 'vitest';

import { getLegalActions, withRuleDefaults } from '@/domain';

import {
  POSITION_BUCKET_SCENARIOS,
  buildScenarioState,
} from './aiScenarioCatalog';

describe('AI scenario catalog', () => {
  it('keeps fixture identities unique and explicit split membership stable', () => {
    const labels = POSITION_BUCKET_SCENARIOS.map(({ label }) => label);
    const holdoutLabels = POSITION_BUCKET_SCENARIOS.filter(
      ({ strengthSplit }) => strengthSplit === 'holdout',
    ).map(({ label }) => label);

    expect(new Set(labels).size).toBe(labels.length);
    expect(holdoutLabels).toEqual([
      'midgame20',
      'turn50',
      'turn150',
      'random10b',
      'random50a',
      'random75b',
    ]);
  });

  it('builds every fixture as a playable, nonterminal continuation', () => {
    const ruleConfig = withRuleDefaults({
      drawRule: 'threefold',
      scoringMode: 'off',
    });

    for (const scenario of POSITION_BUCKET_SCENARIOS) {
      const state = buildScenarioState(scenario, ruleConfig);

      expect(state.status, scenario.label).toBe('active');
      expect(
        getLegalActions(state, ruleConfig).length,
        scenario.label,
      ).toBeGreaterThan(0);
    }
  });
});
