import { describe, expect, it } from 'vitest';

import { RULE_DEFAULTS } from '@/domain/model/ruleConfig';

import { decodeClientMessage, decodeServerMessage } from './codec';
import { createAuthoritativeMatchState } from './reducer';

describe('multiplayer wire codec', () => {
  it('rejects structurally incomplete server frames before client state changes', () => {
    expect(decodeServerMessage('{not json')).toBeNull();
    expect(
      decodeServerMessage({ type: 'ready', revision: 0, stateHash: 'a'.repeat(43) }),
    ).toBeNull();
  });

  it('accepts a complete snapshot and rejects an incomplete authoritative state', () => {
    const state = createAuthoritativeMatchState({
      format: 'single',
      rules: RULE_DEFAULTS,
      targetPoints: 1,
    });
    const frame = {
      type: 'snapshot',
      snapshot: { revision: 0, state, stateHash: 'a'.repeat(43) },
    };

    expect(decodeServerMessage(frame)).not.toBeNull();
    expect(
      decodeServerMessage({
        ...frame,
        snapshot: { ...frame.snapshot, state: { ...state, engine: {} } },
      }),
    ).toBeNull();
  });

  it('shares the same client-frame validation with the room', () => {
    expect(
      decodeClientMessage({
        type: 'hello',
        protocol: 1,
        revision: 0,
        stateHash: null,
      }),
    ).not.toBeNull();
    expect(decodeClientMessage({ type: 'hello', protocol: 2 })).toBeNull();
  });
});
