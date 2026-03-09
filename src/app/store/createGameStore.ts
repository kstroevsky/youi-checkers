import { createStore } from 'zustand/vanilla';

import {
  applyAction,
  checkVictory,
  createInitialState,
  getJumpContinuationTargets,
  getLegalActionsForCell,
  getLegalTargetsForCell,
  serializeSession,
  deserializeSession,
  withRuleDefaults,
} from '@/domain';
import type { ActionKind, Coord, GameState, RuleConfig, TurnAction } from '@/domain';
import { SESSION_STORAGE_KEY } from '@/shared/constants/storage';
import type { AppPreferences, InteractionState, SerializableSession } from '@/shared/types/session';
import { uniqueValues } from '@/shared/utils/collections';

type GameStoreData = {
  ruleConfig: RuleConfig;
  preferences: AppPreferences;
  gameState: GameState;
  past: GameState[];
  future: GameState[];
  selectedCell: Coord | null;
  selectedActionType: ActionKind | null;
  draftJumpPath: Coord[];
  legalTargets: Coord[];
  interaction: InteractionState;
  historyCursor: number;
  importBuffer: string;
  importError: string | null;
  exportBuffer: string;
  helpOpen: boolean;
};

export type GameStoreState = GameStoreData & {
  acknowledgePassScreen: () => void;
  cancelInteraction: () => void;
  chooseActionType: (actionType: ActionKind) => void;
  finishJumpSequence: () => void;
  importSessionFromBuffer: () => void;
  redo: () => void;
  refreshExportBuffer: () => void;
  restart: () => void;
  selectCell: (coord: Coord) => void;
  setImportBuffer: (value: string) => void;
  setPreference: (partial: Partial<AppPreferences>) => void;
  setRuleConfig: (partial: Partial<RuleConfig>) => void;
  toggleHelp: (open?: boolean) => void;
  undo: () => void;
};

export type GameStore = ReturnType<typeof createGameStore>;

const DEFAULT_PREFERENCES: AppPreferences = {
  passDeviceOverlayEnabled: true,
  languageMode: 'bilingual',
};

function cloneGameState(state: GameState): GameState {
  return structuredClone(state);
}

function buildSession(
  ruleConfig: RuleConfig,
  preferences: AppPreferences,
  present: GameState,
  past: GameState[],
  future: GameState[],
): SerializableSession {
  return {
    version: 1,
    ruleConfig,
    preferences,
    present,
    past,
    future,
  };
}

function persistSession(session: SerializableSession, storage?: Storage): void {
  if (!storage) {
    return;
  }

  storage.setItem(SESSION_STORAGE_KEY, serializeSession(session));
}

function loadSession(storage?: Storage): SerializableSession | null {
  if (!storage) {
    return null;
  }

  const serialized = storage.getItem(SESSION_STORAGE_KEY);

  if (!serialized) {
    return null;
  }

  try {
    return deserializeSession(serialized);
  } catch {
    storage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

function getDefaultSession(): SerializableSession {
  const ruleConfig = withRuleDefaults();
  const present = createInitialState(ruleConfig);

  return buildSession(ruleConfig, DEFAULT_PREFERENCES, present, [], []);
}

function createSelectionState(
  source: Coord | null,
  actionType: ActionKind | null,
  interaction: InteractionState,
  legalTargets: Coord[] = [],
  draftJumpPath: Coord[] = [],
): Pick<
  GameStoreData,
  'selectedCell' | 'selectedActionType' | 'interaction' | 'legalTargets' | 'draftJumpPath'
> {
  return {
    selectedCell: source,
    selectedActionType: actionType,
    interaction,
    legalTargets,
    draftJumpPath,
  };
}

function createIdleSelection(gameState: GameState): Pick<
  GameStoreData,
  'selectedCell' | 'selectedActionType' | 'interaction' | 'legalTargets' | 'draftJumpPath'
> {
  return createSelectionState(
    null,
    null,
    gameState.status === 'gameOver' ? { type: 'gameOver' } : { type: 'idle' },
  );
}

function deriveExportBuffer(data: Pick<GameStoreData, 'ruleConfig' | 'preferences' | 'gameState' | 'past' | 'future'>): string {
  return serializeSession(
    buildSession(
      data.ruleConfig,
      data.preferences,
      data.gameState,
      data.past,
      data.future,
    ),
  );
}

type StoreOptions = {
  initialSession?: SerializableSession;
  storage?: Storage;
};

export function createGameStore(options: StoreOptions = {}) {
  const storage =
    options.storage ??
    (typeof window !== 'undefined' ? window.localStorage : undefined);
  const initialSession =
    options.initialSession ?? loadSession(storage) ?? getDefaultSession();
  const initialInteraction: InteractionState =
    initialSession.present.status === 'gameOver' ? { type: 'gameOver' } : { type: 'idle' };

  const store = createStore<GameStoreState>((set, get) => {
    function persistCurrentState(nextState: Pick<
      GameStoreData,
      'ruleConfig' | 'preferences' | 'gameState' | 'past' | 'future'
    >): void {
      persistSession(
        buildSession(
          nextState.ruleConfig,
          nextState.preferences,
          nextState.gameState,
          nextState.past,
          nextState.future,
        ),
        storage,
      );
    }

    function commitAction(action: TurnAction): void {
      const state = get();
      const nextGameState = applyAction(state.gameState, action, state.ruleConfig);
      const nextPast = [...state.past, cloneGameState(state.gameState)];
      const nextFuture: GameState[] = [];
      const nextInteraction: InteractionState =
        nextGameState.status === 'gameOver'
          ? { type: 'gameOver' }
          : state.preferences.passDeviceOverlayEnabled
            ? { type: 'passingDevice', nextPlayer: nextGameState.currentPlayer }
            : { type: 'turnResolved', nextPlayer: nextGameState.currentPlayer };
      const nextData = {
        ruleConfig: state.ruleConfig,
        preferences: state.preferences,
        gameState: nextGameState,
        past: nextPast,
        future: nextFuture,
      };

      set({
        ...nextData,
        ...createSelectionState(null, null, nextInteraction),
        historyCursor: nextPast.length,
        importError: null,
        exportBuffer: deriveExportBuffer(nextData),
      });
      persistCurrentState(nextData);

      if (!state.preferences.passDeviceOverlayEnabled && nextGameState.status !== 'gameOver') {
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

    function applySession(session: SerializableSession): void {
      set({
        ruleConfig: session.ruleConfig,
        preferences: session.preferences,
        gameState: cloneGameState(session.present),
        past: session.past.map(cloneGameState),
        future: session.future.map(cloneGameState),
        ...createIdleSelection(session.present),
        historyCursor: session.past.length,
        importError: null,
        exportBuffer: serializeSession(session),
      });
      persistSession(session, storage);
    }

    return {
      ruleConfig: initialSession.ruleConfig,
      preferences: initialSession.preferences,
      gameState: cloneGameState(initialSession.present),
      past: initialSession.past.map(cloneGameState),
      future: initialSession.future.map(cloneGameState),
      selectedCell: null,
      selectedActionType: null,
      draftJumpPath: [],
      legalTargets: [],
      interaction: initialInteraction,
      historyCursor: initialSession.past.length,
      importBuffer: '',
      importError: null,
      exportBuffer: serializeSession(initialSession),
      helpOpen: false,
      acknowledgePassScreen: () => {
        const state = get();

        if (state.interaction.type !== 'passingDevice' && state.interaction.type !== 'turnResolved') {
          return;
        }

        set({
          interaction: state.gameState.status === 'gameOver' ? { type: 'gameOver' } : { type: 'idle' },
        });
      },
      cancelInteraction: () => {
        const state = get();
        set(createIdleSelection(state.gameState));
      },
      chooseActionType: (actionType) => {
        const state = get();
        const source = state.selectedCell;

        if (!source) {
          return;
        }

        const legalTargets = getLegalTargetsForCell(state.gameState, source, state.ruleConfig);
        const availableActions = uniqueValues(
          getLegalActionsForCell(state.gameState, source, state.ruleConfig).map(
            (action) => action.type,
          ),
        );

        if (!availableActions.includes(actionType)) {
          return;
        }

        if (actionType === 'manualUnfreeze') {
          commitAction({ type: 'manualUnfreeze', coord: source });
          return;
        }

        if (actionType === 'jumpSequence') {
          const firstTargets = uniqueValues(legalTargets.jumpSequence);
          set({
            ...createSelectionState(
              source,
              actionType,
              {
                type: 'buildingJumpChain',
                source,
                path: [],
                availableTargets: firstTargets,
              },
              firstTargets,
              [],
            ),
          });
          return;
        }

        const actionTargets = uniqueValues(legalTargets[actionType]);

        set({
          ...createSelectionState(
            source,
            actionType,
            {
              type: 'choosingTarget',
              source,
              actionType,
              availableTargets: actionTargets,
            },
            actionTargets,
          ),
        });
      },
      finishJumpSequence: () => {
        const state = get();

        if (state.selectedActionType !== 'jumpSequence' || !state.selectedCell || !state.draftJumpPath.length) {
          return;
        }

        commitAction({
          type: 'jumpSequence',
          source: state.selectedCell,
          path: state.draftJumpPath,
        });
      },
      importSessionFromBuffer: () => {
        const state = get();

        try {
          const session = deserializeSession(state.importBuffer);
          applySession(session);
        } catch (error) {
          set({
            importError: error instanceof Error ? error.message : 'Failed to import session.',
          });
        }
      },
      redo: () => {
        const state = get();
        const next = state.future[0];

        if (!next) {
          return;
        }

        const nextPast = [...state.past, cloneGameState(state.gameState)];
        const nextFuture = state.future.slice(1).map(cloneGameState);
        const nextData = {
          ruleConfig: state.ruleConfig,
          preferences: state.preferences,
          gameState: cloneGameState(next),
          past: nextPast,
          future: nextFuture,
        };

        set({
          ...nextData,
          ...createIdleSelection(next),
          historyCursor: nextPast.length,
          exportBuffer: deriveExportBuffer(nextData),
        });
        persistCurrentState(nextData);
      },
      refreshExportBuffer: () => {
        const state = get();
        set({
          exportBuffer: deriveExportBuffer(state),
        });
      },
      restart: () => {
        const state = get();
        const nextGameState = createInitialState(state.ruleConfig);
        const nextData = {
          ruleConfig: state.ruleConfig,
          preferences: state.preferences,
          gameState: nextGameState,
          past: [],
          future: [],
        };

        set({
          ...nextData,
          ...createIdleSelection(nextGameState),
          historyCursor: 0,
          importBuffer: '',
          importError: null,
          exportBuffer: deriveExportBuffer(nextData),
        });
        persistCurrentState(nextData);
      },
      selectCell: (coord) => {
        const state = get();

        if (state.interaction.type === 'passingDevice') {
          return;
        }

        if (
          state.selectedCell &&
          state.selectedActionType &&
          state.legalTargets.includes(coord)
        ) {
          if (state.selectedActionType === 'jumpSequence') {
            const nextPath = [...state.draftJumpPath, coord];
            const nextTargets = uniqueValues(
              getJumpContinuationTargets(state.gameState, state.selectedCell, nextPath),
            );

            if (!nextTargets.length) {
              commitAction({
                type: 'jumpSequence',
                source: state.selectedCell,
                path: nextPath,
              });
              return;
            }

            set({
              draftJumpPath: nextPath,
              legalTargets: nextTargets,
              interaction: {
                type: 'buildingJumpChain',
                source: state.selectedCell,
                path: nextPath,
                availableTargets: nextTargets,
              },
            });
            return;
          }

          commitAction({
            type: state.selectedActionType,
            source: state.selectedCell,
            target: coord,
          } as TurnAction);
          return;
        }

        const actions = getLegalActionsForCell(state.gameState, coord, state.ruleConfig);

        if (!actions.length) {
          set(createIdleSelection(state.gameState));
          return;
        }

        const availableActions = uniqueValues(actions.map((action) => action.type));
        set({
          ...createSelectionState(
            coord,
            null,
            {
              type: 'pieceSelected',
              source: coord,
              availableActions,
            },
          ),
        });
      },
      setImportBuffer: (value) => {
        set({ importBuffer: value });
      },
      setPreference: (partial) => {
        const state = get();
        const preferences = {
          ...state.preferences,
          ...partial,
        };
        const nextData = {
          ruleConfig: state.ruleConfig,
          preferences,
          gameState: state.gameState,
          past: state.past,
          future: state.future,
        };

        set({
          preferences,
          interaction:
            !preferences.passDeviceOverlayEnabled && state.interaction.type === 'passingDevice'
              ? { type: 'idle' }
              : state.interaction,
          exportBuffer: deriveExportBuffer(nextData),
        });
        persistCurrentState(nextData);
      },
      setRuleConfig: (partial) => {
        const state = get();
        const ruleConfig = withRuleDefaults({
          ...state.ruleConfig,
          ...partial,
        });
        let nextGameState = state.gameState;

        if (nextGameState.status === 'active') {
          const victory = checkVictory(nextGameState, ruleConfig);

          if (victory.type !== 'none') {
            nextGameState = {
              ...cloneGameState(nextGameState),
              status: 'gameOver',
              victory,
            };
          }
        }

        const nextData = {
          ruleConfig,
          preferences: state.preferences,
          gameState: nextGameState,
          past: state.past,
          future: state.future,
        };

        set({
          ruleConfig,
          gameState: nextGameState,
          interaction: nextGameState.status === 'gameOver' ? { type: 'gameOver' } : state.interaction,
          exportBuffer: deriveExportBuffer(nextData),
        });
        persistCurrentState(nextData);
      },
      toggleHelp: (open) => {
        const state = get();
        set({
          helpOpen: typeof open === 'boolean' ? open : !state.helpOpen,
        });
      },
      undo: () => {
        const state = get();
        const previous = state.past.at(-1);

        if (!previous) {
          return;
        }

        const nextPast = state.past.slice(0, -1).map(cloneGameState);
        const nextFuture = [cloneGameState(state.gameState), ...state.future.map(cloneGameState)];
        const nextData = {
          ruleConfig: state.ruleConfig,
          preferences: state.preferences,
          gameState: cloneGameState(previous),
          past: nextPast,
          future: nextFuture,
        };

        set({
          ...nextData,
          ...createIdleSelection(previous),
          historyCursor: nextPast.length,
          exportBuffer: deriveExportBuffer(nextData),
        });
        persistCurrentState(nextData);
      },
    };
  });

  return store;
}
