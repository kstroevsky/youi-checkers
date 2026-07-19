import type { GameStoreData } from '@/app/store/createGameStore/types';
import { participantForColor } from '@/shared/multiplayer';

/** One policy predicate for actions that must defer to the authoritative room. */
export function isAuthoritativeOnlineMatch(
  state: Pick<GameStoreData, 'onlineMatch'>,
): boolean {
  return state.onlineMatch !== null;
}

/** Blocks local board input unless this connected seat owns the live turn. */
export function isOnlineInputLocked(
  state: Pick<
    GameStoreData,
    'gameState' | 'onlineMatch' | 'seriesState'
  >,
): boolean {
  const onlineMatch = state.onlineMatch;

  if (!onlineMatch) return false;

  return (
    onlineMatch.status !== 'connected' ||
    onlineMatch.pendingCommand ||
    !onlineMatch.participant ||
    participantForColor(
      state.seriesState,
      state.gameState.currentPlayer,
    ) !== onlineMatch.participant
  );
}
