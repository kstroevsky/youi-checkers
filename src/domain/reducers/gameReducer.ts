import type { EngineState, GameState, RuleConfig, TurnAction } from '@/domain/model/types';

import { runEngineCommand, runGameCommand } from '@/domain/reducers/engineTransition';

/** History-free state transition used by UI, serialization, and AI search. */
export function advanceEngineState(
  state: EngineState,
  action: TurnAction,
  config: Partial<RuleConfig> = {},
): EngineState {
  return runEngineCommand(state, { type: 'submitAction', action }, config, {
    emitEvents: false,
  }).state;
}

/** Authoritative state transition: validate, apply, resolve pass/victory, append history. */
export function applyAction(
  state: GameState,
  action: TurnAction,
  config: Partial<RuleConfig> = {},
): GameState {
  return runGameCommand(state, { type: 'submitAction', action }, config).state;
}
