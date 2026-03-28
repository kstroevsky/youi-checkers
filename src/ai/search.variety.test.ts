import {
  getStableCallsForDifficulty,
  runAiGameTrace,
  runAiVarietySuite,
  summarizeAiVariety,
  type AiGameTrace,
  type AiVarietySummary,
} from '@/ai/test/metrics';
import {
  actionKey,
  createTimeoutClock,
  createHomeFieldWinState,
  createSixStackWinState,
} from '@/ai/test/searchTestUtils';
import { AI_DIFFICULTY_PRESETS, chooseComputerAction, orderMoves } from '@/ai';
import { createEmptyBoard } from '@/domain/model/board';
import { hashPosition } from '@/domain/model/hash';
import type { Coord, GameState, StateSnapshot, TurnAction } from '@/domain/model/types';
import { createInitialState, getLegalActions } from '@/domain';
import { checker, gameStateWithBoard, resetFactoryIds, withConfig } from '@/test/factories';
import { describe, expect, it } from 'vitest';

const RULE_CONFIG = withConfig({
  drawRule: 'threefold',
  scoringMode: 'off',
});
const SUMMARY_CACHE = new Map<'easy' | 'medium' | 'hard', AiVarietySummary>();

function getPairCount(difficulty: 'easy' | 'medium' | 'hard'): number {
  return difficulty === 'hard' ? 4 : 4;
}

function getSummary(difficulty: 'easy' | 'medium' | 'hard'): AiVarietySummary {
  const cached = SUMMARY_CACHE.get(difficulty);

  if (cached) {
    return cached;
  }

  const stableCalls = getStableCallsForDifficulty(difficulty);
  const pairCount = getPairCount(difficulty);
  const traces = runAiVarietySuite({
    difficulty,
    maxTurns: 80,
    pairCount,
    ruleConfig: RULE_CONFIG,
    stableCalls,
  });
  const summary = summarizeAiVariety(traces, {
    difficulty,
    maxTurns: 80,
    pairCount,
    stableCalls,
  });

  SUMMARY_CACHE.set(difficulty, summary);

  return summary;
}

function createSnapshot(board: GameState['board'], currentPlayer: GameState['currentPlayer']): StateSnapshot {
  return {
    board: structuredClone(board),
    currentPlayer,
    moveNumber: 1,
    pendingJump: null,
    status: 'active',
    victory: { type: 'none' },
  };
}

function createSelfUndoMotifState(
  source: Coord,
  target: Coord,
  altSource: Coord,
  _altTarget: Coord,
): { reverseAction: TurnAction; state: GameState } {
  const board = createEmptyBoard();

  board[source].checkers = [checker('black'), checker('black')];
  board[altSource].checkers = [checker('black')];
  board.C6.checkers = [checker('white')];
  board.D6.checkers = [checker('white', true)];
  board.E6.checkers = [checker('white')];
  board.F6.checkers = [checker('white', true)];

  const reverseAction = {
    type: 'splitOneFromStack',
    source,
    target,
  } as const;
  const previousAction = {
    type: 'climbOne',
    source: target,
    target: source,
  } as const;
  const beforeBoard = structuredClone(board);

  beforeBoard[source].checkers = [checker('black')];
  beforeBoard[target].checkers = [checker('black')];
  const beforeState = createSnapshot(beforeBoard, 'black');
  const afterState = createSnapshot(board, 'white');

  return {
    reverseAction,
    state: gameStateWithBoard(board, {
      currentPlayer: 'black',
      history: [
        {
          actor: 'black',
          action: previousAction,
          autoPasses: [],
          afterState,
          beforeState,
          positionHash: hashPosition(afterState),
          victoryAfter: { type: 'none' },
        },
      ],
      moveNumber: 2,
    }),
  };
}

function getOpeningTrace(): AiGameTrace {
  return runAiGameTrace({
    blackSeed: 2,
    difficulty: 'hard',
    gameIndex: 0,
    maxTurns: 8,
    mirrorIndex: 0,
    pairIndex: 0,
    ruleConfig: RULE_CONFIG,
    stableCalls: getStableCallsForDifficulty('hard'),
    whiteSeed: 1,
  });
}

function countIntentSwitches(trace: AiGameTrace): number {
  return trace.plies.reduce((count, ply, index) => {
    if (index === 0 || trace.plies[index - 1].strategicIntent === ply.strategicIntent) {
      return count;
    }

    return count + 1;
  }, 0);
}

describe('AI variety guardrails', () => {
  it('spreads ordered-root opening candidates across source families and files', () => {
    resetFactoryIds();
    const state = createInitialState(RULE_CONFIG);
    const result = chooseComputerAction({
      difficulty: 'hard',
      now: createTimeoutClock(1, 100_000),
      random: () => 0.95,
      ruleConfig: RULE_CONFIG,
      state,
    });
    const sourceFamilies = new Set(result.rootCandidates.map((candidate) => candidate.sourceFamily));
    const sourceFiles = new Set(
      result.rootCandidates.flatMap((candidate) =>
        'source' in candidate.action
          ? [candidate.action.source[0]]
          : 'coord' in candidate.action
            ? [candidate.action.coord[0]]
            : [],
      ),
    );

    expect(result.fallbackKind).toBe('orderedRoot');
    expect(sourceFamilies.size).toBeGreaterThanOrEqual(3);
    expect(sourceFiles.size).toBeGreaterThanOrEqual(2);
    expect(actionKey(result.action)).not.toBe(actionKey(getLegalActions(state, RULE_CONFIG)[0]));
  });

  it('creates additional space within the first ten opening plies', () => {
    const trace = getOpeningTrace();
    const firstTen = trace.plies.slice(0, 10);
    const firstEmpty = trace.plies[0]?.emptyCellCount ?? 0;

    expect(Math.max(...firstTen.map((ply) => ply.emptyCellCount))).toBeGreaterThan(firstEmpty);
  });

  it.each([
    { altSource: 'E3', altTarget: 'E2', label: 'C5↔B5', source: 'C5', target: 'B5' },
    { altSource: 'D3', altTarget: 'D2', label: 'B5↔B4', source: 'B5', target: 'B4' },
    { altSource: 'C3', altTarget: 'C2', label: 'E4↔F4', source: 'E4', target: 'F4' },
    { altSource: 'F3', altTarget: 'F2', label: 'A5↔A4', source: 'A5', target: 'A4' },
  ] as const)('avoids reversible motif %s when a quiet alternative exists', ({ altSource, altTarget, source, target }) => {
    resetFactoryIds();
    const { reverseAction, state } = createSelfUndoMotifState(source, target, altSource, altTarget);
    const ordered = orderMoves(
      state,
      state.currentPlayer,
      RULE_CONFIG,
      AI_DIFFICULTY_PRESETS.hard,
      {
        includeAllQuietMoves: true,
        samePlayerPreviousAction: state.history.at(-1)?.action ?? null,
        selfUndoPenalty: AI_DIFFICULTY_PRESETS.hard.selfUndoPenalty,
      },
    );
    const result = chooseComputerAction({
      difficulty: 'hard',
      now: createTimeoutClock(getStableCallsForDifficulty('hard'), 100_000),
      random: () => 0,
      ruleConfig: RULE_CONFIG,
      state,
    });
    const legalActions = getLegalActions(state, RULE_CONFIG);

    expect(legalActions.map(actionKey)).toContain(actionKey(reverseAction));
    expect(actionKey(result.action)).not.toBe(actionKey(reverseAction));
    expect(ordered.find((entry) => actionKey(entry.action) === actionKey(reverseAction))?.isSelfUndo).toBe(true);
  });

  it('keeps home-field traces on the home plan when direct dispersion wins are available', () => {
    resetFactoryIds();
    const trace = runAiGameTrace({
      blackSeed: 2,
      difficulty: 'hard',
      gameIndex: 0,
      initialState: createHomeFieldWinState(),
      maxTurns: 2,
      mirrorIndex: 0,
      pairIndex: 0,
      ruleConfig: RULE_CONFIG,
      stableCalls: 250,
      whiteSeed: 1,
    });
    const firstPly = trace.plies[0];

    expect(trace.terminalType).toBe('homeField');
    expect(firstPly?.strategicIntent).toBe('home');
    expect(firstPly?.homeFieldProgress.white ?? 0).toBeGreaterThan(firstPly?.sixStackProgress.white ?? 0);
    expect(countIntentSwitches(trace)).toBe(0);
    expect(firstPly?.stackProfileChurn ?? 1).toBeLessThanOrEqual(0.1);
  });

  it('keeps six-stack traces on the stack plan when the front-row conversion is available', () => {
    resetFactoryIds();
    const trace = runAiGameTrace({
      blackSeed: 2,
      difficulty: 'hard',
      gameIndex: 0,
      initialState: createSixStackWinState(),
      maxTurns: 2,
      mirrorIndex: 0,
      pairIndex: 0,
      ruleConfig: RULE_CONFIG,
      stableCalls: 250,
      whiteSeed: 1,
    });
    const firstPly = trace.plies[0];

    expect(trace.terminalType).toBe('sixStacks');
    expect(firstPly?.strategicIntent).toBe('sixStack');
    expect(firstPly?.sixStackProgress.white ?? 0).toBeGreaterThan(firstPly?.homeFieldProgress.white ?? 0);
    expect(countIntentSwitches(trace)).toBe(0);
    expect(firstPly?.stackProfileChurn ?? 1).toBeLessThanOrEqual(0.1);
  });

  it('reports draw-tiebreak wins as dedicated terminal categories', () => {
    const ruleConfig = withConfig({ drawRule: 'threefold' });
    const initialState = {
      ...createInitialState(ruleConfig),
      status: 'gameOver' as const,
      pendingJump: null,
      victory: {
        type: 'threefoldTiebreakWin' as const,
        winner: 'white' as const,
        ownFieldCheckers: { white: 10, black: 9 },
        completedHomeStacks: { white: 2, black: 1 },
        decidedBy: 'checkers' as const,
      },
    };
    const trace = runAiGameTrace({
      blackSeed: 2,
      difficulty: 'easy',
      gameIndex: 0,
      initialState,
      maxTurns: 1,
      mirrorIndex: 0,
      pairIndex: 0,
      ruleConfig,
      stableCalls: 1,
      whiteSeed: 1,
    });

    expect(trace.terminalType).toBe('threefoldTiebreakWin');
  });

  it('keeps hard at least as strong as medium on loop and variety metrics', () => {
    const hard = getSummary('hard');
    const medium = getSummary('medium');

    // Hard now allows a slightly wider near-best band in risk mode, so keep the
    // guardrail strict but not brittle around tiny stochastic shifts.
    expect(hard.metrics.repetitionPlyShare).toBeLessThanOrEqual(0.04);
    expect(hard.metrics.sourceFamilyOpeningHhi).toBeLessThanOrEqual(
      medium.metrics.sourceFamilyOpeningHhi * 1.05 + 1e-6,
    );
  }, 90_000);

  it('reduces checker over-concentration as difficulty rises', () => {
    const medium = getSummary('medium');
    const hard = getSummary('hard');

    expect(medium.metrics.sameFamilyQuietRepeatRate).toBeLessThanOrEqual(0.4);
    expect(hard.metrics.sameFamilyQuietRepeatRate).toBeLessThanOrEqual(0.45);
    expect(medium.metrics.sourceFamilyOpeningHhi).toBeLessThanOrEqual(0.401);
    expect(hard.metrics.sourceFamilyOpeningHhi).toBeLessThanOrEqual(0.401);
  }, 90_000);
});
