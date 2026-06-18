import { DEFAULT_MATCH_SETTINGS } from '@/shared/constants/match';
import type {
  DeserializedSession,
  SerializableSession,
  SerializableSessionV1,
  SerializableSessionV2,
  SerializableSessionV3,
  SerializableSessionV4,
  SerializableSessionV5,
} from '@/shared/types/session';
import { isRecord } from '@/shared/utils/collections';

import { createUndoFrame } from '@/domain/serialization/session/frames';
import {
  assertAiBehaviorProfile,
  assertMatchSettings,
  assertPreferences,
  assertRuleConfig,
  assertSeriesState,
} from '@/domain/serialization/session/guards';
import {
  assertGameState,
  assertGameStates,
  assertTurnLog,
  assertUndoFrame,
  assertValidFrame,
  getCanonicalTurnLog,
} from '@/domain/serialization/session/normalization';

/** Converts legacy session payloads into the v5 storage shape. */
function migrateSession(
  session:
    | SerializableSessionV1
    | SerializableSessionV2
    | SerializableSessionV3
    | SerializableSessionV4,
): SerializableSession {
  const turnLog =
    session.version === 1
      ? getCanonicalTurnLog([
          session.present,
          ...session.past,
          ...session.future,
        ])
      : session.turnLog;
  const present =
    session.version === 1 ? createUndoFrame(session.present) : session.present;
  const past =
    session.version === 1 ? session.past.map(createUndoFrame) : session.past;
  const future =
    session.version === 1
      ? session.future.map(createUndoFrame)
      : session.future;

  return {
    version: 5,
    ruleConfig: session.ruleConfig,
    preferences: session.preferences,
    matchSettings:
      session.version === 3 || session.version === 4
        ? session.matchSettings
        : DEFAULT_MATCH_SETTINGS,
    aiBehaviorProfile: session.version === 4 ? session.aiBehaviorProfile : null,
    seriesState: null,
    turnLog,
    present,
    past,
    future,
  };
}

/** Runtime guard for full v5 session payload. */
function assertSessionV5(value: unknown): SerializableSessionV5 {
  if (!isRecord(value) || value.version !== 5) {
    throw new Error('Unsupported session payload.');
  }

  const turnLog = assertTurnLog(value.turnLog);
  const present = assertValidFrame(
    assertUndoFrame(value.present, turnLog.length),
    turnLog,
  );

  if (!Array.isArray(value.past) || !Array.isArray(value.future)) {
    throw new Error('Invalid session history frames.');
  }

  return {
    version: 5,
    ruleConfig: assertRuleConfig(value.ruleConfig),
    preferences: assertPreferences(value.preferences),
    matchSettings: assertMatchSettings(value.matchSettings),
    aiBehaviorProfile: assertAiBehaviorProfile(value.aiBehaviorProfile),
    seriesState: assertSeriesState(value.seriesState),
    turnLog,
    present,
    past: value.past.map((entry) =>
      assertValidFrame(assertUndoFrame(entry, turnLog.length), turnLog),
    ),
    future: value.future.map((entry) =>
      assertValidFrame(assertUndoFrame(entry, turnLog.length), turnLog),
    ),
  };
}

/** Runtime guard for full v1 session payload. */
function assertLegacySession(value: unknown): SerializableSessionV1 {
  if (!isRecord(value) || value.version !== 1) {
    throw new Error('Unsupported session payload.');
  }

  return {
    version: 1,
    ruleConfig: assertRuleConfig(value.ruleConfig),
    preferences: assertPreferences(value.preferences),
    present: assertGameState(value.present),
    past: assertGameStates(value.past),
    future: assertGameStates(value.future),
  };
}

/** Runtime guard for full v2 session payload. */
function assertSessionV2(value: unknown): SerializableSessionV2 {
  if (!isRecord(value) || value.version !== 2) {
    throw new Error('Unsupported session payload.');
  }

  const turnLog = assertTurnLog(value.turnLog);
  const present = assertValidFrame(
    assertUndoFrame(value.present, turnLog.length),
    turnLog,
  );

  if (!Array.isArray(value.past) || !Array.isArray(value.future)) {
    throw new Error('Invalid session history frames.');
  }

  return {
    version: 2,
    ruleConfig: assertRuleConfig(value.ruleConfig),
    preferences: assertPreferences(value.preferences),
    turnLog,
    present,
    past: value.past.map((entry) =>
      assertValidFrame(assertUndoFrame(entry, turnLog.length), turnLog),
    ),
    future: value.future.map((entry) =>
      assertValidFrame(assertUndoFrame(entry, turnLog.length), turnLog),
    ),
  };
}

/** Runtime guard for full v3 session payload. */
function assertSessionV3(value: unknown): SerializableSessionV3 {
  if (!isRecord(value) || value.version !== 3) {
    throw new Error('Unsupported session payload.');
  }

  const turnLog = assertTurnLog(value.turnLog);
  const present = assertValidFrame(
    assertUndoFrame(value.present, turnLog.length),
    turnLog,
  );

  if (!Array.isArray(value.past) || !Array.isArray(value.future)) {
    throw new Error('Invalid session history frames.');
  }

  return {
    version: 3,
    ruleConfig: assertRuleConfig(value.ruleConfig),
    preferences: assertPreferences(value.preferences),
    matchSettings: assertMatchSettings(value.matchSettings),
    turnLog,
    present,
    past: value.past.map((entry) =>
      assertValidFrame(assertUndoFrame(entry, turnLog.length), turnLog),
    ),
    future: value.future.map((entry) =>
      assertValidFrame(assertUndoFrame(entry, turnLog.length), turnLog),
    ),
  };
}

/** Runtime guard for full v4 session payload. */
function assertSessionV4(value: unknown): SerializableSessionV4 {
  if (!isRecord(value) || value.version !== 4) {
    throw new Error('Unsupported session payload.');
  }

  const turnLog = assertTurnLog(value.turnLog);
  const present = assertValidFrame(
    assertUndoFrame(value.present, turnLog.length),
    turnLog,
  );

  if (!Array.isArray(value.past) || !Array.isArray(value.future)) {
    throw new Error('Invalid session history frames.');
  }

  return {
    version: 4,
    ruleConfig: assertRuleConfig(value.ruleConfig),
    preferences: assertPreferences(value.preferences),
    matchSettings: assertMatchSettings(value.matchSettings),
    aiBehaviorProfile: assertAiBehaviorProfile(value.aiBehaviorProfile),
    turnLog,
    present,
    past: value.past.map((entry) =>
      assertValidFrame(assertUndoFrame(entry, turnLog.length), turnLog),
    ),
    future: value.future.map((entry) =>
      assertValidFrame(assertUndoFrame(entry, turnLog.length), turnLog),
    ),
  };
}

/** Deserializes session JSON and normalizes every payload to the v5 session shape. */
export function deserializeSession(serialized: string): SerializableSession {
  const parsed = JSON.parse(serialized) as unknown;
  const session: DeserializedSession =
    isRecord(parsed) && parsed.version === 1
      ? assertLegacySession(parsed)
      : isRecord(parsed) && parsed.version === 2
        ? assertSessionV2(parsed)
        : isRecord(parsed) && parsed.version === 3
          ? assertSessionV3(parsed)
          : isRecord(parsed) && parsed.version === 4
            ? assertSessionV4(parsed)
            : assertSessionV5(parsed);

  return session.version === 5 ? session : migrateSession(session);
}
