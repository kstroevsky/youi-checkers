import { useSyncExternalStore } from 'react';

import { diagnosticsPreferenceStore } from '@/shared/telemetry/preferenceStore';

export function useDiagnosticsPreference(): {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
} {
  const enabled = useSyncExternalStore(
    diagnosticsPreferenceStore.subscribe,
    diagnosticsPreferenceStore.getSnapshot,
    () => true,
  );

  return {
    enabled,
    setEnabled: diagnosticsPreferenceStore.setEnabled,
  };
}
