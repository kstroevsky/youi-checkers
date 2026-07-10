export const DIAGNOSTICS_STORAGE_KEY = 'youi/diagnostics-enabled/v1';

export type DiagnosticsPreferenceStore = {
  getSnapshot: () => boolean;
  setEnabled: (enabled: boolean) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createDiagnosticsPreferenceStore(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
): DiagnosticsPreferenceStore {
  const listeners = new Set<() => void>();
  let enabled = storage?.getItem(DIAGNOSTICS_STORAGE_KEY) !== 'false';

  return {
    getSnapshot: () => enabled,
    setEnabled(nextEnabled) {
      if (enabled === nextEnabled) {
        return;
      }

      enabled = nextEnabled;
      storage?.setItem(DIAGNOSTICS_STORAGE_KEY, String(nextEnabled));

      for (const listener of listeners) {
        listener();
      }
    },
    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const diagnosticsPreferenceStore = createDiagnosticsPreferenceStore(
  typeof window === 'undefined' ? null : window.localStorage,
);
