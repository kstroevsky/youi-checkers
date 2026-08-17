import type {
  AiDifficultyPreset,
  AiRiskMode,
  AiSearchDiagnosticAblation,
  AiSearchDiagnostics,
} from '@/ai/types';
import { getBehaviorStateBias } from '@/ai/behavior';
import {
  getParticipationScore,
  type ParticipationState,
} from '@/ai/participation';
import {
  getPerfStrategicIntent,
  getPerfStrategicScore,
  getStatePerfBundle,
  type SearchPerfCache,
  type StatePerfBundle,
} from '@/ai/perf';
import type { EngineState, Player, RuleConfig } from '@/domain';
import {
  getDynamicDrawScore,
  getNonterminalDrawTrapBias,
  getRiskStateBias,
} from '@/ai/risk';
import { getStrategicIntent, getStrategicScore } from '@/ai/strategy';
import type { AiBehaviorProfile } from '@/shared/types/session';

const TERMINAL_SCORE = 1_000_000;

type EvaluationOptions = {
  behaviorProfile?: AiBehaviorProfile | null;
  diagnosticAblation?: AiSearchDiagnosticAblation | null;
  diagnostics?: AiSearchDiagnostics | null;
  participationState?: ParticipationState | null;
  perfBundle?: StatePerfBundle | null;
  perfCache?: SearchPerfCache | null;
  preset?: AiDifficultyPreset | null;
  riskMode?: AiRiskMode;
};

function resolvePerfBundle(
  state: EngineState,
  ruleConfig: RuleConfig,
  options: EvaluationOptions,
): StatePerfBundle | null {
  if (options.perfBundle) {
    return options.perfBundle;
  }

  if (options.perfCache) {
    return getStatePerfBundle(state, ruleConfig, options.perfCache);
  }

  return null;
}

/** Returns the opposing player for zero-sum score differences. */
function getOpponent(player: Player): Player {
  return player === 'white' ? 'black' : 'white';
}

/** Cheap structure-only score used by move ordering before deeper search refines it. */
export function evaluateStructureState(
  state: EngineState,
  perspectivePlayer: Player,
  ruleConfig: RuleConfig,
  options: Omit<
    EvaluationOptions,
    'behaviorProfile' | 'diagnosticAblation' | 'participationState'
  > = {},
): number {
  const perfBundle = resolvePerfBundle(state, ruleConfig, options);

  if (state.status === 'gameOver') {
    if ('winner' in state.victory) {
      return state.victory.winner === perspectivePlayer
        ? TERMINAL_SCORE
        : -TERMINAL_SCORE;
    }

    return getDynamicDrawScore(
      state,
      perspectivePlayer,
      options.preset ?? null,
      options.riskMode ?? 'normal',
      options.diagnostics ?? null,
      perfBundle,
    );
  }

  return perfBundle
    ? getPerfStrategicScore(perfBundle, state, perspectivePlayer)
    : getStrategicScore(state, perspectivePlayer);
}

/**
 * Scores one engine state from `perspectivePlayer`'s point of view.
 *
 * The evaluator intentionally models plan conversion rather than exact tactical mobility.
 * Search handles the tactical frontier with move ordering and quiescence.
 */
export function evaluateState(
  state: EngineState,
  perspectivePlayer: Player,
  ruleConfig: RuleConfig,
  options: EvaluationOptions = {},
): number {
  const {
    behaviorProfile = null,
    diagnosticAblation = null,
    diagnostics = null,
    participationState = null,
    perfBundle = null,
    preset = null,
    riskMode = 'normal',
  } = options;
  const resolvedPerfBundle =
    perfBundle ?? resolvePerfBundle(state, ruleConfig, options);

  if (state.status === 'gameOver') {
    if ('winner' in state.victory) {
      return state.victory.winner === perspectivePlayer
        ? TERMINAL_SCORE
        : -TERMINAL_SCORE;
    }

    return getDynamicDrawScore(
      state,
      perspectivePlayer,
      preset,
      riskMode,
      diagnostics,
      resolvedPerfBundle,
    );
  }

  const opponent = getOpponent(perspectivePlayer);
  const ownIntent = resolvedPerfBundle
    ? getPerfStrategicIntent(resolvedPerfBundle, state, perspectivePlayer)
    : getStrategicIntent(state, perspectivePlayer);
  const opponentIntent = resolvedPerfBundle
    ? getPerfStrategicIntent(resolvedPerfBundle, state, opponent)
    : getStrategicIntent(state, opponent);
  let score = resolvedPerfBundle
    ? getPerfStrategicScore(resolvedPerfBundle, state, perspectivePlayer)
    : getStrategicScore(state, perspectivePlayer);

  if (ownIntent.intent === 'home') {
    score += 120;
  } else if (ownIntent.intent === 'sixStack') {
    score += 90;
  }

  if (opponentIntent.intent === 'home') {
    score -= 60;
  } else if (opponentIntent.intent === 'sixStack') {
    score -= 60;
  }

  if (state.pendingJump) {
    score += state.currentPlayer === perspectivePlayer ? 140 : -140;
  }

  if (preset) {
    score += getNonterminalDrawTrapBias(
      state,
      perspectivePlayer,
      preset,
      riskMode,
      diagnostics,
      resolvedPerfBundle,
    );
  }

  if (diagnosticAblation?.behaviorEvaluation && behaviorProfile) {
    score += getBehaviorStateBias(state, perspectivePlayer, behaviorProfile.id);
  }

  const participationEvaluationScale =
    diagnosticAblation?.participationEvaluation === true
      ? 1
      : (diagnosticAblation?.participationEvaluationScale ?? 0);
  if (
    !Number.isFinite(participationEvaluationScale) ||
    participationEvaluationScale < 0
  ) {
    throw new RangeError(
      'participationEvaluationScale must be finite and non-negative.',
    );
  }
  if (participationEvaluationScale > 0 && preset) {
    score += Math.round(
      getParticipationScore(
        state,
        perspectivePlayer,
        preset,
        participationState,
      ) * participationEvaluationScale,
    );
  }

  if (riskMode !== 'normal') {
    score += getRiskStateBias(
      state,
      perspectivePlayer,
      riskMode,
      resolvedPerfBundle,
    );
  }

  return score;
}
