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
import { applyValidatedAction, getLegalActions, validateAction } from '@/domain/rules/moveGeneration';
import { checkVictory, resolveDrawOutcome } from '@/domain/rules/victory';

export type EngineCommand = {
  type: 'submitAction';
  action: TurnAction;
};

export type DomainEvent =
  | { type: 'actionAccepted'; actor: Player; action: TurnAction }
  | { type: 'boardChanged'; actor: Player; action: TurnAction }
  | { type: 'jumpContinuationOpened'; player: Player; source: Coord; targets: Coord[] }
  | { type: 'turnChanged'; player: Player }
  | { type: 'turnRetained'; player: Player; reason: 'jumpContinuation' | 'forcedPass' }
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
    positionCounts: { ...state.positionCounts },
  };
}

/** Counts legal actions for a specified player in a hypothetical state. */
function getLegalActionCount(state: EngineState, player: Player, config: RuleConfig): number {
  return getLegalActions(
    {
      ...state,
      currentPlayer: player,
      pendingJump: null,
    },
    config,
  ).length;
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

/** Authoritative event-driven engine transition used by reducers, store, and tests. */
export function runEngineCommand(
  state: EngineState,
  command: EngineCommand,
  config: Partial<RuleConfig> = {},
): EngineTransitionResult {
  const resolvedConfig = withRuleDefaults(config);
  const validation = validateAction(state, command.action, resolvedConfig);

  if (!validation.valid) {
    throw new Error(validation.reason);
  }

  const appliedState = applyValidatedAction(state, command.action);

  if ('valid' in appliedState) {
    if (!appliedState.valid) {
      throw new Error(appliedState.reason);
    }

    throw new Error('Unexpected successful validation result.');
  }

  const actor = state.currentPlayer;
  const nextPlayer = appliedState.pendingJump ? actor : getOpponent(actor);
  const immediateState = nextStateSeed(
    state,
    appliedState.board,
    nextPlayer,
    appliedState.pendingJump,
  );
  const winAfterMove = checkVictory(immediateState, resolvedConfig);
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
    getLegalActionCount(immediateState, immediateState.currentPlayer, resolvedConfig) === 0
  ) {
    autoPasses.push(immediateState.currentPlayer);
    const retryPlayer = actor;

    if (getLegalActionCount(immediateState, retryPlayer, resolvedConfig) === 0) {
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
    const finalVictory = checkVictory(finalState, resolvedConfig);

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
    events: buildEvents(
      actor,
      command.action,
      finalState,
      autoPasses,
      positionHash,
      appliedState.continuationTargets ?? [],
    ),
    positionHash,
    state: finalState,
  };
}

/** History-appending transition wrapper used by the app-facing reducer API. */
export function runGameCommand(
  state: GameState,
  command: EngineCommand,
  config: Partial<RuleConfig> = {},
): GameTransitionResult {
  const result = runEngineCommand(state, command, config);
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
