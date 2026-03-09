import { createSnapshot } from '@/domain/model/board';
import { hashPosition } from '@/domain/model/hash';
import type { Board, GameState, Player, RuleConfig, TurnAction, ValidationResult } from '@/domain/model/types';
import { withRuleDefaults } from '@/domain/generators/createInitialState';
import { applyActionToBoard, getLegalActions, validateAction } from '@/domain/rules/moveGeneration';
import { checkVictory } from '@/domain/rules/victory';

function getOpponent(player: Player): Player {
  return player === 'white' ? 'black' : 'white';
}

function isValidationResult(value: Board | ValidationResult): value is ValidationResult {
  return 'valid' in value;
}

function nextStateSeed(state: GameState, board: GameState['board'], player: Player): GameState {
  return {
    ...createSnapshot(state),
    board,
    currentPlayer: player,
    moveNumber: state.moveNumber + 1,
    status: 'active',
    victory: { type: 'none' },
    history: state.history.map((entry) => structuredClone(entry)),
    positionCounts: { ...state.positionCounts },
  };
}

function getLegalActionCount(state: GameState, player: Player, config: RuleConfig): number {
  return getLegalActions({ ...state, currentPlayer: player }, config).length;
}

export function applyAction(
  state: GameState,
  action: TurnAction,
  config: Partial<RuleConfig> = {},
): GameState {
  const resolvedConfig = withRuleDefaults(config);
  const validation = validateAction(state, action, resolvedConfig);
  let validationError: string | null = null;

  if (!validation.valid) {
    validationError = validation.reason;
  }

  if (validationError) {
    throw new Error(validationError);
  }

  const nextBoard = applyActionToBoard(state, action, resolvedConfig);

  if (isValidationResult(nextBoard)) {
    if (!nextBoard.valid) {
      throw new Error(nextBoard.reason);
    }

    throw new Error('Unexpected successful validation result.');
  }

  const actor = state.currentPlayer;
  const immediateState = nextStateSeed(state, nextBoard, getOpponent(actor));
  const winAfterMove = checkVictory(immediateState, resolvedConfig);
  const autoPasses: Player[] = [];
  let finalState = immediateState;

  if (winAfterMove.type !== 'none') {
    finalState = {
      ...immediateState,
      currentPlayer: actor,
      status: 'gameOver',
      victory: winAfterMove,
    };
  } else if (getLegalActionCount(immediateState, immediateState.currentPlayer, resolvedConfig) === 0) {
    autoPasses.push(immediateState.currentPlayer);
    const retryPlayer = actor;

    if (getLegalActionCount(immediateState, retryPlayer, resolvedConfig) === 0) {
      autoPasses.push(retryPlayer);
      finalState = {
        ...immediateState,
        currentPlayer: actor,
        status: 'gameOver',
        victory: { type: 'stalemateDraw' },
      };
    } else {
      finalState = {
        ...immediateState,
        currentPlayer: retryPlayer,
      };
    }
  }

  const positionHash = hashPosition(finalState);
  finalState.positionCounts[positionHash] = (finalState.positionCounts[positionHash] ?? 0) + 1;

  if (finalState.status !== 'gameOver') {
    const finalVictory = checkVictory(finalState, resolvedConfig);

    if (finalVictory.type !== 'none') {
      finalState = {
        ...finalState,
        status: 'gameOver',
        victory: finalVictory,
      };
    }
  }

  const beforeState = createSnapshot(state);
  const afterState = createSnapshot(finalState);

  finalState.history = [
    ...state.history,
    {
      actor,
      action: structuredClone(action),
      beforeState,
      afterState,
      autoPasses,
      victoryAfter: structuredClone(finalState.victory),
      positionHash,
    },
  ];

  return finalState;
}
