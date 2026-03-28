import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createGameStore } from '@/app/store/createGameStore';
import { createAiBehaviorProfile } from '@/ai/behavior';
import {
  createCompactSession,
  createPersistedSessionEnvelope,
  deserializePersistedSessionEnvelope,
  serializePersistedSessionEnvelope,
} from '@/app/store/sessionPersistence';
import { applyAction, createInitialState, deserializeSession, serializeSession } from '@/domain';
import { LEGACY_SESSION_STORAGE_KEYS, SESSION_STORAGE_KEY } from '@/shared/constants/storage';
import { createSession, resetFactoryIds } from '@/test/factories';

import {
  createDeferred,
  createHistorySession,
  createMemoryStorage,
  FakeArchive,
} from '@/app/store/createGameStore.testUtils';
import { undoFrame } from '@/test/factories';

describe('createGameStore persistence', () => {
  beforeEach(() => {
    resetFactoryIds();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses updated default rule toggles and pass-device preference in a fresh store', () => {
    const store = createGameStore({
      storage: undefined,
    });

    expect(store.getState().ruleConfig).toEqual({
      allowNonAdjacentFriendlyStackTransfer: false,
      drawRule: 'none',
      scoringMode: 'basic',
    });
    expect(store.getState().preferences.passDeviceOverlayEnabled).toBe(true);
  });

  it('applies missing rule fields from defaults while deserializing sessions', () => {
    const baseSession = createSession(createInitialState());
    const sessionWithPartialRuleConfig = {
      ...baseSession,
      ruleConfig: {
        scoringMode: 'off',
      },
    };
    const deserialized = deserializeSession(JSON.stringify(sessionWithPartialRuleConfig));

    expect(deserialized.ruleConfig).toEqual({
      allowNonAdjacentFriendlyStackTransfer: false,
      drawRule: 'none',
      scoringMode: 'off',
    });
  });

  it('migrates untouched legacy persisted defaults to updated OFF/OFF/ON defaults', async () => {
    const legacySession = createSession(createInitialState(), {
      ruleConfig: {
        allowNonAdjacentFriendlyStackTransfer: true,
        drawRule: 'threefold',
        scoringMode: 'basic',
      },
    });
    const storage = createMemoryStorage({
      [LEGACY_SESSION_STORAGE_KEYS[0]]: serializeSession(legacySession),
    });
    const store = createGameStore({ storage });

    await Promise.resolve();

    const persisted = storage.getItem(SESSION_STORAGE_KEY);
    const envelope = persisted ? deserializePersistedSessionEnvelope(String(persisted)) : null;

    expect(store.getState().ruleConfig).toEqual({
      allowNonAdjacentFriendlyStackTransfer: false,
      drawRule: 'none',
      scoringMode: 'basic',
    });
    expect(envelope).not.toBeNull();
    expect(envelope?.session.ruleConfig).toEqual({
      allowNonAdjacentFriendlyStackTransfer: false,
      drawRule: 'none',
      scoringMode: 'basic',
    });
  });

  it('keeps legacy rule choices when session already has game history', () => {
    const config = {
      allowNonAdjacentFriendlyStackTransfer: true,
      drawRule: 'threefold',
      scoringMode: 'basic',
    } as const;
    const state0 = createInitialState(config);
    const state1 = applyAction(state0, { type: 'climbOne', source: 'A1', target: 'B2' }, config);
    const legacySession = createSession(state1, {
      ruleConfig: config,
      turnLog: state1.history,
      past: [undoFrame(state0)],
    });
    const storage = createMemoryStorage({
      [LEGACY_SESSION_STORAGE_KEYS[0]]: serializeSession(legacySession),
    });
    const store = createGameStore({ storage });

    expect(store.getState().ruleConfig).toEqual(config);
  });

  it('keeps export JSON stale until explicitly refreshed', () => {
    const store = createGameStore({
      initialSession: createSession(createInitialState()),
      storage: undefined,
    });

    expect(store.getState().exportBuffer).toBe('');

    store.getState().refreshExportBuffer();
    const initialExport = store.getState().exportBuffer;

    expect(initialExport).toContain('\n');
    expect(initialExport).toContain('"version": 4');

    store.getState().setImportBuffer('{"draft": true}');
    expect(store.getState().exportBuffer).toBe(initialExport);

    store.getState().setPreference({ language: 'english' });
    expect(store.getState().exportBuffer).toBe(initialExport);

    store.getState().refreshExportBuffer();

    expect(store.getState().exportBuffer).not.toBe(initialExport);
  });

  it('persists and restores the hidden AI behavior profile for computer matches', async () => {
    const storage = createMemoryStorage();
    const store = createGameStore({
      createSessionId: () => 'seed-a',
      storage,
    });

    store.getState().startNewGame({
      opponentMode: 'computer',
      humanPlayer: 'white',
      aiDifficulty: 'medium',
    });

    const expectedProfile = createAiBehaviorProfile('seed-a');
    const persisted = storage.getItem(SESSION_STORAGE_KEY);
    const envelope = persisted ? deserializePersistedSessionEnvelope(persisted) : null;

    expect(store.getState().aiBehaviorProfile).toEqual(expectedProfile);
    expect(envelope?.session.aiBehaviorProfile).toEqual(expectedProfile);

    const restoredStore = createGameStore({ storage });

    await Promise.resolve();

    expect(restoredStore.getState().aiBehaviorProfile).toEqual(expectedProfile);
  });

  it('hydrates full archived history over a compact local session', async () => {
    const { session } = createHistorySession(18);
    const sessionId = 'archive-hydrate';
    const revision = 4;
    const compact = createCompactSession(session);
    const archive = new FakeArchive(async () =>
      createPersistedSessionEnvelope('full', sessionId, revision, session),
    );
    const storage = createMemoryStorage({
      [SESSION_STORAGE_KEY]: serializePersistedSessionEnvelope(
        createPersistedSessionEnvelope('compact', sessionId, revision, compact),
      ),
    });
    const store = createGameStore({ archive, storage });

    expect(store.getState().historyHydrationStatus).toBe('hydrating');
    expect(store.getState().turnLog).toHaveLength(compact.turnLog.length);

    await Promise.resolve();
    await Promise.resolve();

    expect(store.getState().historyHydrationStatus).toBe('full');
    expect(store.getState().turnLog).toHaveLength(session.turnLog.length);
    expect(store.getState().historyCursor).toBe(session.present.historyCursor);
  });

  it('ignores stale archive hydration after the compact session changes locally', async () => {
    const { session } = createHistorySession(18);
    const sessionId = 'archive-stale';
    const revision = 7;
    const compact = createCompactSession(session);
    const loadDeferred = createDeferred<Awaited<ReturnType<FakeArchive['loadLatest']>>>();
    const archive = new FakeArchive(() => loadDeferred.promise);
    const storage = createMemoryStorage({
      [SESSION_STORAGE_KEY]: serializePersistedSessionEnvelope(
        createPersistedSessionEnvelope('compact', sessionId, revision, compact),
      ),
    });
    const store = createGameStore({ archive, storage });

    store.getState().setPreference({ language: 'english' });

    expect(store.getState().historyHydrationStatus).toBe('recentOnly');

    loadDeferred.resolve(createPersistedSessionEnvelope('full', sessionId, revision, session));

    await Promise.resolve();
    await Promise.resolve();

    expect(store.getState().preferences.language).toBe('english');
    expect(store.getState().historyHydrationStatus).toBe('recentOnly');
    expect(store.getState().turnLog).toHaveLength(compact.turnLog.length);
  });

  it('falls back to recent-only history when archive hydration fails', async () => {
    const { session } = createHistorySession(18);
    const sessionId = 'archive-failure';
    const revision = 9;
    const compact = createCompactSession(session);
    const archive = new FakeArchive(async () => {
      throw new Error('IndexedDB blocked');
    });
    const storage = createMemoryStorage({
      [SESSION_STORAGE_KEY]: serializePersistedSessionEnvelope(
        createPersistedSessionEnvelope('compact', sessionId, revision, compact),
      ),
    });
    const store = createGameStore({ archive, storage });

    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => {
      globalThis.setTimeout(resolve, 0);
    });

    expect(store.getState().historyHydrationStatus).toBe('recentOnly');
    expect(store.getState().turnLog).toHaveLength(compact.turnLog.length);
  });
});
