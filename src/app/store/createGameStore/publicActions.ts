import { createGameplayActions } from '@/app/store/createGameStore/gameplayActions';
import { createSessionActions } from '@/app/store/createGameStore/sessionActions';
import type { GameStoreState } from '@/app/store/createGameStore/types';

import type { PublicActionsOptions } from '@/app/store/createGameStore/publicActionTypes';

/** Creates the public action methods exposed on the zustand store. */
export function createPublicGameStoreActions({
  ...options
}: PublicActionsOptions): Pick<
  GameStoreState,
  | 'acknowledgePassScreen'
  | 'cancelInteraction'
  | 'chooseNextSeriesColor'
  | 'chooseActionType'
  | 'goToHistoryCursor'
  | 'importSessionFromBuffer'
  | 'redo'
  | 'refreshExportBuffer'
  | 'retryComputerMove'
  | 'restart'
  | 'selectCell'
  | 'setImportBuffer'
  | 'setGameFormat'
  | 'setPreference'
  | 'setRuleConfig'
  | 'setSetupMatchSettings'
  | 'startNewGame'
  | 'startNextSeriesGame'
  | 'undo'
> {
  return {
    ...createGameplayActions(options),
    ...createSessionActions(options),
  };
}
