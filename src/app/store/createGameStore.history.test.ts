import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createGameStore } from '@/app/store/createGameStore';
import { applyAction, createInitialState, getLegalActions } from '@/domain';
import {
  boardWithPieces,
  checker,
  createSession,
  gameStateWithBoard,
  resetFactoryIds,
  undoFrame,
  withConfig,
} from '@/test/factories';

describe('createGameStore history and interaction', () => {
  beforeEach(() => {
    resetFactoryIds();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('restores undo and redo from shared turn-log frames', () => {
    const config = withConfig();
    const state0 = createInitialState(config);
    const state1 = applyAction(state0, { type: 'climbOne', source: 'A1', target: 'B2' }, config);
    const state2 = applyAction(state1, getLegalActions(state1, config)[0], config);
    const store = createGameStore({
      initialSession: createSession(state2, {
        turnLog: state2.history,
        past: [undoFrame(state0), undoFrame(state1)],
      }),
      storage: undefined,
    });

    expect(store.getState().historyCursor).toBe(2);

    store.getState().undo();
    expect(store.getState().historyCursor).toBe(1);
    expect(store.getState().gameState.positionCounts).toEqual(state1.positionCounts);

    store.getState().redo();
    expect(store.getState().historyCursor).toBe(2);
    expect(store.getState().gameState.positionCounts).toEqual(state2.positionCounts);
  });

  it('recomputes selectable cells when undo crosses game-over and active states with the same board hash', () => {
    const activeState = createInitialState();
    const gameOverState = {
      ...activeState,
      status: 'gameOver' as const,
      victory: { type: 'threefoldDraw' as const },
    };
    const store = createGameStore({
      initialSession: createSession(gameOverState, {
        present: undoFrame(gameOverState),
        past: [undoFrame(activeState)],
        turnLog: [],
      }),
      storage: undefined,
    });

    expect(store.getState().selectableCoords).toEqual([]);

    store.getState().undo();

    expect(store.getState().gameState.status).toBe('active');
    expect(store.getState().selectableCoords.length).toBeGreaterThan(0);
  });

  it('matches repeated undo and redo when traveling to a cursor directly', () => {
    const config = withConfig();
    const state0 = createInitialState(config);
    const state1 = applyAction(state0, { type: 'climbOne', source: 'A1', target: 'B2' }, config);
    const state2 = applyAction(state1, getLegalActions(state1, config)[0], config);
    const state3 = applyAction(state2, getLegalActions(state2, config)[0], config);
    const session = createSession(state3, {
      turnLog: state3.history,
      past: [undoFrame(state0), undoFrame(state1), undoFrame(state2)],
    });
    const byButtons = createGameStore({ initialSession: session, storage: undefined });
    const byCursor = createGameStore({ initialSession: session, storage: undefined });

    byButtons.getState().undo();
    byButtons.getState().undo();
    byButtons.getState().redo();

    byCursor.getState().goToHistoryCursor(1);
    byCursor.getState().goToHistoryCursor(2);

    expect(byCursor.getState().gameState).toEqual(byButtons.getState().gameState);
    expect(byCursor.getState().past).toEqual(byButtons.getState().past);
    expect(byCursor.getState().future).toEqual(byButtons.getState().future);
  });

  it('erases the future branch after a new move from rewound history', () => {
    const config = withConfig();
    const state0 = createInitialState(config);
    const state1 = applyAction(state0, { type: 'climbOne', source: 'A1', target: 'B2' }, config);
    const state2 = applyAction(state1, getLegalActions(state1, config)[0], config);
    const store = createGameStore({
      initialSession: createSession(state2, {
        turnLog: state2.history,
        past: [undoFrame(state0), undoFrame(state1)],
      }),
      storage: undefined,
    });

    store.getState().undo();

    const source = store.getState().selectableCoords[0];
    expect(source).toBeDefined();
    if (!source) {
      return;
    }

    store.getState().selectCell(source);

    const actionType = store.getState().availableActionKinds[0];
    expect(actionType).toBeDefined();
    if (!actionType) {
      return;
    }

    store.getState().chooseActionType(actionType);

    if (actionType !== 'manualUnfreeze') {
      const target = store.getState().legalTargets[0];
      expect(target).toBeDefined();
      if (!target) {
        return;
      }
      store.getState().selectCell(target);
    }

    expect(store.getState().future).toHaveLength(0);
    expect(store.getState().turnLog).toHaveLength(store.getState().historyCursor);
  });

  it('shows single-step move targets and commits moveSingleToEmpty from store flow', () => {
    const state = gameStateWithBoard(
      boardWithPieces({
        B2: [checker('white')],
        F6: [checker('black')],
      }),
    );
    const store = createGameStore({
      initialSession: createSession(state),
      storage: undefined,
    });

    store.getState().selectCell('B2');
    store.getState().chooseActionType('moveSingleToEmpty');
    store.getState().selectCell('A1');

    expect(store.getState().gameState.history[0].action).toEqual({
      type: 'moveSingleToEmpty',
      source: 'B2',
      target: 'A1',
    });
  });

  it('moves a full controlled stack with moveSingleToEmpty', () => {
    const state = gameStateWithBoard(
      boardWithPieces({
        C3: [checker('white'), checker('white')],
        F6: [checker('black')],
      }),
    );
    const store = createGameStore({
      initialSession: createSession(state),
      storage: undefined,
    });

    store.getState().selectCell('C3');
    store.getState().chooseActionType('moveSingleToEmpty');
    store.getState().selectCell('D4');

    expect(store.getState().gameState.board.C3.checkers).toHaveLength(0);
    expect(store.getState().gameState.board.D4.checkers).toHaveLength(2);
  });

  it('keeps jump-chain selection active on non-target clicks and commits stack jumps', () => {
    const state = gameStateWithBoard(
      boardWithPieces({
        B2: [checker('white'), checker('white')],
        C3: [checker('black')],
        F6: [checker('black')],
      }),
    );
    const store = createGameStore({
      initialSession: createSession(state),
      storage: undefined,
    });

    store.getState().selectCell('B2');
    store.getState().chooseActionType('jumpSequence');
    store.getState().selectCell('A1');

    expect(store.getState().selectedActionType).toBe('jumpSequence');
    expect(store.getState().interaction.type).toBe('buildingJumpChain');

    store.getState().selectCell('D4');

    expect(store.getState().gameState.history[0].action).toEqual({
      type: 'jumpSequence',
      source: 'B2',
      path: ['D4'],
    });
  });

  it('returns to a neutral jump follow-up state after the first jump and after cancel', () => {
    const state = gameStateWithBoard(
      boardWithPieces({
        A1: [checker('white')],
        B2: [checker('white')],
        D4: [checker('white')],
        F6: [checker('black')],
      }),
    );
    const store = createGameStore({
      initialSession: createSession(state),
      storage: undefined,
    });

    store.getState().selectCell('A1');
    store.getState().chooseActionType('jumpSequence');
    store.getState().selectCell('C3');

    expect(store.getState().selectedCell).toBeNull();
    expect(store.getState().selectedActionType).toBeNull();
    expect(store.getState().interaction).toMatchObject({
      type: 'jumpFollowUp',
      source: 'C3',
    });
    const interactionAfterJump = store.getState().interaction;
    expect(interactionAfterJump.type).toBe('jumpFollowUp');
    if (interactionAfterJump.type === 'jumpFollowUp') {
      expect(interactionAfterJump.availableTargets).toEqual(expect.arrayContaining(['E5']));
    }
    expect(store.getState().selectableCoords).toEqual(['C3']);

    store.getState().cancelInteraction();

    expect(store.getState().selectedCell).toBeNull();
    expect(store.getState().selectedActionType).toBeNull();
    expect(store.getState().interaction).toMatchObject({
      type: 'jumpFollowUp',
      source: 'C3',
    });
    const interactionAfterCancel = store.getState().interaction;
    expect(interactionAfterCancel.type).toBe('jumpFollowUp');
    if (interactionAfterCancel.type === 'jumpFollowUp') {
      expect(interactionAfterCancel.availableTargets).toEqual(expect.arrayContaining(['E5']));
    }
  });

  it('passes the turn only after the jump follow-up action is spent', () => {
    const state = gameStateWithBoard(
      boardWithPieces({
        A1: [checker('white')],
        B2: [checker('white')],
        D4: [checker('white')],
        F6: [checker('black')],
      }),
    );
    const store = createGameStore({
      initialSession: createSession(state),
      storage: undefined,
    });

    store.getState().selectCell('A1');
    store.getState().chooseActionType('jumpSequence');
    store.getState().selectCell('C3');

    expect(store.getState().interaction.type).toBe('jumpFollowUp');

    store.getState().selectCell('C3');
    store.getState().chooseActionType('moveSingleToEmpty');
    store.getState().selectCell('B3');

    expect(store.getState().gameState.currentPlayer).toBe('black');
    expect(store.getState().interaction).toEqual({
      type: 'passingDevice',
      nextPlayer: 'black',
    });
  });

  it('keeps the neutral jump follow-up state after the same jumper continues into another jump', () => {
    const state = gameStateWithBoard(
      boardWithPieces({
        A1: [checker('white')],
        B2: [checker('white')],
        D4: [checker('white')],
        E4: [checker('white')],
      }),
    );
    const store = createGameStore({
      initialSession: createSession(state),
      storage: undefined,
    });

    store.getState().selectCell('A1');
    store.getState().chooseActionType('jumpSequence');
    store.getState().selectCell('C3');

    expect(store.getState().interaction).toMatchObject({
      type: 'jumpFollowUp',
      source: 'C3',
    });
    const interactionAfterFirstJump = store.getState().interaction;
    expect(interactionAfterFirstJump.type).toBe('jumpFollowUp');
    if (interactionAfterFirstJump.type === 'jumpFollowUp') {
      expect(interactionAfterFirstJump.availableTargets).toEqual(
        expect.arrayContaining(['E5']),
      );
    }

    store.getState().selectCell('C3');
    store.getState().chooseActionType('jumpSequence');
    store.getState().selectCell('E5');

    expect(store.getState().gameState.currentPlayer).toBe('white');
    expect(store.getState().interaction).toMatchObject({
      type: 'jumpFollowUp',
      source: 'E5',
    });
    const interactionAfterFollowUpJump = store.getState().interaction;
    expect(interactionAfterFollowUpJump.type).toBe('jumpFollowUp');
    if (interactionAfterFollowUpJump.type === 'jumpFollowUp') {
      expect(interactionAfterFollowUpJump.availableTargets).toEqual(
        expect.arrayContaining(['E3']),
      );
    }
  });

  it('hydrates saved pending-jump states into the neutral jump follow-up UI', () => {
    const state = gameStateWithBoard(
      boardWithPieces({
        A1: [checker('white')],
        B2: [checker('white')],
        D4: [checker('white')],
        F6: [checker('black')],
      }),
    );
    const afterFirstJump = applyAction(
      state,
      {
        type: 'jumpSequence',
        source: 'A1',
        path: ['C3'],
      },
      withConfig(),
    );
    const store = createGameStore({
      initialSession: createSession(afterFirstJump),
      storage: undefined,
    });

    expect(store.getState().selectedCell).toBeNull();
    expect(store.getState().selectedActionType).toBeNull();
    expect(store.getState().interaction).toEqual({
      type: 'jumpFollowUp',
      source: 'C3',
      availableTargets: ['E5'],
    });
    expect(store.getState().selectableCoords).toEqual(['C3']);
  });
});
