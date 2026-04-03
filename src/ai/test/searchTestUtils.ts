import { expect } from 'vitest';

import { AI_DIFFICULTY_PRESETS, chooseComputerAction } from '@/ai';
import { applyAction, createInitialState, getLegalActions } from '@/domain';
import { createEmptyBoard } from '@/domain/model/board';
import { createCoord } from '@/domain/model/coordinates';
import type { Coord, GameState, TurnAction } from '@/domain/model/types';
import { validateGameState } from '@/domain/validators/stateValidators';
import { checker, gameStateWithBoard } from '@/test/factories';
import { withConfig } from '@/test/factories';

/** Serializes nullable actions into compact test assertions. */
export function actionKey(action: TurnAction | null): string {
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

/** Creates a deterministic clock that advances by a fixed amount per call. */
export function createTickingClock(step = 0.01): () => number {
  let tick = 0;

  return () => {
    const value = tick;
    tick += step;
    return value;
  };
}

/** Creates a clock that eventually jumps beyond the search deadline. */
export function createTimeoutClock(
  stableCalls: number,
  expiredValue: number,
): () => number {
  let calls = 0;

  return () => {
    calls += 1;
    return calls <= stableCalls ? 0 : expiredValue;
  };
}

/** Creates deterministic randomness for soak tests and balanced-move selection. */
export function createSeededRandom(seed = 1): () => number {
  let current = seed >>> 0;

  return () => {
    current = (current * 1_664_525 + 1_013_904_223) >>> 0;
    return current / 0x1_0000_0000;
  };
}

function fillBlackReserve(
  board: ReturnType<typeof createEmptyBoard>,
  excluded: Set<Coord>,
  frozenSingles = true,
): void {
  const reserveCoords: Coord[] = [
    'A1',
    'B1',
    'C1',
    'D1',
    'E1',
    'F1',
    'A2',
    'B2',
    'C2',
    'D2',
    'E2',
    'F2',
    'A3',
    'B3',
    'C3',
    'D3',
    'E3',
    'F3',
  ];
  const missingReserveSlots = reserveCoords.filter((coord) => excluded.has(coord)).length;
  const stackCoord =
    frozenSingles && missingReserveSlots > 0
      ? reserveCoords.find((coord) => !excluded.has(coord)) ?? null
      : null;
  let blackCount = 0;

  for (const coord of reserveCoords) {
    if (excluded.has(coord)) {
      continue;
    }

    board[coord].checkers.push(checker('black', coord === stackCoord ? false : frozenSingles));
    blackCount += 1;
  }

  while (blackCount < 18) {
    if (!stackCoord) {
      throw new Error('Black reserve could not place a valid overflow stack.');
    }

    board[stackCoord].checkers.push(checker('black'));
    blackCount += 1;
  }
}

/** Builds a position with a one-move home-field win for white. */
export function createHomeFieldWinState(): GameState {
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

/** Builds a position with a one-move six-stack win for white. */
export function createSixStackWinState(): GameState {
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

/** Builds a position where white must stop black from winning immediately. */
export function createOpponentThreatState(): GameState {
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

export type SoakStats = {
  /** Nodes evaluated per second averaged across all turns (wall-clock time). */
  avgNodesPerSecond: number;
  /** Minimum completedDepth observed across all turns. */
  minCompletedDepth: number;
  /** Number of turns actually completed (may be less than turnLimit on early exit). */
  turnsCompleted: number;
};

/** Runs a deterministic AI-vs-AI playout and asserts state validity throughout. */
export function runAiSoakPlayout(
  difficulty: keyof typeof AI_DIFFICULTY_PRESETS,
  turnLimit: number,
  stableCalls: number,
): SoakStats {
  const config = withConfig({ drawRule: 'none' });
  const random = createSeededRandom(turnLimit + stableCalls * 100);
  let state = createInitialState(config);

  let totalNodes = 0;
  let totalWallMs = 0;
  let minDepth = Number.MAX_SAFE_INTEGER;
  let turnsCompleted = 0;

  for (let turn = 0; turn < turnLimit; turn += 1) {
    const legalActions = getLegalActions(state, config);

    expect(legalActions.length).toBeGreaterThan(0);

    const startedAt = performance.now();
    const result = chooseComputerAction({
      difficulty,
      now: createTimeoutClock(stableCalls, 100_000),
      random,
      ruleConfig: config,
      state,
    });
    const wallTimeMs = performance.now() - startedAt;
    const wallTimeSlackMs = 250;

    expect(wallTimeMs).toBeLessThanOrEqual(
      AI_DIFFICULTY_PRESETS[difficulty].timeBudgetMs + wallTimeSlackMs,
    );
    expect(result.action).not.toBeNull();
    expect(legalActions.map(actionKey)).toContain(actionKey(result.action));

    totalNodes += result.evaluatedNodes;
    totalWallMs += wallTimeMs;
    if (result.completedDepth < minDepth) {
      minDepth = result.completedDepth;
    }
    turnsCompleted += 1;

    state = applyAction(state, result.action as TurnAction, config);

    const validation = validateGameState(state);

    expect(validation.valid).toBe(true);
    expect(state.pendingJump === null || state.pendingJump.jumpedCheckerIds.length > 0).toBe(true);

    if (state.status === 'gameOver') {
      state = createInitialState(config);
    }
  }

  return {
    avgNodesPerSecond: totalWallMs > 0 ? Math.round(totalNodes / totalWallMs * 1000) : 0,
    minCompletedDepth: minDepth === Number.MAX_SAFE_INTEGER ? 0 : minDepth,
    turnsCompleted,
  };
}
