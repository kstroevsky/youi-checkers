import { createContext, useContext, useRef } from 'react';
import { useStore } from 'zustand';
import type { StoreApi } from 'zustand';

import { createGameStore } from '@/app/store/createGameStore';
import type { GameStoreState } from '@/app/store/createGameStore';
import type { SerializableSession } from '@/shared/types/session';

const GameStoreContext = createContext<StoreApi<GameStoreState> | null>(null);

type GameStoreProviderProps = {
  children: React.ReactNode;
  initialSession?: SerializableSession;
};

export function GameStoreProvider({
  children,
  initialSession,
}: GameStoreProviderProps) {
  const storeRef = useRef<StoreApi<GameStoreState> | null>(null);

  if (!storeRef.current) {
    storeRef.current = createGameStore({ initialSession });
  }

  return (
    <GameStoreContext.Provider value={storeRef.current}>
      {children}
    </GameStoreContext.Provider>
  );
}

export function useGameStore<T>(selector: (state: GameStoreState) => T): T {
  const store = useContext(GameStoreContext);

  if (!store) {
    throw new Error('useGameStore must be used within GameStoreProvider.');
  }

  return useStore(store, selector);
}
