import type { AiDifficultyPreset } from '@/ai/types';

/** Exact product difficulty presets used by the browser worker and the tests. */
export const AI_DIFFICULTY_PRESETS: Record<'easy' | 'medium' | 'hard', AiDifficultyPreset> = {
  easy: {
    timeBudgetMs: 120,
    maxDepth: 2,
    policyPriorWeight: 80,
    quietMoveLimit: 8,
    repetitionPenalty: 120,
    selfUndoPenalty: 220,
    rootCandidateLimit: 4,
    varietyTemperature: 0.35,
    varietyThreshold: 0.08,
    varietyTopCount: 3,
  },
  medium: {
    timeBudgetMs: 400,
    maxDepth: 4,
    policyPriorWeight: 140,
    quietMoveLimit: 16,
    repetitionPenalty: 180,
    selfUndoPenalty: 320,
    rootCandidateLimit: 5,
    varietyTemperature: 0.22,
    varietyThreshold: 0.03,
    varietyTopCount: 2,
  },
  hard: {
    timeBudgetMs: 1200,
    maxDepth: 6,
    policyPriorWeight: 220,
    quietMoveLimit: 28,
    repetitionPenalty: 240,
    selfUndoPenalty: 420,
    rootCandidateLimit: 6,
    varietyTemperature: 0.15,
    varietyThreshold: 0.015,
    varietyTopCount: 3,
  },
};
