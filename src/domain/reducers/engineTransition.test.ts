import { describe, expect, it } from 'vitest';

import { runEngineCommand, runGameCommand } from '@/domain';
import {
  boardWithPieces,
  checker,
  gameStateWithBoard,
  withConfig,
} from '@/test/factories';

describe('engine transition pipeline', () => {
  it('emits jump-continuation events for follow-up jump windows', () => {
    const state = gameStateWithBoard(
      boardWithPieces({
        A1: [checker('white')],
        B2: [checker('black')],
        D4: [checker('black')],
        F6: [checker('black')],
      }),
    );
    const result = runEngineCommand(
      state,
      {
        type: 'submitAction',
        action: {
          type: 'jumpSequence',
          source: 'A1',
          path: ['C3'],
        },
      },
      withConfig(),
    );

    expect(result.state.currentPlayer).toBe('white');
    expect(result.events).toContainEqual({
      type: 'jumpContinuationOpened',
      player: 'white',
      source: 'C3',
      targets: ['E5'],
    });
    expect(result.events).toContainEqual({
      type: 'turnRetained',
      player: 'white',
      reason: 'jumpContinuation',
    });
  });

  it('can skip event materialization for engine-only callers without changing the resulting state', () => {
    const state = gameStateWithBoard(
      boardWithPieces({
        A1: [checker('white')],
        B2: [checker('white')],
        D4: [checker('black')],
      }),
    );
    const withEvents = runEngineCommand(
      state,
      {
        type: 'submitAction',
        action: {
          type: 'jumpSequence',
          source: 'A1',
          path: ['C3'],
        },
      },
      withConfig(),
    );
    const withoutEvents = runEngineCommand(
      state,
      {
        type: 'submitAction',
        action: {
          type: 'jumpSequence',
          source: 'A1',
          path: ['C3'],
        },
      },
      withConfig(),
      { emitEvents: false },
    );

    expect(withoutEvents.events).toEqual([]);
    expect(withoutEvents.state).toEqual(withEvents.state);
    expect(withoutEvents.positionHash).toBe(withEvents.positionHash);
  });

  it('emits game-over events for winning moves', () => {
    const homeCoords = [
      'A4',
      'B4',
      'C4',
      'D4',
      'E4',
      'F4',
      'A5',
      'B5',
      'D5',
      'E5',
      'F5',
      'A6',
      'B6',
      'C6',
      'D6',
      'E6',
      'F6',
    ] as const;
    const pieces = Object.fromEntries(
      homeCoords.map((coord) => [coord, [checker('white')]]),
    ) as Partial<
      Record<(typeof homeCoords)[number] | 'A3', ReturnType<typeof checker>[]>
    >;
    pieces.A3 = [checker('white')];
    const state = gameStateWithBoard(boardWithPieces(pieces));
    const result = runGameCommand(
      state,
      {
        type: 'submitAction',
        action: {
          type: 'jumpSequence',
          source: 'A3',
          path: ['C5'],
        },
      },
      withConfig(),
    );

    expect(result.state.status).toBe('gameOver');
    expect(result.events).toContainEqual({
      type: 'gameOver',
      victory: {
        type: 'homeField',
        winner: 'white',
      },
    });
    expect(result.state.history).toHaveLength(1);
  });

  it('retains the finishing player and ignores the established winner', () => {
    const state = gameStateWithBoard(
      boardWithPieces({
        A1: [checker('black')],
        A6: [checker('white'), checker('white'), checker('white')],
        B6: [checker('white'), checker('white'), checker('white')],
        C6: [checker('white'), checker('white'), checker('white')],
        D6: [checker('white'), checker('white'), checker('white')],
        E6: [checker('white'), checker('white'), checker('white')],
        F6: [checker('white'), checker('white'), checker('white')],
      }),
      {
        currentPlayer: 'black',
      },
    );
    const result = runGameCommand(
      state,
      {
        type: 'submitAction',
        action: {
          type: 'moveSingleToEmpty',
          source: 'A1',
          target: 'B1',
        },
      },
      withConfig(),
      {
        drawResolution: 'disabled',
        turnMode: 'samePlayer',
        victoryPlayer: 'black',
      },
    );

    expect(result.state.status).toBe('active');
    expect(result.state.currentPlayer).toBe('black');
    expect(result.state.victory).toEqual({ type: 'none' });
    expect(result.state.history).toHaveLength(1);
  });

  it('ends finishing play when the finishing player reaches a normal victory', () => {
    const state = gameStateWithBoard(
      boardWithPieces({
        A2: [checker('black')],
        A1: [checker('black'), checker('black')],
        B1: [checker('black'), checker('black'), checker('black')],
        C1: [checker('black'), checker('black'), checker('black')],
        D1: [checker('black'), checker('black'), checker('black')],
        E1: [checker('black'), checker('black'), checker('black')],
        F1: [checker('black'), checker('black'), checker('black')],
        A6: [checker('white'), checker('white'), checker('white')],
        B6: [checker('white'), checker('white'), checker('white')],
        C6: [checker('white'), checker('white'), checker('white')],
        D6: [checker('white'), checker('white'), checker('white')],
        E6: [checker('white'), checker('white'), checker('white')],
        F6: [checker('white'), checker('white'), checker('white')],
      }),
      {
        currentPlayer: 'black',
      },
    );
    const result = runGameCommand(
      state,
      {
        type: 'submitAction',
        action: {
          type: 'climbOne',
          source: 'A2',
          target: 'A1',
        },
      },
      withConfig(),
      {
        drawResolution: 'disabled',
        turnMode: 'samePlayer',
        victoryPlayer: 'black',
      },
    );

    expect(result.state.status).toBe('gameOver');
    expect(result.state.victory).toEqual({
      type: 'sixStacks',
      winner: 'black',
    });
  });
});
