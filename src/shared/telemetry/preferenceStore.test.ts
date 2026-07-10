import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DIAGNOSTICS_STORAGE_KEY,
  createDiagnosticsPreferenceStore,
} from '@/shared/telemetry/preferenceStore';

describe('diagnostics preference store', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('defaults to enabled without writing storage', () => {
    const store = createDiagnosticsPreferenceStore(window.localStorage);

    expect(store.getSnapshot()).toBe(true);
    expect(window.localStorage.getItem(DIAGNOSTICS_STORAGE_KEY)).toBeNull();
  });

  it('persists changes and notifies subscribers', () => {
    const store = createDiagnosticsPreferenceStore(window.localStorage);
    const listener = vi.fn();
    store.subscribe(listener);

    store.setEnabled(false);

    expect(store.getSnapshot()).toBe(false);
    expect(window.localStorage.getItem(DIAGNOSTICS_STORAGE_KEY)).toBe('false');
    expect(listener).toHaveBeenCalledOnce();
  });
});
