import { createStore } from 'zustand/vanilla';

import {
  applyAction,
  buildTargetMap,
  checkVictory,
  createEmptyTargetMap,
  createInitialState,
  createUndoFrame,
  deserializeSession,
  getJumpContinuationTargets,
  getLegalActionsForCell,
  getScoreSummary,
  restoreGameState,
  serializeSession,
  withRuleDefaults,
} from '@/domain';
import type {
  ActionKind,
  Coord,
  GameState,
  RuleConfig,
  ScoreSummary,
  TargetMap,
  TurnAction,
  TurnRecord,
} from '@/domain';
import { hashPosition } from '@/domain/model/hash';
import { LEGACY_SESSION_STORAGE_KEYS, SESSION_STORAGE_KEY } from '@/shared/constants/storage';
import type {
  AppPreferences,
  InteractionState,
  SerializableSession,
  UndoFrame,
} from '@/shared/types/session';
import { uniqueValues } from '@/shared/utils/collections';

type GameStoreData = {
  ruleConfig: RuleConfig;
  preferences: AppPreferences;
  gameState: GameState;
  turnLog: TurnRecord[];
  past: UndoFrame[];
  future: UndoFrame[];
  selectedCell: Coord | null;
  selectedActionType: ActionKind | null;
  selectedTargetMap: TargetMap;
  availableActionKinds: ActionKind[];
  draftJumpPath: Coord[];
  legalTargets: Coord[];
  selectableCoords: Coord[];
  scoreSummary: ScoreSummary | null;
  interaction: InteractionState;
  historyCursor: number;
  importBuffer: string;
  importError: string | null;
  exportBuffer: string;
};

export type GameStoreState = GameStoreData & {
  acknowledgePassScreen: () => void;
  cancelInteraction: () => void;
  chooseActionType: (actionType: ActionKind) => void;
  goToHistoryCursor: (targetCursor: number) => void;
  importSessionFromBuffer: () => void;
  redo: () => void;
  refreshExportBuffer: () => void;
  restart: () => void;
  selectCell: (coord: Coord) => void;
  setImportBuffer: (value: string) => void;
  setPreference: (partial: Partial<AppPreferences>) => void;
  setRuleConfig: (partial: Partial<RuleConfig>) => void;
  undo: () => void;
};

export type GameStore = ReturnType<typeof createGameStore>;

const DEFAULT_PREFERENCES: AppPreferences = {
  passDeviceOverlayEnabled: true,
  language: 'russian',
};

const LEGACY_RULE_DEFAULTS: RuleConfig = {
  allowNonAdjacentFriendlyStackTransfer: true,
  drawRule: 'threefold',
  scoringMode: 'basic',
};

/** Returns stable rule-config cache key used for store-side derivation memoization. */
function ruleConfigKey(config: RuleConfig): string {
  return [
    config.allowNonAdjacentFriendlyStackTransfer ? '1' : '0',
    config.drawRule,
    config.scoringMode,
  ].join(':');
}

/** Builds serializable session payload from store slices. */
function buildSession(
  ruleConfig: RuleConfig,
  preferences: AppPreferences,
  present: GameState,
  turnLog: TurnRecord[],
  past: UndoFrame[],
  future: UndoFrame[],
): SerializableSession {
  return {
    version: 2,
    ruleConfig,
    preferences,
    turnLog,
    present: createUndoFrame(present),
    past,
    future,
  };
}

/** Persists session into browser storage when available. */
function persistSession(session: SerializableSession, storage?: Storage): void {
  if (!storage) {
    return;
  }

  storage.setItem(SESSION_STORAGE_KEY, serializeSession(session));

  for (const legacyKey of LEGACY_SESSION_STORAGE_KEYS) {
    storage.removeItem(legacyKey);
  }
}

/** Detects the former default rule set persisted before default-policy change. */
function hasLegacyRuleDefaults(ruleConfig: RuleConfig): boolean {
  return (
    ruleConfig.allowNonAdjacentFriendlyStackTransfer ===
      LEGACY_RULE_DEFAULTS.allowNonAdjacentFriendlyStackTransfer &&
    ruleConfig.drawRule === LEGACY_RULE_DEFAULTS.drawRule &&
    ruleConfig.scoringMode === LEGACY_RULE_DEFAULTS.scoringMode
  );
}

/** Limits auto-migration to untouched sessions to avoid overriding active games. */
function isUntouchedSession(session: SerializableSession): boolean {
  return (
    session.turnLog.length === 0 &&
    session.past.length === 0 &&
    session.future.length === 0 &&
    session.present.historyCursor === 0
  );
}

/** Applies new rule defaults to stale untouched sessions saved with legacy defaults. */
function migrateLegacyRuleDefaults(
  session: SerializableSession,
): { session: SerializableSession; migrated: boolean } {
  if (!hasLegacyRuleDefaults(session.ruleConfig) || !isUntouchedSession(session)) {
    return { session, migrated: false };
  }

  return {
    session: {
      ...session,
      ruleConfig: withRuleDefaults(),
    },
    migrated: true,
  };
}

/** Loads session from browser storage and drops corrupted payloads. */
function loadSession(storage?: Storage): SerializableSession | null {
  if (!storage) {
    return null;
  }

  const candidateKeys = [SESSION_STORAGE_KEY, ...LEGACY_SESSION_STORAGE_KEYS];

  for (const storageKey of candidateKeys) {
    const serialized = storage.getItem(storageKey);

    if (!serialized) {
      continue;
    }

    try {
      const deserialized = deserializeSession(serialized);
      const { session, migrated } = migrateLegacyRuleDefaults(deserialized);

      if (storageKey !== SESSION_STORAGE_KEY || migrated) {
        persistSession(session, storage);
      }

      return session;
    } catch {
      storage.removeItem(storageKey);
    }
  }

  return null;
}

/** Returns fresh default session for first launch or reset fallback. */
function getDefaultSession(): SerializableSession {
  const ruleConfig = withRuleDefaults();
  const present = createInitialState(ruleConfig);

  return buildSession(ruleConfig, DEFAULT_PREFERENCES, present, [], [], []);
}

/** Rehydrates runtime game state and store slices from one serialized session. */
function createRuntimeState(session: SerializableSession): Pick<
  GameStoreData,
  'ruleConfig' | 'preferences' | 'gameState' | 'turnLog' | 'past' | 'future' | 'historyCursor'
> {
  const turnLog = session.turnLog.slice();
  const gameState = restoreGameState(session.present, turnLog);

  return {
    ruleConfig: session.ruleConfig,
    preferences: session.preferences,
    gameState,
    turnLog,
    past: session.past.slice(),
    future: session.future.slice(),
    historyCursor: session.present.historyCursor,
  };
}

/** Creates selection/interaction slice in one place to keep updates consistent. */
function createSelectionState(
  source: Coord | null,
  actionType: ActionKind | null,
  interaction: InteractionState,
  options: {
    legalTargets?: Coord[];
    draftJumpPath?: Coord[];
    availableActionKinds?: ActionKind[];
    selectedTargetMap?: TargetMap;
  } = {},
): Pick<
  GameStoreData,
  | 'selectedCell'
  | 'selectedActionType'
  | 'selectedTargetMap'
  | 'availableActionKinds'
  | 'interaction'
  | 'legalTargets'
  | 'draftJumpPath'
> {
  return {
    selectedCell: source,
    selectedActionType: actionType,
    selectedTargetMap: options.selectedTargetMap ?? createEmptyTargetMap(),
    availableActionKinds: options.availableActionKinds ?? [],
    interaction,
    legalTargets: options.legalTargets ?? [],
    draftJumpPath: options.draftJumpPath ?? [],
  };
}

/** Resets interaction state to neutral mode for current game status. */
function createIdleSelection(gameState: GameState): Pick<
  GameStoreData,
  | 'selectedCell'
  | 'selectedActionType'
  | 'selectedTargetMap'
  | 'availableActionKinds'
  | 'interaction'
  | 'legalTargets'
  | 'draftJumpPath'
> {
  return createSelectionState(
    null,
    null,
    gameState.status === 'gameOver' ? { type: 'gameOver' } : { type: 'idle' },
  );
}

/** Creates jump-only action buckets for forced continuation UI states. */
function createJumpOnlyTargetMap(targets: Coord[]): TargetMap {
  const targetMap = createEmptyTargetMap();
  targetMap.jumpSequence = targets.slice();
  return targetMap;
}

type JumpContinuationSelection = {
  source: Coord;
  targets: Coord[];
};

/** Detects whether the active player must continue a jump chain from the latest landing. */
function getJumpContinuationSelection(gameState: GameState): JumpContinuationSelection | null {
  if (gameState.status === 'gameOver') {
    return null;
  }

  const lastRecord = gameState.history.at(-1);

  if (!lastRecord || lastRecord.action.type !== 'jumpSequence' || lastRecord.actor !== gameState.currentPlayer) {
    return null;
  }

  const source = lastRecord.action.path.at(-1);

  if (!source) {
    return null;
  }

  const targets = uniqueValues(getJumpContinuationTargets(gameState, source, []));

  if (!targets.length) {
    return null;
  }

  return {
    source,
    targets,
  };
}

type StoreOptions = {
  initialSession?: SerializableSession;
  storage?: Storage;
};

/** Creates zustand store orchestrating UI interaction state and pure domain engine. */
export function createGameStore(options: StoreOptions = {}) {
  const storage =
    options.storage ??
    (typeof window !== 'undefined' ? window.localStorage : undefined);
  const initialSession =
    options.initialSession ?? loadSession(storage) ?? getDefaultSession();
  const initialRuntimeState = createRuntimeState(initialSession);

  let boardDerivationCache:
    | {
        key: string;
        selectableCoords: Coord[];
        scoreSummary: ScoreSummary | null;
      }
    | null = null;
  let cellDerivationCache:
    | {
        key: string;
        availableActionKinds: ActionKind[];
        selectedTargetMap: TargetMap;
      }
    | null = null;

  /** Computes board-level derived data once per position/config pair. */
  function getBoardDerivation(
    gameState: GameState,
    ruleConfig: RuleConfig,
  ): Pick<GameStoreData, 'selectableCoords' | 'scoreSummary'> {
    const key = `${hashPosition(gameState)}::${gameState.status}::${ruleConfigKey(ruleConfig)}`;

    if (boardDerivationCache?.key === key) {
      return boardDerivationCache;
    }

    const selectableCoords =
      gameState.status === 'gameOver'
        ? []
        : Object.keys(gameState.board).filter((coord) =>
            getLegalActionsForCell(gameState, coord as Coord, ruleConfig).length > 0,
          ) as Coord[];
    const scoreSummary = ruleConfig.scoringMode === 'basic' ? getScoreSummary(gameState) : null;

    boardDerivationCache = {
      key,
      selectableCoords,
      scoreSummary,
    };

    return boardDerivationCache;
  }

  /** Computes selected-cell actions once per position/config/cell triple. */
  function getCellDerivation(
    gameState: GameState,
    coord: Coord,
    ruleConfig: RuleConfig,
  ): Pick<GameStoreData, 'availableActionKinds' | 'selectedTargetMap'> {
    const key = `${hashPosition(gameState)}::${gameState.status}::${ruleConfigKey(ruleConfig)}::${coord}`;

    if (cellDerivationCache?.key === key) {
      return cellDerivationCache;
    }

    const actions = getLegalActionsForCell(gameState, coord, ruleConfig);
    const availableActionKinds = uniqueValues(actions.map((action) => action.type));
    const targetMap = buildTargetMap(actions);

    cellDerivationCache = {
      key,
      availableActionKinds,
      selectedTargetMap: targetMap,
    };

    return cellDerivationCache;
  }

  const initialBoardDerivation = getBoardDerivation(
    initialRuntimeState.gameState,
    initialRuntimeState.ruleConfig,
  );
  const initialJumpContinuation = getJumpContinuationSelection(initialRuntimeState.gameState);
  const initialInteraction: InteractionState = initialJumpContinuation
    ? {
        type: 'buildingJumpChain',
        source: initialJumpContinuation.source,
        path: [],
        availableTargets: initialJumpContinuation.targets,
      }
    : initialRuntimeState.gameState.status === 'gameOver'
      ? { type: 'gameOver' }
      : { type: 'idle' };

  const store = createStore<GameStoreState>((set, get) => {
    /** Persists current core session slices after state transitions. */
    function persistCurrentState(nextState: Pick<
      GameStoreData,
      'ruleConfig' | 'preferences' | 'gameState' | 'turnLog' | 'past' | 'future'
    >): void {
      persistSession(
        buildSession(
          nextState.ruleConfig,
          nextState.preferences,
          nextState.gameState,
          nextState.turnLog,
          nextState.past,
          nextState.future,
        ),
        storage,
      );
    }

    /** Commits one validated turn action through the domain reducer and updates app-level flow state. */
    function commitAction(action: TurnAction): void {
      const state = get();
      const nextGameState = applyAction(state.gameState, action, state.ruleConfig);
      const nextTurnLog = nextGameState.history;
      const nextPast = [...state.past, createUndoFrame(state.gameState)];
      const nextFuture: UndoFrame[] = [];
      const jumpContinuation = getJumpContinuationSelection(nextGameState);
      const nextInteraction: InteractionState = jumpContinuation
        ? {
            type: 'buildingJumpChain',
            source: jumpContinuation.source,
            path: [],
            availableTargets: jumpContinuation.targets,
          }
        : nextGameState.status === 'gameOver'
          ? { type: 'gameOver' }
          : state.preferences.passDeviceOverlayEnabled
            ? { type: 'passingDevice', nextPlayer: nextGameState.currentPlayer }
            : { type: 'turnResolved', nextPlayer: nextGameState.currentPlayer };
      const nextBoardDerivation = getBoardDerivation(nextGameState, state.ruleConfig);
      const nextData = {
        ruleConfig: state.ruleConfig,
        preferences: state.preferences,
        gameState: nextGameState,
        turnLog: nextTurnLog,
        past: nextPast,
        future: nextFuture,
        historyCursor: nextGameState.history.length,
        ...nextBoardDerivation,
      };

      set({
        ...nextData,
        ...(jumpContinuation
          ? createSelectionState(
              jumpContinuation.source,
              'jumpSequence',
              nextInteraction,
              {
                legalTargets: jumpContinuation.targets,
                draftJumpPath: [],
                availableActionKinds: ['jumpSequence'],
                selectedTargetMap: createJumpOnlyTargetMap(jumpContinuation.targets),
              },
            )
          : createSelectionState(null, null, nextInteraction)),
        importError: null,
      });
      persistCurrentState(nextData);

      // Skip pass overlay by briefly entering turnResolved and then immediately returning to idle.
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

    /** Replaces entire store session (used by import and initialization paths). */
    function applySession(session: SerializableSession): void {
      const runtimeState = createRuntimeState(session);
      const nextBoardDerivation = getBoardDerivation(runtimeState.gameState, runtimeState.ruleConfig);
      const jumpContinuation = getJumpContinuationSelection(runtimeState.gameState);

      set((current) => ({
        ...runtimeState,
        ...nextBoardDerivation,
        ...(jumpContinuation
          ? createSelectionState(
              jumpContinuation.source,
              'jumpSequence',
              {
                type: 'buildingJumpChain',
                source: jumpContinuation.source,
                path: [],
                availableTargets: jumpContinuation.targets,
              },
              {
                legalTargets: jumpContinuation.targets,
                draftJumpPath: [],
                availableActionKinds: ['jumpSequence'],
                selectedTargetMap: createJumpOnlyTargetMap(jumpContinuation.targets),
              },
            )
          : createIdleSelection(runtimeState.gameState)),
        importBuffer: '',
        importError: null,
        exportBuffer: current.exportBuffer,
      }));
      persistSession(session, storage);
    }

    /** Produces one undo/redo transition payload without mutating store state. */
    function getHistoryStepData(
      state: Pick<
        GameStoreData,
        'ruleConfig' | 'preferences' | 'gameState' | 'turnLog' | 'past' | 'future'
      >,
      direction: 'backward' | 'forward',
    ): Pick<
      GameStoreData,
      | 'ruleConfig'
      | 'preferences'
      | 'gameState'
      | 'turnLog'
      | 'past'
      | 'future'
      | 'historyCursor'
      | 'selectableCoords'
      | 'scoreSummary'
    > | null {
      if (direction === 'backward') {
        const previous = state.past.at(-1);

        if (!previous) {
          return null;
        }

        const previousGameState = restoreGameState(previous, state.turnLog);
        const nextPast = state.past.slice(0, -1);
        const nextFuture = [createUndoFrame(state.gameState), ...state.future];
        const nextBoardDerivation = getBoardDerivation(previousGameState, state.ruleConfig);

        return {
          ruleConfig: state.ruleConfig,
          preferences: state.preferences,
          gameState: previousGameState,
          turnLog: state.turnLog,
          past: nextPast,
          future: nextFuture,
          historyCursor: previous.historyCursor,
          ...nextBoardDerivation,
        };
      }

      const next = state.future[0];

      if (!next) {
        return null;
      }

      const nextGameState = restoreGameState(next, state.turnLog);
      const nextPast = [...state.past, createUndoFrame(state.gameState)];
      const nextFuture = state.future.slice(1);
      const nextBoardDerivation = getBoardDerivation(nextGameState, state.ruleConfig);

      return {
        ruleConfig: state.ruleConfig,
        preferences: state.preferences,
        gameState: nextGameState,
        turnLog: state.turnLog,
        past: nextPast,
        future: nextFuture,
        historyCursor: next.historyCursor,
        ...nextBoardDerivation,
      };
    }

    /** Applies a single backward/forward history step and persists state. */
    function applyHistoryStep(direction: 'backward' | 'forward'): boolean {
      const state = get();
      const nextData = getHistoryStepData(state, direction);

      if (!nextData) {
        return false;
      }

      set({
        ...nextData,
        ...createIdleSelection(nextData.gameState),
      });
      persistCurrentState(nextData);

      return true;
    }

    return {
      ...initialRuntimeState,
      ...initialBoardDerivation,
      selectedCell: initialJumpContinuation?.source ?? null,
      selectedActionType: initialJumpContinuation ? 'jumpSequence' : null,
      selectedTargetMap: initialJumpContinuation
        ? createJumpOnlyTargetMap(initialJumpContinuation.targets)
        : createEmptyTargetMap(),
      availableActionKinds: initialJumpContinuation ? ['jumpSequence'] : [],
      draftJumpPath: [],
      legalTargets: initialJumpContinuation?.targets ?? [],
      interaction: initialInteraction,
      importBuffer: '',
      importError: null,
      exportBuffer: '',
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
        const jumpContinuation = getJumpContinuationSelection(state.gameState);

        if (!jumpContinuation) {
          set(createIdleSelection(state.gameState));
          return;
        }

        set(
          createSelectionState(
            jumpContinuation.source,
            'jumpSequence',
            {
              type: 'buildingJumpChain',
              source: jumpContinuation.source,
              path: [],
              availableTargets: jumpContinuation.targets,
            },
            {
              legalTargets: jumpContinuation.targets,
              draftJumpPath: [],
              availableActionKinds: ['jumpSequence'],
              selectedTargetMap: createJumpOnlyTargetMap(jumpContinuation.targets),
            },
          ),
        );
      },
      chooseActionType: (actionType) => {
        const state = get();
        const source = state.selectedCell;

        if (!source || !state.availableActionKinds.includes(actionType)) {
          return;
        }

        if (actionType === 'manualUnfreeze') {
          commitAction({ type: 'manualUnfreeze', coord: source });
          return;
        }

        if (actionType === 'jumpSequence') {
          const firstTargets = uniqueValues(state.selectedTargetMap.jumpSequence);
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
              {
                legalTargets: firstTargets,
                draftJumpPath: [],
                availableActionKinds: state.availableActionKinds,
                selectedTargetMap: state.selectedTargetMap,
              },
            ),
          });
          return;
        }

        const actionTargets = uniqueValues(state.selectedTargetMap[actionType]);

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
            {
              legalTargets: actionTargets,
              availableActionKinds: state.availableActionKinds,
              selectedTargetMap: state.selectedTargetMap,
            },
          ),
        });
      },
      goToHistoryCursor: (targetCursor) => {
        const initialState = get();
        const normalizedTarget = Number.isInteger(targetCursor)
          ? Math.max(0, Math.min(targetCursor, initialState.turnLog.length))
          : initialState.historyCursor;

        if (normalizedTarget === initialState.historyCursor) {
          return;
        }

        const direction = normalizedTarget < initialState.historyCursor ? 'backward' : 'forward';

        while (get().historyCursor !== normalizedTarget) {
          const moved = applyHistoryStep(direction);

          if (!moved) {
            break;
          }
        }
      },
      importSessionFromBuffer: () => {
        const state = get();

        try {
          const session = deserializeSession(state.importBuffer);
          applySession(session);
        } catch {
          set({
            importError: 'importFailed',
          });
        }
      },
      redo: () => {
        applyHistoryStep('forward');
      },
      refreshExportBuffer: () => {
        const state = get();
        set({
          exportBuffer: serializeSession(
            buildSession(
              state.ruleConfig,
              state.preferences,
              state.gameState,
              state.turnLog,
              state.past,
              state.future,
            ),
            { pretty: true },
          ),
        });
      },
      restart: () => {
        const state = get();
        const nextGameState = createInitialState(state.ruleConfig);
        const nextBoardDerivation = getBoardDerivation(nextGameState, state.ruleConfig);
        const nextData = {
          ruleConfig: state.ruleConfig,
          preferences: state.preferences,
          gameState: nextGameState,
          turnLog: [],
          past: [],
          future: [],
          historyCursor: 0,
          ...nextBoardDerivation,
        };

        set({
          ...nextData,
          ...createIdleSelection(nextGameState),
          importBuffer: '',
          importError: null,
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
            // Jump actions resolve immediately one segment at a time.
            commitAction({
              type: 'jumpSequence',
              source: state.selectedCell,
              path: [coord],
            });
            return;
          }

          // Non-jump actions resolve immediately after selecting a legal target.
          commitAction({
            type: state.selectedActionType,
            source: state.selectedCell,
            target: coord,
          } as TurnAction);
          return;
        }

        if (
          state.selectedActionType === 'jumpSequence' &&
          state.selectedCell &&
          state.interaction.type === 'buildingJumpChain'
        ) {
          // While building a jump chain, ignore non-target clicks to avoid accidental resets.
          return;
        }

        const { availableActionKinds, selectedTargetMap } = getCellDerivation(
          state.gameState,
          coord,
          state.ruleConfig,
        );

        if (!availableActionKinds.length) {
          set(createIdleSelection(state.gameState));
          return;
        }

        set({
          ...createSelectionState(
            coord,
            null,
            {
              type: 'pieceSelected',
              source: coord,
              availableActions: availableActionKinds,
            },
            {
              availableActionKinds,
              selectedTargetMap,
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
          turnLog: state.turnLog,
          past: state.past,
          future: state.future,
        };

        set({
          preferences,
          interaction:
            !preferences.passDeviceOverlayEnabled && state.interaction.type === 'passingDevice'
              ? { type: 'idle' }
              : state.interaction,
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
              ...nextGameState,
              status: 'gameOver',
              victory,
            };
          }
        }

        // Rule toggles can immediately terminate active games (for example threefold draw on/off).
        const nextBoardDerivation = getBoardDerivation(nextGameState, ruleConfig);
        const nextData = {
          ruleConfig,
          preferences: state.preferences,
          gameState: nextGameState,
          turnLog: state.turnLog,
          past: state.past,
          future: state.future,
          historyCursor: nextGameState.history.length,
          ...nextBoardDerivation,
        };

        set({
          ...nextData,
          ...createIdleSelection(nextGameState),
        });
        persistCurrentState(nextData);
      },
      undo: () => {
        applyHistoryStep('backward');
      },
    };
  });

  return store;
}
