import {
  addCheckers,
  cloneBoardStructure,
  ensureMutableCell,
  getCellHeight,
  isStack,
  removeTopCheckers,
  setSingleCheckerFrozen,
} from '@/domain/model/board';
import { withRuleDefaults } from '@/domain/model/ruleConfig';
import type {
  Coord,
  EngineState,
  RuleConfig,
  TurnAction,
  ValidationResult,
} from '@/domain/model/types';

import {
  getJumpTargetsForContext,
  getMovingPlayer,
  getVisitedJumpedCheckerIds,
  resolveJumpPath,
} from '@/domain/rules/moveGeneration/jump';
import type { AppliedActionState } from '@/domain/rules/moveGeneration/types';
import { validateAction } from '@/domain/rules/moveGeneration/validation';

/** Applies a validated action and returns next board state or a validation error. */
export function applyActionToBoard(
  state: Pick<EngineState, 'board' | 'currentPlayer' | 'pendingJump' | 'status'>,
  action: TurnAction,
  config: Partial<RuleConfig> = {},
): ValidationResult | EngineState['board'] {
  const resolvedConfig = withRuleDefaults(config);
  const validation = validateAction(state, action, resolvedConfig);

  if (!validation.valid) {
    return validation;
  }

  return applyValidatedActionToBoard(state, action);
}

/** Applies a previously validated action and returns next board plus jump-continuation state. */
export function applyValidatedAction(
  state: Pick<EngineState, 'board' | 'currentPlayer' | 'pendingJump' | 'status'>,
  action: TurnAction,
): ValidationResult | AppliedActionState {
  const board = cloneBoardStructure(state.board);
  const clonedCoords = new Set<Coord>();

  switch (action.type) {
    case 'manualUnfreeze':
      ensureMutableCell(board, action.coord, clonedCoords);
      setSingleCheckerFrozen(board, action.coord, false);
      return {
        board,
        pendingJump: null,
      };
    case 'jumpSequence': {
      const movingPlayer = getMovingPlayer(state.board, action.source);

      if (!movingPlayer) {
        return { valid: false, reason: `No moving player found at ${action.source}.` };
      }

      const result = resolveJumpPath(
        state.board,
        action.source,
        action.path,
        movingPlayer,
        getVisitedJumpedCheckerIds(state, action.source),
      );

      if (!('board' in result)) {
        return result;
      }

      const continuationTargets = getJumpTargetsForContext(
        result.board,
        result.currentCoord,
        movingPlayer,
        result.jumpedCheckerIds,
      );

      return {
        board: result.board,
        pendingJump: continuationTargets.length
          ? {
              source: result.currentCoord,
              jumpedCheckerIds: [...result.jumpedCheckerIds],
            }
          : null,
      };
    }
    case 'climbOne': {
      ensureMutableCell(board, action.source, clonedCoords);
      ensureMutableCell(board, action.target, clonedCoords);
      addCheckers(board, action.target, removeTopCheckers(board, action.source, 1));
      return {
        board,
        pendingJump: null,
      };
    }
    case 'moveSingleToEmpty': {
      ensureMutableCell(board, action.source, clonedCoords);
      ensureMutableCell(board, action.target, clonedCoords);
      const movingCount = isStack(board, action.source) ? getCellHeight(board, action.source) : 1;
      addCheckers(board, action.target, removeTopCheckers(board, action.source, movingCount));
      return {
        board,
        pendingJump: null,
      };
    }
    case 'splitOneFromStack': {
      ensureMutableCell(board, action.source, clonedCoords);
      ensureMutableCell(board, action.target, clonedCoords);
      addCheckers(board, action.target, removeTopCheckers(board, action.source, 1));
      return {
        board,
        pendingJump: null,
      };
    }
    case 'splitTwoFromStack': {
      ensureMutableCell(board, action.source, clonedCoords);
      ensureMutableCell(board, action.target, clonedCoords);
      addCheckers(board, action.target, removeTopCheckers(board, action.source, 2));
      return {
        board,
        pendingJump: null,
      };
    }
    case 'friendlyStackTransfer': {
      ensureMutableCell(board, action.source, clonedCoords);
      ensureMutableCell(board, action.target, clonedCoords);
      addCheckers(board, action.target, removeTopCheckers(board, action.source, 1));
      return {
        board,
        pendingJump: null,
      };
    }
  }
}

/** Applies a previously validated action while preserving references for untouched cells. */
export function applyValidatedActionToBoard(
  state: Pick<EngineState, 'board' | 'currentPlayer' | 'pendingJump' | 'status'>,
  action: TurnAction,
): ValidationResult | EngineState['board'] {
  const nextState = applyValidatedAction(state, action);

  return 'valid' in nextState ? nextState : nextState.board;
}
