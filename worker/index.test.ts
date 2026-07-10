import { describe, expect, it, vi } from 'vitest';

import worker, { type Env } from './index';

function env(): Env {
  return {
    ASSETS: {
      fetch: vi.fn(async () => new Response('asset')),
    },
    TELEMETRY_DB: {
      batch: vi.fn(async () => []),
      prepare: vi.fn(() => ({
        bind: vi.fn().mockReturnThis(),
        run: vi.fn(async () => ({ success: true })),
      })),
    },
  } as unknown as Env;
}

describe('youi Worker router', () => {
  it('returns a JSON 404 for unknown API routes', async () => {
    const response = await worker.fetch(
      new Request('https://youi.example/api/unknown'),
      env(),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('falls back to the static asset binding outside the API', async () => {
    const bindings = env();
    const request = new Request('https://youi.example/game');

    const response = await worker.fetch(request, bindings);

    expect(await response.text()).toBe('asset');
    expect(bindings.ASSETS.fetch).toHaveBeenCalledWith(request);
  });
});
