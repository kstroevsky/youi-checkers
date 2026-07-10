type GpuProfile = {
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

function probeGpu(): GpuProfile | null {
  try {
    const canvas = new OffscreenCanvas(1, 1);
    const context =
      canvas.getContext('webgl2', { powerPreference: 'low-power' }) ??
      canvas.getContext('webgl', { powerPreference: 'low-power' });

    if (!context) {
      return null;
    }

    const debug = context.getExtension('WEBGL_debug_renderer_info') as {
      UNMASKED_RENDERER_WEBGL: number;
      UNMASKED_VENDOR_WEBGL: number;
    } | null;
    const viewport = context.getParameter(context.MAX_VIEWPORT_DIMS) as
      | Int32Array
      | number[];

    return {
      extensions: context.getSupportedExtensions() ?? [],
      maxRenderbufferSize: Number(
        context.getParameter(context.MAX_RENDERBUFFER_SIZE),
      ),
      maxTextureSize: Number(context.getParameter(context.MAX_TEXTURE_SIZE)),
      maxViewportHeight: Number(viewport?.[1] ?? 0),
      maxViewportWidth: Number(viewport?.[0] ?? 0),
      renderer: debug
        ? String(context.getParameter(debug.UNMASKED_RENDERER_WEBGL))
        : String(context.getParameter(context.RENDERER)),
      shadingLanguageVersion: String(
        context.getParameter(context.SHADING_LANGUAGE_VERSION),
      ),
      vendor: debug
        ? String(context.getParameter(debug.UNMASKED_VENDOR_WEBGL))
        : String(context.getParameter(context.VENDOR)),
      version: String(context.getParameter(context.VERSION)),
    };
  } catch {
    return null;
  }
}

self.onmessage = () => {
  self.postMessage(probeGpu());
};
