import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import {
  FIRST_FEATURE_POLICY_REVISION,
  loadLegacyPolicyV0,
  LEGACY_POLICY_V0_REVISION,
} from '@/ai/test/legacyPolicyV0.node';
import { loadCurrentAiPolicy } from '@/ai/test/policyProvenance.node';
import { runPolicyMatchPair } from '@/ai/test/policyMatch';
import type { StrengthFixture } from '@/ai/test/referenceStrength';
import { createInitialState, getLegalActions } from '@/domain';
import { withConfig } from '@/test/factories';

import { actionKey } from '@/ai/test/searchTestUtils';

describe('common AI policy boundary', () => {
  it('pins LegacyPolicyV0 to the feature branch merge-base', () => {
    const mergeBase = execFileSync(
      'git',
      ['rev-parse', `${FIRST_FEATURE_POLICY_REVISION}^`],
      { encoding: 'utf8' },
    ).trim();

    expect(LEGACY_POLICY_V0_REVISION).toBe(mergeBase);
  });

  it('runs legacy and current decisions through the same state and budget contract', async () => {
    const ruleConfig = withConfig();
    const state = createInitialState(ruleConfig);
    const legalActionKeys = new Set(
      getLegalActions(state, ruleConfig).map(actionKey),
    );
    const current = await loadCurrentAiPolicy();
    const legacy = await loadLegacyPolicyV0();
    const currentSession = await current.createSession(17);
    const legacySession = await legacy.createSession(17);
    const request = {
      difficulty: 'easy' as const,
      ruleConfig,
      searchBudget: {
        maxEvaluatedNodes: 64,
        type: 'fixedNodes' as const,
      },
      state,
    };

    try {
      const [currentDecision, legacyDecision] = await Promise.all([
        currentSession.decide(request),
        legacySession.decide(request),
      ]);

      expect(legalActionKeys.has(actionKey(currentDecision.action))).toBe(true);
      expect(legalActionKeys.has(actionKey(legacyDecision.action))).toBe(true);
      expect(current.sourceHash).toMatch(/^[a-f0-9]{64}$/);
      expect(legacy.sourceHash).toMatch(/^[a-f0-9]{64}$/);
      expect(current.sourceHash).not.toBe(legacy.sourceHash);
    } finally {
      await Promise.all([currentSession.dispose(), legacySession.dispose()]);
      await Promise.all([current.dispose(), legacy.dispose()]);
    }
  }, 30_000);

  it('runs both policies in a current-harness color-swapped pair', async () => {
    const ruleConfig = withConfig({ drawRule: 'none', scoringMode: 'off' });
    const fixture: StrengthFixture = {
      bucket: 'opening',
      id: 'policy-boundary-opening',
      mirror: 'original',
      origin: 'initial',
      split: 'development',
      state: createInitialState(ruleConfig),
    };
    const current = await loadCurrentAiPolicy();
    const legacy = await loadLegacyPolicyV0();

    try {
      const pair = await runPolicyMatchPair({
        adjudicateHorizon: true,
        difficulty: 'easy',
        fixture,
        maxPlies: 2,
        nodeBudget: 32,
        pairId: 'policy-boundary-pair',
        policyA: current,
        policyASeed: 11,
        policyB: legacy,
        policyBSeed: 29,
        ruleConfig,
      });

      expect(pair.games[0].policyAColor).toBe('white');
      expect(pair.games[1].policyAColor).toBe('black');
      expect(pair.games.every((game) => game.totalPlies === 2)).toBe(true);
      expect(pair.adjudicatedPairScore).not.toBeNull();
    } finally {
      await Promise.all([current.dispose(), legacy.dispose()]);
    }
  }, 30_000);
});
