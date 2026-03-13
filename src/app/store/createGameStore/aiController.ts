import { AI_DIFFICULTY_PRESETS, type AiSearchResult } from '@/ai';
import type { TurnAction } from '@/domain';

import { AI_WATCHDOG_BUFFER_MS } from '@/app/store/createGameStore/constants';
import { isComputerMatch, isComputerTurn } from '@/app/store/createGameStore/match';
import type {
  AiStatus,
  AiWorkerLike,
  GameStoreData,
  GameStoreState,
  StoreOptions,
} from '@/app/store/createGameStore/types';

type StoreSetter = (
  partial:
    | Partial<GameStoreState>
    | ((state: GameStoreState) => Partial<GameStoreState>),
) => void;

type AiControllerOptions = {
  commitAction: (action: TurnAction, aiDecision?: AiSearchResult | null) => void;
  get: () => GameStoreState;
  options: StoreOptions;
  set: StoreSetter;
};

const AI_COLD_START_BUFFER_MS = 1500;

/** Owns the AI worker, request ids, and watchdog for one store instance. */
export function createAiController({ commitAction, get, options, set }: AiControllerOptions) {
  let aiWorker: AiWorkerLike | null = null;
  let aiWatchdogId: ReturnType<typeof globalThis.setTimeout> | null = null;
  let aiWorkerIsWarm = false;
  let nextAiRequestId = 1;

  function clearAiWatchdog(): void {
    if (aiWatchdogId === null) {
      return;
    }

    globalThis.clearTimeout(aiWatchdogId);
    aiWatchdogId = null;
  }

  function disposeAiWorker(): void {
    clearAiWatchdog();

    if (!aiWorker) {
      return;
    }

    aiWorker.onmessage = null;
    aiWorker.onerror = null;
    aiWorker.terminate();
    aiWorker = null;
    aiWorkerIsWarm = false;
  }

  function resetAiState(
    status: AiStatus = 'idle',
  ): Pick<GameStoreData, 'aiError' | 'aiStatus' | 'pendingAiRequestId'> {
    return {
      aiError: null,
      aiStatus: status,
      pendingAiRequestId: null,
    };
  }

  function handleAiWatchdogTimeout(requestId: number): void {
    aiWatchdogId = null;

    const latest = get();

    if (latest.pendingAiRequestId !== requestId) {
      return;
    }

    aiWorkerIsWarm = true;
    disposeAiWorker();
    set({
      aiError: 'Computer move timed out.',
      aiStatus: 'error',
      pendingAiRequestId: null,
    });
  }

  function scheduleAiWatchdog(requestId: number, matchSettings: GameStoreState['matchSettings']): void {
    clearAiWatchdog();

    if (!isComputerMatch(matchSettings)) {
      return;
    }

    const timeoutMs =
      AI_DIFFICULTY_PRESETS[matchSettings.aiDifficulty].timeBudgetMs +
      AI_WATCHDOG_BUFFER_MS +
      (aiWorkerIsWarm ? 0 : AI_COLD_START_BUFFER_MS);

    aiWatchdogId = globalThis.setTimeout(
      () => handleAiWatchdogTimeout(requestId),
      timeoutMs,
    );
  }

  function getAiWorker(): AiWorkerLike | null {
    if (aiWorker) {
      return aiWorker;
    }

    const workerFactory =
      options.createAiWorker ??
      (() => {
        if (typeof Worker === 'undefined') {
          return null;
        }

        return new Worker(new URL('../../../ai/worker/ai.worker.ts', import.meta.url), {
          type: 'module',
        }) as AiWorkerLike;
      });

    aiWorker = workerFactory();

    if (!aiWorker) {
      return null;
    }

    aiWorkerIsWarm = false;

    aiWorker.onmessage = (event) => {
      const message = event.data;
      const latest = get();

      if (message.requestId !== latest.pendingAiRequestId) {
        return;
      }

      clearAiWatchdog();
      aiWorkerIsWarm = true;

      if (message.type === 'error') {
        set({
          aiError: message.message,
          aiStatus: 'error',
          pendingAiRequestId: null,
        });
        return;
      }

      if (!message.result.action) {
        set({
          aiError: null,
          aiStatus: 'idle',
          lastAiDecision: message.result,
          pendingAiRequestId: null,
        });
        return;
      }

      commitAction(message.result.action, message.result);
    };

    aiWorker.onerror = (event) => {
      clearAiWatchdog();
      aiWorkerIsWarm = true;
      set({
        aiError: event.message || 'Computer move failed.',
        aiStatus: 'error',
        pendingAiRequestId: null,
      });
    };

    return aiWorker;
  }

  function syncComputerTurn(): void {
    const state = get();

    if (
      !isComputerTurn(state.gameState, state.matchSettings) ||
      state.gameState.status !== 'active' ||
      state.historyCursor !== state.turnLog.length ||
      state.future.length > 0
    ) {
      if (state.pendingAiRequestId !== null) {
        disposeAiWorker();
        set({
          aiStatus: state.aiStatus === 'error' ? 'error' : 'idle',
          pendingAiRequestId: null,
        });
      }
      return;
    }

    if (state.pendingAiRequestId !== null || state.aiStatus === 'thinking') {
      return;
    }

    const worker = getAiWorker();

    if (!worker) {
      set({
        aiError: 'Computer worker is unavailable.',
        aiStatus: 'error',
        pendingAiRequestId: null,
      });
      return;
    }

    const requestId = nextAiRequestId;
    nextAiRequestId += 1;

    set({
      aiError: null,
      aiStatus: 'thinking',
      pendingAiRequestId: requestId,
    });
    scheduleAiWatchdog(requestId, state.matchSettings);
    worker.postMessage({
      type: 'chooseMove',
      requestId,
      ruleConfig: state.ruleConfig,
      state: state.gameState,
      matchSettings: state.matchSettings,
    });
  }

  return {
    disposeAiWorker,
    resetAiState,
    syncComputerTurn,
  };
}
