import { describe, expect, it } from 'vitest';

import { AI_DIFFICULTY_PRESETS, chooseComputerAction } from '@/ai';
import { applyAction, createInitialState, getLegalActions } from '@/domain';
import { createEmptyBoard } from '@/domain/model/board';
import { createCoord } from '@/domain/model/coordinates';
import type { Coord, GameState, TurnAction } from '@/domain/model/types';
import { checker, gameStateWithBoard, resetFactoryIds, withConfig } from '@/test/factories';

function actionKey(action: TurnAction | null): string {
  if (!action) {
    return 'none';
  }

  switch (action.type) {
    case 'manualUnfreeze':
      return `${action.type}:${action.coord}`;
    case 'jumpSequence':
      return `${action.type}:${action.source}:${action.path.join('>')}`;
    default:
      return `${action.type}:${action.source}:${action.target}`;
  }
}

function createTickingClock(step = 0.01): () => number {
  let tick = 0;

  return () => {
    const value = tick;
    tick += step;
    return value;
  };
}

function fillBlackReserve(
  board: ReturnType<typeof createEmptyBoard>,
  excluded: Set<Coord>,
  frozenSingles = true,
): void {
  const reserveCoords: Coord[] = [
    'A1', 'B1', 'C1', 'D1', 'E1', 'F1',
    'A2', 'B2', 'C2', 'D2', 'E2', 'F2',
    'A3', 'B3', 'C3', 'D3', 'E3', 'F3',
  ];
  let blackCount = 0;

  for (const coord of reserveCoords) {
    if (excluded.has(coord)) {
      continue;
    }

    board[coord].checkers.push(checker('black', frozenSingles));
    blackCount += 1;
  }

  while (blackCount < 18) {
    board.A1.checkers.push(checker('black'));
    blackCount += 1;
  }
}

function createHomeFieldWinState(): GameState {
  const board = createEmptyBoard();
  const excluded = new Set<Coord>(['C3']);

  for (const row of [4, 5, 6] as const) {
    for (const column of ['A', 'B', 'C', 'D', 'E', 'F'] as const) {
      const coord = createCoord(column, row);

      if (coord === 'C4') {
        continue;
      }

      board[coord].checkers = [checker('white')];
      excluded.add(coord);
    }
  }

  board.C3.checkers = [checker('white')];
  fillBlackReserve(board, excluded);

  return gameStateWithBoard(board);
}

function createSixStackWinState(): GameState {
  const board = createEmptyBoard();
  const excluded = new Set<Coord>(['A5', 'A6']);

  (['B6', 'C6', 'D6', 'E6', 'F6'] as const).forEach((coord) => {
    board[coord].checkers = [checker('white'), checker('white'), checker('white')];
    excluded.add(coord);
  });
  board.A6.checkers = [checker('white'), checker('white')];
  board.A5.checkers = [checker('white')];
  fillBlackReserve(board, excluded);

  return gameStateWithBoard(board);
}

function createOpponentThreatState(): GameState {
  const board = createEmptyBoard();

  (['B1', 'C1', 'D1', 'E1', 'F1'] as const).forEach((coord) => {
    board[coord].checkers = [checker('black'), checker('black'), checker('black')];
  });
  board.A1.checkers = [checker('black'), checker('black')];
  board.A2.checkers = [checker('black')];
  board.B2.checkers = [checker('white')];

  let whiteCount = 1;

  for (const row of [4, 5, 6] as const) {
    for (const column of ['A', 'B', 'C', 'D', 'E', 'F'] as const) {
      const coord = createCoord(column, row);

      if (coord === 'B4') {
        continue;
      }

      board[coord].checkers = [checker('white', true)];
      whiteCount += 1;

      if (whiteCount === 18) {
        break;
      }
    }

    if (whiteCount === 18) {
      break;
    }
  }

  return gameStateWithBoard(board);
}

describe('computer opponent search', () => {
  it('exposes the shipped difficulty presets', () => {
    expect(AI_DIFFICULTY_PRESETS).toEqual({
      easy: {
        timeBudgetMs: 120,
        maxDepth: 2,
        quietMoveLimit: 8,
        pickTopCount: 3,
        randomThreshold: 0.08,
      },
      medium: {
        timeBudgetMs: 400,
        maxDepth: 4,
        quietMoveLimit: 16,
        pickTopCount: 2,
        randomThreshold: 0.03,
      },
      hard: {
        timeBudgetMs: 1200,
        maxDepth: 6,
        quietMoveLimit: 28,
        pickTopCount: 1,
        randomThreshold: 0,
      },
    });
  });

  it('always returns a legal move on sampled runtime states', () => {
    resetFactoryIds();
    const states = [
      createHomeFieldWinState(),
      createSixStackWinState(),
      createOpponentThreatState(),
    ];

    for (const state of states) {
      const result = chooseComputerAction({
        difficulty: 'easy',
        now: createTickingClock(),
        random: () => 0,
        ruleConfig: withConfig(),
        state,
      });
      const legalActions = getLegalActions(state, withConfig());

      expect(result.action).not.toBeNull();
      expect(legalActions.map(actionKey)).toContain(actionKey(result.action));
    }
  });

  it('finds immediate home-field and six-stack wins', () => {
    resetFactoryIds();
    const homeFieldResult = chooseComputerAction({
      difficulty: 'easy',
      now: createTickingClock(0.001),
      random: () => 0,
      ruleConfig: withConfig(),
      state: createHomeFieldWinState(),
    });
    const sixStackResult = chooseComputerAction({
      difficulty: 'easy',
      now: createTickingClock(0.001),
      random: () => 0,
      ruleConfig: withConfig(),
      state: createSixStackWinState(),
    });

    expect(homeFieldResult.action).toEqual({
      type: 'moveSingleToEmpty',
      source: 'C3',
      target: 'C4',
    });
    expect(sixStackResult.action).toEqual({
      type: 'climbOne',
      source: 'A5',
      target: 'A6',
    });
  });

  it('blocks the opponent from winning on the next move', () => {
    resetFactoryIds();
    const state = createOpponentThreatState();
    const result = chooseComputerAction({
      difficulty: 'easy',
      now: createTickingClock(),
      random: () => 0,
      ruleConfig: withConfig(),
      state,
    });

    expect(result.action).not.toBeNull();

    const nextState = applyAction(state, result.action as TurnAction, withConfig());
    const opponentWinsImmediately = getLegalActions(nextState, withConfig()).some((action) => {
      const replyState = applyAction(nextState, action, withConfig());

      return (
        replyState.status === 'gameOver' &&
        replyState.victory.type === 'sixStacks' &&
        replyState.victory.winner === 'black'
      );
    });

    expect(opponentWinsImmediately).toBe(false);
  });
});
