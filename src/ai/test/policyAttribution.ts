import type { AiPolicy, AiPolicyDecision } from '@/ai/test/policy';
import type { AiSearchDiagnosticAblation } from '@/ai/types';
import type { StrengthFixture } from '@/ai/test/referenceStrength';
import {
  mirrorActionHorizontally,
  mirrorGameStateHorizontally,
} from '@/ai/test/symmetry';
import type { RuleConfig, TurnAction } from '@/domain';
import type { AiDifficulty } from '@/shared/types/session';

import { actionKey } from '@/ai/test/searchTestUtils';

export type PolicyMirrorSample = {
  equivalent: boolean;
  fixtureId: string;
  mirroredActionKey: string | null;
  mirroredExpectedActionKey: string | null;
  originalActionKey: string | null;
  seed: number;
};

export type PolicyMirrorSummary = {
  equivalentCount: number;
  equivalentShare: number;
  sampleCount: number;
  samples: PolicyMirrorSample[];
};

function optionalActionKey(action: TurnAction | null): string | null {
  return action ? actionKey(action) : null;
}

function mirrorDecisionAction(decision: AiPolicyDecision): TurnAction | null {
  return decision.action ? mirrorActionHorizontally(decision.action) : null;
}

export async function measurePolicyMirrorEquivariance({
  difficulty,
  diagnosticAblation = null,
  fixtures,
  nodeBudget,
  policy,
  ruleConfig,
  seeds,
}: {
  difficulty: AiDifficulty;
  diagnosticAblation?: AiSearchDiagnosticAblation | null;
  fixtures: StrengthFixture[];
  nodeBudget: number;
  policy: AiPolicy;
  ruleConfig: RuleConfig;
  seeds: number[];
}): Promise<PolicyMirrorSummary> {
  const samples: PolicyMirrorSample[] = [];

  for (const fixture of fixtures) {
    if (fixture.mirror !== 'original') {
      throw new Error(
        `Mirror attribution expects original fixtures, received ${fixture.id}.`,
      );
    }
    const mirroredState = mirrorGameStateHorizontally(fixture.state);

    for (const seed of seeds) {
      const originalSession = await policy.createSession(seed);
      const mirroredSession = await policy.createSession(seed);

      try {
        const request = {
          difficulty,
          diagnosticAblation,
          ruleConfig,
          searchBudget: {
            maxEvaluatedNodes: nodeBudget,
            type: 'fixedNodes' as const,
          },
        };
        const [original, mirrored] = await Promise.all([
          originalSession.decide({ ...request, state: fixture.state }),
          mirroredSession.decide({ ...request, state: mirroredState }),
        ]);
        const expectedMirrored = mirrorDecisionAction(original);
        const mirroredActionKey = optionalActionKey(mirrored.action);
        const mirroredExpectedActionKey = optionalActionKey(expectedMirrored);
        samples.push({
          equivalent: mirroredActionKey === mirroredExpectedActionKey,
          fixtureId: fixture.id,
          mirroredActionKey,
          mirroredExpectedActionKey,
          originalActionKey: optionalActionKey(original.action),
          seed,
        });
      } finally {
        await Promise.all([
          originalSession.dispose(),
          mirroredSession.dispose(),
        ]);
      }
    }
  }

  const equivalentCount = samples.filter((sample) => sample.equivalent).length;
  return {
    equivalentCount,
    equivalentShare: equivalentCount / Math.max(1, samples.length),
    sampleCount: samples.length,
    samples,
  };
}
