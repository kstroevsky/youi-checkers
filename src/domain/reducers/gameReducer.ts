import type {
  EngineState,
  GameState,
  Player,
  RuleConfig,
  TurnAction,
} from '@/domain/model/types';

import {
  runGeneratedEngineCommand,
  runEngineCommand,
  runGameCommand,
} from '@/domain/reducers/engineTransition';

export type GeneratedEngineTransitionOptions = {
  /** Search-only persistent storage; public state projections retain plain copied records. */
  positionCountStorage?: 'copy' | 'overlay';
};

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

/** Fast search transition for an action generated from the same state and rules. */
export function advanceGeneratedEngineTransition(
  state: EngineState,
  action: TurnAction,
  config: Partial<RuleConfig> = {},
  options: GeneratedEngineTransitionOptions = {},
): ReturnType<typeof runGeneratedEngineCommand> {
  return runGeneratedEngineCommand(
    state,
    { type: 'submitAction', action },
    config,
    options.positionCountStorage,
  );
}

/** Fast search state projection when generated-transition metadata is not needed. */
export function advanceGeneratedEngineState(
  state: EngineState,
  action: TurnAction,
  config: Partial<RuleConfig> = {},
): EngineState {
  return advanceGeneratedEngineTransition(state, action, config).state;
}

/** Same-player transition used while the loser completes a finished series game. */
export function advanceFinishingEngineState(
  state: EngineState,
  action: TurnAction,
  player: Player,
  config: Partial<RuleConfig> = {},
): EngineState {
  return runEngineCommand(state, { type: 'submitAction', action }, config, {
    drawResolution: 'disabled',
    emitEvents: false,
    turnMode: 'samePlayer',
    victoryPlayer: player,
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
