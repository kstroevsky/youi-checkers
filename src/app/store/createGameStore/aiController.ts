import { AI_DIFFICULTY_PRESETS, type AiSearchResult } from '@/ai';
import { validateAction, type TurnAction } from '@/domain';

import {
  AI_SEQUENCE_STEP_REVEAL_MS,
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
const AI_SLOW_INCIDENT_THRESHOLD = 1.5;

/** Owns the AI worker, request ids, and watchdog for one store instance. */
export function createAiController({
  commitAction,
  get,
  options,
  set,
}: AiControllerOptions) {
  let aiWorker: AiWorkerLike | null = null;
  let aiWatchdogId: ReturnType<typeof globalThis.setTimeout> | null = null;
  let aiSequenceRevealTimeoutId: ReturnType<
    typeof globalThis.setTimeout
  > | null = null;
  let finishingPlanDecision: AiSearchResult | null = null;
  let finishingPlanQueue: TurnAction[] = [];
  let aiWorkerIsWarm = false;
  let nextAiRequestId = 1;

  /** Elapsed ms of the most recent completed search, or null if unknown. */
  let lastAiElapsedMs: number | null = null;
  /** Whether the most recent completed search internally timed out. */
  let lastAiTimedOut = false;
  /** Number of silent auto-retries attempted for the current computer turn. */
  let aiAutoRetryCount = 0;
  /** Prevents expected iterative-search budget exhaustion from flooding incidents. */
  let aiDegradedIncidentReported = false;

  function clearAiWatchdog(): void {
    if (aiWatchdogId === null) {
      return;
    }

    globalThis.clearTimeout(aiWatchdogId);
    aiWatchdogId = null;
  }

  function clearAiSequenceRevealTimeout(): void {
    if (aiSequenceRevealTimeoutId === null) {
      return;
    }

    globalThis.clearTimeout(aiSequenceRevealTimeoutId);
    aiSequenceRevealTimeoutId = null;
  }

  function clearFinishingPlan(): void {
    finishingPlanDecision = null;
    finishingPlanQueue = [];
  }

  function disposeAiWorker(): void {
    clearAiWatchdog();
    clearAiSequenceRevealTimeout();
    clearFinishingPlan();

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
    options.telemetry?.increment('ai_watchdog_timeouts');
    options.telemetry?.incident('ai_watchdog_timeout', {
      severity: 'error',
      tags: {
        retry: aiAutoRetryCount,
      },
    });
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

  function scheduleAiSequenceRevealSync(): void {
    clearAiSequenceRevealTimeout();

    aiSequenceRevealTimeoutId = globalThis.setTimeout(() => {
      aiSequenceRevealTimeoutId = null;
      syncComputerTurn();
    }, AI_SEQUENCE_STEP_REVEAL_MS);
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
        options.telemetry?.incident('ai_worker_error', {
          severity: 'error',
          tags: {
            phase: 'message',
          },
        });
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
      const preset = AI_DIFFICULTY_PRESETS[latest.matchSettings.aiDifficulty];
      const searchMode =
        latest.seriesState?.phase === 'finishing' ? 'finishing' : 'normal';
      options.telemetry?.measure('ai_elapsed_ms', message.result.elapsedMs);
      options.telemetry?.increment(
        'ai_evaluated_nodes',
        message.result.evaluatedNodes,
      );
      if (message.result.timedOut) {
        options.telemetry?.increment('ai_search_budget_exhaustions');
      }
      options.telemetry?.context('ai_completed', {
        actionKind: message.result.action?.type ?? 'none',
        completedDepth: message.result.completedDepth,
        completionPlanLength: message.result.completionPlan?.length ?? 0,
        evaluatedNodes: message.result.evaluatedNodes,
        fallback: message.result.fallbackKind,
        principalVariationLength: message.result.principalVariation.length,
        repetitionPenalties: message.result.diagnostics.repetitionPenalties,
        rootCandidateCount: message.result.rootCandidates.length,
        searchMode,
        selfUndoPenalties: message.result.diagnostics.selfUndoPenalties,
        strategicIntent: message.result.strategicIntent,
        timedOut: message.result.timedOut,
      });
      const degradedReason =
        message.result.completedDepth === 0
          ? 'zero_depth'
          : message.result.elapsedMs >
              preset.timeBudgetMs * AI_SLOW_INCIDENT_THRESHOLD
            ? 'budget_overrun'
            : null;
      if (degradedReason) {
        options.telemetry?.increment('ai_degraded_searches');
      }
      if (degradedReason && !aiDegradedIncidentReported) {
        aiDegradedIncidentReported = true;
        options.telemetry?.incident('ai_slow', {
          durationMs: message.result.elapsedMs,
          severity: 'warning',
          tags: {
            completedDepth: message.result.completedDepth,
            difficulty: latest.matchSettings.aiDifficulty,
            reason: degradedReason,
            searchMode,
            timedOut: message.result.timedOut,
          },
        });
      }

      if (!message.result.action) {
        clearFinishingPlan();
        set({
          aiError: null,
          aiStatus: 'idle',
          lastAiDecision: message.result,
          pendingAiRequestId: null,
        });
        return;
      }

      if (searchMode === 'finishing' && message.result.completionPlan?.length) {
        finishingPlanDecision = message.result;
        finishingPlanQueue = message.result.completionPlan.slice(1);
      } else {
        clearFinishingPlan();
      }

      commitAction(message.result.action, message.result);
    };

    aiWorker.onerror = (event) => {
      clearAiWatchdog();
      aiWorkerIsWarm = true;
      options.telemetry?.incident('ai_worker_error', {
        severity: 'error',
        tags: {
          phase: 'runtime',
        },
      });
      set({
        aiError: event.message || 'Computer move failed.',
        aiStatus: 'error',
        pendingAiRequestId: null,
      });
    };

    return aiWorker;
  }

  function syncComputerTurn(): void {
    clearAiSequenceRevealTimeout();

    const state = get();
    const finishingActive = state.seriesState?.phase === 'finishing';

    if (!finishingActive) {
      clearFinishingPlan();
    }

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

    const plannedAction = finishingActive ? finishingPlanQueue[0] : undefined;

    if (plannedAction && finishingPlanDecision) {
      const validation = validateAction(
        state.gameState,
        plannedAction,
        state.ruleConfig,
      );

      if (validation.valid) {
        finishingPlanQueue = finishingPlanQueue.slice(1);
        const replayDecision: AiSearchResult = {
          ...finishingPlanDecision,
          action: plannedAction,
          completionPlan: [plannedAction, ...finishingPlanQueue],
          elapsedMs: 0,
          evaluatedNodes: 0,
          principalVariation: [plannedAction, ...finishingPlanQueue],
          timedOut: false,
        };

        if (finishingPlanQueue.length === 0) {
          finishingPlanDecision = null;
        }

        commitAction(plannedAction, replayDecision);
        return;
      }

      clearFinishingPlan();
      options.telemetry?.increment('ai_finishing_plan_replans');
      options.telemetry?.context('ai_finishing_plan_invalidated', {
        moveNumber: state.gameState.moveNumber,
        reason: validation.reason,
      });
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
    options.telemetry?.setMatchContext(
      state.matchSettings.opponentMode,
      state.matchSettings.aiDifficulty,
    );
    const searchMode =
      state.seriesState?.phase === 'finishing' ? 'finishing' : 'normal';
    options.telemetry?.context('ai_started', {
      budgetMs:
        AI_DIFFICULTY_PRESETS[state.matchSettings.aiDifficulty].timeBudgetMs,
      difficulty: state.matchSettings.aiDifficulty,
      moveNumber: state.gameState.moveNumber,
      searchMode,
      warm: aiWorkerIsWarm,
    });
    scheduleAiWatchdog(requestId, state.matchSettings);
    worker.postMessage({
      type: 'chooseMove',
      requestId,
      ruleConfig: state.ruleConfig,
      state: state.gameState,
      matchSettings: state.matchSettings,
      behaviorProfile: state.aiBehaviorProfile,
      previousStrategicIntent: state.lastAiDecision?.strategicIntent ?? null,
      searchMode,
    });
  }

  return {
    disposeAiWorker,
    resetAiState,
    scheduleAiSequenceRevealSync,
    syncComputerTurn,
  };
}
