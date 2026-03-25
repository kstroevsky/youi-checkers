import type { TurnAction } from '@/domain';

import { getComputerUndoTarget } from '@/app/store/createGameStore/history';
import { isComputerMatch, isComputerTurn } from '@/app/store/createGameStore/match';
import {
  createJumpFollowUpState,
  createIdleSelection,
  createSelectionState,
  getJumpFollowUpSelection,
} from '@/app/store/createGameStore/selection';
import type { GameStoreState } from '@/app/store/createGameStore/types';

import type { PublicActionsOptions } from '@/app/store/createGameStore/publicActionTypes';

/** Creates public actions that operate on live gameplay and history flow. */
export function createGameplayActions({
  applyHistoryStep,
  commitAction,
  get,
  getCellDerivation,
  set,
  syncComputerTurn,
}: PublicActionsOptions): Pick<
  GameStoreState,
  | 'acknowledgePassScreen'
  | 'cancelInteraction'
  | 'chooseActionType'
  | 'goToHistoryCursor'
  | 'redo'
  | 'retryComputerMove'
  | 'restart'
  | 'selectCell'
  | 'undo'
> {
  return {
    acknowledgePassScreen: () => {
      const state = get();

      if (state.interaction.type !== 'passingDevice' && state.interaction.type !== 'turnResolved') {
        return;
      }

      set({
        interaction: state.gameState.status === 'gameOver' ? { type: 'gameOver' } : { type: 'idle' },
      });
    },
    cancelInteraction: () => {
      const state = get();

      if (isComputerTurn(state.gameState, state.matchSettings)) {
        return;
      }

      const jumpFollowUp = getJumpFollowUpSelection(state.gameState);

      if (!jumpFollowUp) {
        set(createIdleSelection(state.gameState));
        return;
      }

      set(createJumpFollowUpState(jumpFollowUp.source, jumpFollowUp.targets));
    },
    chooseActionType: (actionType) => {
      const state = get();
      const source = state.selectedCell;

      if (
        !source ||
        !state.availableActionKinds.includes(actionType) ||
        isComputerTurn(state.gameState, state.matchSettings)
      ) {
        return;
      }

      if (actionType === 'manualUnfreeze') {
        commitAction({ type: 'manualUnfreeze', coord: source });
        return;
      }

      if (actionType === 'jumpSequence') {
        const firstTargets = [...new Set(state.selectedTargetMap.jumpSequence)];
        set({
          ...createSelectionState(
            source,
            actionType,
            {
              type: 'buildingJumpChain',
              source,
              path: [],
              availableTargets: firstTargets,
            },
            {
              legalTargets: firstTargets,
              draftJumpPath: [],
              availableActionKinds: state.availableActionKinds,
              selectedTargetMap: state.selectedTargetMap,
            },
          ),
        });
        return;
      }

      const actionTargets = [...new Set(state.selectedTargetMap[actionType])];

      set({
        ...createSelectionState(
          source,
          actionType,
          {
            type: 'choosingTarget',
            source,
            actionType,
            availableTargets: actionTargets,
          },
          {
            legalTargets: actionTargets,
            availableActionKinds: state.availableActionKinds,
            selectedTargetMap: state.selectedTargetMap,
          },
        ),
      });
    },
    goToHistoryCursor: (targetCursor) => {
      const initialState = get();
      const normalizedTarget = Number.isInteger(targetCursor)
        ? Math.max(0, Math.min(targetCursor, initialState.turnLog.length))
        : initialState.historyCursor;

      if (normalizedTarget === initialState.historyCursor) {
        return;
      }

      const direction = normalizedTarget < initialState.historyCursor ? 'backward' : 'forward';

      while (get().historyCursor !== normalizedTarget) {
        const moved = applyHistoryStep(direction);

        if (!moved) {
          break;
        }
      }
    },
    redo: () => {
      if (!applyHistoryStep('forward')) {
        return;
      }

      const state = get();
      const justReplayed = state.turnLog[state.historyCursor - 1];

      if (isComputerMatch(state.matchSettings) && justReplayed?.actor === state.matchSettings.humanPlayer) {
        applyHistoryStep('forward');
      }
    },
    retryComputerMove: () => {
      const state = get();

      if (!isComputerTurn(state.gameState, state.matchSettings) || state.aiStatus === 'thinking') {
        return;
      }

      syncComputerTurn();
    },
    restart: () => {
      get().startNewGame(get().matchSettings);
    },
    selectCell: (coord) => {
      const state = get();

      if (
        state.interaction.type === 'passingDevice' ||
        isComputerTurn(state.gameState, state.matchSettings)
      ) {
        return;
      }

      if (state.selectedCell && state.selectedActionType && state.legalTargets.includes(coord)) {
        if (state.selectedActionType === 'jumpSequence') {
          commitAction({
            type: 'jumpSequence',
            source: state.selectedCell,
            path: [coord],
          });
          return;
        }

        commitAction({
          type: state.selectedActionType,
          source: state.selectedCell,
          target: coord,
        } as TurnAction);
        return;
      }

      if (
        state.selectedActionType === 'jumpSequence' &&
        state.selectedCell &&
        state.interaction.type === 'buildingJumpChain'
      ) {
        return;
      }

      const { availableActionKinds, selectedTargetMap } = getCellDerivation(
        state.gameState,
        coord,
        state.ruleConfig,
      );

      if (!availableActionKinds.length) {
        set(createIdleSelection(state.gameState));
        return;
      }

      set({
        ...createSelectionState(
          coord,
          null,
          {
            type: 'pieceSelected',
            source: coord,
            availableActions: availableActionKinds,
          },
          {
            availableActionKinds,
            selectedTargetMap,
          },
        ),
      });
    },
    undo: () => {
      const state = get();

      if (isComputerMatch(state.matchSettings)) {
        const targetCursor = getComputerUndoTarget(state);

        if (targetCursor === state.historyCursor) {
          return;
        }

        while (get().historyCursor !== targetCursor) {
          const moved = applyHistoryStep('backward');

          if (!moved) {
            break;
          }
        }

        return;
      }

      applyHistoryStep('backward');
    },
  };
}
