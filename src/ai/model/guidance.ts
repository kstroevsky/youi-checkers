import type { InferenceSession, Tensor } from 'onnxruntime-web';

import { buildMaskedActionPriors } from '@/ai/model/actionSpace';
import { encodeStateForModel } from '@/ai/model/encoding';
import type { AiModelGuidance } from '@/ai/types';
import { getLegalActions, type EngineState, type RuleConfig } from '@/domain';

const DEFAULT_MODEL_URL = '/models/ai-policy-value.onnx';

let sessionPromise: Promise<InferenceSession | null> | null = null;

function getOutputTensor(
  outputs: Record<string, Tensor>,
  candidates: string[],
  fallbackIndex: number,
): Tensor | null {
  for (const candidate of candidates) {
    if (candidate in outputs) {
      return outputs[candidate] ?? null;
    }
  }

  const keys = Object.keys(outputs);
  return keys.length > fallbackIndex ? outputs[keys[fallbackIndex]] ?? null : null;
}

function isNumericTensorData(
  value: Tensor['data'] | undefined,
): value is Exclude<Tensor['data'], string[]> {
  return ArrayBuffer.isView(value) || Array.isArray(value);
}

function toNumberArray(value: Exclude<Tensor['data'], string[]>): number[] {
  return Array.from(value as ArrayLike<number | bigint>, (entry) => Number(entry));
}

async function loadSession(): Promise<InferenceSession | null> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      try {
        const probe = await fetch(DEFAULT_MODEL_URL, {
          method: 'HEAD',
        });

        if (!probe.ok) {
          return null;
        }

        const ort = await import('onnxruntime-web');
        return await ort.InferenceSession.create(DEFAULT_MODEL_URL, {
          executionProviders: ['wasm'],
          graphOptimizationLevel: 'all',
        });
      } catch {
        return null;
      }
    })();
  }

  return sessionPromise;
}

export async function getModelGuidance(
  state: EngineState,
  ruleConfig: RuleConfig,
): Promise<AiModelGuidance | null> {
  const session = await loadSession();

  if (!session) {
    return null;
  }

  try {
    const ort = await import('onnxruntime-web');
    const input = encodeStateForModel(state);
    const feeds = {
      [session.inputNames[0] ?? 'input']: new ort.Tensor('float32', input, [1, 16, 6, 6]),
    };
    const outputs = await session.run(feeds);
    const policyTensor = getOutputTensor(outputs, ['policy', 'policy_logits'], 0);
    const valueTensor = getOutputTensor(outputs, ['value', 'value_scalar'], 1);
    const legalActions = getLegalActions(state, ruleConfig);
    const policyData =
      policyTensor?.data && isNumericTensorData(policyTensor.data)
        ? toNumberArray(policyTensor.data)
        : null;
    const valueData =
      valueTensor?.data && isNumericTensorData(valueTensor.data)
        ? toNumberArray(valueTensor.data)
        : null;
    const actionPriors =
      policyData?.length
        ? buildMaskedActionPriors(legalActions, policyData)
        : {};

    return {
      actionPriors,
      source: 'onnx',
      strategicIntent: null,
      valueEstimate: valueData?.length ? Number(valueData[0] ?? 0) : null,
    };
  } catch {
    return null;
  }
}

export function resetModelGuidanceSessionForTests(): void {
  sessionPromise = null;
}
