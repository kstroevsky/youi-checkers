import type { StoreApi } from 'zustand/vanilla';

import { MultiplayerClient } from '@/app/multiplayer/MultiplayerClient';
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
  createSelectionState,
  createSelectionUpdate,
  getJumpFollowUpSelection,
} from '@/app/store/createGameStore/selection';
import { createStoreTransitions } from '@/app/store/createGameStore/transitions';
import type {
  GameStoreState,
  InitialPersistenceState,
  StoreOptions,
} from '@/app/store/createGameStore/types';
import { participantToMove } from '@/shared/multiplayer';

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
  let bootstrapMultiplayer: (() => void) | null = null;
  let disposeRuntime: (() => void) | null = null;
  let started = false;
  let disposed = false;

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
    const multiplayerClient = new MultiplayerClient({
      getCreateOptions: () => {
        const state = get();
        return {
          format: state.setupMatchSettings.gameFormat,
          rules: state.ruleConfig,
          targetPoints: state.setupMatchSettings.targetPoints,
        };
      },
      project: (authoritative, projection) => {
        const current = get();
        const gameState: GameStoreState['gameState'] = {
          ...authoritative.engine,
          history: projection.turnLog,
        };
        const seriesState: GameStoreState['seriesState'] = authoritative.series
          ? { ...authoritative.series, gameOneCheckpoint: null }
          : null;
        const matchSettings = {
          ...current.matchSettings,
          opponentMode: 'hotSeat' as const,
          gameFormat: authoritative.format,
          targetPoints:
            authoritative.series?.targetPoints ??
            current.matchSettings.targetPoints,
        };
        const canAct =
          projection.connected &&
          !projection.pending &&
          participantToMove(authoritative) === projection.participant;
        const boardDerivation = getBoardDerivation(
          gameState,
          authoritative.rules,
        );
        const jumpFollowUp = canAct
          ? getJumpFollowUpSelection(gameState)
          : null;
        const selection = canAct
          ? createSelectionUpdate(gameState, jumpFollowUp)
          : createSelectionState(
              null,
              null,
              gameState.status === 'gameOver'
                ? { type: 'gameOver' }
                : { type: 'idle' },
            );

        set({
          ...boardDerivation,
          ...selection,
          ruleConfig: authoritative.rules,
          matchSettings,
          seriesState,
          gameState,
          turnLog: projection.turnLog,
          past: [],
          future: [],
          historyCursor: projection.turnLog.length,
          selectableCoords: canAct ? boardDerivation.selectableCoords : [],
          aiBehaviorProfile: null,
          aiError: null,
          aiStatus: 'idle',
          pendingAiRequestId: null,
          lastAiDecision: null,
          importError: null,
        });
      },
      setView: (onlineMatch) => {
        if (onlineMatch) {
          options.telemetry?.setMatchContext('online', 'none');
        }
        set({ onlineMatch });
      },
    });
    bootstrapMultiplayer = () => multiplayerClient.start();

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
    disposeRuntime = () => {
      aiController.disposeAiWorker();
      multiplayerClient.dispose();
    };

    transitions = createStoreTransitions({
      consumeStartupHydrationOnMutation:
        persistenceRuntime.consumeStartupHydrationOnMutation,
      disposeAiWorker: aiController.disposeAiWorker,
      get,
      getBoardDerivation,
      scheduleAiSequenceRevealSync: aiController.scheduleAiSequenceRevealSync,
      persistRuntimeSession: persistenceRuntime.persistRuntimeSession,
      random: options.random ?? Math.random,
      resetAiState: aiController.resetAiState,
      set,
      syncComputerTurn: aiController.syncComputerTurn,
      telemetry: options.telemetry,
      submitOnlineCommand: (command) => multiplayerClient.submit(command),
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
      submitOnlineCommand: (command) => multiplayerClient.submit(command),
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
      onlineMatch: null,
      ...publicActions,
      createOnlineMatch: () => multiplayerClient.create(),
      joinOnlineMatch: (inviteUrl) => multiplayerClient.join(inviteUrl),
      leaveOnlineMatch: () => {
        multiplayerClient.leave();
        publicActions.startNewGame(get().setupMatchSettings);
      },
    };
  }

  /**
   * Runs boot-time side effects after Zustand has produced the store object.
   *
   * Deferring these effects keeps store construction synchronous while still
   * allowing migration sync, archive hydration, and immediate AI turns to start.
   */
  function runPostCreate(store: StoreApi<GameStoreState>): void {
    if (started || disposed) return;
    started = true;
    queueMicrotask(() => {
      if (disposed) return;
      persistInitialState?.();
      startArchiveHydration?.();
      bootstrapMultiplayer?.();

      const state = store.getState();

      if (isComputerTurn(state.gameState, state.matchSettings)) {
        state.retryComputerMove();
      }
    });
  }

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      disposeRuntime?.();
    },
    runPostCreate,
    stateCreator,
  };
}
