import { useShallow } from 'zustand/react/shallow';

import { useGameStore } from '@/app/providers/GameStoreProvider';
import { isOnlineInputLocked } from '@/app/store/createGameStore/onlineMatchPolicy';
import { getTurnActionEndpoints, type Coord } from '@/domain';
import { Board } from '@/ui/board/Board';

const NO_SELECTABLE_COORDS: Coord[] = [];

export function BoardStage() {
  const {
    board,
    jumpFollowUpSource,
    language,
    legalTargets,
    lastAction,
    selectedCell,
    selectableCoords,
    onSelectCell,
  } = useGameStore(
    useShallow((state) => ({
      board: state.gameState.board,
      jumpFollowUpSource:
        state.interaction.type === 'jumpFollowUp'
          ? state.interaction.source
          : null,
      language: state.preferences.language,
      legalTargets: state.legalTargets,
      lastAction:
        state.historyCursor > 0
          ? (state.turnLog[state.historyCursor - 1]?.action ?? null)
          : null,
      selectedCell: state.selectedCell,
      selectableCoords:
        state.interaction.type === 'passingDevice' ||
        isOnlineInputLocked(state) ||
        (state.matchSettings.opponentMode === 'computer' &&
          state.gameState.currentPlayer !== state.matchSettings.humanPlayer)
          ? NO_SELECTABLE_COORDS
          : state.selectableCoords,
      onSelectCell: state.selectCell,
    })),
  );
  const lastMove = lastAction ? getTurnActionEndpoints(lastAction) : null;

  return (
    <Board
      board={board}
      jumpFollowUpSource={jumpFollowUpSource}
      language={language}
      legalTargets={legalTargets}
      lastMoveSource={lastMove?.source ?? null}
      lastMoveTarget={lastMove?.target ?? null}
      selectedCell={selectedCell}
      selectableCoords={selectableCoords}
      onSelectCell={onSelectCell}
    />
  );
}
