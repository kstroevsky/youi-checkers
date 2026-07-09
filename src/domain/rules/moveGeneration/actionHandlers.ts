import {
  addCheckers,
  cloneBoardStructure,
  ensureMutableCell,
  getCell,
  getCellHeight,
  getController,
  getTopChecker,
  isEmptyCell,
  isSingleChecker,
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
} from '@/domain/validators/stateValidators';

import {
  getJumpContinuationTargets,
  getJumpTargetsForContext,
  getMovingPlayer,
  getVisitedFirstJumpedOwner,
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

function collectAdjacentTargets(
  board: EngineState['board'],
  source: Coord,
  isValidTarget: (board: EngineState['board'], target: Coord) => boolean,
): Coord[] {
  const targets: Coord[] = [];

  for (const direction of DIRECTION_VECTORS) {
    const target = getAdjacentCoord(source, direction);

    if (target && isValidTarget(board, target)) {
      targets.push(target);
    }
  }

  return targets;
}

function getClimbTargets(board: EngineState['board'], source: Coord): Coord[] {
  return collectAdjacentTargets(board, source, (nextBoard, target) =>
    canLandOnOccupiedCell(nextBoard, target, 1),
  );
}

function getSingleStepTargets(board: EngineState['board'], source: Coord): Coord[] {
  return collectAdjacentTargets(board, source, isEmptyCell);
}

function getSplitTargets(
  board: EngineState['board'],
  source: Coord,
  movingCount: number,
): Coord[] {
  return collectAdjacentTargets(board, source, (nextBoard, target) => {
    return isEmptyCell(nextBoard, target) || canLandOnOccupiedCell(nextBoard, target, movingCount);
  });
}

function getFriendlyTransferTargets(
  board: EngineState['board'],
  source: Coord,
  player: Player,
  config: RuleConfig,
): Coord[] {
  if (
    !config.allowNonAdjacentFriendlyStackTransfer ||
    (!isControlledStack(board, source, player) &&
      !hasBuriedFriendlyTransferChecker(board, source, player))
  ) {
    return [];
  }

  const targets: Coord[] = [];

  for (const coord of allCoords()) {
    if (coord === source) {
      continue;
    }

    if (
      isStack(board, coord) &&
      getController(board, coord) === player &&
      canLandOnOccupiedCell(board, coord, 1)
    ) {
      targets.push(coord);
    }
  }

  return targets;
}

function findBuriedFriendlyTransferCheckerIndex(
  board: EngineState['board'],
  source: Coord,
  player: Player,
): number {
  const { checkers } = getCell(board, source);
  const topChecker = checkers.at(-1);

  if (!topChecker || topChecker.owner === player) {
    return -1;
  }

  for (let index = checkers.length - 2; index >= 0; index -= 1) {
    if (checkers[index].owner === player) {
      return index;
    }
  }

  return -1;
}

function hasBuriedFriendlyTransferChecker(
  board: EngineState['board'],
  source: Coord,
  player: Player,
): boolean {
  return findBuriedFriendlyTransferCheckerIndex(board, source, player) !== -1;
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

function moveFriendlyTransferChecker(
  board: EngineState['board'],
  source: Coord,
  target: Coord,
  player: Player,
  clonedCoords: Set<Coord>,
): AppliedActionState {
  ensureMutableCell(board, source, clonedCoords);
  ensureMutableCell(board, target, clonedCoords);

  const buriedIndex = findBuriedFriendlyTransferCheckerIndex(board, source, player);
  const checkers =
    buriedIndex === -1
      ? removeTopCheckers(board, source, 1)
      : getCell(board, source).checkers.splice(buriedIndex, 1);

  addCheckers(board, target, checkers);

  return {
    board,
    pendingJump: null,
  };
}

const actionHandlers = {
  manualUnfreeze: {
    kind: 'manualUnfreeze',
    getActions: (state, coord, _config) => {
      return [{ type: 'manualUnfreeze', coord }];
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
        getVisitedFirstJumpedOwner(state, action.source),
      );

      if (!('board' in result)) {
        return result;
      }

      const continuationTargets = getJumpTargetsForContext(
        result.board,
        result.currentCoord,
        movingPlayer,
        result.jumpedCheckerIds,
        result.firstJumpedOwner,
      );

      return {
        board: result.board,
        pendingJump: continuationTargets.length
          ? {
              source: result.currentCoord,
              jumpedCheckerIds: [...result.jumpedCheckerIds],
              firstJumpedOwner: result.firstJumpedOwner ?? undefined,
            }
          : null,
        continuationTargets,
      };
    },
  } satisfies ActionHandler,
  climbOne: {
    kind: 'climbOne',
    getActions: (state, coord, _config) => {
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
      return getSplitTargets(state.board, coord, 1).map((target) => ({
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
      return getSplitTargets(state.board, coord, 2).map((target) => ({
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
      return moveFriendlyTransferChecker(
        board,
        action.source,
        action.target,
        state.currentPlayer,
        new Set<Coord>(),
      );
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
  const topChecker = getTopChecker(state.board, coord);

  if (!topChecker) {
    return [];
  }

  if (topChecker.owner !== state.currentPlayer) {
    return actionHandlers.friendlyStackTransfer.getActions(state, coord, config);
  }

  if (topChecker.frozen) {
    return isFrozenSingle(state.board, coord)
      ? actionHandlers.manualUnfreeze.getActions(state, coord, config)
      : [];
  }

  const isPlayerSingle = isSingleChecker(state.board, coord);
  const isPlayerStack = !isPlayerSingle && isStack(state.board, coord);

  if (!isPlayerSingle && !isPlayerStack) {
    return [];
  }

  const actions: TurnAction[] = [];

  for (const kind of ACTION_GENERATION_ORDER) {
    if (
      (kind === 'splitOneFromStack' ||
        kind === 'splitTwoFromStack' ||
        kind === 'friendlyStackTransfer') &&
      !isPlayerStack
    ) {
      continue;
    }

    if (kind === 'splitTwoFromStack' && getCellHeight(state.board, coord) < 2) {
      continue;
    }

    actions.push(...actionHandlers[kind].getActions(state, coord, config));
  }

  return actions;
}
