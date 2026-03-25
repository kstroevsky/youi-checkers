import { createUndoFrame, runGameCommand, type DomainEvent, type TurnAction } from '@/domain';
import type { SerializableSession } from '@/shared/types/session';
import type { AiSearchResult } from '@/ai';
import type { InteractionState } from '@/shared/types/session';

import { getHistoryStepData } from '@/app/store/createGameStore/history';
import { isComputerMatch, isComputerTurn } from '@/app/store/createGameStore/match';
import {
  buildSessionFromSlices,
  createRuntimeState,
} from '@/app/store/createGameStore/session';
import {
  createIdleSelection,
  createSelectionState,
  createSelectionUpdate,
  getJumpFollowUpSelection,
} from '@/app/store/createGameStore/selection';
import type {
  AiStatus,
  BoardDerivation,
  GameStoreData,
  GameStoreState,
  HistoryHydrationStatus,
  SessionSlices,
} from '@/app/store/createGameStore/types';

type StoreSetter = (
  partial:
    | Partial<GameStoreState>
    | ((state: GameStoreState) => Partial<GameStoreState>),
) => void;

type ApplySessionOptions = {
  historyHydrationStatus?: HistoryHydrationStatus;
  persist?: boolean;
  revision?: number;
  sessionId?: string;
};

type StoreTransitionsOptions = {
  consumeStartupHydrationOnMutation: () => HistoryHydrationStatus;
  disposeAiWorker: () => void;
  get: () => GameStoreState;
  getBoardDerivation: (
    gameState: GameStoreState['gameState'],
    ruleConfig: GameStoreState['ruleConfig'],
  ) => BoardDerivation;
  scheduleAiRevealSync: () => void;
  persistRuntimeSession: (
    session: SerializableSession,
    options?: {
      incrementRevision?: boolean;
      persistArchive?: boolean;
    },
  ) => void;
  resetAiState: (
    status?: AiStatus,
  ) => Pick<GameStoreData, 'aiError' | 'aiStatus' | 'pendingAiRequestId'>;
  set: StoreSetter;
  syncComputerTurn: () => void;
  updateSessionMeta: (options?: ApplySessionOptions) => HistoryHydrationStatus;
};

/** Creates store transitions that coordinate UI state around pure engine updates. */
export function createStoreTransitions({
  consumeStartupHydrationOnMutation,
  disposeAiWorker,
  get,
  getBoardDerivation,
  scheduleAiRevealSync,
  persistRuntimeSession,
  resetAiState,
  set,
  syncComputerTurn,
  updateSessionMeta,
}: StoreTransitionsOptions) {
  /**
   * Persists the canonical session slices after a state transition.
   *
   * The store never persists ad hoc UI-only fields here; it rebuilds the
   * serializable session from the authoritative slices that matter across reloads.
   */
  function persistCurrentState(nextState: SessionSlices): void {
    persistRuntimeSession(buildSessionFromSlices(nextState), {
      persistArchive: true,
    });
  }

  /**
   * Central gameplay commit path for human and AI turns.
   *
   * This is where a pure domain transition becomes a full application transition:
   * history is advanced, interaction state is updated, AI state is reset, and the
   * next persisted session snapshot is emitted.
   */
  function commitAction(action: TurnAction, aiDecision: AiSearchResult | null = null): void {
    const state = get();
    const nextHistoryHydrationStatus = consumeStartupHydrationOnMutation();
    const transition = runGameCommand(
      state.gameState,
      { type: 'submitAction', action },
      state.ruleConfig,
    );
    const nextGameState = transition.state;
    const nextTurnLog = nextGameState.history;
    const nextPast = [...state.past, createUndoFrame(state.gameState)];
    const nextFuture: GameStoreState['future'] = [];
    const jumpFollowUpEvent = transition.events.find(
      (event): event is Extract<DomainEvent, { type: 'jumpContinuationOpened' }> =>
        event.type === 'jumpContinuationOpened',
    );
    const jumpFollowUp = jumpFollowUpEvent
      ? {
          source: jumpFollowUpEvent.source,
          targets: jumpFollowUpEvent.targets,
        }
      : getJumpFollowUpSelection(nextGameState);
    const computerMatch = isComputerMatch(state.matchSettings);
    const nextInteraction: InteractionState =
      nextGameState.status === 'gameOver'
        ? { type: 'gameOver' }
        : computerMatch
          ? { type: 'idle' }
          : state.preferences.passDeviceOverlayEnabled
            ? { type: 'passingDevice', nextPlayer: nextGameState.currentPlayer }
            : { type: 'turnResolved', nextPlayer: nextGameState.currentPlayer };
    const nextBoardDerivation = getBoardDerivation(nextGameState, state.ruleConfig);
    const nextData = {
      ruleConfig: state.ruleConfig,
      preferences: state.preferences,
      matchSettings: state.matchSettings,
      gameState: nextGameState,
      turnLog: nextTurnLog,
      past: nextPast,
      future: nextFuture,
      historyCursor: nextGameState.history.length,
      ...nextBoardDerivation,
    };

    set({
      ...nextData,
      historyHydrationStatus: nextHistoryHydrationStatus,
      ...(jumpFollowUp
        ? createSelectionUpdate(nextGameState, jumpFollowUp)
        : createSelectionState(null, null, nextInteraction)),
      ...resetAiState(),
      importError: null,
      lastAiDecision: aiDecision ?? state.lastAiDecision,
    });
    persistCurrentState(nextData);
    if (
      aiDecision &&
      nextGameState.status === 'active' &&
      isComputerTurn(nextGameState, state.matchSettings)
    ) {
      scheduleAiRevealSync();
    } else {
      syncComputerTurn();
    }

    if (
      !state.preferences.passDeviceOverlayEnabled &&
      nextGameState.status !== 'gameOver' &&
      !isComputerTurn(nextGameState, state.matchSettings)
    ) {
      queueMicrotask(() => {
        const latest = get();

        if (latest.interaction.type === 'turnResolved') {
          set({
            interaction: { type: 'idle' },
          });
        }
      });
    }
  }

  return {
    /** Restores one undo/redo step while keeping persistence and AI state consistent. */
    applyHistoryStep(direction: 'backward' | 'forward'): boolean {
      disposeAiWorker();
      const state = get();
      const nextHistoryHydrationStatus = consumeStartupHydrationOnMutation();
      const nextData = getHistoryStepData(state, direction, getBoardDerivation);

      if (!nextData) {
        return false;
      }

      set({
        ...nextData,
        historyHydrationStatus: nextHistoryHydrationStatus,
        ...createIdleSelection(nextData.gameState),
        ...resetAiState(),
      });
      persistCurrentState(nextData);
      syncComputerTurn();

      return true;
    },
    /** Replaces the live session from import, hydration, or test-controlled boot data. */
    applySession(session: SerializableSession, options: ApplySessionOptions = {}): void {
      disposeAiWorker();
      const historyHydrationStatus = updateSessionMeta(options);
      const runtimeState = createRuntimeState(session);
      const nextBoardDerivation = getBoardDerivation(
        runtimeState.gameState,
        runtimeState.ruleConfig,
      );
      const jumpFollowUp = getJumpFollowUpSelection(runtimeState.gameState);

      set((current) => ({
        ...runtimeState,
        ...nextBoardDerivation,
        ...createSelectionUpdate(runtimeState.gameState, jumpFollowUp),
        ...resetAiState(),
        historyHydrationStatus,
        lastAiDecision: null,
        importBuffer: '',
        importError: null,
        exportBuffer: current.exportBuffer,
      }));

      if (options.persist !== false) {
        persistRuntimeSession(session);
      }

      syncComputerTurn();
    },
    commitAction,
    persistCurrentState,
  };
}
