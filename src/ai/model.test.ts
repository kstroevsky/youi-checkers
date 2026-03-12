import { describe, expect, it } from 'vitest';

import { encodeActionIndex } from '@/ai/model/actionSpace';
import { encodeStateForModel } from '@/ai/model/encoding';
import {
  getModelGuidance,
  resetModelGuidanceSessionForTests,
} from '@/ai/model/guidance';
import { createInitialState, getLegalActions } from '@/domain';
import { withConfig } from '@/test/factories';

describe('AI model plumbing', () => {
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

  it('falls back cleanly when no ONNX guidance model is present', async () => {
    resetModelGuidanceSessionForTests();
    const state = createInitialState(withConfig({ drawRule: 'threefold', scoringMode: 'off' }));
    const guidance = await getModelGuidance(state, withConfig({ drawRule: 'threefold', scoringMode: 'off' }));

    expect(guidance === null || guidance.source === 'onnx').toBe(true);
    if (guidance) {
      expect(typeof guidance.valueEstimate === 'number' || guidance.valueEstimate === null).toBe(true);
      expect(guidance.actionPriors).toBeTypeOf('object');
    }
  });
});
