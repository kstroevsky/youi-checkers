import { chooseComputerAction } from '@/ai';
import { actionKey } from '@/ai/search/shared';
import type { AiTranspositionMode } from '@/ai/types';
import {
  advanceGeneratedEngineState,
  getLegalActions,
  hashPosition,
  type EngineState,
  type RuleConfig,
} from '@/domain';
import type { AiDifficulty } from '@/shared/types/session';

export type ProductTranspositionAuditObservationV1 = {
  actionKey: string | null;
  completedDepth: number;
  rootScores: Array<{ actionKey: string; score: number }>;
  terminalType: string;
  transpositionMode: AiTranspositionMode;
};

export type ProductTranspositionAuditCaseV1 = {
  depth: 2 | 3 | 4;
  historyVariantId: string;
  observations: ProductTranspositionAuditObservationV1[];
  passed: boolean;
  positionHash: string;
};

export type ProductTranspositionAuditV1 = {
  cases: ProductTranspositionAuditCaseV1[];
  mismatchCount: number;
  passed: boolean;
  version: 1;
};

const MODES: AiTranspositionMode[] = ['current', 'repetitionAware', 'disabled'];

function observe(
  state: EngineState,
  config: RuleConfig,
  difficulty: AiDifficulty,
  depth: 2 | 3 | 4,
  transpositionMode: AiTranspositionMode,
): ProductTranspositionAuditObservationV1 {
  const result = chooseComputerAction({
    diagnosticAblation: { transpositionMode },
    diagnosticRootCandidateLimit: Math.max(
      1,
      getLegalActions(state, config).length,
    ),
    difficulty,
    random: () => 0,
    ruleConfig: config,
    searchBudget: { depth, type: 'fixedDepth' },
    state,
  });
  const next = result.action
    ? advanceGeneratedEngineState(state, result.action, config)
    : state;
  return {
    actionKey: result.action ? actionKey(result.action) : null,
    completedDepth: result.completedDepth,
    rootScores: result.rootCandidates
      .map((candidate) => ({
        actionKey: actionKey(candidate.action),
        score: candidate.score,
      }))
      .sort((left, right) => left.actionKey.localeCompare(right.actionKey)),
    terminalType: next.status === 'gameOver' ? next.victory.type : 'active',
    transpositionMode,
  };
}

function comparable(observation: ProductTranspositionAuditObservationV1) {
  return {
    actionKey: observation.actionKey,
    completedDepth: observation.completedDepth,
    rootScores: observation.rootScores,
    terminalType: observation.terminalType,
  };
}

/**
 * Compares actual product search under current, repetition-aware, and disabled
 * TT modes. A mismatch is evidence, never auto-normalized away.
 */
export function auditProductTranspositionsV1({
  config,
  difficulty,
  roots,
}: {
  config: RuleConfig;
  difficulty: AiDifficulty;
  roots: Array<{ historyVariantId: string; state: EngineState }>;
}): ProductTranspositionAuditV1 {
  const cases = roots.flatMap(({ historyVariantId, state }) =>
    ([2, 3, 4] as const).map((depth): ProductTranspositionAuditCaseV1 => {
      const observations = MODES.map((mode) =>
        observe(state, config, difficulty, depth, mode),
      );
      const first = JSON.stringify(comparable(observations[0]));
      const passed = observations.every(
        (observation) => JSON.stringify(comparable(observation)) === first,
      );
      return {
        depth,
        historyVariantId,
        observations,
        passed,
        positionHash: hashPosition(state),
      };
    }),
  );
  const mismatchCount = cases.filter((entry) => !entry.passed).length;
  return { cases, mismatchCount, passed: mismatchCount === 0, version: 1 };
}
