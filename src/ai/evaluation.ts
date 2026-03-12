import type { EngineState, Player, RuleConfig } from '@/domain';

import { getStrategicIntent, getStrategicScore } from '@/ai/strategy';

const TERMINAL_SCORE = 1_000_000;

/** Returns the opposing player for zero-sum score differences. */
function getOpponent(player: Player): Player {
  return player === 'white' ? 'black' : 'white';
}

/** Cheap structure-only score used by move ordering before deeper search refines it. */
export function evaluateStructureState(
  state: EngineState,
  perspectivePlayer: Player,
  _ruleConfig: RuleConfig,
): number {
  if (state.status === 'gameOver') {
    if (state.victory.type === 'homeField' || state.victory.type === 'sixStacks') {
      return state.victory.winner === perspectivePlayer ? TERMINAL_SCORE : -TERMINAL_SCORE;
    }

    return 0;
  }

  return getStrategicScore(state, perspectivePlayer);
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
  _ruleConfig: RuleConfig,
): number {
  if (state.status === 'gameOver') {
    if (state.victory.type === 'homeField' || state.victory.type === 'sixStacks') {
      return state.victory.winner === perspectivePlayer ? TERMINAL_SCORE : -TERMINAL_SCORE;
    }

    return 0;
  }

  const opponent = getOpponent(perspectivePlayer);
  const ownIntent = getStrategicIntent(state, perspectivePlayer);
  const opponentIntent = getStrategicIntent(state, opponent);
  let score = getStrategicScore(state, perspectivePlayer);

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

  return score;
}
