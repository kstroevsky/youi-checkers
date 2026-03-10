import { startTransition, useDeferredValue } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useGameStore } from '@/app/providers/GameStoreProvider';
import { formatTurnRecord, text } from '@/shared/i18n/catalog';
import { Button } from '@/ui/primitives/Button';
import { Panel } from '@/ui/primitives/Panel';

import styles from './style.module.scss';

type HistoryState = 'current' | 'future' | 'past';

function historyCountLabel(language: 'english' | 'russian', count: number): string {
  return language === 'russian' ? `Всего: ${count}` : `Total: ${count}`;
}

export function HistorySection() {
  const { canRedo, canUndo, historyCursor, language, onGoToHistoryCursor, onRedo, onUndo, turnLog } = useGameStore(
    useShallow((state) => ({
      canRedo: state.future.length > 0,
      canUndo: state.past.length > 0,
      historyCursor: state.historyCursor,
      language: state.preferences.language,
      onGoToHistoryCursor: state.goToHistoryCursor,
      onRedo: state.redo,
      onUndo: state.undo,
      turnLog: state.turnLog,
    })),
  );
  const deferredTurnLog = useDeferredValue(turnLog);
  const historyEntries = deferredTurnLog.map((record, index) => ({ record, index })).reverse();

  return (
    <Panel className={styles.root}>
      <div className={styles.header}>
        <h2>{text(language, 'history')}</h2>
        <div className={styles.headerActions}>
          <Button className={styles.headerButton} variant="ghost" onClick={onUndo} disabled={!canUndo}>
            {text(language, 'undo')}
          </Button>
          <Button className={styles.headerButton} variant="ghost" onClick={onRedo} disabled={!canRedo}>
            {text(language, 'redo')}
          </Button>
        </div>
        <small>{historyCountLabel(language, deferredTurnLog.length)}</small>
      </div>
      <ol className={styles.list}>
        {historyEntries.map(({ record, index }) => {
          const state: HistoryState =
            index + 1 === historyCursor ? 'current' : index >= historyCursor ? 'future' : 'past';

          return (
            <li key={`${record.positionHash}-${index}`}>
              <button
                type="button"
                className={styles.historyButton}
                data-state={state}
                aria-current={state === 'current' ? 'step' : undefined}
                onClick={() => startTransition(() => onGoToHistoryCursor(index + 1))}
                disabled={state === 'current'}
                title={formatTurnRecord(language, record)}
              >
                {formatTurnRecord(language, record)}
              </button>
            </li>
          );
        })}
      </ol>
      <p className={styles.meta}>
        <strong>{text(language, 'historyCursor')}:</strong> {historyCursor}
      </p>
    </Panel>
  );
}
