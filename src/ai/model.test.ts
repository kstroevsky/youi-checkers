import { beforeEach, describe, expect, it, vi } from 'vitest';

import { encodeActionIndex } from '@/ai/model/actionSpace';
import { encodeStateForModel } from '@/ai/model/encoding';
import {
  getModelGuidance,
  resetModelGuidanceSessionForTests,
} from '@/ai/model/guidance';
import { createInitialState, getLegalActions } from '@/domain';
import { withConfig } from '@/test/factories';

const { createSessionSpy, runSpy } = vi.hoisted(() => ({
  createSessionSpy: vi.fn(),
  runSpy: vi.fn(),
}));

vi.mock('onnxruntime-web', () => {
  class Tensor {
    constructor(
      public readonly type: string,
      public readonly data: ArrayLike<number | bigint> | string[],
      public readonly dims: number[],
    ) {}
  }

  return {
    InferenceSession: {
      create: createSessionSpy,
    },
    Tensor,
  };
});

const MODEL_PROBE_RANGE = 'bytes=0-63';

describe('AI model plumbing', () => {
  beforeEach(() => {
    resetModelGuidanceSessionForTests();
    createSessionSpy.mockReset();
    runSpy.mockReset();
    vi.unstubAllGlobals();
  });

  it('encodes the model input planes with the expected fixed shape', () => {
    const state = createInitialState(withConfig({ drawRule: 'threefold', scoringMode: 'off' }));
    const encoded = encodeStateForModel(state);

    expect(encoded).toHaveLength(16 * 36);
    expect(encoded.slice(13 * 36, 14 * 36).reduce((sum, value) => sum + value, 0)).toBe(18);
    expect(encoded.slice(14 * 36, 15 * 36).reduce((sum, value) => sum + value, 0)).toBe(6);
  });

  it('maps legal root actions into distinct action-space indices', () => {
    const state = createInitialState(withConfig());
    const legalActions = getLegalActions(state, withConfig());
    const indices = legalActions.map((action) => encodeActionIndex(action));

    expect(indices.every((index) => index !== null)).toBe(true);
    expect(new Set(indices).size).toBe(indices.length);
  });

  it('treats an HTML app-shell model probe as a missing model without importing ONNX runtime', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('<!doctype html><html lang="en"></html>', {
        headers: {
          'content-type': 'text/html',
        },
        status: 200,
      }),
    );

    vi.stubGlobal('fetch', fetchMock);

    const state = createInitialState(withConfig({ drawRule: 'threefold', scoringMode: 'off' }));
    const guidance = await getModelGuidance(state, withConfig({ drawRule: 'threefold', scoringMode: 'off' }));

    expect(guidance).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/models/ai-policy-value.onnx');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: {
        Range: MODEL_PROBE_RANGE,
      },
      method: 'GET',
    });
    expect(createSessionSpy).not.toHaveBeenCalled();
  });

  it('treats HTML-looking probe bytes as a missing model even when the content type is non-html', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('<html><body>fallback shell</body></html>', {
        headers: {
          'content-type': 'application/octet-stream',
        },
        status: 200,
      }),
    );

    vi.stubGlobal('fetch', fetchMock);

    const state = createInitialState(withConfig({ drawRule: 'threefold', scoringMode: 'off' }));
    const guidance = await getModelGuidance(state, withConfig({ drawRule: 'threefold', scoringMode: 'off' }));

    expect(guidance).toBeNull();
    expect(createSessionSpy).not.toHaveBeenCalled();
  });

  it('accepts a non-html probe path and creates an ONNX guidance session', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([0x08, 0x01, 0x12, 0x04]), {
        headers: {
          'content-type': 'application/octet-stream',
        },
        status: 206,
      }),
    );
    const policy = new Float32Array(2736);

    policy[0] = 0.75;
    runSpy.mockResolvedValue({
      policy: {
        data: policy,
      },
      value: {
        data: new Float32Array([0.25]),
      },
    });
    createSessionSpy.mockResolvedValue({
      inputNames: ['input'],
      run: runSpy,
    });
    vi.stubGlobal('fetch', fetchMock);

    const ruleConfig = withConfig({ drawRule: 'threefold', scoringMode: 'off' });
    const state = createInitialState(ruleConfig);
    const guidance = await getModelGuidance(state, ruleConfig);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(createSessionSpy).toHaveBeenCalledWith('/models/ai-policy-value.onnx', {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
    expect(guidance?.source).toBe('onnx');
    expect(guidance?.valueEstimate).toBeCloseTo(0.25);
    expect(guidance?.actionPriors).toBeTypeOf('object');
  });
});
