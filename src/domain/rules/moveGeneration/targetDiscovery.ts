import { allCoords } from '@/domain/model/coordinates';
import { withRuleDefaults } from '@/domain/model/ruleConfig';
import type {
  Coord,
  EngineState,
  RuleConfig,
  TurnAction,
} from '@/domain/model/types';

import { getGeneratedActionsForCell } from '@/domain/rules/moveGeneration/actionHandlers';
import { buildTargetMap } from '@/domain/rules/moveGeneration/targetMap';
import type { TargetMap } from '@/domain/rules/moveGeneration/types';

function getLegalActionsForCellResolved(
  state: Pick<EngineState, 'board' | 'currentPlayer' | 'pendingJump' | 'status'>,
  coord: Coord,
  config: RuleConfig,
): TurnAction[] {
  if (state.status === 'gameOver') {
    return [];
  }

  return getGeneratedActionsForCell(state, coord, config);
}

/** Returns legal target coordinates per action kind for one selected cell. */
export function getLegalTargetsForCell(
  state: Pick<EngineState, 'board' | 'currentPlayer' | 'pendingJump' | 'status'>,
  coord: Coord,
  config: Partial<RuleConfig> = {},
): TargetMap {
  return buildTargetMap(getLegalActionsForCellResolved(state, coord, withRuleDefaults(config)));
}

/** Generates all legal actions for the current player from a specific coordinate. */
export function getLegalActionsForCell(
  state: Pick<EngineState, 'board' | 'currentPlayer' | 'pendingJump' | 'status'>,
  coord: Coord,
  config: Partial<RuleConfig> = {},
): TurnAction[] {
  return getLegalActionsForCellResolved(state, coord, withRuleDefaults(config));
}

/** Generates every legal action for the current player across the whole board. */
export function getLegalActions(
  state: Pick<EngineState, 'board' | 'currentPlayer' | 'pendingJump' | 'status'>,
  config: Partial<RuleConfig> = {},
): TurnAction[] {
  const resolvedConfig = withRuleDefaults(config);
  const actions: TurnAction[] = [];

  for (const coord of allCoords()) {
    actions.push(...getLegalActionsForCellResolved(state, coord, resolvedConfig));
  }

  return actions;
}
