import type { StoreApi } from 'zustand/vanilla';

import { createAiController } from '@/app/store/createGameStore/aiController';
import { createDerivationCache } from '@/app/store/createGameStore/derivations';
import { isComputerTurn } from '@/app/store/createGameStore/match';
import { createPersistenceRuntime } from '@/app/store/createGameStore/persistenceRuntime';
import { createPublicGameStoreActions } from '@/app/store/createGameStore/publicActions';
import {
  buildSessionFromSlices,
  createRuntimeState,
  createSessionId,
  getSessionSlices,
} from '@/app/store/createGameStore/session';
import {
  createInitialInteractionState,
  createSelectionUpdate,
  getJumpFollowUpSelection,
} from '@/app/store/createGameStore/selection';
import { createStoreTransitions } from '@/app/store/createGameStore/transitions';
import type {
  GameStoreState,
  InitialPersistenceState,
  StoreOptions,
} from '@/app/store/createGameStore/types';

type StoreSetter = (
  partial:
    | Partial<GameStoreState>
    | ((state: GameStoreState) => Partial<GameStoreState>),
) => void;

type CreateGameStoreStateRuntimeOptions = {
  archive: StoreOptions['archive'];
  initialPersistence: InitialPersistenceState;
  options: StoreOptions;
  storage?: Storage;
};

/**
 * Builds the state creator and deferred boot hooks for one store instance.
 *
 * This file exists to keep the "assembly" step separate from the pure transition
 * helpers: one place wires persistence, AI control, derived selectors, and the
 * initial session payload into a coherent runtime.
 */
export function createGameStoreStateRuntime({
  archive,
  initialPersistence,
  options,
  storage,
}: CreateGameStoreStateRuntimeOptions) {
  const initialRuntimeState = createRuntimeState(initialPersistence.session);
  const { getBoardDerivation, getCellDerivation } = createDerivationCache();
  const initialBoardDerivation = getBoardDerivation(
    initialRuntimeState.gameState,
    initialRuntimeState.ruleConfig,
  );
  const initialJumpFollowUp = getJumpFollowUpSelection(
    initialRuntimeState.gameState,
  );
  const initialSelection = createSelectionUpdate(
    initialRuntimeState.gameState,
    initialJumpFollowUp,
  );

  let persistInitialState: (() => void) | null = null;
  let startArchiveHydration: (() => void) | null = null;

  /**
   * Instantiates the concrete store runtime around one `set/get` pair.
   *
   * The resulting state object is the meeting point of three subsystems:
   * persistent session truth, transient UI interaction state, and asynchronous AI.
   */
  function stateCreator(
    set: StoreSetter,
    get: () => GameStoreState,
  ): GameStoreState {
    options.telemetry?.setMatchContext(
      initialRuntimeState.matchSettings.opponentMode,
      initialRuntimeState.matchSettings.opponentMode === 'computer'
        ? initialRuntimeState.matchSettings.aiDifficulty
        : 'none',
    );
    const persistenceRuntime = createPersistenceRuntime({
      archive: archive ?? null,
      createSessionId: options.createSessionId,
      initialPersistence,
      storage,
    });

    let transitions: ReturnType<typeof createStoreTransitions> | null = null;

    const aiController = createAiController({
      commitAction: (action, aiDecision) => {
        if (!transitions) {
          return;
        }

        transitions.commitAction(action, aiDecision);
      },
      get,
      options,
      set,
    });

    transitions = createStoreTransitions({
      consumeStartupHydrationOnMutation:
        persistenceRuntime.consumeStartupHydrationOnMutation,
      disposeAiWorker: aiController.disposeAiWorker,
      get,
      getBoardDerivation,
      scheduleAiRevealSync: aiController.scheduleAiRevealSync,
      persistRuntimeSession: persistenceRuntime.persistRuntimeSession,
      random: options.random ?? Math.random,
      resetAiState: aiController.resetAiState,
      set,
      syncComputerTurn: aiController.syncComputerTurn,
      telemetry: options.telemetry,
      updateSessionMeta: persistenceRuntime.updateSessionMeta,
    });

    persistInitialState = () => {
      persistenceRuntime.persistInitialState(() =>
        buildSessionFromSlices(getSessionSlices(get())),
      );
    };

    startArchiveHydration = () => {
      persistenceRuntime.startArchiveHydration({
        applySession: transitions.applySession,
        onHydrationFallback: (historyHydrationStatus) => {
          set({ historyHydrationStatus });
        },
      });
    };

    const publicActions = createPublicGameStoreActions({
      applyHistoryStep: transitions.applyHistoryStep,
      applySession: transitions.applySession,
      beginFreshFullSession: persistenceRuntime.beginFreshFullSession,
      commitAction: transitions.commitAction,
      consumeStartupHydrationOnMutation:
        persistenceRuntime.consumeStartupHydrationOnMutation,
      createSessionId: options.createSessionId ?? createSessionId,
      disposeAiWorker: aiController.disposeAiWorker,
      get,
      getBoardDerivation,
      getCellDerivation,
      persistCurrentState: transitions.persistCurrentState,
      random: options.random ?? Math.random,
      resetAiState: aiController.resetAiState,
      set,
      syncComputerTurn: aiController.syncComputerTurn,
      telemetry: options.telemetry,
    });

    return {
      ...initialRuntimeState,
      ...initialBoardDerivation,
      aiError: null,
      aiStatus: 'idle',
      historyHydrationStatus: initialPersistence.historyHydrationStatus,
      selectedCell: initialSelection.selectedCell,
      selectedActionType: initialSelection.selectedActionType,
      selectedTargetMap: initialSelection.selectedTargetMap,
      availableActionKinds: initialSelection.availableActionKinds,
      draftJumpPath: initialSelection.draftJumpPath,
      legalTargets: initialSelection.legalTargets,
      interaction: createInitialInteractionState(
        initialRuntimeState.gameState,
        initialJumpFollowUp,
      ),
      importBuffer: '',
      importError: null,
      lastAiDecision: null,
      pendingAiRequestId: null,
      exportBuffer: '',
      ...createPublicGameStoreActions({
        applyHistoryStep: transitions.applyHistoryStep,
        applySession: transitions.applySession,
        beginFreshFullSession: persistenceRuntime.beginFreshFullSession,
        commitAction: transitions.commitAction,
        consumeStartupHydrationOnMutation:
          persistenceRuntime.consumeStartupHydrationOnMutation,
        createSessionId: options.createSessionId ?? createSessionId,
        disposeAiWorker: aiController.disposeAiWorker,
        get,
        getBoardDerivation,
        getCellDerivation,
        persistCurrentState: transitions.persistCurrentState,
        random: options.random ?? Math.random,
        resetAiState: aiController.resetAiState,
        set,
        syncComputerTurn: aiController.syncComputerTurn,
      }),
    };
  }

  /**
   * Runs boot-time side effects after Zustand has produced the store object.
   *
   * Deferring these effects keeps store construction synchronous while still
   * allowing migration sync, archive hydration, and immediate AI turns to start.
   */
  function runPostCreate(store: StoreApi<GameStoreState>): void {
    queueMicrotask(() => {
      persistInitialState?.();
      startArchiveHydration?.();

      const state = store.getState();

      if (isComputerTurn(state.gameState, state.matchSettings)) {
        state.retryComputerMove();
      }
    });
  }

  return {
    runPostCreate,
    stateCreator,
  };
}
