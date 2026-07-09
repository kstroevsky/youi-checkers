import { beforeEach, describe, expect, it } from 'vitest';

import { createGameStore } from '@/app/store/createGameStore';
import {
  beginSeriesGameResolution,
  countFinishingAction,
  createSeriesState,
} from '@/app/store/createGameStore/series';
import { createUndoFrame } from '@/domain';
import { DEFAULT_MATCH_SETTINGS } from '@/shared/constants/match';
import type {
  MatchSettings,
  SerializableSession,
  SeriesState,
} from '@/shared/types/session';
import {
  boardWithPieces,
  checker,
  createSession,
  gameStateWithBoard,
  resetFactoryIds,
} from '@/test/factories';

const SERIES_SETTINGS: MatchSettings = {
  ...DEFAULT_MATCH_SETTINGS,
  gameFormat: 'series',
  targetPoints: 100,
};

function createSeriesSession(
  state: ReturnType<typeof gameStateWithBoard>,
  seriesState: SeriesState,
  matchSettings: MatchSettings = SERIES_SETTINGS,
): SerializableSession {
  return {
    ...createSession(state, { matchSettings }),
    version: 5,
    seriesState,
  };
}

function createWhiteWinningState() {
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
    Record<
      (typeof homeCoords)[number] | 'A1' | 'A3',
      ReturnType<typeof checker>[]
    >
  >;
  pieces.A1 = [checker('black')];
  pieces.A3 = [checker('white')];
  return gameStateWithBoard(boardWithPieces(pieces));
}

beforeEach(() => {
  resetFactoryIds();
});

describe('createGameStore multi-game series', () => {
  it('starts an optional series with a configurable target', () => {
    const store = createGameStore({ storage: undefined });

    store.getState().startNewGame({
      ...SERIES_SETTINGS,
      targetPoints: 25,
    });

    expect(store.getState().seriesState).toMatchObject({
      gameNumber: 1,
      phase: 'playing',
      points: { first: 0, second: 0 },
      targetPoints: 25,
    });
  });

  it('reopens a normal win for loser-only actions and locks history', () => {
    const state = createWhiteWinningState();
    const store = createGameStore({
      initialSession: createSeriesSession(
        state,
        createSeriesState(SERIES_SETTINGS),
      ),
      storage: undefined,
    });

    store.getState().selectCell('A3');
    store.getState().chooseActionType('jumpSequence');
    store.getState().selectCell('C5');

    expect(store.getState().seriesState).toMatchObject({
      firstWinner: 'first',
      finishingParticipant: 'second',
      gameWins: { first: 1, second: 0 },
      pendingPoints: 0,
      phase: 'finishing',
    });
    expect(store.getState().gameState).toMatchObject({
      currentPlayer: 'black',
      status: 'active',
      victory: { type: 'none' },
    });

    store.getState().setRuleConfig({ scoringMode: 'off' });

    expect(store.getState().seriesState?.phase).toBe('finishing');
    expect(store.getState().gameState).toMatchObject({
      currentPlayer: 'black',
      status: 'active',
      victory: { type: 'none' },
    });

    store.getState().selectCell('A1');
    store.getState().chooseActionType('moveSingleToEmpty');
    store.getState().selectCell('B1');

    expect(store.getState().seriesState?.pendingPoints).toBe(1);
    const lockedCursor = store.getState().historyCursor;
    store.getState().undo();
    store.getState().goToHistoryCursor(0);
    expect(store.getState().historyCursor).toBe(lockedCursor);
  });

  it('awards every finishing action only when the loser completes the game', () => {
    const board = boardWithPieces({
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
    });
    const state = gameStateWithBoard(board, { currentPlayer: 'black' });
    const settings = { ...SERIES_SETTINGS, targetPoints: 2 };
    const firstWin = beginSeriesGameResolution(
      createSeriesState(settings),
      { type: 'sixStacks', winner: 'white' },
      createUndoFrame(state),
    );
    const store = createGameStore({
      initialSession: createSeriesSession(
        state,
        countFinishingAction(firstWin),
        settings,
      ),
      storage: undefined,
    });

    store.getState().selectCell('A2');
    store.getState().chooseActionType('climbOne');
    store.getState().selectCell('A1');

    expect(store.getState().seriesState).toMatchObject({
      pendingPoints: 2,
      phase: 'matchOver',
      points: { first: 2, second: 0 },
    });
  });

  it('can enable series after a draw and restore game 1 when disabled', () => {
    const state = gameStateWithBoard(boardWithPieces({}), {
      status: 'gameOver',
      victory: { type: 'threefoldDraw' },
    });
    const store = createGameStore({
      initialSession: createSession(state),
      storage: undefined,
    });

    store.getState().setGameFormat('series');

    expect(store.getState().setupMatchSettings.gameFormat).toBe('series');
    expect(store.getState().seriesState).toMatchObject({
      colors: { first: 'black', second: 'white' },
      phase: 'betweenGames',
      points: { first: 0, second: 0 },
    });

    store.getState().setGameFormat('single');

    expect(store.getState().setupMatchSettings.gameFormat).toBe('single');
    expect(store.getState().seriesState).toBeNull();
    expect(store.getState().gameState).toMatchObject({
      status: 'gameOver',
      victory: { type: 'threefoldDraw' },
    });
  });

  it('uses the previous winner color choice for game 2', () => {
    const state = gameStateWithBoard(boardWithPieces({}));
    const resolved = beginSeriesGameResolution(
      createSeriesState(SERIES_SETTINGS),
      {
        type: 'stalemateTiebreakWin',
        winner: 'white',
        ownFieldCheckers: { white: 10, black: 9 },
        completedHomeStacks: { white: 1, black: 0 },
        decidedBy: 'checkers',
      },
      createUndoFrame(state),
    );
    const store = createGameStore({
      initialSession: createSeriesSession(state, resolved),
      storage: undefined,
    });

    store.getState().chooseNextSeriesColor('black');
    store.getState().startNextSeriesGame();

    expect(store.getState().seriesState).toMatchObject({
      colors: { first: 'black', second: 'white' },
      gameNumber: 2,
      phase: 'playing',
    });
    expect(store.getState().gameState.currentPlayer).toBe('white');
  });
});
