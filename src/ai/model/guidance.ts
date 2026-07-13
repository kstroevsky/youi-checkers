import type { InferenceSession, Tensor } from 'onnxruntime-web';
import type * as Ort from 'onnxruntime-web';

import {
  AI_MODEL_ACTION_COUNT,
  buildMaskedActionPriors,
} from '@/ai/model/actionSpace';
import { encodeStateForModel } from '@/ai/model/encoding';
import type { AiModelGuidance } from '@/ai/types';
import { getLegalActions, type EngineState, type RuleConfig } from '@/domain';

const DEFAULT_MODEL_URL = '/models/ai-policy-value.onnx';
const MODEL_PROBE_BYTES = 64;
const HTML_PREFIXES = ['<!doctype', '<html'];

let modelBytesPromise: Promise<Uint8Array | null> | null = null;
let ortModulePromise: Promise<typeof Ort> | null = null;
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
  return keys.length > fallbackIndex
    ? (outputs[keys[fallbackIndex]] ?? null)
    : null;
}

function isNumericTensorData(
  value: Tensor['data'] | undefined,
): value is Exclude<Tensor['data'], string[]> {
  return ArrayBuffer.isView(value) || Array.isArray(value);
}

function toNumberArray(value: Exclude<Tensor['data'], string[]>): number[] {
  return Array.from(value as ArrayLike<number | bigint>, (entry) =>
    Number(entry),
  );
}

function decodeProbeBytes(bytes: Uint8Array | ArrayBuffer): string {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

  return new TextDecoder().decode(buffer).trimStart().toLowerCase();
}

function looksLikeHtmlDocument(prefix: string): boolean {
  return HTML_PREFIXES.some((candidate) => prefix.startsWith(candidate));
}

async function loadModelBytes(): Promise<Uint8Array | null> {
  if (!modelBytesPromise) {
    modelBytesPromise = (async () => {
      try {
        const response = await fetch(DEFAULT_MODEL_URL, { method: 'GET' });

        // A session must never be created from a cached range probe.
        if (!response.ok || response.status !== 200) {
          return null;
        }

        const contentType =
          response.headers.get('content-type')?.toLowerCase() ?? '';

        if (contentType.startsWith('text/html')) {
          return null;
        }

        const bytes = new Uint8Array(await response.arrayBuffer());
        const prefix = decodeProbeBytes(bytes.subarray(0, MODEL_PROBE_BYTES));
        return looksLikeHtmlDocument(prefix) ? null : bytes;
      } catch {
        return null;
      }
    })();
  }

  return modelBytesPromise;
}

async function loadOrtModule(): Promise<typeof Ort> {
  if (!ortModulePromise) {
    ortModulePromise = import('onnxruntime-web/wasm');
  }

  return ortModulePromise;
}

async function loadSession(): Promise<InferenceSession | null> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      try {
        const modelBytes = await loadModelBytes();

        if (!modelBytes) {
          return null;
        }

        const ort = await loadOrtModule();
        return await ort.InferenceSession.create(modelBytes, {
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
    const ort = await loadOrtModule();
    const input = encodeStateForModel(state);
    const feeds = {
      [session.inputNames[0] ?? 'input']: new ort.Tensor(
        'float32',
        input,
        [1, 16, 6, 6],
      ),
    };
    const outputs = await session.run(feeds);
    const policyTensor = getOutputTensor(
      outputs,
      ['policy', 'policy_logits'],
      0,
    );
    const valueTensor = getOutputTensor(outputs, ['value', 'value_scalar'], 1);
    const legalActions = getLegalActions(state, ruleConfig);
    const policyData =
      policyTensor?.data && isNumericTensorData(policyTensor.data)
        ? policyTensor.data instanceof Float32Array
          ? policyTensor.data
          : toNumberArray(policyTensor.data)
        : null;
    const valueData =
      valueTensor?.data && isNumericTensorData(valueTensor.data)
        ? toNumberArray(valueTensor.data)
        : null;
    const actionPriors = policyData?.length
      ? buildMaskedActionPriors(legalActions, policyData)
      : new Float32Array(AI_MODEL_ACTION_COUNT);

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
  modelBytesPromise = null;
  ortModulePromise = null;
  sessionPromise = null;
}
