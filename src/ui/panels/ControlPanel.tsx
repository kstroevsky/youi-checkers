import { RULE_TOGGLE_DESCRIPTORS } from '@/domain';
import type { ActionKind, Coord, GameState, RuleConfig, ScoreSummary, Victory } from '@/domain';
import type { GlossaryTermId } from '@/features/glossary/terms';
import {
  actionLabel,
  describeInteraction,
  formatTurnRecord,
  formatVictory,
  playerLabel,
  text,
} from '@/shared/i18n/catalog';
import type { Language } from '@/shared/i18n/types';
import type { AppPreferences, InteractionState } from '@/shared/types/session';
import { GlossaryTooltip } from '@/ui/tooltips/GlossaryTooltip';

type ControlPanelProps = {
  availableActionKinds: ActionKind[];
  canRedo: boolean;
  canUndo: boolean;
  draftJumpPath: Coord[];
  exportBuffer: string;
  gameState: GameState;
  historyCursor: number;
  importBuffer: string;
  importError: string | null;
  interaction: InteractionState;
  language: Language;
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
  onUndo: () => void;
};

function checkboxId(section: string, name: string): string {
  return `${section}-${name}`;
}

function getTurnLabel(language: Language, currentPlayer: GameState['currentPlayer']): string {
  return language === 'russian'
    ? `${playerLabel(language, currentPlayer)} ходят`
    : `${playerLabel(language, currentPlayer)} turn`;
}

function getVictoryTermId(victory: Victory): GlossaryTermId | null {
  switch (victory.type) {
    case 'homeField':
      return 'homeFieldVictory';
    case 'sixStacks':
      return 'sixStacksVictory';
    case 'threefoldDraw':
      return 'threefoldDraw';
    default:
      return null;
  }
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
  language,
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
  onUndo,
}: ControlPanelProps) {
  const victoryTermId = getVictoryTermId(gameState.victory);
  const scoreItems = scoreSummary
    ? [
        {
          label: text(language, 'whiteHomeSingles'),
          termId: 'homeFieldSingles' as const,
          value: scoreSummary.homeFieldSingles.white,
        },
        {
          label: text(language, 'blackHomeSingles'),
          termId: 'homeFieldSingles' as const,
          value: scoreSummary.homeFieldSingles.black,
        },
        {
          label: text(language, 'whiteStacks'),
          termId: 'controlledStacks' as const,
          value: scoreSummary.controlledStacks.white,
        },
        {
          label: text(language, 'blackStacks'),
          termId: 'controlledStacks' as const,
          value: scoreSummary.controlledStacks.black,
        },
        {
          label: text(language, 'whiteFrontRowStacks'),
          termId: 'frontRowStacks' as const,
          value: scoreSummary.controlledHomeRowHeightThreeStacks.white,
        },
        {
          label: text(language, 'blackFrontRowStacks'),
          termId: 'frontRowStacks' as const,
          value: scoreSummary.controlledHomeRowHeightThreeStacks.black,
        },
        {
          label: text(language, 'whiteFrozenEnemySingles'),
          termId: 'frozenEnemySingles' as const,
          value: scoreSummary.frozenEnemySingles.white,
        },
        {
          label: text(language, 'blackFrozenEnemySingles'),
          termId: 'frozenEnemySingles' as const,
          value: scoreSummary.frozenEnemySingles.black,
        },
      ]
    : [];

  return (
    <aside className="side-panel">
      <section className="panel">
        <div className="turn-banner">
          <p>{getTurnLabel(language, gameState.currentPlayer)}</p>
          <small>{describeInteraction(language, interaction)}</small>
        </div>
        <p className="panel__text">
          <strong>{text(language, 'moveNumberLabel')}:</strong> {gameState.moveNumber}
        </p>
        <p className="panel__text panel__text--with-tooltip">
          <strong>{text(language, 'statusLabel')}:</strong> {formatVictory(language, gameState.victory)}
          {victoryTermId ? <GlossaryTooltip language={language} termId={victoryTermId} /> : null}
        </p>
        {selectedCell ? (
          <p className="panel__text">
            <strong>{text(language, 'selectedCellLabel')}:</strong> {selectedCell}
          </p>
        ) : null}
      </section>

      <section className="panel">
        <div className="panel__header">
          <h2>{text(language, 'moveInput')}</h2>
        </div>
        <div className="action-grid">
          {availableActionKinds.length ? (
            availableActionKinds.map((actionKind) => (
              <div key={actionKind} className="action-chip">
                <button
                  type="button"
                  className={selectedActionType === actionKind ? 'button button--active' : 'button'}
                  onClick={() => onChooseAction(actionKind)}
                >
                  {actionLabel(language, actionKind)}
                </button>
                <GlossaryTooltip language={language} termId={actionKind} />
              </div>
            ))
          ) : (
            <p className="panel__text">{text(language, 'noActionsSelected')}</p>
          )}
        </div>
        {selectedActionType === 'jumpSequence' && draftJumpPath.length ? (
          <div className="inline-actions">
            <button type="button" className="button" onClick={onFinishJump}>
              {text(language, 'finishJump')}
            </button>
          </div>
        ) : null}
        <div className="inline-actions">
          <button type="button" className="button button--ghost" onClick={onCancel}>
            {text(language, 'clear')}
          </button>
        </div>
      </section>

      {scoreSummary ? (
        <section className="panel">
          <div className="panel__header panel__header--with-tooltip">
            <h2>{text(language, 'scoreMode')}</h2>
            <GlossaryTooltip language={language} termId="scoreMode" />
          </div>
          <dl className="score-grid">
            {scoreItems.map((item) => (
              <div key={`${item.label}-${item.value}`}>
                <dt className="score-grid__term">
                  <span>{item.label}</span>
                  <GlossaryTooltip language={language} termId={item.termId} />
                </dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel__header">
          <h2>{text(language, 'rulesAndSession')}</h2>
        </div>
        <div className="settings-list">
          {RULE_TOGGLE_DESCRIPTORS.map((descriptor) => {
            const inputId = checkboxId('rules', descriptor.key);

            return (
              <div key={descriptor.key} className="settings-row">
                <label htmlFor={inputId}>
                  <input
                    id={inputId}
                    type="checkbox"
                    checked={descriptor.isEnabled(ruleConfig)}
                    onChange={(event) => onSetRuleConfig(descriptor.getPatch(event.target.checked))}
                  />
                  <span>{text(language, descriptor.labelKey)}</span>
                </label>
                <GlossaryTooltip language={language} termId={descriptor.glossaryTermId} />
              </div>
            );
          })}
          <div className="settings-row">
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
              <span>{text(language, 'passDeviceOverlay')}</span>
            </label>
            <GlossaryTooltip language={language} termId="passDeviceOverlay" />
          </div>
        </div>
        <div className="inline-actions">
          <button type="button" className="button button--ghost" onClick={onUndo} disabled={!canUndo}>
            {text(language, 'undo')}
          </button>
          <button type="button" className="button button--ghost" onClick={onRedo} disabled={!canRedo}>
            {text(language, 'redo')}
          </button>
          <button type="button" className="button" onClick={onRestart}>
            {text(language, 'restart')}
          </button>
        </div>
        <p className="panel__text">
          <strong>{text(language, 'historyCursor')}:</strong> {historyCursor}
        </p>
      </section>

      <section className="panel">
        <div className="panel__header">
          <h2>{text(language, 'history')}</h2>
        </div>
        <ol className="history-list">
          {[...gameState.history].reverse().map((record, index) => (
            <li key={`${record.positionHash}-${index}`}>{formatTurnRecord(language, record)}</li>
          ))}
        </ol>
      </section>

      <section className="panel">
        <div className="panel__header">
          <h2>{text(language, 'exportImport')}</h2>
        </div>
        <div className="inline-actions">
          <button type="button" className="button button--ghost" onClick={onRefreshExport}>
            {text(language, 'refreshExport')}
          </button>
        </div>
        <label className="field-label" htmlFor="export-session">
          {text(language, 'currentSessionJson')}
        </label>
        <textarea id="export-session" className="session-textarea" readOnly value={exportBuffer} />
        <label className="field-label" htmlFor="import-session">
          {text(language, 'importJson')}
        </label>
        <textarea
          id="import-session"
          className="session-textarea"
          value={importBuffer}
          onChange={(event) => onImportBufferChange(event.target.value)}
        />
        {importError ? <p className="panel__error">{text(language, 'importFailed')}</p> : null}
        <div className="inline-actions">
          <button type="button" className="button" onClick={onImportSession}>
            {text(language, 'importSession')}
          </button>
        </div>
      </section>
    </aside>
  );
}
