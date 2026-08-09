import { createAiBehaviorProfile } from '@/ai/behavior';
import { chooseComputerAction } from '@/ai/search/rootSearch';
import type {
  AiSearchBudget,
  AiSearchResult,
  AiStrategicIntent,
} from '@/ai/types';
import type { EngineState, RuleConfig, TurnAction } from '@/domain';
import type { AiDifficulty } from '@/shared/types/session';

import { createSeededRandom } from '@/ai/test/searchTestUtils';

export const CURRENT_AI_POLICY_ADAPTER_VERSION = 1 as const;

export type AiPolicyDecisionRequest = {
  difficulty: AiDifficulty;
  ruleConfig: RuleConfig;
  searchBudget: AiSearchBudget;
  state: EngineState;
};

export type AiPolicyDecision = {
  action: TurnAction | null;
  /** Policy-specific evidence retained for audit, never required for scoring. */
  diagnostics?: unknown;
};

export interface AiPolicySession {
  decide(request: AiPolicyDecisionRequest): Promise<AiPolicyDecision>;
  dispose(): Promise<void>;
}

/**
 * A decision policy is deliberately narrower than the current search result.
 * Outcome experiments depend only on legal actions; richer diagnostics remain
 * policy-specific so an older engine can run under a newer harness.
 */
export interface AiPolicy {
  readonly id: string;
  readonly sourceHash: string;
  createSession(seed: number): Promise<AiPolicySession>;
  dispose(): Promise<void>;
}

export function createCurrentAiPolicy(sourceHash: string): AiPolicy {
  return {
    id: 'current',
    sourceHash,
    async createSession(seed) {
      const behaviorProfile = createAiBehaviorProfile(`policy-current-${seed}`);
      const random = createSeededRandom(seed);
      let previousStrategicIntent: AiStrategicIntent | null = null;

      return {
        async decide(request) {
          const result: AiSearchResult = chooseComputerAction({
            behaviorProfile,
            difficulty: request.difficulty,
            previousStrategicIntent,
            random,
            ruleConfig: request.ruleConfig,
            searchBudget: request.searchBudget,
            state: request.state,
          });
          previousStrategicIntent = result.strategicIntent;

          return {
            action: result.action,
            diagnostics: result,
          };
        },
        async dispose() {},
      };
    },
    async dispose() {},
  };
}
