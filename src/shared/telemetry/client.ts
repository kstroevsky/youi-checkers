import { TelemetryAccumulator } from '@/shared/telemetry/accumulator';
import {
  TELEMETRY_SCHEMA_VERSION,
  type TelemetryBatch,
  type TelemetryRuntimeContext,
  type TelemetrySeverity,
  type TelemetrySink,
  type TelemetryTags,
} from '@/shared/telemetry/contracts';
import type { TelemetryQueue } from '@/shared/telemetry/queue';
import type { TelemetryDeviceProfile } from '@/shared/telemetry/deviceProfile';

type FlushReason =
  | 'game_complete'
  | 'hidden'
  | 'interval'
  | 'online'
  | 'startup';

export type TelemetryClient = TelemetrySink & {
  flush: (reason: FlushReason, delivery?: 'fetch' | 'beacon') => Promise<void>;
  isEnabled: () => boolean;
  setEnabled: (enabled: boolean) => Promise<void>;
};

type TelemetryClientOptions = {
  beaconFn?: (url: string, data: BodyInit) => boolean;
  beforeFlush?: (
    sink: Pick<TelemetrySink, 'increment' | 'measure'>,
  ) => Promise<void> | void;
  deviceProfile: () => TelemetryDeviceProfile | null;
  enabled?: boolean;
  endpoint?: string;
  fetchFn: typeof fetch;
  now?: () => number;
  performanceNow?: () => number;
  queue: TelemetryQueue;
  release: string;
  runtimeContext: () => TelemetryRuntimeContext;
  sessionId?: string;
};

const MAX_BATCH_BYTES = 32 * 1024;

function randomId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

  return `${prefix}-${random}`;
}

function hasSnapshotData(
  snapshot: ReturnType<TelemetryAccumulator['snapshot']>,
): boolean {
  return (
    Object.keys(snapshot.counters).length > 0 ||
    Object.keys(snapshot.maximums).length > 0 ||
    Object.keys(snapshot.totals).length > 0 ||
    snapshot.incidents.length > 0
  );
}

function serializedSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function compactBatch(batch: TelemetryBatch): TelemetryBatch {
  if (serializedSize(batch) <= MAX_BATCH_BYTES) {
    return batch;
  }

  batch.summary.counters.payload_compacted =
    (batch.summary.counters.payload_compacted ?? 0) + 1;

  for (const incident of batch.incidents) {
    if (incident.context.events && incident.context.events.length > 8) {
      incident.context.events = incident.context.events.slice(-8);
    }
  }

  while (serializedSize(batch) > MAX_BATCH_BYTES) {
    const incidentWithContext = batch.incidents.find(
      (incident) => (incident.context.events?.length ?? 0) > 0,
    );

    if (incidentWithContext?.context.events) {
      incidentWithContext.context.events.shift();
      continue;
    }

    if (batch.incidents.length > 0) {
      batch.incidents.pop();
      continue;
    }

    const summaryRecords = [
      batch.summary.totals,
      batch.summary.maximums,
      batch.summary.counters,
    ];
    const record = summaryRecords.find((entry) =>
      Object.keys(entry).some((key) => key !== 'payload_compacted'),
    );

    if (record) {
      const key = Object.keys(record)
        .filter((entry) => entry !== 'payload_compacted')
        .sort()
        .at(-1);
      if (key) {
        delete record[key];
        continue;
      }
    }

    if (batch.deviceProfile !== null) {
      batch.deviceProfile = null;
      continue;
    }

    break;
  }

  return batch;
}

export function createTelemetryClient(
  options: TelemetryClientOptions,
): TelemetryClient {
  const accumulator = new TelemetryAccumulator();
  const endpoint = options.endpoint ?? '/api/telemetry/batches';
  const now = options.now ?? Date.now;
  const performanceNow =
    options.performanceNow ?? performance.now.bind(performance);
  const sessionId = options.sessionId ?? randomId('session');
  let enabled = options.enabled ?? true;
  let startedAt = now();
  let batchSequence = 0;
  let deliveryPromise: Promise<void> | null = null;
  let matchContext: Pick<
    TelemetryRuntimeContext,
    'aiDifficulty' | 'matchMode'
  > = {
    aiDifficulty: 'none',
    matchMode: 'unknown',
  };

  async function deliverQueued(): Promise<void> {
    if (!enabled) {
      return;
    }

    for (const batch of await options.queue.list()) {
      try {
        const response = await options.fetchFn(endpoint, {
          body: JSON.stringify(batch),
          credentials: 'same-origin',
          headers: {
            'content-type': 'application/json',
          },
          method: 'POST',
        });

        if (response.status === 202) {
          await options.queue.remove(batch.batchId);
          continue;
        }

        if (
          response.status >= 400 &&
          response.status < 500 &&
          response.status !== 429
        ) {
          await options.queue.remove(batch.batchId);
          continue;
        }

        if (response.status !== 202) {
          break;
        }
      } catch {
        break;
      }
    }
  }

  function makeBatch(reason: FlushReason): TelemetryBatch | null {
    accumulator.increment(`flush_${reason}`);
    const snapshot = accumulator.snapshot();

    if (!hasSnapshotData(snapshot)) {
      return null;
    }

    const endedAt = now();
    batchSequence += 1;

    return compactBatch({
      batchId: `${randomId('batch')}-${batchSequence.toString(36)}`,
      context: {
        ...options.runtimeContext(),
        ...matchContext,
      },
      deviceProfile: options.deviceProfile(),
      endedAt,
      incidents: snapshot.incidents,
      release: options.release,
      schemaVersion: TELEMETRY_SCHEMA_VERSION,
      sessionId,
      startedAt,
      summary: {
        counters: snapshot.counters,
        maximums: snapshot.maximums,
        totals: snapshot.totals,
      },
    });
  }

  async function flush(
    reason: FlushReason,
    delivery: 'fetch' | 'beacon' = 'fetch',
  ): Promise<void> {
    if (!enabled) {
      return;
    }

    if (deliveryPromise) {
      await deliveryPromise;
    }

    await options.beforeFlush?.({
      increment: (name, amount = 1) => accumulator.increment(name, amount),
      measure: (name, durationMs) => accumulator.measure(name, durationMs),
    });
    const batch = makeBatch(reason);

    if (!batch) {
      return;
    }

    accumulator.reset();
    startedAt = batch.endedAt;
    deliveryPromise = (async () => {
      const serialized = JSON.stringify(batch);

      if (delivery === 'beacon' && options.beaconFn) {
        options.beaconFn(
          endpoint,
          new Blob([serialized], { type: 'application/json' }),
        );
      }

      try {
        await options.queue.enqueue(batch);
      } catch {
        if (delivery !== 'beacon') {
          return;
        }
      }

      if (delivery === 'fetch') {
        await deliverQueued();
      }
    })();

    try {
      await deliveryPromise;
    } finally {
      deliveryPromise = null;
    }
  }

  return {
    context(name: string, tags: TelemetryTags = {}) {
      if (enabled) {
        accumulator.context(name, tags, performanceNow());
      }
    },
    flush,
    flushGameComplete() {
      void flush('game_complete');
    },
    incident(
      kind: string,
      details: {
        durationMs?: number;
        severity: TelemetrySeverity;
        tags?: TelemetryTags;
      },
    ) {
      if (enabled) {
        accumulator.incident(kind, details, performanceNow());
      }
    },
    increment(name: string, amount = 1) {
      if (enabled) {
        accumulator.increment(name, amount);
      }
    },
    isEnabled: () => enabled,
    measure(name: string, durationMs: number) {
      if (enabled) {
        accumulator.measure(name, durationMs);
      }
    },
    setMatchContext(matchMode, aiDifficulty) {
      matchContext = {
        aiDifficulty,
        matchMode,
      };
    },
    async setEnabled(nextEnabled: boolean) {
      if (enabled === nextEnabled) {
        return;
      }

      enabled = nextEnabled;

      if (!enabled) {
        accumulator.reset();
        await options.queue.clear();
        return;
      }

      startedAt = now();
      await deliverQueued();
    },
  };
}
