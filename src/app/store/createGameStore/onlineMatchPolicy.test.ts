import { describe, expect, it } from 'vitest';

import type { GameStoreData } from './types';

import { isAuthoritativeOnlineMatch } from './onlineMatchPolicy';

describe('online match policy', () => {
  it('routes local mutations only when no authoritative online match exists', () => {
    expect(isAuthoritativeOnlineMatch({ onlineMatch: null })).toBe(false);
    expect(
      isAuthoritativeOnlineMatch({
        onlineMatch: { status: 'connecting' } as GameStoreData['onlineMatch'],
      }),
    ).toBe(true);
  });
});
