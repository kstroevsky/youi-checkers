import { describe, expect, it, vi } from 'vitest';

import { RULE_DEFAULTS } from '../src/domain/model/ruleConfig';
import {
  createAuthoritativeMatchState,
  hashMatchState,
  sha256,
} from '../src/shared/multiplayer';
import { MatchRoom } from './matchRoom';

vi.stubGlobal(
  'WebSocketRequestResponsePair',
  class WebSocketRequestResponsePair {
    constructor(_request: string, _response: string) {}
  },
);

type StoredRoom = {
  created_at: number;
  expires_at: number;
  last_activity_at: number;
  lifecycle: 'waiting' | 'active' | 'completed';
  match_id: string;
  repetition_mode: 'inline' | 'sharded';
  revision: number;
  state_hash: string;
  state_json: string;
};

function createRoomHarness() {
  let room: StoredRoom | null = null;
  const capabilities = new Map<string, 'first' | 'second'>();
  const alarms: number[] = [];
  const sql = {
    exec: vi.fn((query: string, ...values: unknown[]) => {
      const normalized = query.replaceAll(/\s+/gu, ' ').trim();
      let rows: unknown[] = [];

      if (normalized.startsWith('SELECT singleton FROM match_state')) {
        rows = room ? [{ singleton: 1 }] : [];
      } else if (normalized.startsWith('INSERT INTO match_state')) {
        room = {
          created_at: values[2] as number,
          expires_at: values[4] as number,
          last_activity_at: values[3] as number,
          lifecycle: 'waiting',
          match_id: values[0] as string,
          repetition_mode: 'inline',
          revision: 0,
          state_hash: values[1] as string,
          state_json: values[0] as string,
        };
        // The SQL statement receives matchId, stateJson, stateHash, then dates.
        room.state_json = values[1] as string;
        room.state_hash = values[2] as string;
        room.created_at = values[3] as number;
        room.last_activity_at = values[4] as number;
        room.expires_at = values[5] as number;
      } else if (normalized.startsWith('INSERT INTO capabilities')) {
        capabilities.set(values[0] as string, values[1] as 'first' | 'second');
        capabilities.set(values[2] as string, values[3] as 'first' | 'second');
      } else if (normalized.startsWith('SELECT participant FROM capabilities')) {
        const participant = capabilities.get(values[0] as string);
        rows = participant ? [{ participant }] : [];
      } else if (normalized.startsWith('SELECT * FROM match_state')) {
        rows = room ? [room] : [];
      } else if (normalized.startsWith('INSERT OR REPLACE INTO sessions')) {
        // Session persistence is exercised by reaching this public room method.
      } else if (normalized.startsWith('DELETE FROM capabilities')) {
        capabilities.delete(values[0] as string);
      } else if (normalized.startsWith('UPDATE match_state')) {
        if (room) {
          room.lifecycle = values[0] as StoredRoom['lifecycle'];
          room.last_activity_at = values[1] as number;
          room.expires_at = values[2] as number;
        }
      }

      return { toArray: () => rows };
    }),
  };
  const ctx = {
    blockConcurrencyWhile: (operation: () => Promise<void>) => {
      void operation();
    },
    getWebSockets: () => [],
    setWebSocketAutoResponse: () => undefined,
    storage: {
      setAlarm: vi.fn(async (at: number) => alarms.push(at)),
      sql,
      transactionSync: (operation: () => void) => operation(),
    },
  };

  return {
    alarms,
    room: new MatchRoom(ctx as never, {}),
    sql,
  };
}

describe('MatchRoom public interface', () => {
  it('consumes each invite capability once and activates after the second seat joins', async () => {
    const firstCapability = 'first-capability-0001';
    const secondCapability = 'second-capability-0002';
    const { room } = createRoomHarness();
    const state = createAuthoritativeMatchState({
      format: 'single',
      rules: RULE_DEFAULTS,
      targetPoints: 1,
    });

    await room.initialize({
      firstCapabilityDigest: await sha256(firstCapability),
      matchId: '11111111-1111-4111-8111-111111111111',
      secondCapabilityDigest: await sha256(secondCapability),
      state,
      stateHash: await hashMatchState(state),
    });

    await expect(room.createSession(firstCapability)).resolves.toMatchObject({
      participant: 'first',
    });
    await expect(room.createSession(firstCapability)).resolves.toBeNull();
    await expect(room.createSession(secondCapability)).resolves.toMatchObject({
      participant: 'second',
    });
  });
});
