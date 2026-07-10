import { describe, expect, it, vi } from 'vitest';

import { createGameStore } from '@/app/store/createGameStore';
import {
  createAiResult,
  FakeAiWorker,
} from '@/app/store/createGameStore.testUtils';
import { getLegalActions } from '@/domain';
import type { TelemetrySink } from '@/shared/telemetry/contracts';

function createTelemetrySink(): TelemetrySink {
  return {
    context: vi.fn(),
    incident: vi.fn(),
    increment: vi.fn(),
    measure: vi.fn(),
    flushGameComplete: vi.fn(),
    setMatchContext: vi.fn(),
  };
}

describe('game store telemetry', () => {
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
        completedDepth: 2,
        elapsedMs: 140,
        evaluatedNodes: 321,
      }),
    );

    expect(telemetry.measure).toHaveBeenCalledWith('ai_elapsed_ms', 140);
    expect(telemetry.increment).toHaveBeenCalledWith('ai_evaluated_nodes', 321);
    expect(telemetry.context).toHaveBeenCalledWith(
      'ai_completed',
      expect.objectContaining({
        completedDepth: 2,
        timedOut: false,
      }),
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
    expect(telemetry.context).toHaveBeenCalledWith('move_committed', {
      actor: 'human',
      kind: 'climbOne',
    });
    expect(
      JSON.stringify(vi.mocked(telemetry.context).mock.calls),
    ).not.toContain('A1');
    expect(
      JSON.stringify(vi.mocked(telemetry.context).mock.calls),
    ).not.toContain('B2');
  });
});
