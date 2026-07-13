import { createSnapshot } from '@/domain/model/board';
import { hashPosition } from '@/domain/model/hash';
import { withRuleDefaults } from '@/domain/model/ruleConfig';
import type {
  Coord,
  EngineState,
  GameState,
  Player,
  RuleConfig,
  TurnAction,
  Victory,
} from '@/domain/model/types';
import {
  applyValidatedAction,
  hasLegalAction,
  validateAction,
} from '@/domain/rules/moveGeneration';
import {
  checkPlayerVictory,
  checkVictory,
  resolveDrawOutcome,
} from '@/domain/rules/victory';

export type EngineCommand = {
  type: 'submitAction';
  action: TurnAction;
};

export type EngineTransitionOptions = {
  drawResolution?: 'enabled' | 'disabled';
  emitEvents?: boolean;
  turnMode?: 'alternate' | 'samePlayer';
  victoryPlayer?: Player;
};

export type DomainEvent =
  | { type: 'actionAccepted'; actor: Player; action: TurnAction }
  | { type: 'boardChanged'; actor: Player; action: TurnAction }
  | {
      type: 'jumpContinuationOpened';
      player: Player;
      source: Coord;
      targets: Coord[];
    }
  | { type: 'turnChanged'; player: Player }
  | {
      type: 'turnRetained';
      player: Player;
      reason: 'jumpContinuation' | 'forcedPass';
    }
  | { type: 'autoPass'; player: Player }
  | { type: 'gameOver'; victory: Victory }
  | { type: 'positionCountUpdated'; positionHash: string; count: number };

export type EngineTransitionResult = {
  actor: Player;
  autoPasses: Player[];
  events: DomainEvent[];
  positionHash: string;
  state: EngineState;
};

export type GameTransitionResult = {
  actor: Player;
  autoPasses: Player[];
  events: DomainEvent[];
  positionHash: string;
  state: GameState;
};

/** Returns the opposing player for turn handoff. */
function getOpponent(player: Player): Player {
  return player === 'white' ? 'black' : 'white';
}

/** Creates baseline next-turn state before pass/victory post-processing. */
function nextStateSeed(
  state: EngineState,
  board: EngineState['board'],
  player: Player,
  pendingJump: EngineState['pendingJump'],
): EngineState {
  return {
    board,
    currentPlayer: player,
    moveNumber: state.moveNumber + 1,
    status: 'active',
    victory: { type: 'none' },
    pendingJump,
    positionCounts: state.positionCounts,
  };
}

/** Counts legal actions for a specified player in a hypothetical state. */
function playerHasLegalAction(
  state: EngineState,
  player: Player,
  config: RuleConfig,
): boolean {
  return hasLegalAction(
    {
      ...state,
      currentPlayer: player,
      pendingJump: null,
    },
    config,
  );
}

function buildEvents(
  actor: Player,
  action: TurnAction,
  finalState: EngineState,
  autoPasses: Player[],
  positionHash: string,
  continuationTargets: Coord[],
): DomainEvent[] {
  const actionSnapshot = structuredClone(action);
  const events: DomainEvent[] = [
    { type: 'actionAccepted', actor, action: actionSnapshot },
    { type: 'boardChanged', actor, action: structuredClone(actionSnapshot) },
  ];

  if (finalState.status === 'gameOver') {
    events.push({
      type: 'gameOver',
      victory: structuredClone(finalState.victory),
    });
  } else if (finalState.pendingJump && continuationTargets.length) {
    events.push({
      type: 'jumpContinuationOpened',
      player: actor,
      source: finalState.pendingJump.source,
      targets: continuationTargets.slice(),
    });
    events.push({
      type: 'turnRetained',
      player: actor,
      reason: 'jumpContinuation',
    });
  } else {
    for (const player of autoPasses) {
      events.push({ type: 'autoPass', player });
    }

    if (finalState.currentPlayer !== actor) {
      events.push({ type: 'turnChanged', player: finalState.currentPlayer });
    } else if (autoPasses.length) {
      events.push({
        type: 'turnRetained',
        player: actor,
        reason: 'forcedPass',
      });
    }
  }

  events.push({
    type: 'positionCountUpdated',
    positionHash,
    count: finalState.positionCounts[positionHash] ?? 0,
  });

  return events;
}

type ResolvedEngineTransition = {
  actor: Player;
  autoPasses: Player[];
  continuationTargets: Coord[];
  positionHash: string;
  state: EngineState;
};

/** Shared engine transition core used by both state-only and eventful command paths. */
function resolveEngineCommand(
  state: EngineState,
  command: EngineCommand,
  config: Partial<RuleConfig> = {},
  options: EngineTransitionOptions = {},
  actionAlreadyValidated = false,
): ResolvedEngineTransition {
  const resolvedConfig = withRuleDefaults(config);
  if (!actionAlreadyValidated) {
    const validation = validateAction(state, command.action, resolvedConfig);

    if (!validation.valid) {
      throw new Error(validation.reason);
    }
  }

  const appliedState = applyValidatedAction(state, command.action);

  if ('valid' in appliedState) {
    if (!appliedState.valid) {
      throw new Error(appliedState.reason);
    }

    throw new Error('Unexpected successful validation result.');
  }

  const actor = state.currentPlayer;
  const nextPlayer =
    appliedState.pendingJump || options.turnMode === 'samePlayer'
      ? actor
      : getOpponent(actor);
  const immediateState = nextStateSeed(
    state,
    appliedState.board,
    nextPlayer,
    appliedState.pendingJump,
  );
  const victoryConfig =
    options.drawResolution === 'disabled'
      ? { ...resolvedConfig, drawRule: 'none' as const }
      : resolvedConfig;
  const evaluateVictory = (candidate: EngineState): Victory =>
    options.victoryPlayer
      ? checkPlayerVictory(candidate, options.victoryPlayer)
      : checkVictory(candidate, victoryConfig);
  const winAfterMove = evaluateVictory(immediateState);
  const autoPasses: Player[] = [];
  let finalState = immediateState;

  if (winAfterMove.type !== 'none') {
    finalState = {
      ...immediateState,
      currentPlayer: actor,
      status: 'gameOver',
      victory: winAfterMove,
      pendingJump: null,
    };
  } else if (
    !immediateState.pendingJump &&
    !playerHasLegalAction(
      immediateState,
      immediateState.currentPlayer,
      resolvedConfig,
    )
  ) {
    if (options.turnMode === 'samePlayer') {
      throw new Error('The finishing player has no legal action.');
    }

    autoPasses.push(immediateState.currentPlayer);
    const retryPlayer = actor;

    if (!playerHasLegalAction(immediateState, retryPlayer, resolvedConfig)) {
      autoPasses.push(retryPlayer);
      finalState = {
        ...immediateState,
        currentPlayer: actor,
        status: 'gameOver',
        victory: resolveDrawOutcome(immediateState, 'stalemate'),
        pendingJump: null,
      };
    } else {
      finalState = {
        ...immediateState,
        currentPlayer: retryPlayer,
      };
    }
  }

  const positionHash = hashPosition(finalState);
  finalState = {
    ...finalState,
    positionCounts: {
      ...finalState.positionCounts,
      [positionHash]: (finalState.positionCounts[positionHash] ?? 0) + 1,
    },
  };

  if (finalState.status !== 'gameOver') {
    const finalVictory = evaluateVictory(finalState);

    if (finalVictory.type !== 'none') {
      finalState = {
        ...finalState,
        status: 'gameOver',
        victory: finalVictory,
        pendingJump: null,
      };
    }
  }

  return {
    actor,
    autoPasses,
    continuationTargets: appliedState.continuationTargets ?? [],
    positionHash,
    state: finalState,
  };
}

/** Authoritative event-driven engine transition used by reducers, store, and tests. */
export function runEngineCommand(
  state: EngineState,
  command: EngineCommand,
  config: Partial<RuleConfig> = {},
  options: EngineTransitionOptions = {},
): EngineTransitionResult {
  const result = resolveEngineCommand(state, command, config, options);

  return {
    actor: result.actor,
    autoPasses: result.autoPasses,
    events:
      options.emitEvents === false
        ? []
        : buildEvents(
            result.actor,
            command.action,
            result.state,
            result.autoPasses,
            result.positionHash,
            result.continuationTargets,
          ),
    positionHash: result.positionHash,
    state: result.state,
  };
}

/**
 * Search-only transition for actions produced by getLegalActions for this exact
 * state/config. Public/user commands must continue through runEngineCommand.
 */
export function runGeneratedEngineCommand(
  state: EngineState,
  command: EngineCommand,
  config: Partial<RuleConfig> = {},
): EngineTransitionResult {
  const result = resolveEngineCommand(
    state,
    command,
    config,
    { emitEvents: false },
    true,
  );

  return {
    actor: result.actor,
    autoPasses: result.autoPasses,
    events: [],
    positionHash: result.positionHash,
    state: result.state,
  };
}

/** History-appending transition wrapper used by the app-facing reducer API. */
export function runGameCommand(
  state: GameState,
  command: EngineCommand,
  config: Partial<RuleConfig> = {},
  options: EngineTransitionOptions = {},
): GameTransitionResult {
  const result = runEngineCommand(state, command, config, options);
  const beforeState = createSnapshot(state);
  const afterState = createSnapshot({
    ...result.state,
    history: state.history,
  });

  return {
    ...result,
    state: {
      ...result.state,
      history: [
        ...state.history,
        {
          actor: state.currentPlayer,
          action: structuredClone(command.action),
          beforeState,
          afterState,
          autoPasses: result.autoPasses,
          victoryAfter: structuredClone(result.state.victory),
          positionHash: result.positionHash,
        },
      ],
    },
  };
}
