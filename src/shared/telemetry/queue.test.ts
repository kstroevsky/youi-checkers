import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';

import type { TelemetryBatch } from '@/shared/telemetry/contracts';
import {
  MAX_QUEUED_BATCHES,
  createTelemetryQueue,
} from '@/shared/telemetry/queue';

function batch(index: number): TelemetryBatch {
  return {
    batchId: `batch-${index.toString().padStart(8, '0')}`,
    context: {
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
    },
    deviceProfile: null,
    endedAt: 1_750_000_001_000 + index,
    incidents: [],
    release: 'test+0000000',
    schemaVersion: 1,
    sessionId: 'session-12345678',
    startedAt: 1_750_000_000_000,
    summary: {
      counters: { index },
      maximums: {},
      totals: {},
    },
  };
}

describe('telemetry IndexedDB queue', () => {
  it('keeps only the newest bounded batch count', async () => {
    const queue = createTelemetryQueue(new IDBFactory());

    for (let index = 0; index < MAX_QUEUED_BATCHES + 2; index += 1) {
      await queue.enqueue(batch(index));
    }

    const batches = await queue.list();

    expect(batches).toHaveLength(MAX_QUEUED_BATCHES);
    expect(batches[0].batchId).toBe('batch-00000002');
    expect(batches.at(-1)?.batchId).toBe('batch-00000011');
  });

  it('removes acknowledged batches and clears all queued diagnostics', async () => {
    const queue = createTelemetryQueue(new IDBFactory());
    await queue.enqueue(batch(1));
    await queue.enqueue(batch(2));

    await queue.remove(batch(1).batchId);
    expect((await queue.list()).map(({ batchId }) => batchId)).toEqual([
      batch(2).batchId,
    ]);

    await queue.clear();
    expect(await queue.list()).toEqual([]);
  });
});
