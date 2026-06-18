import { describe, expect, it } from 'vitest';

import {
  beginSeriesGameResolution,
  chooseNextSeriesColor,
  completeFinishingPhase,
  countFinishingAction,
  createSeriesState,
  participantForColor,
  startNextSeriesGame,
} from '@/app/store/createGameStore/series';
import { createInitialState, createUndoFrame } from '@/domain';
import { DEFAULT_MATCH_SETTINGS } from '@/shared/constants/match';

describe('multi-game series state', () => {
  it('keeps scores attached to stable participants when colors change', () => {
    const initial = createSeriesState({
      ...DEFAULT_MATCH_SETTINGS,
      gameFormat: 'series',
      targetPoints: 100,
    });

    expect(participantForColor(initial, 'white')).toBe('first');
    expect(participantForColor(initial, 'black')).toBe('second');

    const resolved = beginSeriesGameResolution(
      initial,
      { type: 'homeField', winner: 'white' },
      createUndoFrame(createInitialState()),
    );
    const counted = countFinishingAction(countFinishingAction(resolved));
    const completed = completeFinishingPhase(counted, {
      type: 'sixStacks',
      winner: 'black',
    });
    const recolored = chooseNextSeriesColor(completed, 'first', 'black');

    expect(recolored.gameWins).toEqual({ first: 1, second: 0 });
    expect(recolored.points).toEqual({ first: 2, second: 0 });
    expect(recolored.colors).toEqual({ first: 'black', second: 'white' });
  });

  it('ends a draw without points and swaps colors automatically', () => {
    const initial = createSeriesState({
      ...DEFAULT_MATCH_SETTINGS,
      gameFormat: 'series',
      targetPoints: 100,
    });
    const resolved = beginSeriesGameResolution(
      initial,
      { type: 'threefoldDraw' },
      createUndoFrame(createInitialState()),
    );

    expect(resolved.phase).toBe('betweenGames');
    expect(resolved.gameWins).toEqual({ first: 0, second: 0 });
    expect(resolved.points).toEqual({ first: 0, second: 0 });
    expect(resolved.colors).toEqual({ first: 'black', second: 'white' });
    expect(resolved.colorChooser).toBeNull();
  });

  it('finishes the match only after the loser completes the game', () => {
    const initial = createSeriesState({
      ...DEFAULT_MATCH_SETTINGS,
      gameFormat: 'series',
      targetPoints: 2,
    });
    const resolved = beginSeriesGameResolution(
      initial,
      { type: 'sixStacks', winner: 'white' },
      createUndoFrame(createInitialState()),
    );
    const counted = countFinishingAction(countFinishingAction(resolved));

    expect(counted.phase).toBe('finishing');
    expect(counted.points).toEqual({ first: 0, second: 0 });

    const completed = completeFinishingPhase(counted, {
      type: 'homeField',
      winner: 'black',
    });

    expect(completed.phase).toBe('matchOver');
    expect(completed.points).toEqual({ first: 2, second: 0 });
    expect(completed.lastGame).toMatchObject({
      outcome: 'win',
      pointsAwarded: 2,
      winner: 'first',
    });
  });

  it('starts the next game only after color choice is resolved', () => {
    const initial = createSeriesState({
      ...DEFAULT_MATCH_SETTINGS,
      gameFormat: 'series',
      targetPoints: 100,
    });
    const resolved = beginSeriesGameResolution(
      initial,
      {
        type: 'stalemateTiebreakWin',
        winner: 'white',
        ownFieldCheckers: { white: 10, black: 9 },
        completedHomeStacks: { white: 1, black: 0 },
        decidedBy: 'checkers',
      },
      createUndoFrame(createInitialState()),
    );

    expect(() => startNextSeriesGame(resolved)).toThrow(
      'Choose the next color first.',
    );

    const recolored = chooseNextSeriesColor(resolved, 'first', 'white');
    const next = startNextSeriesGame(recolored);

    expect(next.gameNumber).toBe(2);
    expect(next.phase).toBe('playing');
    expect(next.firstWinner).toBeNull();
    expect(next.finishingParticipant).toBeNull();
    expect(next.pendingPoints).toBe(0);
  });
});
