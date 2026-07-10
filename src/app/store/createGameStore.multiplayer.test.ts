import { describe, expect, it } from 'vitest';

import { createGameStore } from '@/app/store/createGameStore';
import { createMemoryStorage } from '@/app/store/createGameStore.testUtils';

const ONLINE_MATCH = {
  directConnected: false,
  error: null,
  inviteUrl: null,
  lifecycle: 'active' as const,
  matchId: '11111111-1111-4111-8111-111111111111',
  participant: 'first' as const,
  peerPresent: true,
  pendingCommand: false,
  revision: 3,
  status: 'connected' as const,
};

describe('online store safety boundaries', () => {
  it('locks local history, restart, import, format, and rule mutations', () => {
    const store = createGameStore({
      archive: null,
      storage: createMemoryStorage(),
    });
    store.setState({ onlineMatch: ONLINE_MATCH });
    const before = store.getState();

    before.restart();
    before.undo();
    before.setGameFormat('series');
    before.setRuleConfig({ drawRule: 'none' });
    before.setImportBuffer('{"version":5}');
    before.importSessionFromBuffer();

    const after = store.getState();
    expect(after.gameState).toBe(before.gameState);
    expect(after.ruleConfig).toEqual(before.ruleConfig);
    expect(after.matchSettings).toEqual(before.matchSettings);
    expect(after.onlineMatch).toEqual(ONLINE_MATCH);
    expect(after.importError).toBeNull();
  });

  it('still permits local accessibility preferences without persisting match state', () => {
    let persistedWrites = 0;
    const store = createGameStore({
      archive: null,
      storage: createMemoryStorage(
        {},
        { onSetItem: () => (persistedWrites += 1) },
      ),
    });
    store.setState({ onlineMatch: ONLINE_MATCH });
    const writesBefore = persistedWrites;

    store.getState().setPreference({ passDeviceOverlayEnabled: false });

    expect(store.getState().preferences.passDeviceOverlayEnabled).toBe(false);
    expect(persistedWrites).toBe(writesBefore);
  });
});
