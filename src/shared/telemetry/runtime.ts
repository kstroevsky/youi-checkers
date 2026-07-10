import { sanitizeError } from '@/shared/telemetry/accumulator';
import { createTelemetryClient } from '@/shared/telemetry/client';
import type { TelemetrySink } from '@/shared/telemetry/contracts';
import type { TelemetryDeviceProfile } from '@/shared/telemetry/deviceProfile';
import { diagnosticsPreferenceStore } from '@/shared/telemetry/preferenceStore';
import {
  createBrowserTelemetryQueue,
  createMemoryTelemetryQueue,
} from '@/shared/telemetry/queue';
import {
  coarseGpuFamily,
  getBrowserRuntimeContext,
  setDetectedGpuFamily,
} from '@/shared/telemetry/runtimeContext';

const TEN_MINUTES_MS = 10 * 60 * 1000;
const DRIFT_INTERVAL_MS = 1000;
const STALL_THRESHOLD_MS = 250;
const SLOW_INTERACTION_MS = 500;
const queue = createBrowserTelemetryQueue() ?? createMemoryTelemetryQueue();
let deviceProfile: TelemetryDeviceProfile | null = null;

async function captureBrowserLoad(
  sink: Pick<TelemetrySink, 'increment' | 'measure'>,
): Promise<void> {
  const browserPerformance = performance as Performance & {
    memory?: {
      jsHeapSizeLimit: number;
      totalJSHeapSize: number;
      usedJSHeapSize: number;
    };
  };

  if (browserPerformance.memory) {
    sink.measure(
      'heap_used_mb',
      browserPerformance.memory.usedJSHeapSize / 1_048_576,
    );
    sink.measure(
      'heap_total_mb',
      browserPerformance.memory.totalJSHeapSize / 1_048_576,
    );
    sink.measure(
      'heap_limit_mb',
      browserPerformance.memory.jsHeapSizeLimit / 1_048_576,
    );
  }

  if (navigator.storage?.estimate) {
    try {
      const estimate = await navigator.storage.estimate();

      if (estimate.usage !== undefined) {
        sink.measure('storage_used_mb', estimate.usage / 1_048_576);
      }
      if (estimate.quota !== undefined) {
        sink.measure('storage_quota_mb', estimate.quota / 1_048_576);
      }
    } catch {
      // Storage estimation is optional and may be denied.
    }
  }

  const navigation = performance.getEntriesByType('navigation')[0] as
    | PerformanceNavigationTiming
    | undefined;

  if (navigation) {
    sink.measure('navigation_ms', navigation.duration);
    sink.measure('dom_content_loaded_ms', navigation.domContentLoadedEventEnd);
    sink.measure('load_event_ms', navigation.loadEventEnd);
    sink.measure('navigation_transfer_kb', navigation.transferSize / 1024);
    sink.measure('navigation_encoded_kb', navigation.encodedBodySize / 1024);
  }

  const resources = performance.getEntriesByType(
    'resource',
  ) as PerformanceResourceTiming[];
  sink.increment('resource_count', resources.length);
  sink.measure(
    'resource_transfer_kb',
    resources.reduce((total, entry) => total + entry.transferSize, 0) / 1024,
  );
  sink.measure(
    'resource_max_ms',
    resources.reduce((maximum, entry) => Math.max(maximum, entry.duration), 0),
  );
  sink.increment('dom_nodes', document.getElementsByTagName('*').length);
}

export const telemetry = createTelemetryClient({
  beaconFn:
    typeof navigator === 'undefined'
      ? undefined
      : navigator.sendBeacon.bind(navigator),
  beforeFlush: typeof window === 'undefined' ? undefined : captureBrowserLoad,
  deviceProfile: () => deviceProfile,
  fetchFn:
    typeof fetch === 'undefined'
      ? async () => new Response(null, { status: 503 })
      : fetch.bind(globalThis),
  queue,
  release: typeof __APP_RELEASE__ === 'undefined' ? 'unknown' : __APP_RELEASE__,
  runtimeContext:
    typeof window === 'undefined'
      ? () => ({
          aiDifficulty: 'none',
          browserFamily: 'server',
          browserMajor: null,
          colorDepth: 0,
          deviceClass: 'unknown',
          deviceMemoryGb: null,
          devicePixelRatio: 1,
          downlinkMbps: null,
          gpuFamily: 'unknown',
          hardwareConcurrency: 0,
          matchMode: 'unknown',
          maxTouchPoints: 0,
          networkClass: 'unknown',
          osFamily: 'server',
          osMajor: null,
          pwaMode: 'browser',
          rttMs: null,
          saveData: false,
          screenHeight: 0,
          screenWidth: 0,
          viewportHeight: 0,
          viewportClass: 'unknown',
          viewportWidth: 0,
        })
      : getBrowserRuntimeContext,
});

let started = false;

export function startTelemetry(
  startupStartedAt = performance.now(),
): () => void {
  if (started || typeof window === 'undefined') {
    return () => undefined;
  }

  started = true;
  const cleanups: Array<() => void> = [];
  let collectionCleanups: Array<() => void> = [];
  let collectionObservers: PerformanceObserver[] = [];
  let collectionActive = false;
  let deviceProfileCaptured = false;
  let startupMeasured = false;
  let expectedTick = performance.now() + DRIFT_INTERVAL_MS;
  let driftInterval: number | null = null;
  let flushInterval: number | null = null;
  const browserWindow = window as Window & {
    cancelIdleCallback?: (handle: number) => void;
    requestIdleCallback?: (
      callback: IdleRequestCallback,
      options?: IdleRequestOptions,
    ) => number;
  };
  let cancelProfileSchedule: () => void = () => undefined;

  const stopTimers = () => {
    if (driftInterval !== null) {
      window.clearInterval(driftInterval);
      driftInterval = null;
    }
    if (flushInterval !== null) {
      window.clearInterval(flushInterval);
      flushInterval = null;
    }
  };

  const startTimers = () => {
    if (
      driftInterval !== null ||
      !telemetry.isEnabled() ||
      document.visibilityState !== 'visible'
    ) {
      return;
    }

    expectedTick = performance.now() + DRIFT_INTERVAL_MS;
    driftInterval = window.setInterval(() => {
      const current = performance.now();
      const drift = Math.max(0, current - expectedTick);
      expectedTick = current + DRIFT_INTERVAL_MS;

      if (drift >= STALL_THRESHOLD_MS) {
        telemetry.measure('timer_drift_ms', drift);
        telemetry.incident('main_thread_stall', {
          durationMs: drift,
          severity: 'warning',
          tags: { source: 'timer_drift' },
        });
      }
      telemetry.measure('foreground_ms', DRIFT_INTERVAL_MS);
    }, DRIFT_INTERVAL_MS);
    flushInterval = window.setInterval(() => {
      void telemetry.flush('interval');
    }, TEN_MINUTES_MS);
  };

  const collectDeviceProfile = async () => {
    if (!telemetry.isEnabled() || deviceProfileCaptured) {
      return;
    }

    performance.mark('youi-telemetry-profile-start');
    try {
      const { collectBrowserDeviceProfile } =
        await import('@/shared/telemetry/deviceProfile');
      try {
        const profile = await collectBrowserDeviceProfile();
        deviceProfile = profile;
        deviceProfileCaptured = true;
        setDetectedGpuFamily(coarseGpuFamily(profile.gpu.renderer));
      } catch {
        telemetry.increment('device_profile_probe_failed');
      }
      await telemetry.flush('startup');
    } finally {
      performance.mark('youi-telemetry-profile-end');
      performance.measure(
        'youi-telemetry-device-profile',
        'youi-telemetry-profile-start',
        'youi-telemetry-profile-end',
      );
    }
  };

  const scheduleDeviceProfile = () => {
    if (deviceProfileCaptured) {
      return;
    }

    if (browserWindow.requestIdleCallback) {
      const idleId = browserWindow.requestIdleCallback(
        () => void collectDeviceProfile(),
        { timeout: 2_000 },
      );
      cancelProfileSchedule = () => browserWindow.cancelIdleCallback?.(idleId);
      return;
    }

    const timeoutId = window.setTimeout(
      () => void collectDeviceProfile(),
      1_000,
    );
    cancelProfileSchedule = () => window.clearTimeout(timeoutId);
  };

  const observe = (
    type: string,
    callback: (entry: PerformanceEntry) => void,
    options: PerformanceObserverInit & { durationThreshold?: number } = {
      buffered: true,
      type,
    },
  ) => {
    if (
      typeof PerformanceObserver === 'undefined' ||
      !PerformanceObserver.supportedEntryTypes?.includes(type)
    ) {
      return;
    }

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        callback(entry);
      }
    });
    observer.observe(options);
    collectionObservers.push(observer);
  };

  const startCollection = () => {
    if (collectionActive || !telemetry.isEnabled()) {
      return;
    }

    collectionActive = true;
    const collectionStartedAt = performance.now();
    if (!startupMeasured) {
      startupMeasured = true;
      telemetry.measure('startup_ms', collectionStartedAt - startupStartedAt);
    }

    observe('largest-contentful-paint', (entry) => {
      telemetry.measure('lcp_ms', entry.startTime);
    });
    observe('layout-shift', (entry) => {
      const shift = entry as PerformanceEntry & {
        hadRecentInput?: boolean;
        value?: number;
      };
      if (!shift.hadRecentInput && typeof shift.value === 'number') {
        telemetry.measure('cls_score', shift.value);
      }
    });
    observe(
      'event',
      (entry) => {
        if (entry.startTime < collectionStartedAt) {
          return;
        }
        const interaction = entry as PerformanceEntry & { duration: number };
        telemetry.measure('inp_ms', interaction.duration);
        if (interaction.duration >= SLOW_INTERACTION_MS) {
          telemetry.incident('slow_interaction', {
            durationMs: interaction.duration,
            severity: 'warning',
          });
        }
      },
      { buffered: true, durationThreshold: 40, type: 'event' },
    );
    observe('longtask', (entry) => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      telemetry.increment('long_tasks');
      telemetry.measure('long_task_ms', entry.duration);
      if (entry.duration >= STALL_THRESHOLD_MS) {
        telemetry.incident('main_thread_stall', {
          durationMs: entry.duration,
          severity: 'warning',
          tags: { source: 'longtask' },
        });
      }
    });

    const onError = (event: ErrorEvent) => {
      telemetry.incident('application_error', {
        severity: 'error',
        tags: sanitizeError(event.error ?? new Error(event.message)),
      });
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      telemetry.incident('unhandled_rejection', {
        severity: 'error',
        tags: sanitizeError(event.reason),
      });
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    collectionCleanups = [
      () => window.removeEventListener('error', onError),
      () =>
        window.removeEventListener('unhandledrejection', onUnhandledRejection),
    ];
    startTimers();
    scheduleDeviceProfile();
  };

  const stopCollection = () => {
    stopTimers();
    cancelProfileSchedule();
    cancelProfileSchedule = () => undefined;
    for (const observer of collectionObservers) {
      observer.disconnect();
    }
    collectionObservers = [];
    for (const cleanup of collectionCleanups) {
      cleanup();
    }
    collectionCleanups = [];
    collectionActive = false;
  };

  void telemetry.setEnabled(diagnosticsPreferenceStore.getSnapshot());
  startCollection();

  const unsubscribePreference = diagnosticsPreferenceStore.subscribe(() => {
    const enabled = diagnosticsPreferenceStore.getSnapshot();
    void telemetry.setEnabled(enabled);
    if (enabled) {
      startCollection();
    } else {
      stopCollection();
    }
  });
  cleanups.push(unsubscribePreference);

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      void telemetry.flush('hidden', 'beacon');
      stopTimers();
    } else {
      startTimers();
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  cleanups.push(() =>
    document.removeEventListener('visibilitychange', onVisibilityChange),
  );

  const onOnline = () => {
    void telemetry.flush('online');
  };
  window.addEventListener('online', onOnline);
  cleanups.push(() => window.removeEventListener('online', onOnline));

  return () => {
    stopCollection();
    for (const cleanup of cleanups) {
      cleanup();
    }
    started = false;
  };
}
