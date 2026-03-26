import { beforeEach, describe, expect, it } from 'vitest';

import {
  applyAction,
  createInitialState,
  getLegalActions,
  getLegalActionsForCell,
  validateAction,
} from '@/domain';
import {
  boardWithPieces,
  checker,
  gameStateWithBoard,
  resetFactoryIds,
  withConfig,
} from '@/test/factories';
describe('game engine action application', () => {
  beforeEach(() => {
    resetFactoryIds();
  });
  it('rejects illegal jumps over stacks and onto occupied cells', () => {
    const stackState = gameStateWithBoard(
      boardWithPieces({
        A1: [checker('white')],
        B2: [checker('black'), checker('white')],
      }),
    );
    expect(
      validateAction(
        stackState,
        {
          type: 'jumpSequence',
          source: 'A1',
          path: ['C3'],
        },
        withConfig(),
      ),
    ).toEqual({ valid: false, reason: 'Cannot jump over B2.' });

    const occupiedLandingState = gameStateWithBoard(
      boardWithPieces({
        A1: [checker('white')],
        B2: [checker('black')],
        C3: [checker('white')],
      }),
    );
    expect(
      validateAction(
        occupiedLandingState,
        {
          type: 'jumpSequence',
          source: 'A1',
          path: ['C3'],
        },
        withConfig(),
      ).valid,
    ).toBe(false);
  });

  it('handles climb, split-one, split-two, and control changes', () => {
    const climbState = gameStateWithBoard(
      boardWithPieces({
        A1: [checker('white')],
        B2: [checker('black')],
      }),
    );
    const afterClimb = applyAction(
      climbState,
      {
        type: 'climbOne',
        source: 'A1',
        target: 'B2',
      },
      withConfig(),
    );

    expect(afterClimb.board.B2.checkers.map((entry) => entry.owner)).toEqual([
      'black',
      'white',
    ]);

    const splitState = gameStateWithBoard(
      boardWithPieces({
        C3: [checker('black'), checker('white'), checker('white')],
      }),
    );
    const afterSplitOne = applyAction(
      splitState,
      {
        type: 'splitOneFromStack',
        source: 'C3',
        target: 'C4',
      },
      withConfig(),
    );

    expect(afterSplitOne.board.C3.checkers).toHaveLength(2);
    expect(afterSplitOne.board.C4.checkers).toHaveLength(1);

    const afterSplitTwo = applyAction(
      splitState,
      {
        type: 'splitTwoFromStack',
        source: 'C3',
        target: 'C4',
      },
      withConfig(),
    );

    expect(afterSplitTwo.board.C3.checkers).toHaveLength(1);
    expect(afterSplitTwo.board.C4.checkers).toHaveLength(2);
  });

  it('supports one-step movement from active singles and controlled stacks onto adjacent empty cells', () => {
    const state = gameStateWithBoard(
      boardWithPieces({
        B2: [checker('white')],
        F6: [checker('black')],
      }),
    );
    const singleActions = getLegalActionsForCell(state, 'B2', withConfig()).filter(
      (action) => action.type === 'moveSingleToEmpty',
    );

    expect(singleActions).toHaveLength(8);
    expect(singleActions).toContainEqual({
      type: 'moveSingleToEmpty',
      source: 'B2',
      target: 'A1',
    });
    expect(singleActions).toContainEqual({
      type: 'moveSingleToEmpty',
      source: 'B2',
      target: 'C3',
    });

    const afterStep = applyAction(
      state,
      {
        type: 'moveSingleToEmpty',
        source: 'B2',
        target: 'A1',
      },
      withConfig(),
    );

    expect(afterStep.board.B2.checkers).toHaveLength(0);
    expect(afterStep.board.A1.checkers).toHaveLength(1);
    expect(afterStep.board.A1.checkers[0].owner).toBe('white');

    const stackState = gameStateWithBoard(
      boardWithPieces({
        C3: [checker('white'), checker('white')],
        F6: [checker('black')],
      }),
    );
    const stackActions = getLegalActionsForCell(stackState, 'C3', withConfig()).filter(
      (action) => action.type === 'moveSingleToEmpty',
    );

    expect(stackActions).toContainEqual({
      type: 'moveSingleToEmpty',
      source: 'C3',
      target: 'D4',
    });

    const afterStackStep = applyAction(
      stackState,
      {
        type: 'moveSingleToEmpty',
        source: 'C3',
        target: 'D4',
      },
      withConfig(),
    );

    expect(afterStackStep.board.C3.checkers).toHaveLength(0);
    expect(afterStackStep.board.D4.checkers).toHaveLength(2);
  });

  it('rejects one-step single movement from frozen pieces or onto occupied cells', () => {
    const frozenState = gameStateWithBoard(
      boardWithPieces({
        B2: [checker('white', true)],
        F6: [checker('black')],
      }),
    );

    expect(getLegalActionsForCell(frozenState, 'B2', withConfig())).toEqual([
      {
        type: 'manualUnfreeze',
        coord: 'B2',
      },
    ]);

    const occupiedTargetState = gameStateWithBoard(
      boardWithPieces({
        B2: [checker('white')],
        C3: [checker('black')],
        F6: [checker('black')],
      }),
    );

    expect(
      validateAction(
        occupiedTargetState,
        {
          type: 'moveSingleToEmpty',
          source: 'B2',
          target: 'C3',
        },
        withConfig(),
      ).valid,
    ).toBe(false);

    const frozenTargetState = gameStateWithBoard(
      boardWithPieces({
        B2: [checker('white')],
        C3: [checker('black', true)],
        F6: [checker('black')],
      }),
    );

    expect(
      validateAction(
        frozenTargetState,
        {
          type: 'moveSingleToEmpty',
          source: 'B2',
          target: 'C3',
        },
        withConfig(),
      ).valid,
    ).toBe(false);
  });

  it('rejects manual unfreeze away from the pending jump source', () => {
    const config = withConfig();
    const state = gameStateWithBoard(
      boardWithPieces({
        A1: [checker('white')],
        B2: [checker('black')],
        D4: [checker('black')],
        F6: [checker('white', true)],
      }),
    );
    const afterFirstJump = applyAction(
      state,
      {
        type: 'jumpSequence',
        source: 'A1',
        path: ['C3'],
      },
      config,
    );

    expect(
      validateAction(
        afterFirstJump,
        {
          type: 'manualUnfreeze',
          coord: 'F6',
        },
        config,
      ),
    ).toEqual({
      valid: false,
      reason: 'Only C3 may act during jump continuation.',
    });
  });

  it('applies legal stack jump segments and records history correctly', () => {
    const state = gameStateWithBoard(
      boardWithPieces({
        B2: [checker('white'), checker('white')],
        C3: [checker('black')],
        F6: [checker('black')],
      }),
    );
    const actions = getLegalActionsForCell(state, 'B2', withConfig());

    expect(actions).toContainEqual({
      type: 'jumpSequence',
      source: 'B2',
      path: ['D4'],
    });

    const afterJump = applyAction(
      state,
      {
        type: 'jumpSequence',
        source: 'B2',
        path: ['D4'],
      },
      withConfig(),
    );

    expect(afterJump.board.B2.checkers).toHaveLength(0);
    expect(afterJump.board.D4.checkers).toHaveLength(2);
    expect(afterJump.history.at(-1)?.action).toEqual({
      type: 'jumpSequence',
      source: 'B2',
      path: ['D4'],
    });
  });

  it('prevents climbing onto a frozen checker and stack heights above three', () => {
    const state = gameStateWithBoard(
      boardWithPieces({
        A1: [checker('white')],
        B2: [checker('black', true)],
        C3: [checker('white'), checker('white'), checker('white')],
      }),
    );

    expect(
      validateAction(
        state,
        {
          type: 'climbOne',
          source: 'A1',
          target: 'B2',
        },
        withConfig(),
      ).valid,
    ).toBe(false);

    expect(
      validateAction(
        state,
        {
          type: 'friendlyStackTransfer',
          source: 'C3',
          target: 'C3',
        },
        withConfig(),
      ).valid,
    ).toBe(false);
  });

  it('supports non-adjacent friendly stack transfer behind config', () => {
    const state = gameStateWithBoard(
      boardWithPieces({
        A1: [checker('white'), checker('white')],
        F6: [checker('white'), checker('white')],
      }),
    );

    const actions = getLegalActionsForCell(
      state,
      'A1',
      withConfig({ allowNonAdjacentFriendlyStackTransfer: true }),
    );

    expect(actions).toContainEqual({
      type: 'friendlyStackTransfer',
      source: 'A1',
      target: 'F6',
    });
  });

  it('preserves untouched board cell references after legal moves', () => {
    const initialState = createInitialState();
    const climbedState = applyAction(
      initialState,
      { type: 'climbOne', source: 'A1', target: 'B2' },
      withConfig(),
    );

    expect(climbedState.board).not.toBe(initialState.board);
    expect(climbedState.board.A1).not.toBe(initialState.board.A1);
    expect(climbedState.board.B2).not.toBe(initialState.board.B2);
    expect(climbedState.board.F6).toBe(initialState.board.F6);

    const jumpState = gameStateWithBoard(
      boardWithPieces({
        A1: [checker('white')],
        B2: [checker('black')],
      }),
    );
    const afterJump = applyAction(
      jumpState,
      { type: 'jumpSequence', source: 'A1', path: ['C3'] },
      withConfig(),
    );

    expect(afterJump.board.A1).not.toBe(jumpState.board.A1);
    expect(afterJump.board.B2).not.toBe(jumpState.board.B2);
    expect(afterJump.board.C3).not.toBe(jumpState.board.C3);
    expect(afterJump.board.F6).toBe(jumpState.board.F6);
  });

  it('handles automatic passes when the next player has no legal actions', () => {
    const activeBoard = boardWithPieces({
      A1: [checker('white'), checker('white')],
    });
    const activeState = gameStateWithBoard(activeBoard);
    const afterMove = applyAction(
      activeState,
      {
        type: 'splitOneFromStack',
        source: 'A1',
        target: 'A2',
      },
      withConfig(),
    );

    expect(afterMove.currentPlayer).toBe('white');
    expect(afterMove.history[0].autoPasses).toEqual(['black']);
  });

  it('computes score summaries and maintains invariants over random playouts', () => {
    let state = createInitialState();
    const config = withConfig();

    expect(getLegalActions(state, config).length).toBeGreaterThan(0);

    for (let turn = 0; turn < 24; turn += 1) {
      const actions = getLegalActions(state, config);

      expect(actions.length).toBeGreaterThan(0);
      state = applyAction(state, actions[turn % actions.length], config);

      for (const cell of Object.values(state.board)) {
        expect(cell.checkers.length).toBeLessThanOrEqual(3);
        if (cell.checkers.length > 1) {
          expect(cell.checkers.some((entry) => entry.frozen)).toBe(false);
          expect(cell.checkers.at(-1)?.owner).toBeDefined();
        }
      }
    }
  });
});
