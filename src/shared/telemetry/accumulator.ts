import type {
  TelemetryContextEvent,
  TelemetryIncident,
  TelemetrySeverity,
  TelemetrySummary,
  TelemetryTags,
} from '@/shared/telemetry/contracts';

export const MAX_CONTEXT_EVENTS = 64;
export const MAX_INCIDENTS = 20;
export const MAX_METRICS_PER_SUMMARY = 64;

const MAX_METRIC_VALUE = 1_000_000_000;
const MAX_TAGS = 16;
const SAFE_NAME = /^[a-z][a-z0-9_]{0,63}$/;
const SAFE_TAG_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

type AccumulatorSnapshot = TelemetrySummary & {
  incidents: TelemetryIncident[];
};

const SEVERITY_WEIGHT: Record<TelemetrySeverity, number> = {
  error: 2,
  warning: 1,
};

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}

function isSafeName(name: string): boolean {
  return SAFE_NAME.test(name);
}

function canRecordMetric(
  record: Record<string, number>,
  name: string,
): boolean {
  return name in record || Object.keys(record).length < MAX_METRICS_PER_SUMMARY;
}

function sanitizeTags(tags: TelemetryTags): TelemetryTags {
  const sanitized: TelemetryTags = {};

  for (const [key, value] of Object.entries(tags)) {
    if (Object.keys(sanitized).length >= MAX_TAGS || !SAFE_TAG_NAME.test(key)) {
      continue;
    }
    if (typeof value === 'string') {
      sanitized[key] = value.slice(0, 128);
    } else if (
      value === null ||
      typeof value === 'boolean' ||
      (typeof value === 'number' &&
        Number.isFinite(value) &&
        Math.abs(value) <= MAX_METRIC_VALUE)
    ) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

function createId(prefix: string, at: number, sequence: number): string {
  return `${prefix}-${at.toString(36)}-${sequence.toString(36).padStart(4, '0')}`;
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function sanitizeError(error: unknown): {
  fingerprint: string;
  name: string;
} {
  const name =
    error instanceof Error && /^[A-Za-z][A-Za-z0-9]*$/.test(error.name)
      ? error.name.slice(0, 64)
      : 'Error';
  const stack = error instanceof Error ? (error.stack ?? '') : '';
  const appFrames = stack
    .split('\n')
    .filter((line) => line.includes('/src/'))
    .map((line) =>
      line
        .replace(/^.*\/src\//, '/src/')
        .replace(/:\d+:\d+\)?$/, '')
        .slice(0, 160),
    )
    .slice(0, 4)
    .join('|');

  return {
    fingerprint: fnv1a(`${name}|${appFrames || 'no-app-frame'}`),
    name,
  };
}

export class TelemetryAccumulator {
  private readonly counters: Record<string, number> = {};
  private readonly maximums: Record<string, number> = {};
  private readonly totals: Record<string, number> = {};
  private readonly contextEvents: TelemetryContextEvent[] = [];
  private incidents: TelemetryIncident[] = [];
  private incidentSequence = 0;

  increment(name: string, amount = 1): void {
    if (
      !isSafeName(name) ||
      !canRecordMetric(this.counters, name) ||
      !Number.isFinite(amount) ||
      amount < 0 ||
      amount > MAX_METRIC_VALUE
    ) {
      return;
    }

    this.counters[name] = Math.min(
      MAX_METRIC_VALUE,
      roundMetric((this.counters[name] ?? 0) + amount),
    );
  }

  measure(name: string, durationMs: number): void {
    if (
      !isSafeName(name) ||
      !canRecordMetric(this.totals, name) ||
      !Number.isFinite(durationMs) ||
      durationMs < 0 ||
      durationMs > MAX_METRIC_VALUE
    ) {
      return;
    }

    const rounded = roundMetric(durationMs);
    this.totals[name] = Math.min(
      MAX_METRIC_VALUE,
      roundMetric((this.totals[name] ?? 0) + rounded),
    );
    this.maximums[name] = Math.max(this.maximums[name] ?? 0, rounded);
  }

  context(
    name: string,
    tags: TelemetryTags = {},
    atMs = performance.now(),
  ): void {
    if (!isSafeName(name)) {
      return;
    }

    this.contextEvents.push({
      atMs: roundMetric(atMs),
      name,
      tags: sanitizeTags(tags),
    });

    if (this.contextEvents.length > MAX_CONTEXT_EVENTS) {
      this.contextEvents.splice(
        0,
        this.contextEvents.length - MAX_CONTEXT_EVENTS,
      );
    }
  }

  incident(
    kind: string,
    details: {
      durationMs?: number;
      severity: TelemetrySeverity;
      tags?: TelemetryTags;
    },
    atMs = performance.now(),
  ): void {
    if (
      !isSafeName(kind) ||
      (details.severity !== 'warning' && details.severity !== 'error') ||
      (details.durationMs !== undefined &&
        (!Number.isFinite(details.durationMs) ||
          details.durationMs < 0 ||
          details.durationMs > 86_400_000))
    ) {
      return;
    }

    const at = Date.now();
    this.incidentSequence += 1;
    const incident: TelemetryIncident = {
      at,
      context: {
        events: this.contextEvents.map((event) => ({
          ...event,
          tags: { ...event.tags },
        })),
        tags: sanitizeTags(details.tags ?? {}),
      },
      ...(details.durationMs === undefined
        ? {}
        : { durationMs: roundMetric(details.durationMs) }),
      id: createId('incident', at, this.incidentSequence),
      kind,
      severity: details.severity,
    };

    this.incidents.push(incident);
    this.incidents.sort((left, right) => {
      const severityDelta =
        SEVERITY_WEIGHT[right.severity] - SEVERITY_WEIGHT[left.severity];

      if (severityDelta !== 0) {
        return severityDelta;
      }

      return (right.durationMs ?? 0) - (left.durationMs ?? 0);
    });
    this.incidents = this.incidents.slice(0, MAX_INCIDENTS);
    this.context('incident_recorded', { kind }, atMs);
  }

  snapshot(): AccumulatorSnapshot {
    return {
      counters: { ...this.counters },
      incidents: this.incidents.map((incident) => structuredClone(incident)),
      maximums: { ...this.maximums },
      totals: { ...this.totals },
    };
  }

  reset(): void {
    for (const key of Object.keys(this.counters)) {
      delete this.counters[key];
    }
    for (const key of Object.keys(this.maximums)) {
      delete this.maximums[key];
    }
    for (const key of Object.keys(this.totals)) {
      delete this.totals[key];
    }
    this.contextEvents.length = 0;
    this.incidents = [];
  }
}
