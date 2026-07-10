import type { TelemetryRuntimeContext } from '@/shared/telemetry/contracts';

type RuntimeContextInput = {
  connection?: {
    downlink?: number;
    effectiveType?: string;
    rtt?: number;
    saveData?: boolean;
  };
  colorDepth: number;
  devicePixelRatio: number;
  deviceMemory?: number;
  gpuFamily?: string;
  hardwareConcurrency?: number;
  maxTouchPoints: number;
  screenHeight: number;
  screenWidth: number;
  standalone: boolean;
  userAgent: string;
  viewportHeight: number;
  viewportWidth: number;
};

function browserFamily(userAgent: string): string {
  if (/Firefox\//i.test(userAgent)) {
    return 'firefox';
  }
  if (/Edg\//i.test(userAgent)) {
    return 'edge';
  }
  if (/Chrome\//i.test(userAgent) || /CriOS\//i.test(userAgent)) {
    return 'chromium';
  }
  if (/Safari\//i.test(userAgent)) {
    return 'safari';
  }
  return 'other';
}

function osFamily(userAgent: string): string {
  if (/Android/i.test(userAgent)) {
    return 'android';
  }
  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    return 'ios';
  }
  if (/Windows/i.test(userAgent)) {
    return 'windows';
  }
  if (/Mac OS X|Macintosh/i.test(userAgent)) {
    return 'macos';
  }
  if (/Linux/i.test(userAgent)) {
    return 'linux';
  }
  return 'other';
}

function browserMajor(userAgent: string): number | null {
  const match = userAgent.match(/(?:Edg|Firefox|Chrome|CriOS|Version)\/(\d+)/i);

  return match ? Number(match[1]) : null;
}

function osMajor(userAgent: string): number | null {
  const match = userAgent.match(
    /(?:Android |(?:CPU (?:iPhone )?OS |Mac OS X )|Windows NT )(\d+)/i,
  );

  return match ? Number(match[1]) : null;
}

function memoryBucket(memory?: number): string {
  if (memory === undefined) {
    return 'unknown';
  }
  if (memory <= 2) {
    return 'low';
  }
  if (memory <= 4) {
    return 'mid';
  }
  return 'high';
}

function cpuBucket(cores?: number): string {
  if (cores === undefined) {
    return 'unknown';
  }
  if (cores <= 4) {
    return 'low';
  }
  if (cores <= 8) {
    return 'mid';
  }
  return 'high';
}

export function classifyRuntimeContext(
  input: RuntimeContextInput,
): TelemetryRuntimeContext {
  const networkClass = input.connection?.saveData
    ? 'save-data'
    : (input.connection?.effectiveType ?? 'unknown');

  return {
    aiDifficulty: 'none',
    browserFamily: browserFamily(input.userAgent),
    browserMajor: browserMajor(input.userAgent),
    colorDepth: input.colorDepth,
    deviceClass: `memory_${memoryBucket(input.deviceMemory)}_cpu_${cpuBucket(input.hardwareConcurrency)}`,
    deviceMemoryGb: input.deviceMemory ?? null,
    devicePixelRatio: input.devicePixelRatio,
    downlinkMbps: input.connection?.downlink ?? null,
    gpuFamily: input.gpuFamily ?? 'unknown',
    hardwareConcurrency: input.hardwareConcurrency ?? 0,
    matchMode: 'unknown',
    maxTouchPoints: input.maxTouchPoints,
    networkClass,
    osFamily: osFamily(input.userAgent),
    osMajor: osMajor(input.userAgent),
    pwaMode: input.standalone ? 'standalone' : 'browser',
    rttMs: input.connection?.rtt ?? null,
    saveData: input.connection?.saveData ?? false,
    screenHeight: input.screenHeight,
    screenWidth: input.screenWidth,
    viewportHeight: input.viewportHeight,
    viewportClass:
      input.viewportWidth <= 540
        ? 'compact'
        : input.viewportWidth <= 900
          ? 'medium'
          : 'wide',
    viewportWidth: input.viewportWidth,
  };
}

let detectedGpuFamily = 'unknown';

export function setDetectedGpuFamily(gpuFamily: string): void {
  detectedGpuFamily = gpuFamily;
}

export function coarseGpuFamily(renderer: string): string {
  const normalized = renderer.toLowerCase();

  if (normalized.includes('apple')) return 'apple';
  if (normalized.includes('adreno') || normalized.includes('qualcomm')) {
    return 'adreno';
  }
  if (normalized.includes('mali') || normalized.includes('arm')) return 'mali';
  if (normalized.includes('intel')) return 'intel';
  if (normalized.includes('nvidia')) return 'nvidia';
  if (normalized.includes('amd') || normalized.includes('radeon')) return 'amd';
  if (normalized.includes('swiftshader')) return 'software';
  return 'other';
}

export function detectBrowserGpuFamily(): string {
  try {
    const canvas = document.createElement('canvas');
    const context =
      canvas.getContext('webgl2', { powerPreference: 'low-power' }) ??
      canvas.getContext('webgl', { powerPreference: 'low-power' });

    if (!context) return 'unavailable';

    const extension = context.getExtension('WEBGL_debug_renderer_info') as {
      UNMASKED_RENDERER_WEBGL: number;
    } | null;

    if (!extension) return 'masked';

    const renderer = context.getParameter(extension.UNMASKED_RENDERER_WEBGL);
    return typeof renderer === 'string'
      ? coarseGpuFamily(renderer)
      : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export function getBrowserRuntimeContext(): TelemetryRuntimeContext {
  const browserNavigator = navigator as Navigator & {
    connection?: {
      effectiveType?: string;
      saveData?: boolean;
    };
    deviceMemory?: number;
  };

  return classifyRuntimeContext({
    connection: browserNavigator.connection,
    colorDepth: window.screen.colorDepth,
    devicePixelRatio: window.devicePixelRatio,
    deviceMemory: browserNavigator.deviceMemory,
    gpuFamily: detectedGpuFamily,
    hardwareConcurrency: browserNavigator.hardwareConcurrency,
    maxTouchPoints: browserNavigator.maxTouchPoints,
    screenHeight: window.screen.height,
    screenWidth: window.screen.width,
    standalone: window.matchMedia('(display-mode: standalone)').matches,
    userAgent: browserNavigator.userAgent,
    viewportHeight: window.innerHeight,
    viewportWidth: window.innerWidth,
  });
}
