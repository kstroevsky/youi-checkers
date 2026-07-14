import type { GameStoreData } from '@/app/store/createGameStore/types';

/** One policy predicate for actions that must defer to the authoritative room. */
export function isAuthoritativeOnlineMatch(
  state: Pick<GameStoreData, 'onlineMatch'>,
): boolean {
  return state.onlineMatch !== null;
}
