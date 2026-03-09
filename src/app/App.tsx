import { useState } from 'react';

import { getLegalActionsForCell, getScoreSummary } from '@/domain';
import { allCoords } from '@/domain/model/coordinates';
import { useGameStore } from '@/app/providers/GameStoreProvider';
import { playerLabel, text } from '@/shared/i18n/catalog';
import type { Language } from '@/shared/i18n/types';
import { Board } from '@/ui/board/Board';
import { ControlPanel } from '@/ui/panels/ControlPanel';
import { InstructionsView } from '@/ui/panels/InstructionsView';

type AppTab = 'game' | 'instructions';

function getTurnOverlayTitle(language: Language, player: 'white' | 'black'): string {
  return language === 'russian'
    ? `${playerLabel(language, player)} ходят`
    : `${playerLabel(language, player)} turn`;
}

function getPassOverlayLabel(language: Language, player: 'white' | 'black'): string {
  return language === 'russian'
    ? `Передайте устройство: ${playerLabel(language, player).toLowerCase()}.`
    : `Pass the device to ${playerLabel(language, player)}.`;
}

export function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('game');
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
  const language = preferences.language;
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
          <div className="app-header__main">
            <div>
              <h1>{text(language, 'appTitle')}</h1>
              <p>{text(language, 'appTagline')}</p>
            </div>
            <div className="language-switch" aria-label={text(language, 'languageSwitchLabel')}>
              <button
                type="button"
                className={language === 'russian' ? 'button button--active' : 'button button--ghost'}
                onClick={() => setPreference({ language: 'russian' })}
              >
                {text(language, 'languageRussian')}
              </button>
              <button
                type="button"
                className={language === 'english' ? 'button button--active' : 'button button--ghost'}
                onClick={() => setPreference({ language: 'english' })}
              >
                {text(language, 'languageEnglish')}
              </button>
            </div>
          </div>
          <div className="app-tabs" role="tablist" aria-label={text(language, 'appSectionsLabel')}>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'game'}
              className={activeTab === 'game' ? 'tab-button tab-button--active' : 'tab-button'}
              onClick={() => setActiveTab('game')}
            >
              {text(language, 'tabGame')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'instructions'}
              className={activeTab === 'instructions' ? 'tab-button tab-button--active' : 'tab-button'}
              onClick={() => setActiveTab('instructions')}
            >
              {text(language, 'tabInstructions')}
            </button>
          </div>
        </header>

        {activeTab === 'game' ? (
          <div className="app-layout">
            <Board
              board={gameState.board}
              language={language}
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
              historyCursor={historyCursor}
              importBuffer={importBuffer}
              importError={importError}
              interaction={interaction}
              language={language}
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
              onUndo={undo}
            />
          </div>
        ) : (
          <InstructionsView language={language} />
        )}
      </main>

      {(interaction.type === 'passingDevice' || interaction.type === 'turnResolved') && (
        <div className="pass-overlay" role="presentation">
          <div className="pass-overlay__panel">
            <p>{getTurnOverlayTitle(language, interaction.nextPlayer)}</p>
            <small>{getPassOverlayLabel(language, interaction.nextPlayer)}</small>
            <button type="button" className="button" onClick={acknowledgePassScreen}>
              {text(language, 'continue')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
