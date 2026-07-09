import { useId } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useGameStore } from '@/app/providers/GameStoreProvider';
import { playerLabel, text } from '@/shared/i18n/catalog';
import type { Language } from '@/shared/i18n/types';
import { Button } from '@/ui/primitives/Button';
import { Panel } from '@/ui/primitives/Panel';

import styles from './style.module.scss';

type MatchSetupPanelProps = {
  compact?: boolean;
  embedded?: boolean;
};

function difficultyLabel(
  language: Language,
  difficulty: 'easy' | 'medium' | 'hard',
): string {
  switch (difficulty) {
    case 'easy':
      return text(language, 'difficultyEasy');
    case 'medium':
      return text(language, 'difficultyMedium');
    case 'hard':
      return text(language, 'difficultyHard');
  }
}

/** Renders one compact, game-screen-facing block for configuring the next match. */
export function MatchSetupPanel({
  compact = false,
  embedded = false,
}: MatchSetupPanelProps) {
  const fieldId = useId();
  const {
    language,
    setupMatchSettings,
    onSetSetupMatchSettings,
    onStartNewGame,
  } = useGameStore(
    useShallow((state) => ({
      language: state.preferences.language,
      setupMatchSettings: state.setupMatchSettings,
      onSetSetupMatchSettings: state.setSetupMatchSettings,
      onStartNewGame: state.startNewGame,
    })),
  );
  const computerMatch = setupMatchSettings.opponentMode === 'computer';
  const seriesMatch = setupMatchSettings.gameFormat === 'series';
  const targetFieldId = `${fieldId}-target`;
  const opponentFieldId = `${fieldId}-opponent`;
  const playerFieldId = `${fieldId}-player`;
  const difficultyFieldId = `${fieldId}-difficulty`;
  const content = (
    <>
      <div className={styles.header}>
        <h2>{text(language, 'matchSetup')}</h2>
        {!compact ? (
          <p className={styles.hint}>{text(language, 'matchSetupHint')}</p>
        ) : null}
      </div>

      <div className={styles.field}>
        <p className={styles.fieldLabel} id={opponentFieldId}>
          {text(language, 'opponentMode')}
        </p>
        <div
          className={styles.toggleRow}
          aria-labelledby={opponentFieldId}
          role="radiogroup"
        >
          <label
            className={styles.toggleOption}
            data-checked={
              setupMatchSettings.opponentMode === 'hotSeat' || undefined
            }
          >
            <input
              checked={setupMatchSettings.opponentMode === 'hotSeat'}
              name={`${fieldId}-opponentMode`}
              type="radio"
              onChange={() =>
                onSetSetupMatchSettings({ opponentMode: 'hotSeat' })
              }
            />
            <span>{text(language, 'hotSeat')}</span>
          </label>
          <label
            className={styles.toggleOption}
            data-checked={
              setupMatchSettings.opponentMode === 'computer' || undefined
            }
          >
            <input
              checked={setupMatchSettings.opponentMode === 'computer'}
              name={`${fieldId}-opponentMode`}
              type="radio"
              onChange={() =>
                onSetSetupMatchSettings({ opponentMode: 'computer' })
              }
            />
            <span>{text(language, 'computerOpponent')}</span>
          </label>
        </div>
      </div>

      {seriesMatch ? (
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor={targetFieldId}>
            {text(language, 'targetPoints')}
          </label>
          <input
            id={targetFieldId}
            className={styles.select}
            min={1}
            step={1}
            type="number"
            value={setupMatchSettings.targetPoints || ''}
            onChange={(event) =>
              onSetSetupMatchSettings({
                targetPoints:
                  event.target.value === ''
                    ? 0
                    : Math.max(1, Math.trunc(Number(event.target.value))),
              })
            }
          />
        </div>
      ) : null}

      <div className={styles.field} data-disabled={!computerMatch || undefined}>
        <p className={styles.fieldLabel} id={playerFieldId}>
          {text(language, 'playAs')}
        </p>
        <div
          className={styles.toggleRow}
          aria-labelledby={playerFieldId}
          role="radiogroup"
        >
          {(['white', 'black'] as const).map((player) => {
            const checked = setupMatchSettings.humanPlayer === player;

            return (
              <label
                key={player}
                className={styles.toggleOption}
                data-checked={checked || undefined}
                data-disabled={!computerMatch || undefined}
              >
                <svg viewBox="0 0 32 32" className={styles[player]}>
                  <circle cx="16" cy="16" r="45" className={styles.outer} />
                  <circle cx="16" cy="16" r="28" className={styles.middle} />
                  <circle cx="16" cy="16" r="14" className={styles.inner} />
                </svg>
                <input
                  checked={checked}
                  disabled={!computerMatch}
                  name={`${fieldId}-humanPlayer`}
                  type="radio"
                  onChange={() =>
                    onSetSetupMatchSettings({ humanPlayer: player })
                  }
                />
                <span>{playerLabel(language, player)}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className={styles.field} data-disabled={!computerMatch || undefined}>
        <label className={styles.fieldLabel} htmlFor={difficultyFieldId}>
          {text(language, 'aiDifficulty')}
        </label>
        <select
          id={difficultyFieldId}
          className={styles.select}
          disabled={!computerMatch}
          value={setupMatchSettings.aiDifficulty}
          onChange={(event) =>
            onSetSetupMatchSettings({
              aiDifficulty: event.target.value as 'easy' | 'medium' | 'hard',
            })
          }
        >
          <option value="easy">{difficultyLabel(language, 'easy')}</option>
          <option value="medium">{difficultyLabel(language, 'medium')}</option>
          <option value="hard">{difficultyLabel(language, 'hard')}</option>
        </select>
      </div>

      <Button
        className={styles.startButton}
        fullWidth
        onClick={() => onStartNewGame(setupMatchSettings)}
      >
        {text(language, 'startNewGame')}
      </Button>
    </>
  );

  if (embedded) {
    return (
      <section
        className={styles.root}
        data-compact={compact || undefined}
        data-embedded="true"
      >
        {content}
      </section>
    );
  }

  return (
    <Panel className={styles.root} data-compact={compact || undefined}>
      {content}
    </Panel>
  );
}
