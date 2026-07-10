export type TelemetryDeviceProfile = {
  battery: {
    charging: boolean;
    level: number;
  } | null;
  capabilities: {
    crossOriginIsolated: boolean;
    serviceWorker: boolean;
    sharedArrayBuffer: boolean;
    wasm: boolean;
    webgl2: boolean;
    worker: boolean;
  };
  clientHints: {
    architecture: string;
    bitness: string;
    brands: Array<{
      brand: string;
      version: string;
    }>;
    mobile: boolean;
    model: string;
    platform: string;
    platformVersion: string;
    wow64: boolean;
  };
  display: {
    colorGamut: string;
    contrast: string;
    forcedColors: boolean;
    hdr: boolean;
    pointer: string;
    reducedMotion: boolean;
  };
  gpu: {
    extensions: string[];
    maxRenderbufferSize: number;
    maxTextureSize: number;
    maxViewportHeight: number;
    maxViewportWidth: number;
    renderer: string;
    shadingLanguageVersion: string;
    vendor: string;
    version: string;
  };
};

export type DeviceProfileInput = TelemetryDeviceProfile & {
  rawUserAgent?: string;
};

const EMPTY_GPU: TelemetryDeviceProfile['gpu'] = {
  extensions: [],
  maxRenderbufferSize: 0,
  maxTextureSize: 0,
  maxViewportHeight: 0,
  maxViewportWidth: 0,
  renderer: 'unavailable',
  shadingLanguageVersion: 'unavailable',
  vendor: 'unavailable',
  version: 'unavailable',
};

function safeString(value: unknown, fallback = 'unknown'): string {
  return typeof value === 'string' && value.length > 0
    ? value.slice(0, 256)
    : fallback;
}

export function buildDeviceProfile(
  input: DeviceProfileInput,
): TelemetryDeviceProfile {
  return {
    battery: input.battery
      ? {
          charging: input.battery.charging,
          level: Math.max(0, Math.min(1, input.battery.level)),
        }
      : null,
    capabilities: { ...input.capabilities },
    clientHints: {
      architecture: safeString(input.clientHints.architecture),
      bitness: safeString(input.clientHints.bitness),
      brands: input.clientHints.brands.slice(0, 8).map((entry) => ({
        brand: safeString(entry.brand),
        version: safeString(entry.version),
      })),
      mobile: input.clientHints.mobile,
      model: safeString(input.clientHints.model),
      platform: safeString(input.clientHints.platform),
      platformVersion: safeString(input.clientHints.platformVersion),
      wow64: input.clientHints.wow64,
    },
    display: { ...input.display },
    gpu: {
      extensions: input.gpu.extensions
        .filter((entry): entry is string => typeof entry === 'string')
        .slice(0, 128)
        .map((entry) => entry.slice(0, 128)),
      maxRenderbufferSize: input.gpu.maxRenderbufferSize,
      maxTextureSize: input.gpu.maxTextureSize,
      maxViewportHeight: input.gpu.maxViewportHeight,
      maxViewportWidth: input.gpu.maxViewportWidth,
      renderer: safeString(input.gpu.renderer, 'unavailable'),
      shadingLanguageVersion: safeString(
        input.gpu.shadingLanguageVersion,
        'unavailable',
      ),
      vendor: safeString(input.gpu.vendor, 'unavailable'),
      version: safeString(input.gpu.version, 'unavailable'),
    },
  };
}

async function readGpuProfile(): Promise<TelemetryDeviceProfile['gpu']> {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') {
    return EMPTY_GPU;
  }

  return new Promise((resolve) => {
    let worker: Worker;

    try {
      worker = new Worker(new URL('./gpuProbe.worker.ts', import.meta.url), {
        type: 'module',
      });
    } catch {
      resolve(EMPTY_GPU);
      return;
    }
    const timeout = window.setTimeout(() => {
      worker.terminate();
      resolve(EMPTY_GPU);
    }, 3_000);

    worker.onmessage = (
      event: MessageEvent<TelemetryDeviceProfile['gpu'] | null>,
    ) => {
      window.clearTimeout(timeout);
      worker.terminate();
      resolve(event.data ?? EMPTY_GPU);
    };
    worker.onerror = () => {
      window.clearTimeout(timeout);
      worker.terminate();
      resolve(EMPTY_GPU);
    };
    worker.postMessage('probe');
  });
}

type NavigatorUAData = {
  brands?: Array<{ brand: string; version: string }>;
  getHighEntropyValues?: (hints: string[]) => Promise<Record<string, unknown>>;
  mobile?: boolean;
  platform?: string;
};

type BatteryManagerLike = {
  charging: boolean;
  level: number;
};

let collectedProfile: TelemetryDeviceProfile | null = null;

export function getCollectedDeviceProfile(): TelemetryDeviceProfile | null {
  return collectedProfile ? structuredClone(collectedProfile) : null;
}

export async function collectBrowserDeviceProfile(): Promise<TelemetryDeviceProfile> {
  const browserNavigator = navigator as Navigator & {
    getBattery?: () => Promise<BatteryManagerLike>;
    userAgentData?: NavigatorUAData;
  };
  const uaData = browserNavigator.userAgentData;
  let highEntropy: Record<string, unknown> = {};

  try {
    highEntropy =
      (await uaData?.getHighEntropyValues?.([
        'architecture',
        'bitness',
        'fullVersionList',
        'model',
        'platformVersion',
        'wow64',
      ])) ?? {};
  } catch {
    // High-entropy hints are optional.
  }

  let battery: TelemetryDeviceProfile['battery'] = null;

  try {
    const value = await browserNavigator.getBattery?.();
    if (value) {
      battery = {
        charging: value.charging,
        level: value.level,
      };
    }
  } catch {
    // Battery status is optional.
  }

  const brandsSource = Array.isArray(highEntropy.fullVersionList)
    ? highEntropy.fullVersionList
    : uaData?.brands;
  const brands = Array.isArray(brandsSource)
    ? brandsSource.filter(
        (entry): entry is { brand: string; version: string } =>
          typeof entry === 'object' &&
          entry !== null &&
          typeof (entry as { brand?: unknown }).brand === 'string' &&
          typeof (entry as { version?: unknown }).version === 'string',
      )
    : [];
  const gpu = await readGpuProfile();
  const profile = buildDeviceProfile({
    battery,
    capabilities: {
      crossOriginIsolated: globalThis.crossOriginIsolated === true,
      serviceWorker: 'serviceWorker' in browserNavigator,
      sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
      wasm: typeof WebAssembly !== 'undefined',
      webgl2: gpu.version.toLowerCase().includes('webgl 2'),
      worker: typeof Worker !== 'undefined',
    },
    clientHints: {
      architecture: safeString(highEntropy.architecture),
      bitness: safeString(highEntropy.bitness),
      brands,
      mobile: uaData?.mobile ?? /Mobile/i.test(browserNavigator.userAgent),
      model: safeString(highEntropy.model),
      platform: safeString(uaData?.platform),
      platformVersion: safeString(highEntropy.platformVersion),
      wow64: highEntropy.wow64 === true,
    },
    display: {
      colorGamut: window.matchMedia('(color-gamut: rec2020)').matches
        ? 'rec2020'
        : window.matchMedia('(color-gamut: p3)').matches
          ? 'p3'
          : 'srgb',
      contrast: window.matchMedia('(prefers-contrast: more)').matches
        ? 'more'
        : window.matchMedia('(prefers-contrast: less)').matches
          ? 'less'
          : 'normal',
      forcedColors: window.matchMedia('(forced-colors: active)').matches,
      hdr: window.matchMedia('(dynamic-range: high)').matches,
      pointer: window.matchMedia('(pointer: coarse)').matches
        ? 'coarse'
        : window.matchMedia('(pointer: fine)').matches
          ? 'fine'
          : 'none',
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)')
        .matches,
    },
    gpu,
  });

  collectedProfile = profile;
  return structuredClone(profile);
}
