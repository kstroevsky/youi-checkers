import { createStore } from 'zustand/vanilla';

import { createGameStoreStateRuntime } from '@/app/store/createGameStore/stateCreator';
import { getInitialPersistenceState } from '@/app/store/createGameStore/persistence';
import { createIndexedDbSessionArchive } from '@/app/store/sessionArchive';
import type {
  GameStore,
  GameStoreState,
  StoreOptions,
} from '@/app/store/createGameStore/types';

export type {
  GameStore,
  GameStoreData,
  GameStoreState,
  HistoryHydrationStatus,
  StoreOptions,
} from '@/app/store/createGameStore/types';

/**
 * Public store factory that assembles one complete game runtime.
 *
 * Callers should use this entry point instead of constructing submodules manually,
 * because boot-time storage selection, archive hydration policy, and post-create
 * side effects must stay aligned for the store to behave correctly.
 */
export function createGameStore(options: StoreOptions = {}): GameStore {
  const storage =
    options.storage ??
    (typeof window !== 'undefined' ? window.localStorage : undefined);
  const archive =
    options.archive ??
    (typeof window !== 'undefined' ? createIndexedDbSessionArchive() : null);
  const initialPersistence = getInitialPersistenceState({
    ...options,
    archive,
    storage,
  });
  const runtime = createGameStoreStateRuntime({
    archive,
    initialPersistence,
    options,
    storage,
  });
  const store = createStore<GameStoreState>(runtime.stateCreator) as GameStore;

  store.start = () => runtime.runPostCreate(store);
  store.dispose = () => runtime.dispose();
  if (options.autoStart !== false) {
    store.start();
  }

  return store;
}
