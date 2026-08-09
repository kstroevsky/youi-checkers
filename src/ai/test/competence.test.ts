import { describe, expect, it } from 'vitest';

import { chooseComputerAction } from '@/ai';
import {
  evaluateCompetenceGates,
  scoreTacticalDecision,
  summarizeCompetenceSamples,
  type TacticalDecisionSample,
} from '@/ai/test/competenceMetrics';
import { buildTacticalOracleFixtures } from '@/ai/test/tacticalFixtures';
import { createInitialState, getLegalActions } from '@/domain';
import { withConfig } from '@/test/factories';

describe('AI competence measurement', () => {
  it('can expose the complete searched root for deeper-oracle scoring', () => {
    const ruleConfig = withConfig({ drawRule: 'none', scoringMode: 'off' });
    const state = createInitialState(ruleConfig);
    const legalActionCount = getLegalActions(state, ruleConfig).length;
    const result = chooseComputerAction({
      diagnosticRootCandidateLimit: legalActionCount,
      difficulty: 'easy',
      random: () => 0,
      ruleConfig,
      searchBudget: { depth: 1, type: 'fixedDepth' },
      state,
    });

    expect(legalActionCount).toBeGreaterThan(6);
    expect(result.rootCandidates).toHaveLength(legalActionCount);
    expect(result.diagnostics.rootPreparationTransitions).toBe(
      legalActionCount,
    );
  });

  it('builds unique-win and unique-defense fixtures with exact mirrors', () => {
    const fixtures = buildTacticalOracleFixtures(
      withConfig({ drawRule: 'none', scoringMode: 'off' }),
    );

    expect(fixtures).toHaveLength(6);
    expect(
      fixtures.filter((fixture) => fixture.objective === 'uniqueWin'),
    ).toHaveLength(4);
    expect(
      fixtures.filter((fixture) => fixture.objective === 'uniqueDefense'),
    ).toHaveLength(2);
    expect(
      fixtures.every((fixture) => fixture.expectedActionKeys.length === 1),
    ).toBe(true);
    expect(fixtures.every((fixture) => fixture.state.status === 'active')).toBe(
      true,
    );
    expect(new Set(fixtures.map((fixture) => fixture.id)).size).toBe(
      fixtures.length,
    );

    for (const label of [
      'home-field-win',
      'six-stack-win',
      'immediate-defense',
    ]) {
      expect(
        fixtures.filter((fixture) => fixture.label === label),
      ).toHaveLength(2);
    }
  });

  it('scores selected actions on the deeper oracle scale', () => {
    expect(
      scoreTacticalDecision({
        catastrophicRegretThreshold: 5_000,
        expectedActionKeys: ['move:A1:B1'],
        oracleCandidates: [
          { actionKey: 'move:A1:B1', score: 14_000 },
          { actionKey: 'move:A1:A2', score: 7_000 },
        ],
        selectedActionKey: 'move:A1:A2',
      }),
    ).toEqual({
      catastrophicRegret: true,
      exactTacticalSuccess: false,
      oracleBestActionKey: 'move:A1:B1',
      oracleBestScore: 14_000,
      oracleCovered: true,
      oracleRegret: 7_000,
      oracleSelectedActionScore: 7_000,
    });
  });

  it('preserves missing oracle coverage instead of manufacturing zero regret', () => {
    expect(
      scoreTacticalDecision({
        catastrophicRegretThreshold: 5_000,
        expectedActionKeys: ['move:A1:B1'],
        oracleCandidates: [{ actionKey: 'move:A1:B1', score: 14_000 }],
        selectedActionKey: 'move:A1:A2',
      }),
    ).toMatchObject({
      catastrophicRegret: null,
      exactTacticalSuccess: false,
      oracleCovered: false,
      oracleRegret: null,
      oracleSelectedActionScore: null,
    });
  });

  it('summarizes fixed-node curves with explicit evidence denominators', () => {
    const base = {
      completedDepth: 1,
      completedRootMoves: 3,
      difficulty: 'hard' as const,
      evaluatedNodes: 64,
      fallbackKind: 'none' as const,
      fixtureId: 'fixture',
      legalActionCount: 3,
      objective: 'uniqueWin' as const,
      oracleBestActionKey: 'move:A1:B1',
      oracleBestScore: 14_000,
      partialDepth: null,
      partialRootMoves: 0,
      rootPreparationTransitions: 3,
      seed: 1,
      spatialVariant: 'original' as const,
      timedOut: true,
    };
    const samples: TacticalDecisionSample[] = [
      {
        ...base,
        catastrophicRegret: false,
        exactTacticalSuccess: true,
        nodeBudget: 64,
        oracleCovered: true,
        oracleRegret: 0,
        oracleSelectedActionScore: 14_000,
        selectedActionKey: 'move:A1:B1',
      },
      {
        ...base,
        catastrophicRegret: null,
        completedDepth: 0,
        completedRootMoves: 1,
        exactTacticalSuccess: false,
        fallbackKind: 'partialCurrentDepth',
        fixtureId: 'fixture-mirror',
        nodeBudget: 64,
        oracleCovered: false,
        oracleRegret: null,
        oracleSelectedActionScore: null,
        partialDepth: 1,
        partialRootMoves: 1,
        selectedActionKey: 'move:A1:A2',
        spatialVariant: 'horizontalMirror',
      },
      {
        ...base,
        catastrophicRegret: false,
        exactTacticalSuccess: true,
        nodeBudget: 128,
        oracleCovered: true,
        oracleRegret: 200,
        oracleSelectedActionScore: 13_800,
        selectedActionKey: 'move:A1:B1',
      },
      {
        ...base,
        catastrophicRegret: false,
        exactTacticalSuccess: true,
        fixtureId: 'defense-fixture',
        nodeBudget: 128,
        objective: 'uniqueDefense',
        oracleCovered: true,
        oracleRegret: 100,
        oracleSelectedActionScore: 13_900,
        selectedActionKey: 'move:A1:B1',
      },
    ];

    const summary = summarizeCompetenceSamples(samples);

    expect(summary).toHaveLength(2);
    expect(summary[0]).toMatchObject({
      difficulty: 'hard',
      nodeBudget: 64,
      sampleCount: 2,
      oracleCoveredCount: 1,
      oracleMissingCount: 1,
    });
    expect(summary[0].oracleCoverage).toMatchObject({ count: 1, total: 2 });
    expect(summary[0].oracleRegret?.count).toBe(1);
    expect(summary[0].catastrophicRegretShare).toMatchObject({
      count: 0,
      total: 1,
    });
    expect(summary[0].fullRootCoverageShare).toMatchObject({
      count: 1,
      total: 2,
    });
    expect(summary[0].uniqueWinAccuracy).toMatchObject({ count: 1, total: 2 });
    expect(summary[0].uniqueDefenseAccuracy).toBeNull();
    expect(summary[1].nodeBudget).toBe(128);

    expect(
      evaluateCompetenceGates(summary, {
        maxCatastrophicRegretShare: { easy: 0.1, hard: 0, medium: 0.05 },
        maxP95OracleRegret: { easy: 5_000, hard: 1_000, medium: 2_500 },
        minTacticalAccuracy: { easy: 0.9, hard: 1, medium: 0.95 },
      }),
    ).toMatchObject({
      evaluatedPoints: [{ difficulty: 'hard', nodeBudget: 128 }],
      failures: [],
      verdict: 'pass',
    });
  });
});
