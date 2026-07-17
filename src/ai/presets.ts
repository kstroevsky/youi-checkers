import type { AiDifficultyPreset } from '@/ai/types';

/** Exact product difficulty presets used by the browser worker and the tests. */
export const AI_DIFFICULTY_PRESETS: Record<'easy' | 'medium' | 'hard', AiDifficultyPreset> = {
  easy: {
    drawAversionAhead: 220,
    drawAversionBehindRelief: 70,
    familyVarietyWeight: 30,
    frontierWidthWeight: 20,
    timeBudgetMs: 250,
    maxDepth: 2,
    participationBias: 14,
    // Extended from 2: longer window makes the AI penalise same-piece reuse
    // across more of its recent moves, reducing sameFamilyQuietRepeatRate.
    participationWindow: 5,
    policyPriorWeight: 80,
    quietMoveLimit: 8,
    // Raised from 120: stronger penalty for returning to already-visited positions.
    repetitionPenalty: 160,
    riskBandWidening: 0.08,
    riskLoopPenalty: 260,
    riskPolicyPriorScale: 0.45,
    riskProgressBonus: 420,
    riskTacticalBonus: 280,
    selfUndoPenalty: 220,
    rootCandidateLimit: 4,
    // Raised from 70: stronger deterrent for reusing the same piece family.
    sourceReusePenalty: 90,
    stagnationDisplacementWeight: 16,
    stagnationMobilityWeight: 14,
    stagnationProgressWeight: 26,
    stagnationRepetitionWeight: 20,
    stagnationSelfUndoWeight: 24,
    stagnationThreshold: 0.42,
    varietyTemperature: 0.35,
    varietyThreshold: 0.08,
    varietyTopCount: 3,
  },
  medium: {
    // Raised from 180: pushes harder toward decisive play.
    drawAversionAhead: 220,
    drawAversionBehindRelief: 60,
    familyVarietyWeight: 42,
    frontierWidthWeight: 28,
    timeBudgetMs: 800,
    maxDepth: 4,
    participationBias: 18,
    // Extended from 3: 8-move memory window keeps the AI aware of repeated
    // piece families over a longer horizon, directly reducing repetition rate.
    participationWindow: 8,
    policyPriorWeight: 140,
    quietMoveLimit: 16,
    // Raised from 180.
    repetitionPenalty: 240,
    riskBandWidening: 0.06,
    // Raised from 220: higher cost for looping moves at this skill level.
    riskLoopPenalty: 280,
    riskPolicyPriorScale: 0.6,
    riskProgressBonus: 360,
    riskTacticalBonus: 240,
    selfUndoPenalty: 320,
    rootCandidateLimit: 5,
    // Raised from 100.
    sourceReusePenalty: 130,
    stagnationDisplacementWeight: 15,
    stagnationMobilityWeight: 14,
    stagnationProgressWeight: 24,
    stagnationRepetitionWeight: 20,
    stagnationSelfUndoWeight: 20,
    stagnationThreshold: 0.46,
    varietyTemperature: 0.22,
    varietyThreshold: 0.03,
    varietyTopCount: 2,
  },
  hard: {
    // Raised from 140: the AI must actively seek decisive outcomes rather
    // than accepting draws when ahead; addresses decisiveResultShare → 0.
    drawAversionAhead: 200,
    drawAversionBehindRelief: 50,
    familyVarietyWeight: 56,
    frontierWidthWeight: 36,
    timeBudgetMs: 2_000,
    maxDepth: 6,
    participationBias: 24,
    // Extended from 3: 10-move window is the primary lever against the
    // sameFamilyQuietRepeatRate regression introduced by the one-color
    // pendingJump constraint.  Longer memory ≈ broader piece engagement.
    participationWindow: 10,
    policyPriorWeight: 220,
    quietMoveLimit: 28,
    // Raised from 300: repetition loops must be more costly than advancing.
    repetitionPenalty: 400,
    riskBandWidening: 0.04,
    // Raised from 240: draws in loop-pressure positions are now more expensive.
    riskLoopPenalty: 320,
    riskPolicyPriorScale: 0.72,
    riskProgressBonus: 280,
    riskTacticalBonus: 200,
    selfUndoPenalty: 460,
    rootCandidateLimit: 6,
    // Raised from 140.
    sourceReusePenalty: 180,
    stagnationDisplacementWeight: 14,
    stagnationMobilityWeight: 14,
    stagnationProgressWeight: 22,
    stagnationRepetitionWeight: 18,
    stagnationSelfUndoWeight: 18,
    stagnationThreshold: 0.5,
    varietyTemperature: 0.15,
    varietyThreshold: 0.015,
    varietyTopCount: 3,
  },
};
