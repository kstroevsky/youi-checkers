import type {
  TelemetrySink,
  TelemetryTags,
} from '@/shared/telemetry/contracts';
import { diagnosticsPreferenceStore } from '@/shared/telemetry/preferenceStore';

type BufferedTelemetrySink = {
  connect: (target: TelemetrySink) => void;
  disconnect: () => void;
  setEnabled: (enabled: boolean) => void;
  sink: TelemetrySink;
};

export function createBufferedTelemetrySink(
  capacity = 64,
): BufferedTelemetrySink {
  let target: TelemetrySink | null = null;
  let enabled = true;
  const pending: Array<(sink: TelemetrySink) => void> = [];
  const dispatch = (operation: (sink: TelemetrySink) => void) => {
    if (!enabled) {
      return;
    }

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

      if (!enabled) {
        pending.length = 0;
        return;
      }

      for (const operation of pending.splice(0)) {
        operation(nextTarget);
      }
    },
    disconnect() {
      target = null;
    },
    setEnabled(nextEnabled) {
      enabled = nextEnabled;
      if (!enabled) {
        pending.length = 0;
      }
    },
    sink: {
      context(name: string, tags: TelemetryTags = {}) {
        dispatch((sink) => sink.context(name, { ...tags }));
      },
      flushCritical() {
        dispatch((sink) => sink.flushCritical());
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
bufferedTelemetry.setEnabled(diagnosticsPreferenceStore.getSnapshot());

export const telemetry = bufferedTelemetry.sink;

let startPromise: Promise<void> | null = null;
let stopRuntime: (() => void) | null = null;
let startGeneration = 0;

export function startTelemetry(): void {
  if (!diagnosticsPreferenceStore.getSnapshot()) {
    return;
  }

  const generation = startGeneration;
  startPromise ??= import('@/shared/telemetry/runtime')
    .then((runtime) => {
      if (
        generation !== startGeneration ||
        !diagnosticsPreferenceStore.getSnapshot()
      ) {
        return;
      }
      stopRuntime = runtime.startTelemetry(bootstrapStartedAt);
      bufferedTelemetry.connect(runtime.telemetry);
    })
    .catch(() => {
      startPromise = null;
    });
}

diagnosticsPreferenceStore.subscribe(() => {
  const enabled = diagnosticsPreferenceStore.getSnapshot();
  bufferedTelemetry.setEnabled(enabled);
  if (enabled) {
    startTelemetry();
  } else {
    startGeneration += 1;
    stopRuntime?.();
    stopRuntime = null;
    bufferedTelemetry.disconnect();
    startPromise = null;
  }
});
