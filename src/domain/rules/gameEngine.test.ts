import { describe, expect, it, beforeEach } from 'vitest';

import {
  applyAction,
  checkVictory,
  createInitialState,
  deserializeSession,
  getJumpContinuationTargets,
  getLegalActions,
  getLegalActionsForCell,
  getScoreSummary,
  serializeSession,
  validateAction,
} from '@/domain';
import { createEmptyBoard } from '@/domain/model/board';
import { hashPosition } from '@/domain/model/hash';
import type { GameState } from '@/domain/model/types';
import { createSession, boardWithPieces, checker, gameStateWithBoard, resetFactoryIds, withConfig } from '@/test/factories';

describe('game engine', () => {
  beforeEach(() => {
    resetFactoryIds();
  });

  it('creates the exact initial setup', () => {
    const state = createInitialState();

    expect(state.currentPlayer).toBe('white');
    expect(state.board.A1.checkers[0].owner).toBe('white');
    expect(state.board.F3.checkers[0].owner).toBe('white');
    expect(state.board.A4.checkers[0].owner).toBe('black');
    expect(state.board.F6.checkers[0].owner).toBe('black');
    expect(Object.values(state.board).every((cell) => cell.checkers.length === 1)).toBe(true);
  });

  it('jumps over own checker without freezing and can continue a chain', () => {
    const state = gameStateWithBoard(
      boardWithPieces({
        A1: [checker('white')],
        B2: [checker('white')],
        D4: [checker('white')],
      }),
    );

    const actions = getLegalActionsForCell(state, 'A1', withConfig());
    const jumpAction = actions.find((action) => action.type === 'jumpSequence');

    expect(jumpAction).toEqual({
      type: 'jumpSequence',
      source: 'A1',
      path: ['C3'],
    });
    expect(getJumpContinuationTargets(state, 'A1', ['C3'])).toEqual(['E5']);
  });

  it('rejects jump chains that repeat an earlier in-chain position', () => {
    const state = gameStateWithBoard(
      boardWithPieces({
        A1: [checker('white')],
        B2: [checker('white')],
      }),
    );

    expect(getJumpContinuationTargets(state, 'A1', ['C3'])).toEqual([]);
    expect(
      getLegalActionsForCell(state, 'A1', withConfig()).filter(
        (action) => action.type === 'jumpSequence',
      ),
    ).toEqual([
      {
        type: 'jumpSequence',
        source: 'A1',
        path: ['C3'],
      },
    ]);

    expect(
      validateAction(
        state,
        {
          type: 'jumpSequence',
          source: 'A1',
          path: ['C3', 'A1'],
        },
        withConfig(),
      ),
    ).toEqual({
      valid: false,
      reason: 'Jump path repeats a previous position at A1.',
    });
  });

  it('freezes an opponent when jumping and unfreezes own frozen checker when jumping', () => {
    const freezeState = gameStateWithBoard(
      boardWithPieces({
        A1: [checker('white')],
        B2: [checker('black')],
      }),
    );
    const afterFreeze = applyAction(
      freezeState,
      {
        type: 'jumpSequence',
        source: 'A1',
        path: ['C3'],
      },
      withConfig(),
    );

    expect(afterFreeze.board.B2.checkers[0].frozen).toBe(true);

    const thawState = gameStateWithBoard(
      boardWithPieces({
        A1: [checker('white')],
        B2: [checker('white', true)],
      }),
    );
    const afterThaw = applyAction(
      thawState,
      {
        type: 'jumpSequence',
        source: 'A1',
        path: ['C3'],
      },
      withConfig(),
    );

    expect(afterThaw.board.B2.checkers[0].frozen).toBe(false);
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

    expect(afterClimb.board.B2.checkers.map((entry) => entry.owner)).toEqual(['black', 'white']);

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

    const actions = getLegalActionsForCell(state, 'A1', withConfig());

    expect(actions).toContainEqual({
      type: 'friendlyStackTransfer',
      source: 'A1',
      target: 'F6',
    });
  });

  it('detects home-field and six-stack victories', () => {
    const board = createEmptyBoard();
    const whiteCoords = [
      'A4', 'B4', 'C4', 'D4', 'E4', 'F4',
      'A5', 'B5', 'C5', 'D5', 'E5', 'F5',
      'A6', 'B6', 'C6', 'D6', 'E6', 'F6',
    ] as const;

    whiteCoords.forEach((coord) => {
      board[coord].checkers = [checker('white')];
    });

    const homeFieldState = gameStateWithBoard(board);

    expect(checkVictory(homeFieldState, withConfig())).toEqual({
      type: 'homeField',
      winner: 'white',
    });

    const stackBoard = createEmptyBoard();

    (['A6', 'B6', 'C6', 'D6', 'E6', 'F6'] as const).forEach((coord) => {
      stackBoard[coord].checkers = [checker('black'), checker('white'), checker('white')];
    });

    const stackState = gameStateWithBoard(stackBoard);

    expect(checkVictory(stackState, withConfig())).toEqual({
      type: 'sixStacks',
      winner: 'white',
    });
  });

  it('handles automatic passes and stalemate draws', () => {
    const activeBoard = boardWithPieces({
      A1: [checker('white'), checker('white')],
      F6: [checker('black')],
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

    const stalemateState = gameStateWithBoard(
      boardWithPieces({
        A1: [checker('white', true)],
        F6: [checker('black')],
      }),
    );
    const afterUnfreeze = applyAction(
      stalemateState,
      { type: 'manualUnfreeze', coord: 'A1' },
      withConfig(),
    );

    expect(afterUnfreeze.victory).toEqual({ type: 'stalemateDraw' });
  });

  it('marks threefold repetition draws from position counts', () => {
    const board = boardWithPieces({
      A1: [checker('white')],
      B2: [checker('black')],
      C3: [checker('white')],
      D4: [checker('black')],
    });
    const state = gameStateWithBoard(board);
    const repeatedHash = hashPosition({ board, currentPlayer: 'white' });
    const repeatedState: GameState = {
      ...state,
      positionCounts: {
        ...state.positionCounts,
        [repeatedHash]: 3,
      },
    };

    expect(checkVictory(repeatedState, withConfig())).toEqual({ type: 'threefoldDraw' });
  });

  it('treats equivalent boards with different checker ids as the same repetition position', () => {
    const boardA = boardWithPieces({
      A1: [checker('white', false, 'white-a')],
      B2: [checker('black', true, 'black-a')],
    });
    const boardB = boardWithPieces({
      A1: [checker('white', false, 'white-b')],
      B2: [checker('black', true, 'black-b')],
    });
    const hashA = hashPosition({ board: boardA, currentPlayer: 'white' });
    const hashB = hashPosition({ board: boardB, currentPlayer: 'white' });
    const stateB: GameState = {
      ...gameStateWithBoard(boardB),
      positionCounts: {
        [hashA]: 3,
      },
    };

    expect(hashA).toBe(hashB);
    expect(checkVictory(stateB, withConfig())).toEqual({ type: 'threefoldDraw' });
  });

  it('serializes and deserializes sessions', () => {
    const session = createSession(createInitialState());
    const serialized = serializeSession(session);
    const restored = deserializeSession(serialized);

    expect(restored.present.currentPlayer).toBe(session.present.currentPlayer);
    expect(() => deserializeSession('{"version":1,"present":{}}')).toThrow();
  });

  it('migrates legacy bilingual preferences and normalizes stale position counts on deserialize', () => {
    const state = createInitialState();
    const legacySerialized = JSON.stringify({
      version: 1,
      ruleConfig: withConfig(),
      preferences: {
        passDeviceOverlayEnabled: true,
        languageMode: 'bilingual',
      },
      present: {
        ...state,
        positionCounts: {
          staleHash: 9,
        },
      },
      past: [],
      future: [],
    });
    const restored = deserializeSession(legacySerialized);
    const currentHash = hashPosition(restored.present);

    expect(restored.preferences.language).toBe('russian');
    expect(restored.present.positionCounts).toEqual({
      [currentHash]: 1,
    });
  });

  it('computes score summaries and maintains invariants over random playouts', () => {
    let state = createInitialState();
    const config = withConfig();
    const score = getScoreSummary(state);

    expect(score.homeFieldSingles.white).toBe(0);
    expect(score.homeFieldSingles.black).toBe(0);

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
