import type {
  TelemetrySink,
  TelemetryTags,
} from '@/shared/telemetry/contracts';
import { diagnosticsPreferenceStore } from '@/shared/telemetry/preferenceStore';

type BufferedTelemetrySink = {
  connect: (target: TelemetrySink) => void;
  sink: TelemetrySink;
};

export function createBufferedTelemetrySink(
  capacity = 64,
): BufferedTelemetrySink {
  let target: TelemetrySink | null = null;
  const pending: Array<(sink: TelemetrySink) => void> = [];
  const dispatch = (operation: (sink: TelemetrySink) => void) => {
    if (target) {
      operation(target);
      return;
    }

    pending.push(operation);
    if (pending.length > capacity) {
      pending.shift();
    }
  };

  return {
    connect(nextTarget) {
      target = nextTarget;
      for (const operation of pending.splice(0)) {
        operation(nextTarget);
      }
    },
    sink: {
      context(name: string, tags: TelemetryTags = {}) {
        dispatch((sink) => sink.context(name, { ...tags }));
      },
      flushGameComplete() {
        dispatch((sink) => sink.flushGameComplete());
      },
      incident(kind, details) {
        const copiedDetails = {
          ...details,
          ...(details.tags ? { tags: { ...details.tags } } : {}),
        };
        dispatch((sink) => sink.incident(kind, copiedDetails));
      },
      increment(name, amount) {
        dispatch((sink) => sink.increment(name, amount));
      },
      measure(name, durationMs) {
        dispatch((sink) => sink.measure(name, durationMs));
      },
      setMatchContext(matchMode, aiDifficulty) {
        dispatch((sink) => sink.setMatchContext(matchMode, aiDifficulty));
      },
    },
  };
}

const bootstrapStartedAt =
  typeof performance === 'undefined' ? 0 : performance.now();
const bufferedTelemetry = createBufferedTelemetrySink();

export const telemetry = bufferedTelemetry.sink;

let startPromise: Promise<void> | null = null;

export function startTelemetry(): void {
  if (!diagnosticsPreferenceStore.getSnapshot()) {
    return;
  }

  startPromise ??= import('@/shared/telemetry/runtime')
    .then((runtime) => {
      runtime.startTelemetry(bootstrapStartedAt);
      bufferedTelemetry.connect(runtime.telemetry);
    })
    .catch(() => undefined);
}

diagnosticsPreferenceStore.subscribe(() => {
  if (diagnosticsPreferenceStore.getSnapshot()) {
    startTelemetry();
  }
});
