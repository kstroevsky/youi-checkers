import type { GameState, Player, Victory } from '@/domain';
import { resolveDrawOutcome } from '@/domain/rules/victory';

export const STRENGTH_ADJUDICATION_VERSION = 1 as const;

export type StrengthTerminalType =
  | Exclude<Victory['type'], 'none'>
  | 'unfinished';

export function cloneStrengthState(state: GameState): GameState {
  return structuredClone(state);
}

export function getStrengthTerminalType(
  state: GameState,
): StrengthTerminalType {
  return state.status === 'gameOver' && state.victory.type !== 'none'
    ? state.victory.type
    : 'unfinished';
}

export function getNaturalPointsForPlayer(
  state: GameState,
  player: Player,
): number | null {
  if (state.status !== 'gameOver') return null;
  if ('winner' in state.victory) {
    return state.victory.winner === player ? 1 : 0;
  }
  return 0.5;
}

/** Fixed, symmetric, policy-independent horizon adjudication. */
export function getHorizonPointsForPlayer(
  state: GameState,
  player: Player,
): number {
  const outcome = resolveDrawOutcome(state, 'stalemate');
  if ('winner' in outcome) return outcome.winner === player ? 1 : 0;
  return 0.5;
}
