import { allCoords } from '@/domain/model/coordinates';
import { withRuleDefaults } from '@/domain/model/ruleConfig';
import type {
  Coord,
  EngineState,
  RuleConfig,
  TurnAction,
} from '@/domain/model/types';

import { getGeneratedActionsForCell } from '@/domain/rules/moveGeneration/actionHandlers';
import { getForcedActionCoord } from '@/domain/rules/moveGeneration/turnConstraint';
import { buildTargetMap } from '@/domain/rules/moveGeneration/targetMap';
import type { TargetMap } from '@/domain/rules/moveGeneration/types';

function getLegalActionsForCellResolved(
  state: Pick<
    EngineState,
    'board' | 'currentPlayer' | 'pendingJump' | 'status'
  >,
  coord: Coord,
  config: RuleConfig,
): TurnAction[] {
  if (state.status === 'gameOver') {
    return [];
  }

  const forcedCoord = getForcedActionCoord(state);

  if (forcedCoord !== null && forcedCoord !== coord) {
    return [];
  }

  return getGeneratedActionsForCell(state, coord, config);
}

/** Returns legal target coordinates per action kind for one selected cell. */
export function getLegalTargetsForCell(
  state: Pick<
    EngineState,
    'board' | 'currentPlayer' | 'pendingJump' | 'status'
  >,
  coord: Coord,
  config: Partial<RuleConfig> = {},
): TargetMap {
  return buildTargetMap(
    getLegalActionsForCellResolved(state, coord, withRuleDefaults(config)),
  );
}

/** Generates all legal actions for the current player from a specific coordinate. */
export function getLegalActionsForCell(
  state: Pick<
    EngineState,
    'board' | 'currentPlayer' | 'pendingJump' | 'status'
  >,
  coord: Coord,
  config: Partial<RuleConfig> = {},
): TurnAction[] {
  return getLegalActionsForCellResolved(state, coord, withRuleDefaults(config));
}

/** Generates every legal action for the current player across the whole board. */
export function getLegalActions(
  state: Pick<
    EngineState,
    'board' | 'currentPlayer' | 'pendingJump' | 'status'
  >,
  config: Partial<RuleConfig> = {},
): TurnAction[] {
  if (state.status === 'gameOver') {
    return [];
  }

  const resolvedConfig = withRuleDefaults(config);
  const forcedCoord = getForcedActionCoord(state);

  if (forcedCoord !== null) {
    return getLegalActionsForCellResolved(state, forcedCoord, resolvedConfig);
  }

  const actions: TurnAction[] = [];

  for (const coord of allCoords()) {
    actions.push(...getGeneratedActionsForCell(state, coord, resolvedConfig));
  }

  return actions;
}

/** Returns as soon as one legal action is found, avoiding full-list materialization. */
export function hasLegalAction(
  state: Pick<
    EngineState,
    'board' | 'currentPlayer' | 'pendingJump' | 'status'
  >,
  config: Partial<RuleConfig> = {},
): boolean {
  if (state.status === 'gameOver') {
    return false;
  }

  const resolvedConfig = withRuleDefaults(config);
  const forcedCoord = getForcedActionCoord(state);

  if (forcedCoord !== null) {
    return (
      getGeneratedActionsForCell(state, forcedCoord, resolvedConfig).length > 0
    );
  }

  for (const coord of allCoords()) {
    if (getGeneratedActionsForCell(state, coord, resolvedConfig).length > 0) {
      return true;
    }
  }

  return false;
}
