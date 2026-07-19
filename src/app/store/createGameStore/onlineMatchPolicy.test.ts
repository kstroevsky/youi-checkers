import { describe, expect, it } from 'vitest';

import { createInitialState } from '@/domain';

import type { GameStoreData } from './types';

import {
  isAuthoritativeOnlineMatch,
  isOnlineInputLocked,
} from './onlineMatchPolicy';

describe('online match policy', () => {
  it('routes local mutations only when no authoritative online match exists', () => {
    expect(isAuthoritativeOnlineMatch({ onlineMatch: null })).toBe(false);
    expect(
      isAuthoritativeOnlineMatch({
        onlineMatch: { status: 'connecting' } as GameStoreData['onlineMatch'],
      }),
    ).toBe(true);
  });

  it('allows only the connected, non-pending participant who owns the turn', () => {
    const gameState = createInitialState();
    const onlineMatch = {
      participant: 'first',
      pendingCommand: false,
      status: 'connected',
    } as GameStoreData['onlineMatch'];
    const state = { gameState, onlineMatch, seriesState: null };

    expect(isOnlineInputLocked(state)).toBe(false);
    expect(
      isOnlineInputLocked({
        ...state,
        onlineMatch: { ...onlineMatch!, participant: 'second' },
      }),
    ).toBe(true);
    expect(
      isOnlineInputLocked({
        ...state,
        onlineMatch: { ...onlineMatch!, pendingCommand: true },
      }),
    ).toBe(true);
    expect(
      isOnlineInputLocked({
        ...state,
        onlineMatch: { ...onlineMatch!, status: 'reconnecting' },
      }),
    ).toBe(true);
  });
});
