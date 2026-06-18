import {
  checkVictory,
  createInitialState,
  createUndoFrame,
  deserializeSession,
  restoreGameState,
  serializeSession,
  withRuleDefaults,
} from '@/domain';

import { createAiBehaviorProfile } from '@/ai/behavior';
import { getRuleConfigForNewMatch } from '@/app/store/createGameStore/match';
import {
  beginSeriesGameResolution,
  chooseNextSeriesColor,
  createSeriesState,
  matchSettingsForSeriesColors,
  reopenGameForFinishing,
  startNextSeriesGame,
} from '@/app/store/createGameStore/series';
import { buildSessionFromSlices } from '@/app/store/createGameStore/session';
import { createIdleSelection } from '@/app/store/createGameStore/selection';
import type { GameStoreState } from '@/app/store/createGameStore/types';

import type { PublicActionsOptions } from '@/app/store/createGameStore/publicActionTypes';

/** Creates public actions that mutate persisted session, rules, and setup state. */
export function createSessionActions({
  applySession,
  beginFreshFullSession,
  consumeStartupHydrationOnMutation,
  createSessionId,
  disposeAiWorker,
  get,
  getBoardDerivation,
  persistCurrentState,
  random,
  resetAiState,
  set,
  syncComputerTurn,
}: PublicActionsOptions): Pick<
  GameStoreState,
  | 'chooseNextSeriesColor'
  | 'importSessionFromBuffer'
  | 'refreshExportBuffer'
  | 'restart'
  | 'setGameFormat'
  | 'setImportBuffer'
  | 'setPreference'
  | 'setRuleConfig'
  | 'setSetupMatchSettings'
  | 'startNewGame'
  | 'startNextSeriesGame'
> {
  function resolveAutomaticComputerColor(
    seriesState: NonNullable<GameStoreState['seriesState']>,
    matchSettings: GameStoreState['matchSettings'],
  ) {
    if (
      seriesState.phase === 'betweenGames' &&
      seriesState.colorChooser === 'second' &&
      matchSettings.opponentMode === 'computer'
    ) {
      return chooseNextSeriesColor(
        seriesState,
        'second',
        random() < 0.5 ? 'white' : 'black',
      );
    }

    return seriesState;
  }

  return {
    chooseNextSeriesColor: (color) => {
      const state = get();
      const chooser = state.seriesState?.colorChooser;

      if (!state.seriesState || !chooser) {
        return;
      }

      const seriesState = chooseNextSeriesColor(
        state.seriesState,
        chooser,
        color,
      );
      const matchSettings = matchSettingsForSeriesColors(
        state.matchSettings,
        seriesState,
      );
      const nextData = {
        ruleConfig: state.ruleConfig,
        preferences: state.preferences,
        matchSettings,
        aiBehaviorProfile: state.aiBehaviorProfile,
        seriesState,
        gameState: state.gameState,
        turnLog: state.turnLog,
        past: state.past,
        future: state.future,
      };

      set({ matchSettings, seriesState });
      persistCurrentState(nextData);
    },
    importSessionFromBuffer: () => {
      const state = get();

      try {
        const session = deserializeSession(state.importBuffer);
        const nextHistoryHydrationStatus = beginFreshFullSession();
        applySession(session, {
          historyHydrationStatus: nextHistoryHydrationStatus,
        });
      } catch {
        set({
          importError: 'importFailed',
        });
      }
    },
    refreshExportBuffer: () => {
      const state = get();
      set({
        exportBuffer: serializeSession(buildSessionFromSlices(state), {
          pretty: true,
        }),
      });
    },
    restart: () => {
      disposeAiWorker();
      const state = get();

      if (state.seriesState && state.seriesState.phase !== 'playing') {
        return;
      }

      const nextHistoryHydrationStatus = consumeStartupHydrationOnMutation();
      const nextGameState = createInitialState(state.ruleConfig);
      const nextData = {
        ruleConfig: state.ruleConfig,
        preferences: state.preferences,
        matchSettings: state.matchSettings,
        aiBehaviorProfile: state.aiBehaviorProfile,
        seriesState: state.seriesState,
        gameState: nextGameState,
        turnLog: [],
        past: [],
        future: [],
        historyCursor: 0,
        ...getBoardDerivation(nextGameState, state.ruleConfig),
      };

      set({
        ...nextData,
        historyHydrationStatus: nextHistoryHydrationStatus,
        ...createIdleSelection(nextGameState),
        ...resetAiState(),
      });
      persistCurrentState(nextData);
      syncComputerTurn();
    },
    setGameFormat: (format) => {
      disposeAiWorker();
      const state = get();

      if (format === state.matchSettings.gameFormat) {
        return;
      }

      if (format === 'single') {
        if (!state.seriesState || state.seriesState.gameNumber !== 1) {
          return;
        }

        const checkpoint =
          state.seriesState.phase === 'playing'
            ? null
            : state.seriesState.gameOneCheckpoint;
        const turnLog = checkpoint
          ? state.turnLog.slice(0, checkpoint.historyCursor)
          : state.turnLog;
        const gameState = checkpoint
          ? restoreGameState(checkpoint, turnLog)
          : state.gameState;
        const matchSettings = {
          ...state.matchSettings,
          gameFormat: 'single' as const,
        };
        const nextData = {
          ruleConfig: state.ruleConfig,
          preferences: state.preferences,
          matchSettings,
          aiBehaviorProfile: state.aiBehaviorProfile,
          seriesState: null,
          gameState,
          turnLog,
          past: checkpoint
            ? state.past.filter(
                (frame) => frame.historyCursor < checkpoint.historyCursor,
              )
            : state.past,
          future: [],
          historyCursor: gameState.history.length,
          ...getBoardDerivation(gameState, state.ruleConfig),
        };

        set({
          ...nextData,
          ...createIdleSelection(gameState),
          interaction:
            gameState.status === 'gameOver'
              ? { type: 'gameOver' }
              : { type: 'idle' },
          ...resetAiState(),
        });
        persistCurrentState(nextData);
        syncComputerTurn();
        return;
      }

      let matchSettings: GameStoreState['matchSettings'] = {
        ...state.matchSettings,
        gameFormat: 'series' as const,
        targetPoints: Math.max(
          1,
          Math.trunc(state.setupMatchSettings.targetPoints),
        ),
      };
      let seriesState = createSeriesState(matchSettings);
      let gameState = state.gameState;

      if (
        gameState.status === 'gameOver' &&
        gameState.victory.type !== 'none'
      ) {
        seriesState = beginSeriesGameResolution(
          seriesState,
          gameState.victory,
          createUndoFrame(gameState),
        );
        seriesState = resolveAutomaticComputerColor(seriesState, matchSettings);

        if (seriesState.phase === 'finishing') {
          gameState = reopenGameForFinishing(gameState, seriesState);
        }
      }

      matchSettings = matchSettingsForSeriesColors(matchSettings, seriesState);
      const nextData = {
        ruleConfig: state.ruleConfig,
        preferences: state.preferences,
        matchSettings,
        aiBehaviorProfile: state.aiBehaviorProfile,
        seriesState,
        gameState,
        turnLog: gameState.history,
        past: state.past,
        future: [],
        historyCursor: gameState.history.length,
        ...getBoardDerivation(gameState, state.ruleConfig),
      };

      set({
        ...nextData,
        ...createIdleSelection(gameState),
        interaction:
          gameState.status === 'gameOver'
            ? { type: 'gameOver' }
            : { type: 'idle' },
        ...resetAiState(),
      });
      persistCurrentState(nextData);
      syncComputerTurn();
    },
    setImportBuffer: (value) => {
      set({ importBuffer: value });
    },
    setPreference: (partial) => {
      const state = get();
      const nextHistoryHydrationStatus = consumeStartupHydrationOnMutation();
      const preferences = {
        ...state.preferences,
        ...partial,
      };
      const nextData = {
        ruleConfig: state.ruleConfig,
        preferences,
        matchSettings: state.matchSettings,
        aiBehaviorProfile: state.aiBehaviorProfile,
        seriesState: state.seriesState,
        gameState: state.gameState,
        turnLog: state.turnLog,
        past: state.past,
        future: state.future,
      };

      set({
        historyHydrationStatus: nextHistoryHydrationStatus,
        preferences,
        interaction:
          !preferences.passDeviceOverlayEnabled &&
          state.interaction.type === 'passingDevice'
            ? { type: 'idle' }
            : state.interaction,
      });
      persistCurrentState(nextData);
    },
    setRuleConfig: (partial) => {
      disposeAiWorker();
      const state = get();
      const nextHistoryHydrationStatus = consumeStartupHydrationOnMutation();
      const ruleConfig = withRuleDefaults({
        ...state.ruleConfig,
        ...partial,
      });
      let nextGameState = state.gameState;
      let seriesState = state.seriesState;
      let matchSettings = state.matchSettings;

      if (
        nextGameState.status === 'active' &&
        seriesState?.phase !== 'finishing'
      ) {
        const victory = checkVictory(nextGameState, ruleConfig);

        if (victory.type !== 'none') {
          nextGameState = {
            ...nextGameState,
            pendingJump: null,
            status: 'gameOver',
            victory,
          };

          if (seriesState?.phase === 'playing') {
            seriesState = beginSeriesGameResolution(
              seriesState,
              victory,
              createUndoFrame(nextGameState),
            );
            seriesState = resolveAutomaticComputerColor(
              seriesState,
              matchSettings,
            );

            if (seriesState.phase === 'finishing') {
              nextGameState = reopenGameForFinishing(
                nextGameState,
                seriesState,
              );
            }

            matchSettings = matchSettingsForSeriesColors(
              matchSettings,
              seriesState,
            );
          }
        }
      }

      const nextData = {
        ruleConfig,
        preferences: state.preferences,
        matchSettings,
        aiBehaviorProfile: state.aiBehaviorProfile,
        seriesState,
        gameState: nextGameState,
        turnLog: state.turnLog,
        past: state.past,
        future: state.future,
        historyCursor: nextGameState.history.length,
        ...getBoardDerivation(nextGameState, ruleConfig),
      };

      set({
        ...nextData,
        historyHydrationStatus: nextHistoryHydrationStatus,
        ...createIdleSelection(nextGameState),
        ...resetAiState(),
      });
      persistCurrentState(nextData);
      syncComputerTurn();
    },
    setSetupMatchSettings: (partial) => {
      const state = get();

      set({
        setupMatchSettings: {
          ...state.setupMatchSettings,
          ...partial,
        },
      });
    },
    startNewGame: (matchSettings = get().setupMatchSettings) => {
      disposeAiWorker();
      const state = get();
      const nextHistoryHydrationStatus = beginFreshFullSession();
      const normalizedMatchSettings = {
        ...matchSettings,
        targetPoints: Math.max(1, Math.trunc(matchSettings.targetPoints)),
      };
      const nextRuleConfig = getRuleConfigForNewMatch(
        state.ruleConfig,
        normalizedMatchSettings,
      );
      const nextGameState = createInitialState(nextRuleConfig);
      // The hidden persona stays stable for one match so resumed saves remain consistent.
      const aiBehaviorProfile =
        normalizedMatchSettings.opponentMode === 'computer'
          ? createAiBehaviorProfile(createSessionId())
          : null;
      const seriesState =
        normalizedMatchSettings.gameFormat === 'series'
          ? createSeriesState(normalizedMatchSettings)
          : null;
      const nextData = {
        ruleConfig: nextRuleConfig,
        preferences: state.preferences,
        matchSettings: normalizedMatchSettings,
        aiBehaviorProfile,
        seriesState,
        gameState: nextGameState,
        turnLog: [],
        past: [],
        future: [],
        historyCursor: 0,
        ...getBoardDerivation(nextGameState, nextRuleConfig),
      };

      set({
        ...nextData,
        historyHydrationStatus: nextHistoryHydrationStatus,
        ...createIdleSelection(nextGameState),
        ...resetAiState(),
        importBuffer: '',
        importError: null,
        lastAiDecision: null,
        aiBehaviorProfile,
        setupMatchSettings: normalizedMatchSettings,
      });
      persistCurrentState(nextData);
      syncComputerTurn();
    },
    startNextSeriesGame: () => {
      disposeAiWorker();
      const state = get();

      if (!state.seriesState) {
        return;
      }

      const seriesState = startNextSeriesGame(state.seriesState);
      const matchSettings = matchSettingsForSeriesColors(
        state.matchSettings,
        seriesState,
      );
      const nextGameState = createInitialState(state.ruleConfig);
      const nextData = {
        ruleConfig: state.ruleConfig,
        preferences: state.preferences,
        matchSettings,
        aiBehaviorProfile: state.aiBehaviorProfile,
        seriesState,
        gameState: nextGameState,
        turnLog: [],
        past: [],
        future: [],
        historyCursor: 0,
        ...getBoardDerivation(nextGameState, state.ruleConfig),
      };

      set({
        ...nextData,
        ...createIdleSelection(nextGameState),
        ...resetAiState(),
        lastAiDecision: null,
      });
      persistCurrentState(nextData);
      syncComputerTurn();
    },
  };
}
