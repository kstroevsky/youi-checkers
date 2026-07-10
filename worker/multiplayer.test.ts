import { describe, expect, it, vi } from 'vitest';

import { RULE_DEFAULTS } from '../src/domain/model/ruleConfig';
import {
  handleMultiplayerRequest,
  type MultiplayerWorkerEnv,
} from './multiplayer';
import type { InitializeMatchInput } from './matchRoom';

const MATCH_ID = '11111111-1111-4111-8111-111111111111';

function createEnv(options?: {
  participant?: 'first' | 'second';
  ticket?: string;
}) {
  const initialize = vi.fn(async (_input: InitializeMatchInput) => undefined);
  const createSession = vi.fn(async (_capability: string) => ({
    participant: options?.participant ?? 'second',
    ticket: options?.ticket ?? 'session-ticket',
  }));
  const fetch = vi.fn(async (_request: Request) => new Response('upgraded'));
  const stub = { createSession, fetch, initialize };
  const env: MultiplayerWorkerEnv = {
    MATCH_ROOMS: {
      get: vi.fn(() => stub),
      idFromName: vi.fn((name) => name),
    },
  };

  return { createSession, env, fetch, initialize };
}

describe('multiplayer Worker routes', () => {
  it('creates a room with two independent 256-bit capabilities', async () => {
    const { env, initialize } = createEnv();
    const response = await handleMultiplayerRequest(
      new Request('https://youi.example/api/matches', {
        body: JSON.stringify({
          format: 'single',
          rules: RULE_DEFAULTS,
          targetPoints: 100,
        }),
        headers: {
          'content-type': 'application/json',
          origin: 'https://youi.example',
        },
        method: 'POST',
      }),
      env,
    );
    const body = (await response!.json()) as Record<string, string>;

    expect(response!.status).toBe(201);
    expect(body.capability).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(body.inviteCapability).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(body.capability).not.toBe(body.inviteCapability);
    expect(initialize).toHaveBeenCalledOnce();
    expect(initialize.mock.calls[0][0].state.engine).not.toHaveProperty(
      'history',
    );
  });

  it('exchanges an invite capability for a scoped HttpOnly session cookie', async () => {
    const { createSession, env } = createEnv({
      participant: 'second',
      ticket: 'opaque-ticket',
    });
    const capability = 'a'.repeat(43);
    const response = await handleMultiplayerRequest(
      new Request(`https://youi.example/api/matches/${MATCH_ID}/session`, {
        body: JSON.stringify({ capability }),
        headers: {
          'content-type': 'application/json',
          origin: 'https://youi.example',
        },
        method: 'POST',
      }),
      env,
    );

    expect(response!.status).toBe(200);
    expect(createSession).toHaveBeenCalledWith(capability);
    expect(response!.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response!.headers.get('set-cookie')).toContain('SameSite=Strict');
    expect(response!.headers.get('set-cookie')).toContain(
      `/api/matches/${MATCH_ID}`,
    );
  });

  it('keeps the session ticket out of the WebSocket URL', async () => {
    const { env, fetch } = createEnv();
    const response = await handleMultiplayerRequest(
      new Request(`https://youi.example/api/matches/${MATCH_ID}/socket`, {
        headers: {
          cookie: 'youi_match_session=secret-ticket',
          origin: 'https://youi.example',
          upgrade: 'websocket',
        },
      }),
      env,
    );

    expect(await response!.text()).toBe('upgraded');
    const forwarded = fetch.mock.calls[0][0];
    expect(forwarded.url).toBe('https://match-room.internal/socket');
    expect(forwarded.headers.get('x-youi-session-ticket')).toBe(
      'secret-ticket',
    );
  });

  it('rejects cross-origin room creation', async () => {
    const { env, initialize } = createEnv();
    const response = await handleMultiplayerRequest(
      new Request('https://youi.example/api/matches', {
        body: '{}',
        headers: {
          'content-type': 'application/json',
          origin: 'https://attacker.example',
        },
        method: 'POST',
      }),
      env,
    );

    expect(response!.status).toBe(403);
    expect(initialize).not.toHaveBeenCalled();
  });
});
