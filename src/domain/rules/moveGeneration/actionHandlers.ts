import {
  addCheckers,
  cloneBoardStructure,
  ensureMutableCell,
  getCellHeight,
  getController,
  getTopChecker,
  isEmptyCell,
  isStack,
  removeTopCheckers,
  setSingleCheckerFrozen,
} from '@/domain/model/board';
import { DIRECTION_VECTORS } from '@/domain/model/constants';
import { allCoords, getAdjacentCoord } from '@/domain/model/coordinates';
import type {
  ActionKind,
  Coord,
  EngineState,
  JumpSequenceAction,
  Player,
  RuleConfig,
  TurnAction,
  ValidationResult,
} from '@/domain/model/types';
import {
  canLandOnOccupiedCell,
  isControlledStack,
  isFrozenSingle,
  isMovableSingle,
} from '@/domain/validators/stateValidators';

import {
  getJumpContinuationTargets,
  getJumpTargetsForContext,
  getMovingPlayer,
  getVisitedJumpedCheckerIds,
  resolveJumpPath,
} from '@/domain/rules/moveGeneration/jump';
import type { AppliedActionState } from '@/domain/rules/moveGeneration/types';

type ActionState = Pick<EngineState, 'board' | 'currentPlayer' | 'pendingJump' | 'status'>;

type ActionHandler = {
  kind: ActionKind;
  getActions: (
    state: ActionState,
    coord: Coord,
    config: RuleConfig,
  ) => TurnAction[];
  applyValidated: (
    state: ActionState,
    action: TurnAction,
  ) => ValidationResult | AppliedActionState;
};

const ACTION_GENERATION_ORDER: Array<Exclude<ActionKind, 'manualUnfreeze'>> = [
  'jumpSequence',
  'climbOne',
  'moveSingleToEmpty',
  'splitOneFromStack',
  'splitTwoFromStack',
  'friendlyStackTransfer',
];

function getClimbTargets(board: EngineState['board'], source: Coord): Coord[] {
  return DIRECTION_VECTORS.flatMap((direction) => {
    const target = getAdjacentCoord(source, direction);

    if (!target || !canLandOnOccupiedCell(board, target)) {
      return [];
    }

    return [target];
  });
}

function getSingleStepTargets(board: EngineState['board'], source: Coord): Coord[] {
  return DIRECTION_VECTORS.flatMap((direction) => {
    const target = getAdjacentCoord(source, direction);

    if (!target || !isEmptyCell(board, target)) {
      return [];
    }

    return [target];
  });
}

function getSplitTargets(board: EngineState['board'], source: Coord): Coord[] {
  return DIRECTION_VECTORS.flatMap((direction) => {
    const target = getAdjacentCoord(source, direction);

    if (!target || !isEmptyCell(board, target)) {
      return [];
    }

    return [target];
  });
}

function getFriendlyTransferTargets(
  board: EngineState['board'],
  source: Coord,
  player: Player,
  config: RuleConfig,
): Coord[] {
  if (!config.allowNonAdjacentFriendlyStackTransfer || !isControlledStack(board, source, player)) {
    return [];
  }

  return allCoords().filter((coord) => {
    if (coord === source) {
      return false;
    }

    return (
      isStack(board, coord) &&
      getController(board, coord) === player &&
      getCellHeight(board, coord) < 3
    );
  });
}

function moveCheckers(
  board: EngineState['board'],
  source: Coord,
  target: Coord,
  movingCount: number,
  clonedCoords: Set<Coord>,
): AppliedActionState {
  ensureMutableCell(board, source, clonedCoords);
  ensureMutableCell(board, target, clonedCoords);
  addCheckers(board, target, removeTopCheckers(board, source, movingCount));

  return {
    board,
    pendingJump: null,
  };
}

const actionHandlers = {
  manualUnfreeze: {
    kind: 'manualUnfreeze',
    getActions: (state, coord, _config) => {
      if (
        isFrozenSingle(state.board, coord) &&
        getTopChecker(state.board, coord)?.owner === state.currentPlayer
      ) {
        return [{ type: 'manualUnfreeze', coord }];
      }

      return [];
    },
    applyValidated: (state, action) => {
      if (action.type !== 'manualUnfreeze') {
        return { valid: false, reason: `Unsupported action ${action.type} for manual unfreeze.` };
      }

      const board = cloneBoardStructure(state.board);
      const clonedCoords = new Set<Coord>();

      ensureMutableCell(board, action.coord, clonedCoords);
      setSingleCheckerFrozen(board, action.coord, false);

      return {
        board,
        pendingJump: null,
      };
    },
  } satisfies ActionHandler,
  jumpSequence: {
    kind: 'jumpSequence',
    getActions: (state, coord, _config) => {
      const player = state.currentPlayer;
      const isPlayerSingle = isMovableSingle(state.board, coord, player);
      const isPlayerStack = isControlledStack(state.board, coord, player);

      if (!isPlayerSingle && !isPlayerStack) {
        return [];
      }

      return getJumpContinuationTargets(state, coord, []).map<JumpSequenceAction>((target) => ({
        type: 'jumpSequence',
        source: coord,
        path: [target],
      }));
    },
    applyValidated: (state, action) => {
      if (action.type !== 'jumpSequence') {
        return { valid: false, reason: `Unsupported action ${action.type} for jump sequence.` };
      }

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
        continuationTargets,
      };
    },
  } satisfies ActionHandler,
  climbOne: {
    kind: 'climbOne',
    getActions: (state, coord, _config) => {
      const player = state.currentPlayer;
      const isPlayerSingle = isMovableSingle(state.board, coord, player);
      const isPlayerStack = isControlledStack(state.board, coord, player);

      if (!isPlayerSingle && !isPlayerStack) {
        return [];
      }

      return getClimbTargets(state.board, coord).map((target) => ({
        type: 'climbOne' as const,
        source: coord,
        target,
      }));
    },
    applyValidated: (state, action) => {
      if (action.type !== 'climbOne') {
        return { valid: false, reason: `Unsupported action ${action.type} for climb.` };
      }

      const board = cloneBoardStructure(state.board);
      return moveCheckers(board, action.source, action.target, 1, new Set<Coord>());
    },
  } satisfies ActionHandler,
  moveSingleToEmpty: {
    kind: 'moveSingleToEmpty',
    getActions: (state, coord, _config) => {
      const player = state.currentPlayer;
      const isPlayerSingle = isMovableSingle(state.board, coord, player);
      const isPlayerStack = isControlledStack(state.board, coord, player);

      if (!isPlayerSingle && !isPlayerStack) {
        return [];
      }

      return getSingleStepTargets(state.board, coord).map((target) => ({
        type: 'moveSingleToEmpty' as const,
        source: coord,
        target,
      }));
    },
    applyValidated: (state, action) => {
      if (action.type !== 'moveSingleToEmpty') {
        return { valid: false, reason: `Unsupported action ${action.type} for step move.` };
      }

      const board = cloneBoardStructure(state.board);
      const movingCount = isStack(board, action.source) ? getCellHeight(board, action.source) : 1;
      return moveCheckers(board, action.source, action.target, movingCount, new Set<Coord>());
    },
  } satisfies ActionHandler,
  splitOneFromStack: {
    kind: 'splitOneFromStack',
    getActions: (state, coord, _config) => {
      if (!isControlledStack(state.board, coord, state.currentPlayer)) {
        return [];
      }

      return getSplitTargets(state.board, coord).map((target) => ({
        type: 'splitOneFromStack' as const,
        source: coord,
        target,
      }));
    },
    applyValidated: (state, action) => {
      if (action.type !== 'splitOneFromStack') {
        return { valid: false, reason: `Unsupported action ${action.type} for split-one.` };
      }

      const board = cloneBoardStructure(state.board);
      return moveCheckers(board, action.source, action.target, 1, new Set<Coord>());
    },
  } satisfies ActionHandler,
  splitTwoFromStack: {
    kind: 'splitTwoFromStack',
    getActions: (state, coord, _config) => {
      if (
        !isControlledStack(state.board, coord, state.currentPlayer) ||
        getCellHeight(state.board, coord) < 2
      ) {
        return [];
      }

      return getSplitTargets(state.board, coord).map((target) => ({
        type: 'splitTwoFromStack' as const,
        source: coord,
        target,
      }));
    },
    applyValidated: (state, action) => {
      if (action.type !== 'splitTwoFromStack') {
        return { valid: false, reason: `Unsupported action ${action.type} for split-two.` };
      }

      const board = cloneBoardStructure(state.board);
      return moveCheckers(board, action.source, action.target, 2, new Set<Coord>());
    },
  } satisfies ActionHandler,
  friendlyStackTransfer: {
    kind: 'friendlyStackTransfer',
    getActions: (state, coord, config) => {
      if (!isControlledStack(state.board, coord, state.currentPlayer)) {
        return [];
      }

      return getFriendlyTransferTargets(
        state.board,
        coord,
        state.currentPlayer,
        config,
      ).map((target) => ({
        type: 'friendlyStackTransfer' as const,
        source: coord,
        target,
      }));
    },
    applyValidated: (state, action) => {
      if (action.type !== 'friendlyStackTransfer') {
        return {
          valid: false,
          reason: `Unsupported action ${action.type} for friendly transfer.`,
        };
      }

      const board = cloneBoardStructure(state.board);
      return moveCheckers(board, action.source, action.target, 1, new Set<Coord>());
    },
  } satisfies ActionHandler,
} satisfies Record<ActionKind, ActionHandler>;

/** Returns the canonical handler for one action kind. */
export function getActionHandler(kind: TurnAction['type']): ActionHandler {
  return actionHandlers[kind];
}

/** Generates actions for a coordinate using the canonical ordered handlers. */
export function getGeneratedActionsForCell(
  state: ActionState,
  coord: Coord,
  config: RuleConfig,
): TurnAction[] {
  const manualUnfreezeActions = actionHandlers.manualUnfreeze.getActions(state, coord, config);

  if (manualUnfreezeActions.length) {
    return manualUnfreezeActions;
  }

  const actions: TurnAction[] = [];

  for (const kind of ACTION_GENERATION_ORDER) {
    actions.push(...actionHandlers[kind].getActions(state, coord, config));
  }

  return actions;
}
