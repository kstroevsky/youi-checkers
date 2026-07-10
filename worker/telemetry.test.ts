import { describe, expect, it } from 'vitest';

import {
  MAX_TELEMETRY_BODY_BYTES,
  handleTelemetryRequest,
  runTelemetryRetention,
  type TelemetryWorkerEnv,
} from './telemetry';

type BoundStatement = {
  bindings: unknown[];
  sql: string;
};

function createDatabase() {
  const batches: BoundStatement[][] = [];
  const runs: BoundStatement[] = [];

  const database = {
    batch: async (statements: BoundStatement[]) => {
      batches.push(statements);
      return statements.map(() => ({ success: true }));
    },
    prepare: (sql: string) => ({
      bind: (...bindings: unknown[]) => {
        const statement = {
          bindings,
          sql,
          async run() {
            runs.push(statement);
            return { success: true };
          },
        };

        return statement;
      },
    }),
  };

  return {
    batches,
    database: database as unknown as TelemetryWorkerEnv['TELEMETRY_DB'],
    runs,
  };
}

function validBody() {
  return {
    batchId: 'batch-12345678',
    context: {
      aiDifficulty: 'hard',
      browserFamily: 'chromium',
      browserMajor: 150,
      colorDepth: 24,
      deviceClass: 'mobile',
      deviceMemoryGb: 4,
      devicePixelRatio: 3,
      downlinkMbps: 8.5,
      gpuFamily: 'adreno',
      hardwareConcurrency: 8,
      matchMode: 'computer',
      maxTouchPoints: 5,
      networkClass: '4g',
      osFamily: 'android',
      osMajor: 14,
      pwaMode: 'standalone',
      rttMs: 120,
      saveData: false,
      screenHeight: 844,
      screenWidth: 390,
      viewportHeight: 780,
      viewportClass: 'compact',
      viewportWidth: 390,
    },
    deviceProfile: {
      battery: { charging: false, level: 0.63 },
      capabilities: {
        crossOriginIsolated: false,
        serviceWorker: true,
        sharedArrayBuffer: false,
        wasm: true,
        webgl2: true,
        worker: true,
      },
      clientHints: {
        architecture: 'arm',
        bitness: '64',
        brands: [{ brand: 'Chromium', version: '150.0.1.2' }],
        mobile: true,
        model: 'Example Phone',
        platform: 'Android',
        platformVersion: '14.0.0',
        wow64: false,
      },
      display: {
        colorGamut: 'p3',
        contrast: 'normal',
        forcedColors: false,
        hdr: true,
        pointer: 'coarse',
        reducedMotion: false,
      },
      gpu: {
        extensions: ['EXT_color_buffer_float'],
        maxRenderbufferSize: 16384,
        maxTextureSize: 16384,
        maxViewportHeight: 16384,
        maxViewportWidth: 16384,
        renderer: 'ANGLE (Example GPU)',
        shadingLanguageVersion: 'WebGL GLSL ES 3.00',
        vendor: 'Google Inc.',
        version: 'WebGL 2.0',
      },
    },
    endedAt: 1_750_000_060_000,
    incidents: [
      {
        at: 1_750_000_030_000,
        context: { tags: { phase: 'ai', timedOut: true } },
        durationMs: 1_200,
        id: 'incident-12345678',
        kind: 'ai_timeout',
        severity: 'error',
      },
    ],
    release: '0.3.3+abcdef0',
    schemaVersion: 1,
    sessionId: 'session-12345678',
    startedAt: 1_750_000_000_000,
    summary: {
      counters: { moves: 2 },
      maximums: { ai_ms: 1_200 },
      totals: { foreground_ms: 60_000 },
    },
  };
}

describe('telemetry Worker endpoint', () => {
  it('stores one validated batch and its incidents atomically', async () => {
    const { batches, database } = createDatabase();
    const request = new Request('https://youi.example/api/telemetry/batches', {
      body: JSON.stringify(validBody()),
      headers: {
        'content-type': 'application/json',
        origin: 'https://youi.example',
      },
      method: 'POST',
    });

    const response = await handleTelemetryRequest(
      request,
      { TELEMETRY_DB: database },
      () => 1_750_000_100_000,
    );

    expect(response.status).toBe(202);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
    expect(batches[0][0].sql).toContain(
      'INSERT OR IGNORE INTO telemetry_batches',
    );
    expect(batches[0][1].sql).toContain(
      'INSERT OR IGNORE INTO telemetry_incidents',
    );
    expect(batches[0][1].sql).toContain('ingest_token');
  });

  it('rejects cross-origin submissions', async () => {
    const { database } = createDatabase();
    const request = new Request('https://youi.example/api/telemetry/batches', {
      body: JSON.stringify(validBody()),
      headers: {
        'content-type': 'application/json',
        origin: 'https://attacker.example',
      },
      method: 'POST',
    });

    const response = await handleTelemetryRequest(request, {
      TELEMETRY_DB: database,
    });

    expect(response.status).toBe(403);
  });

  it('rejects a rate-limited source before parsing its body', async () => {
    const { batches, database } = createDatabase();
    const request = new Request('https://youi.example/api/telemetry/batches', {
      body: JSON.stringify(validBody()),
      headers: {
        'cf-connecting-ip': '198.51.100.2',
        'content-type': 'application/json',
        origin: 'https://youi.example',
      },
      method: 'POST',
    });

    const response = await handleTelemetryRequest(request, {
      TELEMETRY_DB: database,
      TELEMETRY_RATE_LIMITER: {
        limit: async () => ({ success: false }),
      },
    });

    expect(response.status).toBe(429);
    expect(batches).toEqual([]);
  });

  it('rejects bodies above the hard byte limit', async () => {
    const { database } = createDatabase();
    const request = new Request('https://youi.example/api/telemetry/batches', {
      body: 'x'.repeat(MAX_TELEMETRY_BODY_BYTES + 1),
      headers: {
        'content-type': 'application/json',
        origin: 'https://youi.example',
      },
      method: 'POST',
    });

    const response = await handleTelemetryRequest(request, {
      TELEMETRY_DB: database,
    });

    expect(response.status).toBe(413);
  });

  it('rejects unknown or malformed device capability fields', async () => {
    const { database } = createDatabase();
    const body = validBody();
    body.deviceProfile.gpu = {
      ...body.deviceProfile.gpu,
      rawFingerprint: 'not-allowed',
    } as typeof body.deviceProfile.gpu;
    const request = new Request('https://youi.example/api/telemetry/batches', {
      body: JSON.stringify(body),
      headers: {
        'content-type': 'application/json',
        origin: 'https://youi.example',
      },
      method: 'POST',
    });

    const response = await handleTelemetryRequest(request, {
      TELEMETRY_DB: database,
    });

    expect(response.status).toBe(400);
  });

  it('deletes expired incidents before expired batches', async () => {
    const { database, runs } = createDatabase();

    await runTelemetryRetention(
      { TELEMETRY_DB: database },
      () => 1_750_000_100_000,
    );

    expect(runs.map((statement) => statement.sql)).toEqual([
      expect.stringContaining('DELETE FROM telemetry_incidents'),
      expect.stringContaining('DELETE FROM telemetry_batches'),
    ]);
  });
});
