import { describe, expect, it } from 'vitest';

import {
  classifyRuntimeContext,
  coarseGpuFamily,
} from '@/shared/telemetry/runtimeContext';

describe('telemetry runtime context', () => {
  it('coarsens device and browser data instead of retaining raw identifiers', () => {
    const context = classifyRuntimeContext({
      colorDepth: 24,
      connection: {
        downlink: 8.5,
        effectiveType: '4g',
        rtt: 120,
        saveData: false,
      },
      devicePixelRatio: 3,
      deviceMemory: 3,
      hardwareConcurrency: 6,
      maxTouchPoints: 5,
      screenHeight: 844,
      screenWidth: 390,
      standalone: true,
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Pixel 9) AppleWebKit/537.36 Chrome/150.0.0.0 Mobile',
      viewportHeight: 780,
      viewportWidth: 390,
    });

    expect(context).toMatchObject({
      browserFamily: 'chromium',
      browserMajor: 150,
      colorDepth: 24,
      deviceClass: 'memory_mid_cpu_mid',
      deviceMemoryGb: 3,
      devicePixelRatio: 3,
      downlinkMbps: 8.5,
      hardwareConcurrency: 6,
      maxTouchPoints: 5,
      networkClass: '4g',
      osFamily: 'android',
      osMajor: 14,
      pwaMode: 'standalone',
      rttMs: 120,
      screenHeight: 844,
      screenWidth: 390,
      viewportHeight: 780,
      viewportWidth: 390,
      viewportClass: 'compact',
    });
    expect(JSON.stringify(context)).not.toContain('Pixel 9');
    expect(JSON.stringify(context)).not.toContain('150.0.0.0');
  });
});

describe('coarseGpuFamily', () => {
  it('keeps only a broad GPU vendor family', () => {
    expect(coarseGpuFamily('ANGLE (Apple, Apple M4 Pro, Metal)')).toBe('apple');
    expect(coarseGpuFamily('ANGLE (Qualcomm, Adreno (TM) 750)')).toBe('adreno');
    expect(coarseGpuFamily('Intel(R) Iris(R) Xe Graphics')).toBe('intel');
    expect(coarseGpuFamily('unknown renderer detail')).toBe('other');
  });
});
