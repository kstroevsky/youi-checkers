import type { AiDifficultyPreset } from '@/ai/types';

/** Exact product difficulty presets used by the browser worker and the tests. */
export const AI_DIFFICULTY_PRESETS: Record<'easy' | 'medium' | 'hard', AiDifficultyPreset> = {
  easy: {
    timeBudgetMs: 120,
    maxDepth: 2,
    quietMoveLimit: 8,
    pickTopCount: 3,
    randomThreshold: 0.08,
  },
  medium: {
    timeBudgetMs: 400,
    maxDepth: 4,
    quietMoveLimit: 16,
    pickTopCount: 2,
    randomThreshold: 0.03,
  },
  hard: {
    timeBudgetMs: 1200,
    maxDepth: 6,
    quietMoveLimit: 28,
    pickTopCount: 1,
    randomThreshold: 0,
  },
};
