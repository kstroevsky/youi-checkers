import { describe, expect, it } from 'vitest';

import {
  MAX_CONTEXT_EVENTS,
  MAX_INCIDENTS,
  MAX_METRICS_PER_SUMMARY,
  TelemetryAccumulator,
  sanitizeError,
} from '@/shared/telemetry/accumulator';

describe('TelemetryAccumulator', () => {
  it('aggregates routine measurements without uploading the event timeline', () => {
    const accumulator = new TelemetryAccumulator();

    accumulator.increment('moves', 2);
    accumulator.measure('ai_ms', 80);
    accumulator.measure('ai_ms', 120);
    accumulator.context('move_committed', { mode: 'computer' }, 10);

    const snapshot = accumulator.snapshot();

    expect(snapshot).toEqual({
      counters: { moves: 2 },
      incidents: [],
      maximums: { ai_ms: 120 },
      totals: { ai_ms: 200 },
    });
    expect(JSON.stringify(snapshot)).not.toContain('move_committed');
  });

  it('bounds context and retains it only around severe incidents', () => {
    const accumulator = new TelemetryAccumulator();

    for (let index = 0; index < MAX_CONTEXT_EVENTS + 5; index += 1) {
      accumulator.context('tick', { index }, index);
    }

    accumulator.incident(
      'main_thread_stall',
      {
        durationMs: 900,
        severity: 'warning',
      },
      100,
    );

    const [incident] = accumulator.snapshot().incidents;

    expect(incident.context.events).toHaveLength(MAX_CONTEXT_EVENTS);
    expect(incident.context.events?.[0]).toEqual({
      atMs: 5,
      name: 'tick',
      tags: { index: 5 },
    });
  });

  it('keeps only the most severe bounded incident set', () => {
    const accumulator = new TelemetryAccumulator();

    for (let index = 0; index < MAX_INCIDENTS; index += 1) {
      accumulator.incident(
        `slow_${index}`,
        {
          durationMs: index,
          severity: 'warning',
        },
        index,
      );
    }
    for (let index = 0; index < 4; index += 1) {
      accumulator.incident(
        `error_${index}`,
        {
          durationMs: index,
          severity: 'error',
        },
        MAX_INCIDENTS + index,
      );
    }

    const incidents = accumulator.snapshot().incidents;

    expect(incidents).toHaveLength(MAX_INCIDENTS);
    expect(
      incidents.filter((incident) => incident.severity === 'error'),
    ).toHaveLength(4);
  });

  it('sanitizes public names and tags so an invalid batch cannot poison the retry queue', () => {
    const accumulator = new TelemetryAccumulator();

    accumulator.increment('not valid');
    accumulator.increment('valid_metric', -1);
    accumulator.measure('valid_metric', Number.POSITIVE_INFINITY);
    accumulator.context('not valid', { leaked: 'x'.repeat(1_000) });
    accumulator.context('valid_context', {
      accepted: 'x'.repeat(200),
      'not valid': 'discarded',
    });
    accumulator.incident('not valid', { severity: 'error' });

    for (let index = 0; index < MAX_METRICS_PER_SUMMARY + 4; index += 1) {
      accumulator.increment(`metric_${index}`);
    }
    accumulator.incident('valid_incident', { severity: 'error' });

    const snapshot = accumulator.snapshot();

    expect(Object.keys(snapshot.counters)).toHaveLength(
      MAX_METRICS_PER_SUMMARY,
    );
    expect(snapshot.incidents).toHaveLength(1);
    expect(snapshot.incidents[0].context.events?.[0]).toEqual({
      atMs: expect.any(Number),
      name: 'valid_context',
      tags: { accepted: 'x'.repeat(128) },
    });
  });
});

describe('sanitizeError', () => {
  it('keeps an error class and app-frame fingerprint without raw messages', () => {
    const error = new TypeError('private imported text');
    error.stack =
      'TypeError: private imported text\n    at submit (/src/app/store.ts:10:2)\n    at https://cdn.example/vendor.js:2:1';

    const sanitized = sanitizeError(error);

    expect(sanitized.name).toBe('TypeError');
    expect(sanitized.fingerprint).toMatch(/^[a-f0-9]{8}$/);
    expect(JSON.stringify(sanitized)).not.toContain('private imported text');
    expect(JSON.stringify(sanitized)).not.toContain('cdn.example');
  });
});
