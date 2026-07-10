import {
  TELEMETRY_SCHEMA_VERSION,
  type TelemetryBatch,
  type TelemetryIncident,
  type TelemetryRuntimeContext,
  type TelemetrySummary,
} from '../src/shared/telemetry/contracts';
import type { TelemetryDeviceProfile } from '../src/shared/telemetry/deviceProfile';

export const MAX_TELEMETRY_BODY_BYTES = 32 * 1024;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

type D1RunResult = {
  success: boolean;
};

type D1PreparedStatement = {
  bind: (...values: unknown[]) => D1PreparedStatement;
  run: () => Promise<D1RunResult>;
};

type D1DatabaseLike = {
  batch: (statements: D1PreparedStatement[]) => Promise<D1RunResult[]>;
  prepare: (sql: string) => D1PreparedStatement;
};

type RateLimiterLike = {
  limit: (options: { key: string }) => Promise<{ success: boolean }>;
};

export type TelemetryWorkerEnv = {
  TELEMETRY_RATE_LIMITER?: RateLimiterLike;
  TELEMETRY_DB: D1DatabaseLike;
};

const CONTEXT_KEYS = [
  'aiDifficulty',
  'browserFamily',
  'browserMajor',
  'colorDepth',
  'deviceClass',
  'deviceMemoryGb',
  'devicePixelRatio',
  'downlinkMbps',
  'gpuFamily',
  'hardwareConcurrency',
  'matchMode',
  'maxTouchPoints',
  'networkClass',
  'osFamily',
  'osMajor',
  'pwaMode',
  'rttMs',
  'saveData',
  'screenHeight',
  'screenWidth',
  'viewportHeight',
  'viewportClass',
  'viewportWidth',
] as const satisfies ReadonlyArray<keyof TelemetryRuntimeContext>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isSafeIdentifier(value: unknown, maxLength = 128): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 8 &&
    value.length <= maxLength &&
    /^[A-Za-z0-9+._:-]+$/.test(value)
  );
}

function isTimestamp(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1_500_000_000_000 &&
    value <= 4_000_000_000_000
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNumericRecord(value: unknown): value is Record<string, number> {
  return (
    isRecord(value) &&
    Object.keys(value).length <= 64 &&
    Object.entries(value).every(
      ([key, entry]) =>
        /^[a-z][a-z0-9_]{0,63}$/.test(key) &&
        isFiniteNumber(entry) &&
        entry >= 0 &&
        entry <= 1_000_000_000,
    )
  );
}

function isSummary(value: unknown): value is TelemetrySummary {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['counters', 'maximums', 'totals']) &&
    isNumericRecord(value.counters) &&
    isNumericRecord(value.maximums) &&
    isNumericRecord(value.totals)
  );
}

function isJsonValue(value: unknown, depth = 0): boolean {
  if (depth > 4) {
    return false;
  }

  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    return typeof value !== 'string' || value.length <= 256;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return (
      value.length <= 64 &&
      value.every((entry) => isJsonValue(entry, depth + 1))
    );
  }

  return (
    isRecord(value) &&
    Object.keys(value).length <= 32 &&
    Object.entries(value).every(
      ([key, entry]) =>
        /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key) &&
        isJsonValue(entry, depth + 1),
    )
  );
}

function isContext(value: unknown): value is TelemetryRuntimeContext {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, CONTEXT_KEYS) &&
    [
      'browserFamily',
      'deviceClass',
      'gpuFamily',
      'networkClass',
      'osFamily',
      'pwaMode',
      'viewportClass',
    ].every(
      (key) => typeof value[key] === 'string' && value[key].length <= 64,
    ) &&
    [
      'colorDepth',
      'devicePixelRatio',
      'hardwareConcurrency',
      'maxTouchPoints',
      'screenHeight',
      'screenWidth',
      'viewportHeight',
      'viewportWidth',
    ].every(
      (key) =>
        isFiniteNumber(value[key]) && value[key] >= 0 && value[key] <= 100_000,
    ) &&
    [
      'browserMajor',
      'deviceMemoryGb',
      'downlinkMbps',
      'osMajor',
      'rttMs',
    ].every(
      (key) =>
        value[key] === null ||
        (isFiniteNumber(value[key]) &&
          value[key] >= 0 &&
          value[key] <= 100_000),
    ) &&
    typeof value.saveData === 'boolean' &&
    ['easy', 'medium', 'hard', 'none'].includes(String(value.aiDifficulty)) &&
    ['computer', 'hotSeat', 'unknown'].includes(String(value.matchMode))
  );
}

function isBoundedString(value: unknown, maxLength = 256): value is string {
  return typeof value === 'string' && value.length <= maxLength;
}

function isBooleanRecord(
  value: unknown,
  keys: readonly string[],
): value is Record<string, boolean> {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, keys) &&
    keys.every((key) => typeof value[key] === 'boolean')
  );
}

function isDeviceProfile(
  value: unknown,
): value is TelemetryDeviceProfile | null {
  if (value === null) {
    return true;
  }

  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'battery',
      'capabilities',
      'clientHints',
      'display',
      'gpu',
    ]) ||
    new TextEncoder().encode(JSON.stringify(value)).byteLength > 16 * 1024
  ) {
    return false;
  }

  const battery = value.battery;
  const capabilities = value.capabilities;
  const clientHints = value.clientHints;
  const display = value.display;
  const gpu = value.gpu;

  return (
    (battery === null ||
      (isRecord(battery) &&
        hasOnlyKeys(battery, ['charging', 'level']) &&
        typeof battery.charging === 'boolean' &&
        isFiniteNumber(battery.level) &&
        battery.level >= 0 &&
        battery.level <= 1)) &&
    isBooleanRecord(capabilities, [
      'crossOriginIsolated',
      'serviceWorker',
      'sharedArrayBuffer',
      'wasm',
      'webgl2',
      'worker',
    ]) &&
    isRecord(clientHints) &&
    hasOnlyKeys(clientHints, [
      'architecture',
      'bitness',
      'brands',
      'mobile',
      'model',
      'platform',
      'platformVersion',
      'wow64',
    ]) &&
    ['architecture', 'bitness', 'model', 'platform', 'platformVersion'].every(
      (key) => isBoundedString(clientHints[key]),
    ) &&
    typeof clientHints.mobile === 'boolean' &&
    typeof clientHints.wow64 === 'boolean' &&
    Array.isArray(clientHints.brands) &&
    clientHints.brands.length <= 8 &&
    clientHints.brands.every(
      (entry) =>
        isRecord(entry) &&
        hasOnlyKeys(entry, ['brand', 'version']) &&
        isBoundedString(entry.brand) &&
        isBoundedString(entry.version),
    ) &&
    isRecord(display) &&
    hasOnlyKeys(display, [
      'colorGamut',
      'contrast',
      'forcedColors',
      'hdr',
      'pointer',
      'reducedMotion',
    ]) &&
    ['colorGamut', 'contrast', 'pointer'].every((key) =>
      isBoundedString(display[key], 32),
    ) &&
    ['forcedColors', 'hdr', 'reducedMotion'].every(
      (key) => typeof display[key] === 'boolean',
    ) &&
    isRecord(gpu) &&
    hasOnlyKeys(gpu, [
      'extensions',
      'maxRenderbufferSize',
      'maxTextureSize',
      'maxViewportHeight',
      'maxViewportWidth',
      'renderer',
      'shadingLanguageVersion',
      'vendor',
      'version',
    ]) &&
    ['renderer', 'shadingLanguageVersion', 'vendor', 'version'].every((key) =>
      isBoundedString(gpu[key]),
    ) &&
    [
      'maxRenderbufferSize',
      'maxTextureSize',
      'maxViewportHeight',
      'maxViewportWidth',
    ].every(
      (key) =>
        isFiniteNumber(gpu[key]) && gpu[key] >= 0 && gpu[key] <= 1_000_000,
    ) &&
    Array.isArray(gpu.extensions) &&
    gpu.extensions.length <= 128 &&
    gpu.extensions.every((entry) => isBoundedString(entry, 128))
  );
}

function isIncident(value: unknown): value is TelemetryIncident {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      'at',
      'context',
      'durationMs',
      'id',
      'kind',
      'severity',
    ]) &&
    isSafeIdentifier(value.id) &&
    typeof value.kind === 'string' &&
    /^[a-z][a-z0-9_]{0,63}$/.test(value.kind) &&
    (value.severity === 'warning' || value.severity === 'error') &&
    isTimestamp(value.at) &&
    (value.durationMs === undefined ||
      (isFiniteNumber(value.durationMs) &&
        value.durationMs >= 0 &&
        value.durationMs <= 86_400_000)) &&
    isJsonValue(value.context) &&
    JSON.stringify(value.context).length <= 8_192
  );
}

function parseBatch(value: unknown): TelemetryBatch | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'batchId',
      'context',
      'deviceProfile',
      'endedAt',
      'incidents',
      'release',
      'schemaVersion',
      'sessionId',
      'startedAt',
      'summary',
    ]) ||
    value.schemaVersion !== TELEMETRY_SCHEMA_VERSION ||
    !isSafeIdentifier(value.batchId) ||
    !isSafeIdentifier(value.sessionId) ||
    !isSafeIdentifier(value.release) ||
    !isTimestamp(value.startedAt) ||
    !isTimestamp(value.endedAt) ||
    value.endedAt < value.startedAt ||
    !isContext(value.context) ||
    !isDeviceProfile(value.deviceProfile) ||
    !isSummary(value.summary) ||
    !Array.isArray(value.incidents) ||
    value.incidents.length > 20 ||
    !value.incidents.every(isIncident)
  ) {
    return null;
  }

  return value as TelemetryBatch;
}

function response(status: number, message: string): Response {
  return Response.json(
    { message },
    {
      headers: {
        'cache-control': 'no-store',
      },
      status,
    },
  );
}

export async function handleTelemetryRequest(
  request: Request,
  env: TelemetryWorkerEnv,
  now: () => number = Date.now,
): Promise<Response> {
  if (request.method !== 'POST') {
    return response(405, 'Method not allowed.');
  }

  const url = new URL(request.url);
  const origin = request.headers.get('origin');

  if (origin !== url.origin) {
    return response(403, 'Cross-origin telemetry is not accepted.');
  }

  if (env.TELEMETRY_RATE_LIMITER) {
    const clientIp = request.headers.get('cf-connecting-ip');

    if (clientIp) {
      const result = await env.TELEMETRY_RATE_LIMITER.limit({
        key: `telemetry:${clientIp}`,
      });

      if (!result.success) {
        return response(429, 'Telemetry rate limit exceeded.');
      }
    }
  }

  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return response(415, 'Expected application/json.');
  }

  const declaredLength = Number(request.headers.get('content-length') ?? 0);

  if (declaredLength > MAX_TELEMETRY_BODY_BYTES) {
    return response(413, 'Telemetry batch is too large.');
  }

  const bytes = await request.arrayBuffer();

  if (bytes.byteLength > MAX_TELEMETRY_BODY_BYTES) {
    return response(413, 'Telemetry batch is too large.');
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return response(400, 'Invalid JSON.');
  }

  const batch = parseBatch(parsed);

  if (!batch) {
    return response(400, 'Invalid telemetry batch.');
  }

  const receivedAt = now();
  const expiresAt = receivedAt + RETENTION_MS;
  const ingestToken = crypto.randomUUID();
  const statements = [
    env.TELEMETRY_DB.prepare(
      `INSERT OR IGNORE INTO telemetry_batches (
        batch_id, schema_version, session_id, release, started_at, ended_at,
        received_at, expires_at, browser_family, os_family, device_class,
        viewport_class, network_class, pwa_mode, match_mode, ai_difficulty,
        browser_major, os_major, device_memory_gb, hardware_concurrency,
        screen_width, screen_height, viewport_width, viewport_height,
        device_pixel_ratio, color_depth, max_touch_points, downlink_mbps,
        rtt_ms, save_data, gpu_family, summary_json, device_profile_json,
        ingest_token
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      batch.batchId,
      batch.schemaVersion,
      batch.sessionId,
      batch.release,
      batch.startedAt,
      batch.endedAt,
      receivedAt,
      expiresAt,
      batch.context.browserFamily,
      batch.context.osFamily,
      batch.context.deviceClass,
      batch.context.viewportClass,
      batch.context.networkClass,
      batch.context.pwaMode,
      batch.context.matchMode,
      batch.context.aiDifficulty,
      batch.context.browserMajor,
      batch.context.osMajor,
      batch.context.deviceMemoryGb,
      batch.context.hardwareConcurrency,
      batch.context.screenWidth,
      batch.context.screenHeight,
      batch.context.viewportWidth,
      batch.context.viewportHeight,
      batch.context.devicePixelRatio,
      batch.context.colorDepth,
      batch.context.maxTouchPoints,
      batch.context.downlinkMbps,
      batch.context.rttMs,
      batch.context.saveData ? 1 : 0,
      batch.context.gpuFamily,
      JSON.stringify(batch.summary),
      batch.deviceProfile === null ? null : JSON.stringify(batch.deviceProfile),
      ingestToken,
    ),
    ...batch.incidents.map((incident) =>
      env.TELEMETRY_DB.prepare(
        `INSERT OR IGNORE INTO telemetry_incidents (
          incident_id, batch_id, kind, severity, occurred_at, duration_ms,
          expires_at, context_json
        ) SELECT ?, ?, ?, ?, ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM telemetry_batches
            WHERE batch_id = ? AND ingest_token = ?
          )`,
      ).bind(
        incident.id,
        batch.batchId,
        incident.kind,
        incident.severity,
        incident.at,
        incident.durationMs ?? null,
        expiresAt,
        JSON.stringify(incident.context),
        batch.batchId,
        ingestToken,
      ),
    ),
  ];

  const results = await env.TELEMETRY_DB.batch(statements);

  if (results.some((result) => !result.success)) {
    return response(503, 'Telemetry storage is temporarily unavailable.');
  }

  return response(202, 'Accepted.');
}

export async function runTelemetryRetention(
  env: TelemetryWorkerEnv,
  now: () => number = Date.now,
): Promise<void> {
  const cutoff = now();

  await env.TELEMETRY_DB.prepare(
    'DELETE FROM telemetry_incidents WHERE expires_at <= ?',
  )
    .bind(cutoff)
    .run();
  await env.TELEMETRY_DB.prepare(
    'DELETE FROM telemetry_batches WHERE expires_at <= ?',
  )
    .bind(cutoff)
    .run();
}
