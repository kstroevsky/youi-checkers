import type { ActionKind, Coord, GameState, RuleConfig, ScoreSummary } from '@/domain';
import type { AppPreferences, InteractionState } from '@/shared/types/session';

import { actionLabel, describeInteraction, playerLabel, playerLabelRu } from '@/features/game-session/labels';
import { formatTurnRecord, formatVictory } from '@/features/history/formatters';

type ControlPanelProps = {
  availableActionKinds: ActionKind[];
  canRedo: boolean;
  canUndo: boolean;
  draftJumpPath: Coord[];
  exportBuffer: string;
  gameState: GameState;
  helpOpen: boolean;
  historyCursor: number;
  importBuffer: string;
  importError: string | null;
  interaction: InteractionState;
  preferences: AppPreferences;
  ruleConfig: RuleConfig;
  scoreSummary: ScoreSummary | null;
  selectedActionType: ActionKind | null;
  selectedCell: Coord | null;
  onCancel: () => void;
  onChooseAction: (actionType: ActionKind) => void;
  onFinishJump: () => void;
  onImportBufferChange: (value: string) => void;
  onImportSession: () => void;
  onRedo: () => void;
  onRefreshExport: () => void;
  onRestart: () => void;
  onSetPreference: (preferences: Partial<AppPreferences>) => void;
  onSetRuleConfig: (config: Partial<RuleConfig>) => void;
  onToggleHelp: (open?: boolean) => void;
  onUndo: () => void;
};

function checkboxId(section: string, name: string): string {
  return `${section}-${name}`;
}

export function ControlPanel({
  availableActionKinds,
  canRedo,
  canUndo,
  draftJumpPath,
  exportBuffer,
  gameState,
  historyCursor,
  importBuffer,
  importError,
  interaction,
  preferences,
  ruleConfig,
  scoreSummary,
  selectedActionType,
  selectedCell,
  onCancel,
  onChooseAction,
  onFinishJump,
  onImportBufferChange,
  onImportSession,
  onRedo,
  onRefreshExport,
  onRestart,
  onSetPreference,
  onSetRuleConfig,
  onToggleHelp,
  onUndo,
}: ControlPanelProps) {
  return (
    <aside className="side-panel">
      <section className="panel">
        <div className="turn-banner">
          <p>{playerLabel(gameState.currentPlayer)} turn</p>
          <small>{playerLabelRu(gameState.currentPlayer)} ходят</small>
        </div>
        <p className="panel__text">{describeInteraction(interaction)}</p>
        <p className="panel__text">Move {gameState.moveNumber}</p>
        <p className="panel__text">{formatVictory(gameState.victory)}</p>
        {selectedCell ? <p className="panel__text">Selected: {selectedCell}</p> : null}
      </section>

      <section className="panel">
        <div className="panel__header">
          <h2>Move input</h2>
        </div>
        <div className="action-grid">
          {availableActionKinds.length ? (
            availableActionKinds.map((actionKind) => (
              <button
                key={actionKind}
                type="button"
                className={selectedActionType === actionKind ? 'button button--active' : 'button'}
                onClick={() => onChooseAction(actionKind)}
              >
                {actionLabel(actionKind)}
              </button>
            ))
          ) : (
            <p className="panel__text">No actions selected.</p>
          )}
        </div>
        {selectedActionType === 'jumpSequence' && draftJumpPath.length ? (
          <div className="inline-actions">
            <button type="button" className="button" onClick={onFinishJump}>
              Finish jump
            </button>
          </div>
        ) : null}
        <div className="inline-actions">
          <button type="button" className="button button--ghost" onClick={onCancel}>
            Clear
          </button>
        </div>
      </section>

      {scoreSummary ? (
        <section className="panel">
          <div className="panel__header">
            <h2>Score mode</h2>
          </div>
          <dl className="score-grid">
            <div>
              <dt>White home singles</dt>
              <dd>{scoreSummary.homeFieldSingles.white}</dd>
            </div>
            <div>
              <dt>Black home singles</dt>
              <dd>{scoreSummary.homeFieldSingles.black}</dd>
            </div>
            <div>
              <dt>White stacks</dt>
              <dd>{scoreSummary.controlledStacks.white}</dd>
            </div>
            <div>
              <dt>Black stacks</dt>
              <dd>{scoreSummary.controlledStacks.black}</dd>
            </div>
            <div>
              <dt>White front-row 3-stacks</dt>
              <dd>{scoreSummary.controlledHomeRowHeightThreeStacks.white}</dd>
            </div>
            <div>
              <dt>Black front-row 3-stacks</dt>
              <dd>{scoreSummary.controlledHomeRowHeightThreeStacks.black}</dd>
            </div>
            <div>
              <dt>White frozen enemy singles</dt>
              <dd>{scoreSummary.frozenEnemySingles.white}</dd>
            </div>
            <div>
              <dt>Black frozen enemy singles</dt>
              <dd>{scoreSummary.frozenEnemySingles.black}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel__header">
          <h2>Rules and session</h2>
        </div>
        <div className="settings-list">
          <label htmlFor={checkboxId('rules', 'transfer')}>
            <input
              id={checkboxId('rules', 'transfer')}
              type="checkbox"
              checked={ruleConfig.allowNonAdjacentFriendlyStackTransfer}
              onChange={(event) =>
                onSetRuleConfig({
                  allowNonAdjacentFriendlyStackTransfer: event.target.checked,
                })
              }
            />
            Non-adjacent friendly transfer
          </label>
          <label htmlFor={checkboxId('rules', 'draw')}>
            <input
              id={checkboxId('rules', 'draw')}
              type="checkbox"
              checked={ruleConfig.drawRule === 'threefold'}
              onChange={(event) =>
                onSetRuleConfig({
                  drawRule: event.target.checked ? 'threefold' : 'none',
                })
              }
            />
            Threefold repetition draw
          </label>
          <label htmlFor={checkboxId('rules', 'score')}>
            <input
              id={checkboxId('rules', 'score')}
              type="checkbox"
              checked={ruleConfig.scoringMode === 'basic'}
              onChange={(event) =>
                onSetRuleConfig({
                  scoringMode: event.target.checked ? 'basic' : 'off',
                })
              }
            />
            Basic score summary
          </label>
          <label htmlFor={checkboxId('session', 'overlay')}>
            <input
              id={checkboxId('session', 'overlay')}
              type="checkbox"
              checked={preferences.passDeviceOverlayEnabled}
              onChange={(event) =>
                onSetPreference({
                  passDeviceOverlayEnabled: event.target.checked,
                })
              }
            />
            Pass-device overlay
          </label>
        </div>
        <div className="inline-actions">
          <button type="button" className="button button--ghost" onClick={onUndo} disabled={!canUndo}>
            Undo
          </button>
          <button type="button" className="button button--ghost" onClick={onRedo} disabled={!canRedo}>
            Redo
          </button>
          <button type="button" className="button" onClick={onRestart}>
            Restart
          </button>
          <button type="button" className="button button--ghost" onClick={() => onToggleHelp(true)}>
            Help
          </button>
        </div>
        <p className="panel__text">History cursor: {historyCursor}</p>
      </section>

      <section className="panel">
        <div className="panel__header">
          <h2>History</h2>
        </div>
        <ol className="history-list">
          {[...gameState.history].reverse().map((record, index) => (
            <li key={`${record.positionHash}-${index}`}>{formatTurnRecord(record)}</li>
          ))}
        </ol>
      </section>

      <section className="panel">
        <div className="panel__header">
          <h2>Export / Import</h2>
        </div>
        <div className="inline-actions">
          <button type="button" className="button button--ghost" onClick={onRefreshExport}>
            Refresh export
          </button>
        </div>
        <label className="field-label" htmlFor="export-session">
          Current session JSON
        </label>
        <textarea id="export-session" className="session-textarea" readOnly value={exportBuffer} />
        <label className="field-label" htmlFor="import-session">
          Import JSON
        </label>
        <textarea
          id="import-session"
          className="session-textarea"
          value={importBuffer}
          onChange={(event) => onImportBufferChange(event.target.value)}
        />
        {importError ? <p className="panel__error">{importError}</p> : null}
        <div className="inline-actions">
          <button type="button" className="button" onClick={onImportSession}>
            Import session
          </button>
        </div>
      </section>
    </aside>
  );
}
