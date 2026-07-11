import { createContext, useContext, useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import type { StoreApi } from 'zustand';

import { createGameStore } from '@/app/store/createGameStore';
import type { GameStoreState } from '@/app/store/createGameStore';
import type { SerializableSession } from '@/shared/types/session';

type CreateGameStoreOptions = Parameters<typeof createGameStore>[0];

const GameStoreContext = createContext<StoreApi<GameStoreState> | null>(null);

type GameStoreProviderProps = {
  children: React.ReactNode;
  initialSession?: SerializableSession;
  storeOptions?: Omit<CreateGameStoreOptions, 'initialSession'>;
};

/** Creates and exposes one store instance for the whole React subtree. */
export function GameStoreProvider({
  children,
  initialSession,
  storeOptions,
}: GameStoreProviderProps) {
  const storeRef = useRef<StoreApi<GameStoreState> | null>(null);

  if (!storeRef.current) {
    storeRef.current = createGameStore({ ...storeOptions, initialSession });
  }

  useEffect(() => {
    const store = storeRef.current;

    if (!store || typeof window === 'undefined') {
      return undefined;
    }

    const automationWindow = window as Window & {
      advanceTime?: (milliseconds: number) => void;
      render_game_to_text?: () => string;
    };
    automationWindow.render_game_to_text = () => {
      const state = store.getState();
      const board = Object.fromEntries(
        Object.entries(state.gameState.board).map(([coord, cell]) => [
          coord,
          cell.checkers.map((checker) => ({
            frozen: checker.frozen,
            owner: checker.owner,
          })),
        ]),
      );

      return JSON.stringify({
        coordinateSystem:
          'A1 is bottom-left; columns increase right, rows increase up',
        board,
        currentPlayer: state.gameState.currentPlayer,
        interaction: state.interaction.type,
        moveNumber: state.gameState.moveNumber,
        online: state.onlineMatch
          ? {
              participant: state.onlineMatch.participant,
              pendingCommand: state.onlineMatch.pendingCommand,
              revision: state.onlineMatch.revision,
              status: state.onlineMatch.status,
            }
          : null,
        selectableCoords: state.selectableCoords,
        series: state.seriesState
          ? {
              gameNumber: state.seriesState.gameNumber,
              phase: state.seriesState.phase,
              points: state.seriesState.points,
            }
          : null,
        status: state.gameState.status,
        victory: state.gameState.victory,
      });
    };
    // YOUI has no frame simulation; all game time advances through explicit actions.
    automationWindow.advanceTime = (_milliseconds) => undefined;

    return () => {
      delete automationWindow.render_game_to_text;
      delete automationWindow.advanceTime;
    };
  }, []);

  return (
    <GameStoreContext.Provider value={storeRef.current}>
      {children}
    </GameStoreContext.Provider>
  );
}

/** Typed zustand selector hook bound to `GameStoreProvider` context. */
export function useGameStore<T>(selector: (state: GameStoreState) => T): T {
  const store = useContext(GameStoreContext);

  if (!store) {
    throw new Error('useGameStore must be used within GameStoreProvider.');
  }

  return useStore(store, selector);
}
