import {
  createInitialState,
  createUndoFrame,
  restoreGameState,
  withRuleDefaults,
} from '@/domain';
import { DEFAULT_MATCH_SETTINGS } from '@/shared/constants/match';
import type {
  AiBehaviorProfile,
  AppPreferences,
  SerializableSession,
  SeriesState,
} from '@/shared/types/session';
import type { GameState, RuleConfig, TurnRecord } from '@/domain';

import { DEFAULT_PREFERENCES } from '@/app/store/createGameStore/constants';
import type {
  GameStoreData,
  SessionSlices,
} from '@/app/store/createGameStore/types';

/** Generates a session identifier compatible with browsers and tests. */
export function createSessionId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Builds the serializable session representation from the core runtime slices. */
export function buildSession(
  ruleConfig: RuleConfig,
  preferences: AppPreferences,
  matchSettings: typeof DEFAULT_MATCH_SETTINGS,
  aiBehaviorProfile: AiBehaviorProfile | null,
  seriesState: SeriesState | null,
  present: GameState,
  turnLog: TurnRecord[],
  past: SessionSlices['past'],
  future: SessionSlices['future'],
): SerializableSession {
  return {
    version: 5,
    ruleConfig,
    preferences,
    matchSettings,
    aiBehaviorProfile,
    seriesState,
    turnLog,
    present: createUndoFrame(present),
    past,
    future,
  };
}

/** Returns a fresh in-memory session for first launch or a full reset. */
export function getDefaultSession(): SerializableSession {
  const ruleConfig = withRuleDefaults();
  const present = createInitialState(ruleConfig);

  return buildSession(
    ruleConfig,
    DEFAULT_PREFERENCES,
    DEFAULT_MATCH_SETTINGS,
    null,
    null,
    present,
    [],
    [],
    [],
  );
}

/** Rehydrates the runtime store fields from one serialized session snapshot. */
export function createRuntimeState(
  session: SerializableSession,
): Pick<
  GameStoreData,
  | 'ruleConfig'
  | 'preferences'
  | 'matchSettings'
  | 'aiBehaviorProfile'
  | 'seriesState'
  | 'setupMatchSettings'
  | 'gameState'
  | 'turnLog'
  | 'past'
  | 'future'
  | 'historyCursor'
> {
  const turnLog = session.turnLog.slice();
  const gameState = restoreGameState(session.present, turnLog);

  return {
    ruleConfig: session.ruleConfig,
    preferences: session.preferences,
    matchSettings: session.matchSettings,
    aiBehaviorProfile: session.aiBehaviorProfile,
    seriesState: session.seriesState,
    setupMatchSettings: session.matchSettings,
    gameState,
    turnLog,
    past: session.past.slice(),
    future: session.future.slice(),
    historyCursor: session.present.historyCursor,
  };
}

/** Selects the session fields that must stay in sync with persistence. */
export function getSessionSlices(
  state: Pick<
    GameStoreData,
    | 'ruleConfig'
    | 'preferences'
    | 'matchSettings'
    | 'aiBehaviorProfile'
    | 'seriesState'
    | 'gameState'
    | 'turnLog'
    | 'past'
    | 'future'
  >,
): SessionSlices {
  return {
    ruleConfig: state.ruleConfig,
    preferences: state.preferences,
    matchSettings: state.matchSettings,
    aiBehaviorProfile: state.aiBehaviorProfile,
    seriesState: state.seriesState,
    gameState: state.gameState,
    turnLog: state.turnLog,
    past: state.past,
    future: state.future,
  };
}

/** Creates a persisted session payload from already assembled core store slices. */
export function buildSessionFromSlices(
  nextState: SessionSlices,
): SerializableSession {
  return buildSession(
    nextState.ruleConfig,
    nextState.preferences,
    nextState.matchSettings,
    nextState.aiBehaviorProfile,
    nextState.seriesState,
    nextState.gameState,
    nextState.turnLog,
    nextState.past,
    nextState.future,
  );
}
