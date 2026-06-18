import { AI_DIFFICULTY_PRESETS, type AiSearchResult } from '@/ai';
import type { TurnAction } from '@/domain';

import {
  AI_MOVE_REVEAL_MS,
  AI_WATCHDOG_BUFFER_MS,
} from '@/app/store/createGameStore/constants';
import {
  isComputerMatch,
  isComputerTurn,
} from '@/app/store/createGameStore/match';
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
  commitAction: (
    action: TurnAction,
    aiDecision?: AiSearchResult | null,
  ) => void;
  get: () => GameStoreState;
  options: StoreOptions;
  set: StoreSetter;
};

/** Extra cold-start allowance for the first request on a fresh worker. */
export const AI_COLD_START_BUFFER_MS = 2500;

/**
 * Maximum number of silent auto-retries before surfacing an error to the user.
 * One retry lets a single transient stall on a slow device recover invisibly.
 */
export const AI_AUTO_RETRY_LIMIT = 2;

/**
 * Additional watchdog time granted after the device has shown signs of being
 * slow (previous move timed out or finished above the slow-device threshold).
 */
export const AI_SLOW_DEVICE_BUFFER_MS = 500;

/**
 * Fraction of the time budget that, when exceeded by the previous move, marks
 * the device as slow for the next watchdog calculation.
 */
const AI_SLOW_DEVICE_THRESHOLD = 0.75;

/** Owns the AI worker, request ids, and watchdog for one store instance. */
export function createAiController({
  commitAction,
  get,
  options,
  set,
}: AiControllerOptions) {
  let aiWorker: AiWorkerLike | null = null;
  let aiWatchdogId: ReturnType<typeof globalThis.setTimeout> | null = null;
  let aiRevealTimeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
  let aiWorkerIsWarm = false;
  let nextAiRequestId = 1;

  /** Elapsed ms of the most recent completed search, or null if unknown. */
  let lastAiElapsedMs: number | null = null;
  /** Whether the most recent completed search internally timed out. */
  let lastAiTimedOut = false;
  /** Number of silent auto-retries attempted for the current computer turn. */
  let aiAutoRetryCount = 0;

  function clearAiWatchdog(): void {
    if (aiWatchdogId === null) {
      return;
    }

    globalThis.clearTimeout(aiWatchdogId);
    aiWatchdogId = null;
  }

  function clearAiRevealTimeout(): void {
    if (aiRevealTimeoutId === null) {
      return;
    }

    globalThis.clearTimeout(aiRevealTimeoutId);
    aiRevealTimeoutId = null;
  }

  function disposeAiWorker(): void {
    clearAiWatchdog();
    clearAiRevealTimeout();

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

    lastAiTimedOut = true;
    disposeAiWorker();

    if (aiAutoRetryCount < AI_AUTO_RETRY_LIMIT) {
      aiAutoRetryCount += 1;
      set({ aiError: null, aiStatus: 'idle', pendingAiRequestId: null });
      syncComputerTurn();
      return;
    }

    aiAutoRetryCount = 0;
    set({
      aiError: 'Computer move timed out.',
      aiStatus: 'error',
      pendingAiRequestId: null,
    });
  }

  function scheduleAiWatchdog(
    requestId: number,
    matchSettings: GameStoreState['matchSettings'],
  ): void {
    clearAiWatchdog();

    if (!isComputerMatch(matchSettings)) {
      return;
    }

    const preset = AI_DIFFICULTY_PRESETS[matchSettings.aiDifficulty];
    const isSlowDevice =
      lastAiTimedOut ||
      (lastAiElapsedMs !== null &&
        lastAiElapsedMs > preset.timeBudgetMs * AI_SLOW_DEVICE_THRESHOLD);

    const timeoutMs =
      preset.timeBudgetMs +
      AI_WATCHDOG_BUFFER_MS +
      (aiWorkerIsWarm ? 0 : AI_COLD_START_BUFFER_MS) +
      (isSlowDevice ? AI_SLOW_DEVICE_BUFFER_MS : 0);

    aiWatchdogId = globalThis.setTimeout(
      () => handleAiWatchdogTimeout(requestId),
      timeoutMs,
    );
  }

  function scheduleAiRevealSync(): void {
    clearAiRevealTimeout();

    aiRevealTimeoutId = globalThis.setTimeout(() => {
      aiRevealTimeoutId = null;
      syncComputerTurn();
    }, AI_MOVE_REVEAL_MS);
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

        return new Worker(
          new URL('../../../ai/worker/ai.worker.ts', import.meta.url),
          {
            type: 'module',
          },
        ) as AiWorkerLike;
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

      lastAiElapsedMs = message.result.elapsedMs;
      lastAiTimedOut = message.result.timedOut;
      aiAutoRetryCount = 0;

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
    clearAiRevealTimeout();

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
      behaviorProfile: state.aiBehaviorProfile,
      searchMode:
        state.seriesState?.phase === 'finishing' ? 'finishing' : 'normal',
    });
  }

  return {
    disposeAiWorker,
    resetAiState,
    scheduleAiRevealSync,
    syncComputerTurn,
  };
}
