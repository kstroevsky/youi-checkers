import { deserializeSession } from '@/domain';
import type { SerializableSession, UndoFrame } from '@/shared/types/session';
import { isRecord } from '@/shared/utils/collections';

export const LOCAL_HISTORY_WINDOW = 15;
export const PERSISTED_SESSION_ENVELOPE_VERSION = 1;

export type PersistedSessionKind = 'compact' | 'full';

export type PersistedSessionEnvelope<K extends PersistedSessionKind = PersistedSessionKind> = {
  version: typeof PERSISTED_SESSION_ENVELOPE_VERSION;
  sessionId: string;
  revision: number;
  kind: K;
  session: SerializableSession;
};

function cloneUndoFrame(frame: UndoFrame): UndoFrame {
  return {
    snapshot: frame.snapshot,
    positionCounts: { ...frame.positionCounts },
    historyCursor: frame.historyCursor,
  };
}

export function cloneSession(session: SerializableSession): SerializableSession {
  return {
    ...session,
    turnLog: session.turnLog.slice(),
    present: cloneUndoFrame(session.present),
    past: session.past.map(cloneUndoFrame),
    future: session.future.map(cloneUndoFrame),
  };
}

function rebaseUndoFrame(frame: UndoFrame, windowStart: number): UndoFrame {
  return {
    ...cloneUndoFrame(frame),
    historyCursor: frame.historyCursor - windowStart,
  };
}

/** Builds a standalone recent-history window that still supports local undo/redo. */
export function createCompactSession(
  session: SerializableSession,
  maxTurnRecords = LOCAL_HISTORY_WINDOW,
): SerializableSession {
  const windowSize = Math.max(1, maxTurnRecords);
  const totalTurns = session.turnLog.length;

  if (totalTurns <= windowSize) {
    return cloneSession(session);
  }

  const cursor = session.present.historyCursor;
  let windowStart = Math.max(0, cursor - Math.floor(windowSize / 2));
  const windowEnd = Math.min(totalTurns, windowStart + windowSize);

  windowStart = Math.max(0, windowEnd - windowSize);

  return {
    ...session,
    turnLog: session.turnLog.slice(windowStart, windowEnd),
    present: {
      ...cloneUndoFrame(session.present),
      historyCursor: cursor - windowStart,
    },
    past: session.past
      .filter((frame) => frame.historyCursor >= windowStart && frame.historyCursor < cursor)
      .map((frame) => rebaseUndoFrame(frame, windowStart)),
    future: session.future
      .filter((frame) => frame.historyCursor > cursor && frame.historyCursor <= windowEnd)
      .map((frame) => rebaseUndoFrame(frame, windowStart)),
  };
}

export function createPersistedSessionEnvelope<K extends PersistedSessionKind>(
  kind: K,
  sessionId: string,
  revision: number,
  session: SerializableSession,
): PersistedSessionEnvelope<K> {
  return {
    version: PERSISTED_SESSION_ENVELOPE_VERSION,
    sessionId,
    revision,
    kind,
    session,
  };
}

export function serializePersistedSessionEnvelope(
  envelope: PersistedSessionEnvelope,
): string {
  return JSON.stringify(envelope);
}

/** Validates persisted session envelopes without changing import/export session JSON shape. */
export function deserializePersistedSessionEnvelope(
  serialized: string,
): PersistedSessionEnvelope {
  const parsed = JSON.parse(serialized) as unknown;
  const revision =
    isRecord(parsed) && typeof parsed.revision === 'number' ? parsed.revision : null;

  if (
    !isRecord(parsed) ||
    parsed.version !== PERSISTED_SESSION_ENVELOPE_VERSION ||
    (parsed.kind !== 'compact' && parsed.kind !== 'full') ||
    typeof parsed.sessionId !== 'string' ||
    parsed.sessionId.length === 0 ||
    revision === null ||
    !Number.isInteger(revision) ||
    revision < 0
  ) {
    throw new Error('Invalid persisted session envelope.');
  }

  return {
    version: PERSISTED_SESSION_ENVELOPE_VERSION,
    sessionId: parsed.sessionId,
    revision,
    kind: parsed.kind,
    session: deserializeSession(JSON.stringify(parsed.session)),
  };
}
