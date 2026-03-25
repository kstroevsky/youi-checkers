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

/** Returns legal target coordinates per action kind for one selected cell. */
export function getLegalTargetsForCell(
  state: Pick<EngineState, 'board' | 'currentPlayer' | 'pendingJump' | 'status'>,
  coord: Coord,
  config: Partial<RuleConfig> = {},
): TargetMap {
  return buildTargetMap(getLegalActionsForCell(state, coord, config));
}

/** Generates all legal actions for the current player from a specific coordinate. */
export function getLegalActionsForCell(
  state: Pick<EngineState, 'board' | 'currentPlayer' | 'pendingJump' | 'status'>,
  coord: Coord,
  config: Partial<RuleConfig> = {},
): TurnAction[] {
  if (state.status === 'gameOver') {
    return [];
  }

  return getGeneratedActionsForCell(state, coord, withRuleDefaults(config));
}

/** Generates every legal action for the current player across the whole board. */
export function getLegalActions(
  state: Pick<EngineState, 'board' | 'currentPlayer' | 'pendingJump' | 'status'>,
  config: Partial<RuleConfig> = {},
): TurnAction[] {
  return allCoords().flatMap((coord) => getLegalActionsForCell(state, coord, config));
}
