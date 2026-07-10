import { describe, expect, it, vi } from 'vitest';

import type { TelemetryBatch } from '@/shared/telemetry/contracts';
import { createTelemetryClient } from '@/shared/telemetry/client';

function createMemoryQueue() {
  const batches: TelemetryBatch[] = [];

  return {
    batches,
    queue: {
      clear: async () => {
        batches.length = 0;
      },
      enqueue: async (batch: TelemetryBatch) => {
        const existing = batches.findIndex(
          ({ batchId }) => batchId === batch.batchId,
        );
        if (existing >= 0) {
          batches[existing] = batch;
        } else {
          batches.push(batch);
        }
      },
      list: async () => batches.slice(),
      remove: async (batchId: string) => {
        const index = batches.findIndex((batch) => batch.batchId === batchId);
        if (index >= 0) {
          batches.splice(index, 1);
        }
      },
    },
  };
}

describe('telemetry client delivery', () => {
  it('queues a compact snapshot before sending and removes it after acknowledgement', async () => {
    const { batches, queue } = createMemoryQueue();
    let sentInit: RequestInit | undefined;
    const fetchFn: typeof fetch = vi.fn(async (_input, init) => {
      sentInit = init;
      return new Response(null, { status: 202 });
    });
    const client = createTelemetryClient({
      deviceProfile: () => null,
      fetchFn,
      now: () => 1_750_000_000_000,
      performanceNow: () => 42,
      queue,
      release: 'test+abcdef0',
      runtimeContext: () => ({
        aiDifficulty: 'none',
        browserFamily: 'test',
        browserMajor: 1,
        colorDepth: 24,
        deviceClass: 'desktop',
        deviceMemoryGb: 8,
        devicePixelRatio: 1,
        downlinkMbps: null,
        gpuFamily: 'unknown',
        hardwareConcurrency: 8,
        matchMode: 'unknown',
        maxTouchPoints: 0,
        networkClass: 'unknown',
        osFamily: 'test',
        osMajor: 1,
        pwaMode: 'browser',
        rttMs: null,
        saveData: false,
        screenHeight: 900,
        screenWidth: 1440,
        viewportHeight: 900,
        viewportClass: 'wide',
        viewportWidth: 1440,
      }),
      sessionId: 'session-12345678',
    });
    client.increment('moves');

    await client.flush('game_complete');

    expect(fetchFn).toHaveBeenCalledOnce();
    expect(batches).toEqual([]);
    const body = JSON.parse(String(sentInit?.body)) as TelemetryBatch;
    expect(body.summary.counters).toMatchObject({
      flush_game_complete: 1,
      moves: 1,
    });
    expect(JSON.stringify(body)).not.toContain('events');
  });

  it('retains a failed batch for a later retry', async () => {
    const { batches, queue } = createMemoryQueue();
    const client = createTelemetryClient({
      deviceProfile: () => null,
      fetchFn: vi.fn(async () => {
        throw new Error('offline');
      }),
      now: () => 1_750_000_000_000,
      performanceNow: () => 42,
      queue,
      release: 'test+abcdef0',
      runtimeContext: () => ({
        aiDifficulty: 'none',
        browserFamily: 'test',
        browserMajor: 1,
        colorDepth: 24,
        deviceClass: 'desktop',
        deviceMemoryGb: 8,
        devicePixelRatio: 1,
        downlinkMbps: null,
        gpuFamily: 'unknown',
        hardwareConcurrency: 8,
        matchMode: 'unknown',
        maxTouchPoints: 0,
        networkClass: 'unknown',
        osFamily: 'test',
        osMajor: 1,
        pwaMode: 'browser',
        rttMs: null,
        saveData: false,
        screenHeight: 900,
        screenWidth: 1440,
        viewportHeight: 900,
        viewportClass: 'wide',
        viewportWidth: 1440,
      }),
      sessionId: 'session-12345678',
    });
    client.increment('moves');

    await client.flush('interval');

    expect(batches).toHaveLength(1);
  });

  it('drops permanently rejected batches so they cannot block later delivery', async () => {
    const { batches, queue } = createMemoryQueue();
    await queue.enqueue({ batchId: 'batch-invalid-0001' } as TelemetryBatch);
    const fetchFn: typeof fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 400 }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    const client = createTelemetryClient({
      deviceProfile: () => null,
      fetchFn,
      now: () => 1_750_000_000_000,
      performanceNow: () => 42,
      queue,
      release: 'test+abcdef0',
      runtimeContext: () => ({
        aiDifficulty: 'none',
        browserFamily: 'test',
        browserMajor: 1,
        colorDepth: 24,
        deviceClass: 'desktop',
        deviceMemoryGb: 8,
        devicePixelRatio: 1,
        downlinkMbps: null,
        gpuFamily: 'unknown',
        hardwareConcurrency: 8,
        matchMode: 'unknown',
        maxTouchPoints: 0,
        networkClass: 'unknown',
        osFamily: 'test',
        osMajor: 1,
        pwaMode: 'browser',
        rttMs: null,
        saveData: false,
        screenHeight: 900,
        screenWidth: 1440,
        viewportHeight: 900,
        viewportClass: 'wide',
        viewportWidth: 1440,
      }),
      sessionId: 'session-12345678',
    });
    client.increment('moves');

    await client.flush('interval');

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(batches).toEqual([]);
  });

  it('disabling diagnostics clears queued and in-memory data', async () => {
    const { batches, queue } = createMemoryQueue();
    await queue.enqueue({
      batchId: 'batch-existing1',
    } as TelemetryBatch);
    const client = createTelemetryClient({
      deviceProfile: () => null,
      fetchFn: vi.fn(),
      now: () => 1_750_000_000_000,
      performanceNow: () => 42,
      queue,
      release: 'test+abcdef0',
      runtimeContext: () => ({
        aiDifficulty: 'none',
        browserFamily: 'test',
        browserMajor: 1,
        colorDepth: 24,
        deviceClass: 'desktop',
        deviceMemoryGb: 8,
        devicePixelRatio: 1,
        downlinkMbps: null,
        gpuFamily: 'unknown',
        hardwareConcurrency: 8,
        matchMode: 'unknown',
        maxTouchPoints: 0,
        networkClass: 'unknown',
        osFamily: 'test',
        osMajor: 1,
        pwaMode: 'browser',
        rttMs: null,
        saveData: false,
        screenHeight: 900,
        screenWidth: 1440,
        viewportHeight: 900,
        viewportClass: 'wide',
        viewportWidth: 1440,
      }),
      sessionId: 'session-12345678',
    });
    client.increment('moves');

    await client.setEnabled(false);
    await client.flush('interval');

    expect(batches).toEqual([]);
  });

  it('compacts repeated incident context below the Worker payload limit', async () => {
    const { queue } = createMemoryQueue();
    let requestBody = '';
    const client = createTelemetryClient({
      deviceProfile: () => null,
      fetchFn: vi.fn(async (_input, init) => {
        requestBody = String(init?.body);
        return new Response(null, { status: 202 });
      }),
      now: () => 1_750_000_000_000,
      performanceNow: () => 42,
      queue,
      release: 'test+abcdef0',
      runtimeContext: () => ({
        aiDifficulty: 'hard',
        browserFamily: 'test',
        browserMajor: 1,
        colorDepth: 24,
        deviceClass: 'desktop',
        deviceMemoryGb: 8,
        devicePixelRatio: 1,
        downlinkMbps: null,
        gpuFamily: 'unknown',
        hardwareConcurrency: 8,
        matchMode: 'computer',
        maxTouchPoints: 0,
        networkClass: 'unknown',
        osFamily: 'test',
        osMajor: 1,
        pwaMode: 'browser',
        rttMs: null,
        saveData: false,
        screenHeight: 900,
        screenWidth: 1440,
        viewportHeight: 900,
        viewportClass: 'wide',
        viewportWidth: 1440,
      }),
      sessionId: 'session-12345678',
    });

    for (let index = 0; index < 64; index += 1) {
      client.context('interaction', {
        detail: `context-${index}-${'x'.repeat(180)}`,
      });
    }
    for (let index = 0; index < 20; index += 1) {
      client.incident(`stall_${index}`, {
        durationMs: 1_000 + index,
        severity: 'error',
      });
    }

    await client.flush('interval');

    expect(
      new TextEncoder().encode(requestBody).byteLength,
    ).toBeLessThanOrEqual(32 * 1024);
  });
});
