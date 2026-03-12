import type { AiDifficultyPreset } from '@/ai/types';

/** Exact product difficulty presets used by the browser worker and the tests. */
export const AI_DIFFICULTY_PRESETS: Record<'easy' | 'medium' | 'hard', AiDifficultyPreset> = {
  easy: {
    timeBudgetMs: 120,
    maxDepth: 2,
    quietMoveLimit: 8,
    balancedTopCount: 3,
    balancedThreshold: 0.08,
    repetitionPenalty: 120,
    selfUndoPenalty: 220,
    rootCandidateLimit: 4,
  },
  medium: {
    timeBudgetMs: 400,
    maxDepth: 4,
    quietMoveLimit: 16,
    balancedTopCount: 2,
    balancedThreshold: 0.03,
    repetitionPenalty: 180,
    selfUndoPenalty: 320,
    rootCandidateLimit: 5,
  },
  hard: {
    timeBudgetMs: 1200,
    maxDepth: 6,
    quietMoveLimit: 28,
    balancedTopCount: 2,
    balancedThreshold: 0.015,
    repetitionPenalty: 240,
    selfUndoPenalty: 420,
    rootCandidateLimit: 6,
  },
};
