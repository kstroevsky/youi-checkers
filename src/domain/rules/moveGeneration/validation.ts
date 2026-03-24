import { getTopChecker } from '@/domain/model/board';
import { withRuleDefaults } from '@/domain/model/ruleConfig';
import type {
  Coord,
  EngineState,
  Player,
  RuleConfig,
  TurnAction,
  ValidationResult,
} from '@/domain/model/types';
import { isFrozenSingle } from '@/domain/validators/stateValidators';

import {
  getVisitedJumpedCheckerIds,
  resolveJumpPath,
} from '@/domain/rules/moveGeneration/jump';
import { getLegalActionsForCell } from '@/domain/rules/moveGeneration/targetDiscovery';

/** Lightweight structural equality for action matching in validator checks. */
function actionsEqual(left: TurnAction, right: TurnAction): boolean {
  switch (left.type) {
    case 'manualUnfreeze':
      return right.type === 'manualUnfreeze' && left.coord === right.coord;
    case 'jumpSequence':
      return (
        right.type === 'jumpSequence' &&
        left.source === right.source &&
        left.path.length === right.path.length &&
        left.path.every((coord, index) => coord === right.path[index])
      );
    case 'climbOne':
      return right.type === 'climbOne' && left.source === right.source && left.target === right.target;
    case 'moveSingleToEmpty':
      return (
        right.type === 'moveSingleToEmpty' &&
        left.source === right.source &&
        left.target === right.target
      );
    case 'splitOneFromStack':
      return (
        right.type === 'splitOneFromStack' &&
        left.source === right.source &&
        left.target === right.target
      );
    case 'splitTwoFromStack':
      return (
        right.type === 'splitTwoFromStack' &&
        left.source === right.source &&
        left.target === right.target
      );
    case 'friendlyStackTransfer':
      return (
        right.type === 'friendlyStackTransfer' &&
        left.source === right.source &&
        left.target === right.target
      );
  }
}

/** Shared source ownership validation for action variants with a source coordinate. */
function validateCommonSource(
  state: Pick<EngineState, 'board'>,
  source: Coord,
  player: Player,
): ValidationResult {
  const topChecker = getTopChecker(state.board, source);

  if (!topChecker) {
    return { valid: false, reason: `No checker at ${source}.` };
  }

  if (topChecker.owner !== player) {
    return { valid: false, reason: `Source ${source} is not controlled by ${player}.` };
  }

  return { valid: true };
}

/** Validates action legality against current state and optional rule configuration. */
export function validateAction(
  state: Pick<EngineState, 'board' | 'currentPlayer' | 'pendingJump' | 'status'>,
  action: TurnAction,
  config: Partial<RuleConfig> = {},
): ValidationResult {
  const resolvedConfig = withRuleDefaults(config);

  if (state.status === 'gameOver') {
    return { valid: false, reason: 'The game is already over.' };
  }

  switch (action.type) {
    case 'manualUnfreeze': {
      if (!isFrozenSingle(state.board, action.coord)) {
        return { valid: false, reason: `${action.coord} is not a frozen single checker.` };
      }

      if (getTopChecker(state.board, action.coord)?.owner !== state.currentPlayer) {
        return { valid: false, reason: 'Only the owner may manually unfreeze a checker.' };
      }

      return { valid: true };
    }
    case 'jumpSequence': {
      const sourceValidation = validateCommonSource(state, action.source, state.currentPlayer);

      if (!sourceValidation.valid) {
        return sourceValidation;
      }

      if (action.path.length !== 1) {
        return {
          valid: false,
          reason: 'Jump actions are applied one landing at a time.',
        };
      }

      const sourceTopChecker = getTopChecker(state.board, action.source);

      if (!sourceTopChecker || sourceTopChecker.frozen) {
        return { valid: false, reason: 'Frozen single checkers cannot jump.' };
      }

      const legalAction = getLegalActionsForCell(state, action.source, resolvedConfig).find((candidate) =>
        actionsEqual(candidate, action),
      );

      if (legalAction) {
        return { valid: true };
      }

      const resolution = resolveJumpPath(
        state.board,
        action.source,
        action.path,
        sourceTopChecker.owner,
        getVisitedJumpedCheckerIds(state, action.source),
      );

      if (!('board' in resolution)) {
        return resolution;
      }

      return {
        valid: false,
        reason: `Illegal jump from ${action.source} to ${action.path[0]}.`,
      };
    }
    case 'climbOne':
    case 'moveSingleToEmpty':
    case 'splitOneFromStack':
    case 'splitTwoFromStack':
    case 'friendlyStackTransfer': {
      const sourceValidation = validateCommonSource(state, action.source, state.currentPlayer);

      if (!sourceValidation.valid) {
        return sourceValidation;
      }

      const legalAction = getLegalActionsForCell(state, action.source, resolvedConfig).find((candidate) =>
        actionsEqual(candidate, action),
      );

      return legalAction
        ? { valid: true }
        : { valid: false, reason: `Illegal ${action.type} from ${action.source} to ${action.target}.` };
    }
  }
}
