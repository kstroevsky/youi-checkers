import { getLegalActionsForCell, getScoreSummary } from '@/domain';
import { allCoords } from '@/domain/model/coordinates';
import { useGameStore } from '@/app/providers/GameStoreProvider';
import { Board } from '@/ui/board/Board';
import { HelpDialog } from '@/ui/dialogs/HelpDialog';
import { ControlPanel } from '@/ui/panels/ControlPanel';

export function App() {
  const gameState = useGameStore((state) => state.gameState);
  const ruleConfig = useGameStore((state) => state.ruleConfig);
  const preferences = useGameStore((state) => state.preferences);
  const interaction = useGameStore((state) => state.interaction);
  const selectedCell = useGameStore((state) => state.selectedCell);
  const selectedActionType = useGameStore((state) => state.selectedActionType);
  const legalTargets = useGameStore((state) => state.legalTargets);
  const draftJumpPath = useGameStore((state) => state.draftJumpPath);
  const historyCursor = useGameStore((state) => state.historyCursor);
  const canUndo = useGameStore((state) => state.past.length > 0);
  const canRedo = useGameStore((state) => state.future.length > 0);
  const exportBuffer = useGameStore((state) => state.exportBuffer);
  const importBuffer = useGameStore((state) => state.importBuffer);
  const importError = useGameStore((state) => state.importError);
  const helpOpen = useGameStore((state) => state.helpOpen);
  const selectCell = useGameStore((state) => state.selectCell);
  const chooseActionType = useGameStore((state) => state.chooseActionType);
  const finishJumpSequence = useGameStore((state) => state.finishJumpSequence);
  const cancelInteraction = useGameStore((state) => state.cancelInteraction);
  const acknowledgePassScreen = useGameStore((state) => state.acknowledgePassScreen);
  const undo = useGameStore((state) => state.undo);
  const redo = useGameStore((state) => state.redo);
  const restart = useGameStore((state) => state.restart);
  const setRuleConfig = useGameStore((state) => state.setRuleConfig);
  const setPreference = useGameStore((state) => state.setPreference);
  const setImportBuffer = useGameStore((state) => state.setImportBuffer);
  const importSessionFromBuffer = useGameStore((state) => state.importSessionFromBuffer);
  const refreshExportBuffer = useGameStore((state) => state.refreshExportBuffer);
  const toggleHelp = useGameStore((state) => state.toggleHelp);
  const availableActionKinds =
    interaction.type === 'pieceSelected'
      ? interaction.availableActions
      : selectedCell
        ? Array.from(
            new Set(
              getLegalActionsForCell(gameState, selectedCell, ruleConfig).map(
                (action) => action.type,
              ),
            ),
          )
        : [];
  const scoreSummary = ruleConfig.scoringMode === 'basic' ? getScoreSummary(gameState) : null;
  const selectableCoords =
    interaction.type === 'passingDevice'
      ? []
      : allCoords().filter((coord) => getLegalActionsForCell(gameState, coord, ruleConfig).length);

  return (
    <>
      <main className="app-shell">
        <header className="app-header">
          <div>
            <h1>White Maybe Black</h1>
            <p>Hot-seat local play on one screen.</p>
          </div>
        </header>
        <div className="app-layout">
          <Board
            board={gameState.board}
            legalTargets={legalTargets}
            selectedCell={selectedCell}
            selectableCoords={selectableCoords}
            onSelectCell={selectCell}
          />
          <ControlPanel
            availableActionKinds={availableActionKinds}
            canRedo={canRedo}
            canUndo={canUndo}
            draftJumpPath={draftJumpPath}
            exportBuffer={exportBuffer}
            gameState={gameState}
            helpOpen={helpOpen}
            historyCursor={historyCursor}
            importBuffer={importBuffer}
            importError={importError}
            interaction={interaction}
            preferences={preferences}
            ruleConfig={ruleConfig}
            scoreSummary={scoreSummary}
            selectedActionType={selectedActionType}
            selectedCell={selectedCell}
            onCancel={cancelInteraction}
            onChooseAction={chooseActionType}
            onFinishJump={finishJumpSequence}
            onImportBufferChange={setImportBuffer}
            onImportSession={importSessionFromBuffer}
            onRedo={redo}
            onRefreshExport={refreshExportBuffer}
            onRestart={restart}
            onSetPreference={setPreference}
            onSetRuleConfig={setRuleConfig}
            onToggleHelp={toggleHelp}
            onUndo={undo}
          />
        </div>
      </main>

      {(interaction.type === 'passingDevice' || interaction.type === 'turnResolved') && (
        <div className="pass-overlay" role="presentation">
          <div className="pass-overlay__panel">
            <p>{interaction.nextPlayer === 'white' ? 'White turn' : 'Black turn'}</p>
            <small>{interaction.nextPlayer === 'white' ? 'Передайте белым' : 'Передайте чёрным'}</small>
            <button type="button" className="button" onClick={acknowledgePassScreen}>
              Continue
            </button>
          </div>
        </div>
      )}

      <HelpDialog open={helpOpen} onClose={() => toggleHelp(false)} />
    </>
  );
}
