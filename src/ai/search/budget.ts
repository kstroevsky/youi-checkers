import type {
  AiDifficultyPreset,
  AiSearchBudget,
  AiSearchBudgetReport,
} from '@/ai/types';
import { throwIfTimedOut, throwSearchTimeout } from '@/ai/search/shared';
import type { SearchContext } from '@/ai/search/types';

export type ResolvedSearchBudget = Omit<AiSearchBudgetReport, 'exhaustedBy'> & {
  deadline: number;
};

function requirePositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer.`);
  }

  return value;
}

/** Resolves product defaults and measurement overrides into one executable contract. */
export function resolveSearchBudget(
  budget: AiSearchBudget | undefined,
  preset: AiDifficultyPreset,
  startedAt: number,
): ResolvedSearchBudget {
  if (!budget) {
    return {
      deadline: startedAt + preset.timeBudgetMs,
      maxDepth: preset.maxDepth,
      maxEvaluatedNodes: null,
      timeBudgetMs: preset.timeBudgetMs,
      type: 'presetTime',
    };
  }

  if (budget.type === 'fixedDepth') {
    const depth = requirePositiveInteger(budget.depth, 'fixedDepth.depth');

    return {
      deadline: Number.POSITIVE_INFINITY,
      maxDepth: depth,
      maxEvaluatedNodes: null,
      timeBudgetMs: null,
      type: budget.type,
    };
  }

  if (budget.type === 'fixedNodes') {
    const maxDepth = requirePositiveInteger(
      budget.maxDepth ?? preset.maxDepth,
      'fixedNodes.maxDepth',
    );

    return {
      deadline: Number.POSITIVE_INFINITY,
      maxDepth,
      maxEvaluatedNodes: requirePositiveInteger(
        budget.maxEvaluatedNodes,
        'fixedNodes.maxEvaluatedNodes',
      ),
      timeBudgetMs: null,
      type: budget.type,
    };
  }

  if (!Number.isFinite(budget.timeBudgetMs) || budget.timeBudgetMs <= 0) {
    throw new RangeError(
      'wallClock.timeBudgetMs must be a positive finite number.',
    );
  }

  return {
    deadline: startedAt + budget.timeBudgetMs,
    maxDepth: requirePositiveInteger(
      budget.maxDepth ?? preset.maxDepth,
      'wallClock.maxDepth',
    ),
    maxEvaluatedNodes: null,
    timeBudgetMs: budget.timeBudgetMs,
    type: budget.type,
  };
}

/** Checks the equal-work limit before consulting the monotonic wall clock. */
export function throwIfSearchBudgetExhausted(context: SearchContext): void {
  if (
    context.maxEvaluatedNodes !== null &&
    context.evaluatedNodes >= context.maxEvaluatedNodes
  ) {
    context.budgetExhaustion = 'nodes';
    // Reuse the search timeout sentinel so all existing safe fallback paths apply.
    throwSearchTimeout();
  }

  try {
    throwIfTimedOut(context.now, context.deadline);
  } catch (error) {
    context.budgetExhaustion = 'time';
    throw error;
  }
}

/** Builds immutable result metadata for path assertions and report provenance. */
export function reportSearchBudget(
  budget: ResolvedSearchBudget,
  exhaustedBy: AiSearchBudgetReport['exhaustedBy'],
): AiSearchBudgetReport {
  return {
    exhaustedBy,
    maxDepth: budget.maxDepth,
    maxEvaluatedNodes: budget.maxEvaluatedNodes,
    timeBudgetMs: budget.timeBudgetMs,
    type: budget.type,
  };
}
