# Model Artifact Slot

Place the exported ONNX guidance model here as `ai-policy-value.onnx`.

This directory is a deployment slot, not a source directory. The browser worker fetches `/models/ai-policy-value.onnx` as a complete `200` response, rejects an HTML-like fallback response, then lazily imports the `onnxruntime-web` WASM runtime and creates a session from the fetched bytes. It falls back to search-only play if the file is absent or unusable.

Using complete bytes is intentional: a session must never be built from a cached range probe. The full response also makes the failure boundary explicit—asset availability is checked before the optional inference runtime is imported.

Important constraints:

- the runtime model is optional;
- policy priors are used for move ordering;
- `valueEstimate` is diagnostic only and is not injected into [`evaluateState()`](../../src/ai/evaluation.ts);
- the file is cached by the PWA runtime caching rule in [`vite.config.ts`](../../vite.config.ts).

To produce the artifact, follow [`training/README.md`](../../training/README.md).
