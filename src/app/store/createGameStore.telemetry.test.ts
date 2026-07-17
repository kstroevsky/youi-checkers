import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGameStore } from '@/app/store/createGameStore';
import { AI_MOVE_REVEAL_MS } from '@/app/store/createGameStore/constants';
import {
  beginSeriesGameResolution,
  createSeriesState,
} from '@/app/store/createGameStore/series';
import {
  createAiResult,
  FakeAiWorker,
} from '@/app/store/createGameStore.testUtils';
import { createUndoFrame, getLegalActions } from '@/domain';
import type { MatchSettings } from '@/shared/types/session';
import type { TelemetrySink } from '@/shared/telemetry/contracts';
import {
  boardWithPieces,
  checker,
  createSession,
  gameStateWithBoard,
} from '@/test/factories';

function createTelemetrySink(): TelemetrySink {
  return {
    context: vi.fn(),
    incident: vi.fn(),
    increment: vi.fn(),
    measure: vi.fn(),
    flushCritical: vi.fn(),
    flushGameComplete: vi.fn(),
    setMatchContext: vi.fn(),
  };
}

describe('game store telemetry', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports AI lifecycle metrics through the injected sink', () => {
    const worker = new FakeAiWorker();
    const telemetry = createTelemetrySink();
    const store = createGameStore({
      createAiWorker: () => worker,
      storage: undefined,
      telemetry,
    });

    store.getState().startNewGame({
      aiDifficulty: 'easy',
      gameFormat: 'single',
      humanPlayer: 'black',
      opponentMode: 'computer',
      targetPoints: 100,
    });

    expect(telemetry.setMatchContext).toHaveBeenCalledWith('computer', 'easy');
    expect(telemetry.context).toHaveBeenCalledWith(
      'ai_started',
      expect.objectContaining({
        difficulty: 'easy',
        warm: false,
      }),
    );

    const action = getLegalActions(
      store.getState().gameState,
      store.getState().ruleConfig,
    )[0];
    expect(action).toBeDefined();
    if (!action) {
      return;
    }

    worker.reply(
      createAiResult({
        action,
        completedDepth: 1,
        elapsedMs: 140,
        evaluatedNodes: 321,
        fallbackKind: 'previousDepth',
        timedOut: true,
      }),
    );

    expect(telemetry.measure).toHaveBeenCalledWith('ai_elapsed_ms', 140);
    expect(telemetry.increment).toHaveBeenCalledWith('ai_evaluated_nodes', 321);
    expect(telemetry.increment).toHaveBeenCalledWith(
      'ai_search_budget_exhaustions',
    );
    expect(telemetry.context).toHaveBeenCalledWith(
      'ai_completed',
      expect.objectContaining({
        completedDepth: 1,
        searchMode: 'normal',
        timedOut: true,
      }),
    );
    expect(telemetry.incident).not.toHaveBeenCalledWith(
      'ai_slow',
      expect.anything(),
    );
  });

  it('reports committed moves without exposing coordinates', () => {
    const telemetry = createTelemetrySink();
    const store = createGameStore({
      storage: undefined,
      telemetry,
    });

    store.getState().selectCell('A1');
    store.getState().chooseActionType('climbOne');
    store.getState().selectCell('B2');

    expect(telemetry.increment).toHaveBeenCalledWith('moves_committed');
    expect(telemetry.context).toHaveBeenCalledWith(
      'move_committed',
      expect.objectContaining({
        actor: 'human',
        kind: 'climbOne',
        positionAfter: expect.stringMatching(/^[0-9a-f]{8}$/),
        positionBefore: expect.stringMatching(/^[0-9a-f]{8}$/),
      }),
    );
    expect(
      JSON.stringify(vi.mocked(telemetry.context).mock.calls),
    ).not.toContain('A1');
    expect(
      JSON.stringify(vi.mocked(telemetry.context).mock.calls),
    ).not.toContain('B2');
  });

  it('captures and immediately flushes a repeated finishing-position loop', async () => {
    vi.useFakeTimers();

    const matchSettings: MatchSettings = {
      aiDifficulty: 'easy',
      gameFormat: 'series',
      humanPlayer: 'white',
      opponentMode: 'computer',
      targetPoints: 100,
    };
    const state = gameStateWithBoard(
      boardWithPieces({
        A1: [checker('black'), checker('black'), checker('black')],
        C1: [checker('black'), checker('black'), checker('black')],
        E1: [checker('black'), checker('black'), checker('black')],
        F1: [checker('black'), checker('black'), checker('black')],
        A2: [checker('black')],
        D2: [checker('black')],
        E2: [checker('black')],
        F2: [checker('black')],
        B3: [checker('black')],
        E3: [checker('black')],
        A6: [checker('white'), checker('white'), checker('white')],
        B6: [checker('white'), checker('white'), checker('white')],
        C6: [checker('white'), checker('white'), checker('white')],
        D6: [checker('white'), checker('white'), checker('white')],
        E6: [checker('white'), checker('white'), checker('white')],
        F6: [checker('white'), checker('white'), checker('white')],
      }),
      { currentPlayer: 'black', moveNumber: 157 },
    );
    const seriesState = beginSeriesGameResolution(
      createSeriesState(matchSettings),
      { type: 'sixStacks', winner: 'white' },
      createUndoFrame(state),
    );
    const worker = new FakeAiWorker();
    const telemetry = createTelemetrySink();

    createGameStore({
      createAiWorker: () => worker,
      initialSession: createSession(state, { matchSettings, seriesState }),
      storage: undefined,
      telemetry,
    });
    await Promise.resolve();

    const loop = [
      { type: 'moveSingleToEmpty', source: 'A1', target: 'B1' },
      { type: 'moveSingleToEmpty', source: 'B1', target: 'A1' },
      { type: 'moveSingleToEmpty', source: 'A1', target: 'B1' },
    ] as const;

    for (const action of loop) {
      worker.reply(
        createAiResult({
          action,
          completedDepth: 0,
          elapsedMs: 130,
          fallbackKind: 'orderedRoot',
          timedOut: true,
        }),
      );
      vi.advanceTimersByTime(AI_MOVE_REVEAL_MS);
    }

    expect(telemetry.context).toHaveBeenCalledWith(
      'finishing_started',
      expect.objectContaining({ gameNumber: 1, player: 'black' }),
    );
    expect(telemetry.incident).toHaveBeenCalledWith(
      'finishing_loop_detected',
      expect.objectContaining({
        severity: 'error',
        tags: expect.objectContaining({
          actionKind: 'moveSingleToEmpty',
          boardSnapshot: expect.stringMatching(/^v1:/),
          finishingPlayer: 'black',
          noProgressStreak: 3,
          twoPlyUndoCount: 2,
        }),
      }),
    );
    expect(telemetry.flushCritical).toHaveBeenCalledTimes(1);
    expect(telemetry.increment).toHaveBeenCalledWith('finishing_moves');
    expect(telemetry.increment).toHaveBeenCalledWith(
      'ai_search_budget_exhaustions',
    );
    expect(
      vi
        .mocked(telemetry.incident)
        .mock.calls.filter(([kind]) => kind === 'ai_slow'),
    ).toHaveLength(1);
    expect(
      JSON.stringify(vi.mocked(telemetry.context).mock.calls),
    ).not.toContain('black-001');
  });

  it('records a healthy finishing lifecycle without a loop incident', () => {
    const matchSettings: MatchSettings = {
      aiDifficulty: 'easy',
      gameFormat: 'series',
      humanPlayer: 'white',
      opponentMode: 'hotSeat',
      targetPoints: 100,
    };
    const state = gameStateWithBoard(
      boardWithPieces({
        A1: [checker('black'), checker('black')],
        A2: [checker('black')],
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
      { currentPlayer: 'black' },
    );
    const seriesState = beginSeriesGameResolution(
      createSeriesState(matchSettings),
      { type: 'sixStacks', winner: 'white' },
      createUndoFrame(state),
    );
    const telemetry = createTelemetrySink();
    const store = createGameStore({
      initialSession: createSession(state, { matchSettings, seriesState }),
      storage: undefined,
      telemetry,
    });

    store.getState().selectCell('A2');
    store.getState().chooseActionType('climbOne');
    store.getState().selectCell('A1');

    expect(telemetry.increment).toHaveBeenCalledWith('finishing_started');
    expect(telemetry.increment).toHaveBeenCalledWith('finishing_completed');
    expect(telemetry.context).toHaveBeenCalledWith(
      'finishing_completed',
      expect.objectContaining({ pendingPoints: 1, player: 'black' }),
    );
    expect(telemetry.incident).not.toHaveBeenCalledWith(
      'finishing_loop_detected',
      expect.anything(),
    );
    expect(telemetry.flushGameComplete).toHaveBeenCalledTimes(1);
  });
});
