import { describe, expect, it } from 'vitest';

import {
  buildDeviceProfile,
  type DeviceProfileInput,
} from '@/shared/telemetry/deviceProfile';

describe('device telemetry profile', () => {
  it('retains diagnostic hardware and version detail without raw user-agent data', () => {
    const input: DeviceProfileInput = {
      battery: {
        charging: false,
        level: 0.42,
      },
      capabilities: {
        crossOriginIsolated: false,
        serviceWorker: true,
        sharedArrayBuffer: false,
        wasm: true,
        webgl2: true,
        worker: true,
      },
      clientHints: {
        architecture: 'arm',
        bitness: '64',
        brands: [{ brand: 'Chromium', version: '150.0.7871.47' }],
        mobile: true,
        model: 'Pixel 9',
        platform: 'Android',
        platformVersion: '14.0.0',
        wow64: false,
      },
      display: {
        colorGamut: 'p3',
        contrast: 'normal',
        forcedColors: false,
        hdr: true,
        pointer: 'coarse',
        reducedMotion: false,
      },
      gpu: {
        extensions: ['EXT_color_buffer_float', 'OES_texture_float_linear'],
        maxRenderbufferSize: 16384,
        maxTextureSize: 16384,
        maxViewportHeight: 16384,
        maxViewportWidth: 16384,
        renderer: 'ANGLE (Qualcomm, Adreno (TM) 750)',
        shadingLanguageVersion: 'WebGL GLSL ES 3.00',
        vendor: 'Google Inc. (Qualcomm)',
        version: 'WebGL 2.0',
      },
      rawUserAgent: 'Mozilla/5.0 private raw user agent',
    };

    const profile = buildDeviceProfile(input);

    expect(profile.clientHints.model).toBe('Pixel 9');
    expect(profile.clientHints.brands[0]?.version).toBe('150.0.7871.47');
    expect(profile.gpu.renderer).toContain('Adreno');
    expect(profile.gpu.maxTextureSize).toBe(16384);
    expect(profile.battery?.level).toBe(0.42);
    expect(JSON.stringify(profile)).not.toContain('private raw user agent');
  });
});
