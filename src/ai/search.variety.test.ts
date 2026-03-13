import baselines from '@/ai/test/fixtures/ai-variety-baselines.json';
import targetBands from '@/ai/test/fixtures/ai-variety-target-bands.json';
import {
  compareSummaryToBaseline,
  getStableCallsForDifficulty,
  runAiGameTrace,
  runAiVarietySuite,
  summarizeAiVariety,
  type AiGameTrace,
  type AiVarietySummary,
  type AiVarietyTargetBands,
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
import { getLegalActions } from '@/domain';
import { checker, gameStateWithBoard, resetFactoryIds, withConfig } from '@/test/factories';
import { describe, expect, it } from 'vitest';

type BaselineFile = {
  difficulties: Record<'easy' | 'medium' | 'hard', AiVarietySummary>;
  version: number;
};

const BASELINES = baselines as BaselineFile;
const TARGET_BANDS = targetBands as AiVarietyTargetBands;
const RULE_CONFIG = withConfig({
  drawRule: 'threefold',
  scoringMode: 'off',
});
const SUMMARY_CACHE = new Map<'easy' | 'medium' | 'hard', AiVarietySummary>();

function getPairCount(difficulty: 'easy' | 'medium' | 'hard'): number {
  return difficulty === 'hard' ? 8 : 4;
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
    baselineSummary: BASELINES.difficulties[difficulty],
    difficulty,
    maxTurns: 80,
    pairCount,
    stableCalls,
    targetBands: TARGET_BANDS,
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
  altTarget: Coord,
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
  it.each(['easy', 'medium', 'hard'] as const)(
    'matches the checked-in variety baseline for %s',
    (difficulty) => {
      expect(compareSummaryToBaseline(getSummary(difficulty), BASELINES.difficulties[difficulty])).toEqual([]);
    },
    40_000,
  );

  it('creates space and reaches a mobility peak in the opening trace', () => {
    const trace = getOpeningTrace();
    const firstFour = trace.plies.slice(0, 4);

    expect(firstFour.at(-1)?.emptyCellCount ?? 0).toBeGreaterThan(trace.plies[0]?.emptyCellCount ?? 0);
    expect(Math.max(...firstFour.map((ply) => ply.afterLegalMoveCount))).toBeGreaterThanOrEqual(
      firstFour[0]?.beforeLegalMoveCount ?? 0,
    );
    expect(getSummary('hard').metrics.decompressionSlope).toBeGreaterThan(0);
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

  it('keeps hard at least as strong as medium on loop and variety metrics', () => {
    const hard = getSummary('hard');
    const medium = getSummary('medium');

    expect(hard.metrics.twoPlyUndoRate).toBeLessThanOrEqual(medium.metrics.twoPlyUndoRate * 1.05 + 1e-6);
    expect(hard.metrics.repetitionPlyShare).toBeLessThanOrEqual(medium.metrics.repetitionPlyShare * 1.05 + 1e-6);
    expect(hard.metrics.openingEntropy).toBeGreaterThanOrEqual(medium.metrics.openingEntropy * 0.95 - 1e-6);
    expect(Object.keys(hard.samples.firstTenLineDistribution).length).toBeGreaterThanOrEqual(
      Object.keys(medium.samples.firstTenLineDistribution).length,
    );
  });

  it('keeps medium at least as strong as easy on loop metrics', () => {
    const easy = getSummary('easy');
    const medium = getSummary('medium');

    expect(medium.metrics.twoPlyUndoRate).toBeLessThanOrEqual(easy.metrics.twoPlyUndoRate * 1.05 + 1e-6);
    expect(medium.metrics.repetitionPlyShare).toBeLessThanOrEqual(easy.metrics.repetitionPlyShare * 1.05 + 1e-6);
    expect(medium.metrics.maxRepeatedStateRun).toBeLessThanOrEqual(easy.metrics.maxRepeatedStateRun * 1.05 + 1e-6);
  });
});
