import type { TelemetryDeviceProfile } from '@/shared/telemetry/deviceProfile';

export const TELEMETRY_SCHEMA_VERSION = 1 as const;

export type TelemetrySeverity = 'warning' | 'error';

export type TelemetryScalar = boolean | number | string | null;

export type TelemetryTags = Record<string, TelemetryScalar>;

export type TelemetryContextEvent = {
  atMs: number;
  name: string;
  tags: TelemetryTags;
};

export type TelemetryIncident = {
  at: number;
  context: {
    events?: TelemetryContextEvent[];
    tags: TelemetryTags;
  };
  durationMs?: number;
  id: string;
  kind: string;
  severity: TelemetrySeverity;
};

export type TelemetrySummary = {
  counters: Record<string, number>;
  maximums: Record<string, number>;
  totals: Record<string, number>;
};

export type TelemetryRuntimeContext = {
  aiDifficulty: 'easy' | 'medium' | 'hard' | 'none';
  browserFamily: string;
  browserMajor: number | null;
  colorDepth: number;
  deviceClass: string;
  deviceMemoryGb: number | null;
  devicePixelRatio: number;
  downlinkMbps: number | null;
  gpuFamily: string;
  hardwareConcurrency: number;
  matchMode: 'computer' | 'hotSeat' | 'unknown';
  maxTouchPoints: number;
  networkClass: string;
  osFamily: string;
  osMajor: number | null;
  pwaMode: string;
  rttMs: number | null;
  saveData: boolean;
  screenHeight: number;
  screenWidth: number;
  viewportHeight: number;
  viewportClass: string;
  viewportWidth: number;
};

export type TelemetryBatch = {
  batchId: string;
  context: TelemetryRuntimeContext;
  deviceProfile: TelemetryDeviceProfile | null;
  endedAt: number;
  incidents: TelemetryIncident[];
  release: string;
  schemaVersion: typeof TELEMETRY_SCHEMA_VERSION;
  sessionId: string;
  startedAt: number;
  summary: TelemetrySummary;
};

export type TelemetrySink = {
  context: (name: string, tags?: TelemetryTags) => void;
  incident: (
    kind: string,
    details: {
      durationMs?: number;
      severity: TelemetrySeverity;
      tags?: TelemetryTags;
    },
  ) => void;
  increment: (name: string, amount?: number) => void;
  measure: (name: string, durationMs: number) => void;
  flushGameComplete: () => void;
  setMatchContext: (
    matchMode: TelemetryRuntimeContext['matchMode'],
    aiDifficulty: TelemetryRuntimeContext['aiDifficulty'],
  ) => void;
};

export const NOOP_TELEMETRY_SINK: TelemetrySink = {
  context: () => undefined,
  incident: () => undefined,
  increment: () => undefined,
  measure: () => undefined,
  flushGameComplete: () => undefined,
  setMatchContext: () => undefined,
};
