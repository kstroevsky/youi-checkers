import type { SerializableSession } from '@/shared/types/session';
import type { TelemetrySink } from '@/shared/telemetry/contracts';
import type { Coord, TurnAction } from '@/domain';

import type {
  BoardDerivation,
  CellDerivation,
  GameStoreData,
  GameStoreState,
  HistoryHydrationStatus,
} from '@/app/store/createGameStore/types';

export type StoreSetter = (
  partial:
    | Partial<GameStoreState>
    | ((state: GameStoreState) => Partial<GameStoreState>),
) => void;

export type PublicActionsOptions = {
  applyHistoryStep: (direction: 'backward' | 'forward') => boolean;
  applySession: (
    session: SerializableSession,
    options?: {
      historyHydrationStatus?: HistoryHydrationStatus;
      persist?: boolean;
      revision?: number;
      sessionId?: string;
    },
  ) => void;
  beginFreshFullSession: () => HistoryHydrationStatus;
  commitAction: (action: TurnAction) => void;
  consumeStartupHydrationOnMutation: () => HistoryHydrationStatus;
  createSessionId: () => string;
  disposeAiWorker: () => void;
  get: () => GameStoreState;
  getBoardDerivation: (
    gameState: GameStoreState['gameState'],
    ruleConfig: GameStoreState['ruleConfig'],
  ) => BoardDerivation;
  getCellDerivation: (
    gameState: GameStoreState['gameState'],
    coord: Coord,
    ruleConfig: GameStoreState['ruleConfig'],
  ) => CellDerivation;
  persistCurrentState: (
    nextState: Pick<
      GameStoreData,
      | 'ruleConfig'
      | 'preferences'
      | 'matchSettings'
      | 'seriesState'
      | 'aiBehaviorProfile'
      | 'gameState'
      | 'turnLog'
      | 'past'
      | 'future'
    >,
  ) => void;
  random: () => number;
  resetAiState: () => Pick<
    GameStoreData,
    'aiError' | 'aiStatus' | 'pendingAiRequestId'
  >;
  set: StoreSetter;
  syncComputerTurn: () => void;
  telemetry?: TelemetrySink;
};
