import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MultiplayerClient,
  type OnlineMatchView,
} from './MultiplayerClient';

const MATCH_ID = '12345678-1234-4123-8123-123456789abc';

type SocketListener = (event: Event | MessageEvent<string>) => void;

class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];

  readonly closeCalls: Array<{ code?: number; reason?: string }> = [];
  bufferedAmount = 0;
  readyState = FakeWebSocket.OPEN;
  private readonly listeners = new Map<string, SocketListener[]>();

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: SocketListener): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  close(code?: number, reason?: string): void {
    this.closeCalls.push({ code, reason });
  }

  dispatch(type: 'open' | 'message', data?: string): void {
    const event =
      type === 'message' ? ({ data } as MessageEvent<string>) : new Event(type);
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  send(): void {}
}

function createClient(onView: (view: OnlineMatchView | null) => void) {
  return new MultiplayerClient({
    getCreateOptions: () => ({
      format: 'single',
      rules: {
        allowNonAdjacentFriendlyStackTransfer: true,
        drawRule: 'threefold',
        scoringMode: 'off',
      },
      targetPoints: 1,
    }),
    project: () => undefined,
    setView: onView,
  });
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  localStorage.clear();
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MultiplayerClient lifetime', () => {
  it('starts and disposes browser listeners explicitly', () => {
    const addEventListener = vi.spyOn(document, 'addEventListener');
    const removeEventListener = vi.spyOn(document, 'removeEventListener');
    const client = createClient(() => undefined);

    expect(addEventListener).not.toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    );

    client.start();
    client.dispose();

    expect(addEventListener).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    );
    expect(removeEventListener).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    );
  });

  it('accepts peer-presence messages without closing the canonical socket', async () => {
    const views: Array<OnlineMatchView | null> = [];
    const client = createClient((view) => {
      views.push(view);
    });

    await client.join(`${window.location.origin}/#match=${MATCH_ID}`);
    const socket = FakeWebSocket.instances[0];
    socket.dispatch(
      'message',
      JSON.stringify({ type: 'peerPresence', connected: true }),
    );

    await vi.waitFor(() => {
      expect(views.at(-1)?.status).toBe('connected');
    });
    expect(views.at(-1)?.peerPresent).toBe(true);
    expect(socket.closeCalls).toEqual([]);
    client.dispose();
  });

  it('uses an application close code for invalid server messages', async () => {
    const client = createClient(() => undefined);

    await client.join(`${window.location.origin}/#match=${MATCH_ID}`);
    const socket = FakeWebSocket.instances[0];
    socket.dispatch('message', JSON.stringify({ type: 'unknown' }));

    await vi.waitFor(() => {
      expect(socket.closeCalls).toHaveLength(1);
    });
    expect(socket.closeCalls[0]).toEqual({
      code: 4008,
      reason: 'Invalid server message',
    });
    client.dispose();
  });

  it('uses an application close code when socket backpressure is excessive', async () => {
    const client = createClient(() => undefined);

    await client.join(`${window.location.origin}/#match=${MATCH_ID}`);
    const socket = FakeWebSocket.instances[0];
    socket.bufferedAmount = 65 * 1024;
    socket.dispatch('open');

    expect(socket.closeCalls[0]).toEqual({
      code: 4013,
      reason: 'Reconnect to resume',
    });
    client.dispose();
  });
});
