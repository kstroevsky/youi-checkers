import { describe, expect, it } from 'vitest';

import { AI_DIFFICULTY_PRESETS, chooseComputerAction, orderMoves } from '@/ai';
import { applyAction, createInitialState, getLegalActions, hashPosition } from '@/domain';
import { createEmptyBoard } from '@/domain/model/board';
import { createCoord } from '@/domain/model/coordinates';
import type { Coord, GameState, TurnAction } from '@/domain/model/types';
import { validateGameState } from '@/domain/validators/stateValidators';
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

function createTimeoutClock(stableCalls: number, expiredValue: number): () => number {
  let calls = 0;

  return () => {
    calls += 1;
    return calls <= stableCalls ? 0 : expiredValue;
  };
}

function createSeededRandom(seed = 1): () => number {
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
        balancedTopCount: 3,
        balancedThreshold: 0.08,
        repetitionPenalty: 120,
        selfUndoPenalty: 220,
        rootCandidateLimit: 4,
      },
      medium: {
        timeBudgetMs: 400,
        maxDepth: 4,
        quietMoveLimit: 16,
        balancedTopCount: 2,
        balancedThreshold: 0.03,
        repetitionPenalty: 180,
        selfUndoPenalty: 320,
        rootCandidateLimit: 5,
      },
      hard: {
        timeBudgetMs: 1200,
        maxDepth: 6,
        quietMoveLimit: 28,
        balancedTopCount: 2,
        balancedThreshold: 0.015,
        repetitionPenalty: 240,
        selfUndoPenalty: 420,
        rootCandidateLimit: 6,
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
    expect(homeFieldResult.completedRootMoves).toBe(1);
    expect(homeFieldResult.fallbackKind).toBe('none');
    expect(homeFieldResult.timedOut).toBe(false);
    expect(sixStackResult.action).toEqual({
      type: 'climbOne',
      source: 'A5',
      target: 'A6',
    });
    expect(sixStackResult.completedRootMoves).toBe(1);
    expect(sixStackResult.fallbackKind).toBe('none');
    expect(sixStackResult.timedOut).toBe(false);
    expect(homeFieldResult.principalVariation).toHaveLength(1);
    expect(homeFieldResult.rootCandidates).toHaveLength(1);
    expect(homeFieldResult.diagnostics.betaCutoffs).toBeGreaterThanOrEqual(0);
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

  it('searches every legal root move even when quiet-move trimming is active below the root', () => {
    const config = withConfig();
    const state = createInitialState(config);
    const legalActions = getLegalActions(state, config);
    const originalHardPreset = { ...AI_DIFFICULTY_PRESETS.hard };
    let result;

    AI_DIFFICULTY_PRESETS.hard.maxDepth = 1;
    AI_DIFFICULTY_PRESETS.hard.timeBudgetMs = 10_000;

    try {
      result = chooseComputerAction({
        difficulty: 'hard',
        now: createTickingClock(0.01),
        random: () => 0,
        ruleConfig: config,
        state,
      });
    } finally {
      Object.assign(AI_DIFFICULTY_PRESETS.hard, originalHardPreset);
    }

    expect(legalActions.length).toBeGreaterThan(AI_DIFFICULTY_PRESETS.hard.quietMoveLimit);
    expect(result.completedDepth).toBe(1);
    expect(result.completedRootMoves).toBe(legalActions.length);
    expect(result.fallbackKind).toBe('none');
    expect(result.timedOut).toBe(false);
  }, 15_000);

  it('marks and de-prioritizes self-undo moves that return to the grandparent position', () => {
    const config = withConfig();
    const state = createInitialState(config);
    const orderedBase = orderMoves(state, state.currentPlayer, config, AI_DIFFICULTY_PRESETS.hard, {
      includeAllQuietMoves: true,
    });
    const quietCandidate = orderedBase.find(
      (entry) =>
        !entry.isTactical &&
        entry.action.type !== 'jumpSequence' &&
        entry.action.type !== 'manualUnfreeze',
    );

    expect(quietCandidate).toBeDefined();
    if (!quietCandidate) {
      return;
    }

    const ordered = orderMoves(state, state.currentPlayer, config, AI_DIFFICULTY_PRESETS.hard, {
      grandparentPositionKey: hashPosition(quietCandidate.nextState),
      includeAllQuietMoves: true,
      selfUndoPenalty: 10_000,
    });
    const baseEntry = orderedBase.find(
      (entry) => actionKey(entry.action) === actionKey(quietCandidate.action),
    );
    const undoEntry = ordered.find((entry) => actionKey(entry.action) === actionKey(quietCandidate.action));

    expect(baseEntry).toBeDefined();
    expect(undoEntry).toBeDefined();
    if (!baseEntry || !undoEntry) {
      return;
    }

    expect(undoEntry.isSelfUndo).toBe(true);
    expect(undoEntry.score).toBeLessThan(baseEntry.score);
  });

  it('penalizes repeated quiet moves based on positionCounts', () => {
    const config = withConfig();
    const state = createInitialState(config);
    const orderedBase = orderMoves(state, state.currentPlayer, config, AI_DIFFICULTY_PRESETS.hard, {
      includeAllQuietMoves: true,
      repetitionPenalty: 0,
    });
    const quietCandidate = orderedBase.find(
      (entry) =>
        !entry.isTactical &&
        entry.action.type !== 'jumpSequence' &&
        entry.action.type !== 'manualUnfreeze',
    );

    expect(quietCandidate).toBeDefined();
    if (!quietCandidate) {
      return;
    }

    const repeatedKey = hashPosition(quietCandidate.nextState);
    const loopState: GameState = {
      ...state,
      positionCounts: {
        ...state.positionCounts,
        [repeatedKey]: 2,
      },
    };
    const orderedRepeated = orderMoves(
      loopState,
      loopState.currentPlayer,
      config,
      AI_DIFFICULTY_PRESETS.hard,
      {
        includeAllQuietMoves: true,
        repetitionPenalty: 6_000,
      },
    );
    const baseEntry = orderedBase.find(
      (entry) => actionKey(entry.action) === actionKey(quietCandidate.action),
    );
    const repeatedEntry = orderedRepeated.find(
      (entry) => actionKey(entry.action) === actionKey(quietCandidate.action),
    );

    expect(baseEntry).toBeDefined();
    expect(repeatedEntry).toBeDefined();
    if (!baseEntry || !repeatedEntry) {
      return;
    }

    expect(repeatedEntry.isRepetition).toBe(true);
    expect(repeatedEntry.score).toBeLessThan(baseEntry.score);
  });

  it('keeps best root move parity-stable across odd/even depths on tactical wins', () => {
    const state = createHomeFieldWinState();
    const originalHardPreset = { ...AI_DIFFICULTY_PRESETS.hard };
    let depthThree;
    let depthFour;

    AI_DIFFICULTY_PRESETS.hard.timeBudgetMs = 10_000;

    try {
      AI_DIFFICULTY_PRESETS.hard.maxDepth = 3;
      depthThree = chooseComputerAction({
        difficulty: 'hard',
        now: createTickingClock(0.001),
        random: () => 0,
        ruleConfig: withConfig(),
        state,
      });
      AI_DIFFICULTY_PRESETS.hard.maxDepth = 4;
      depthFour = chooseComputerAction({
        difficulty: 'hard',
        now: createTickingClock(0.001),
        random: () => 0,
        ruleConfig: withConfig(),
        state,
      });
    } finally {
      Object.assign(AI_DIFFICULTY_PRESETS.hard, originalHardPreset);
    }

    expect(actionKey(depthThree.action)).toBe(actionKey(depthFour.action));
    expect(depthThree.fallbackKind).toBe('none');
    expect(depthFour.fallbackKind).toBe('none');
  });

  it('falls back to partial current-depth search work instead of blind legal-order fallback on timeout', () => {
    const config = withConfig();
    const state = createOpponentThreatState();
    const legalActions = getLegalActions(state, config);
    const orderedRootMoves = orderMoves(
      state,
      state.currentPlayer,
      config,
      AI_DIFFICULTY_PRESETS.hard,
      {
        actions: legalActions,
        includeAllQuietMoves: true,
      },
    );
    const originalHardPreset = { ...AI_DIFFICULTY_PRESETS.hard };
    let result;

    AI_DIFFICULTY_PRESETS.hard.maxDepth = 2;
    AI_DIFFICULTY_PRESETS.hard.timeBudgetMs = 10_000;

    try {
      result = chooseComputerAction({
        difficulty: 'hard',
        now: createTimeoutClock(220, 20_000),
        random: () => 0,
        ruleConfig: config,
        state,
      });
    } finally {
      Object.assign(AI_DIFFICULTY_PRESETS.hard, originalHardPreset);
    }

    expect(actionKey(orderedRootMoves[0]?.action ?? null)).not.toBe(actionKey(legalActions[0] ?? null));
    expect(result.timedOut).toBe(true);
    expect(['partialCurrentDepth', 'legalOrder']).toContain(result.fallbackKind);
    if (result.fallbackKind === 'partialCurrentDepth') {
      expect(result.completedRootMoves).toBeGreaterThan(0);
      expect(actionKey(result.action)).not.toBe(actionKey(legalActions[0] ?? null));
    }
  });
});

function runAiSoakPlayout(
  difficulty: keyof typeof AI_DIFFICULTY_PRESETS,
  turnLimit: number,
  stableCalls: number,
): void {
  const config = withConfig({ drawRule: 'none' });
  const random = createSeededRandom(turnLimit + stableCalls * 100);
  let state = createInitialState(config);

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

    expect(wallTimeMs).toBeLessThanOrEqual(
      AI_DIFFICULTY_PRESETS[difficulty].timeBudgetMs + 250,
    );
    expect(result.action).not.toBeNull();
    expect(legalActions.map(actionKey)).toContain(actionKey(result.action));

    state = applyAction(state, result.action as TurnAction, config);

    const validation = validateGameState(state);

    expect(validation.valid).toBe(true);
    expect(state.pendingJump === null || state.pendingJump.visitedStateKeys.length > 0).toBe(true);

    if (state.status === 'gameOver') {
      state = createInitialState(config);
    }
  }
}

for (const difficulty of ['easy', 'medium', 'hard'] as const) {
  const stableCalls = difficulty === 'easy' ? 8 : difficulty === 'medium' ? 10 : 12;

  it(`survives a 200-turn AI-vs-AI soak on ${difficulty}`, () => {
    runAiSoakPlayout(difficulty, 200, stableCalls);
  }, 20_000);

  it(`survives a 500-turn AI-vs-AI soak on ${difficulty}`, () => {
    runAiSoakPlayout(difficulty, 500, stableCalls);
  }, 35_000);
}
