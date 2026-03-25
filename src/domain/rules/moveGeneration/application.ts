import { withRuleDefaults } from '@/domain/model/ruleConfig';
import type {
  EngineState,
  RuleConfig,
  TurnAction,
  ValidationResult,
} from '@/domain/model/types';

import { getActionHandler } from '@/domain/rules/moveGeneration/actionHandlers';
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
  return getActionHandler(action.type).applyValidated(state, action as never);
}

/** Applies a previously validated action while preserving references for untouched cells. */
export function applyValidatedActionToBoard(
  state: Pick<EngineState, 'board' | 'currentPlayer' | 'pendingJump' | 'status'>,
  action: TurnAction,
): ValidationResult | EngineState['board'] {
  const nextState = applyValidatedAction(state, action);

  return 'valid' in nextState ? nextState : nextState.board;
}
