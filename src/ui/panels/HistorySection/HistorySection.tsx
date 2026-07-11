import {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useGameStore } from '@/app/providers/GameStoreProvider';
import { useIsMobileViewport } from '@/shared/hooks/useIsMobileViewport';
import {
  formatHistorySummary,
  formatTurnRecord,
  text,
} from '@/shared/i18n/catalog';
import { MatchSetupPanel } from '@/ui/panels/MatchSetupPanel';
import { Button } from '@/ui/primitives/Button';
import { Panel } from '@/ui/primitives/Panel';

import styles from './style.module.scss';

type HistoryState = 'current' | 'future' | 'past';

export function HistorySection() {
  const copyResetTimeoutRef = useRef<number | null>(null);
  const [historyCopied, setHistoryCopied] = useState(false);
  const compactLayout = useIsMobileViewport(960);
  const {
    canRedo,
    canUndo,
    historyCursor,
    historyHydrationStatus,
    historyLocked,
    language,
    onlineMatch,
    onGoToHistoryCursor,
    onRedo,
    onUndo,
    turnLog,
  } = useGameStore(
    useShallow((state) => ({
      canRedo:
        state.future.length > 0 &&
        (state.seriesState === null || state.seriesState.phase === 'playing'),
      canUndo:
        state.past.length > 0 &&
        (state.seriesState === null || state.seriesState.phase === 'playing'),
      historyCursor: state.historyCursor,
      historyHydrationStatus: state.historyHydrationStatus,
      historyLocked:
        Boolean(state.onlineMatch) ||
        (state.seriesState !== null && state.seriesState.phase !== 'playing'),
      language: state.preferences.language,
      onlineMatch: state.onlineMatch,
      onGoToHistoryCursor: state.goToHistoryCursor,
      onRedo: state.redo,
      onUndo: state.undo,
      turnLog: state.turnLog,
    })),
  );
  const deferredTurnLog = useDeferredValue(turnLog);
  const historyEntries = deferredTurnLog
    .map((record, index) => ({ record, index }))
    .reverse();
  const hydrationNote =
    historyHydrationStatus === 'hydrating'
      ? text(language, 'historyHydrating')
      : historyHydrationStatus === 'recentOnly'
        ? text(language, 'historyRecentOnly')
        : null;
  const copyLabel = historyCopied
    ? text(language, 'historyCopied')
    : text(language, 'historyCopy');

  const showMatchSetup = !compactLayout && !onlineMatch;
  const historyCopyPayload = deferredTurnLog
    .map(
      (record, index) => `${index + 1}. ${formatTurnRecord(language, record)}`,
    )
    .join('\n');

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
    };
  }, []);

  const handleHistoryCopy = () => {
    if (
      !historyCopyPayload.length ||
      typeof navigator === 'undefined' ||
      typeof navigator.clipboard?.writeText !== 'function'
    ) {
      return;
    }

    void navigator.clipboard
      .writeText(historyCopyPayload)
      .then(() => {
        setHistoryCopied(true);

        if (copyResetTimeoutRef.current !== null) {
          window.clearTimeout(copyResetTimeoutRef.current);
        }

        copyResetTimeoutRef.current = window.setTimeout(() => {
          setHistoryCopied(false);
          copyResetTimeoutRef.current = null;
        }, 1200);
      })
      .catch(() => {
        setHistoryCopied(false);
      });
  };

  return (
    <Panel className={styles.root}>
      <div className={styles.header}>
        <h2>{text(language, 'history')}</h2>
        <div className={styles.headerActions}>
          <Button
            className={styles.headerButton}
            variant="ghost"
            onClick={onUndo}
            disabled={!canUndo}
          >
            {text(language, 'undo')}
          </Button>
          <Button
            className={styles.headerButton}
            variant="ghost"
            onClick={onRedo}
            disabled={!canRedo}
          >
            {text(language, 'redo')}
          </Button>
          <button
            type="button"
            className={styles.historyCopyButton}
            aria-label={copyLabel}
            title={copyLabel}
            data-copied={historyCopied || undefined}
            onClick={handleHistoryCopy}
            disabled={!historyCopyPayload.length}
          >
            <span className={styles.copyIcon} aria-hidden="true" />
          </button>
        </div>
        <small>
          {formatHistorySummary(
            language,
            deferredTurnLog.length,
            historyCursor,
          )}
        </small>
        {hydrationNote ? (
          <small className={styles.statusNote}>{hydrationNote}</small>
        ) : null}
      </div>
      <ol className={styles.list}>
        {historyEntries.map(({ record, index }) => {
          const state: HistoryState =
            index + 1 === historyCursor
              ? 'current'
              : index >= historyCursor
                ? 'future'
                : 'past';

          return (
            <li key={`${record.positionHash}-${index}`}>
              <button
                type="button"
                className={styles.historyButton}
                data-state={state}
                aria-current={state === 'current' ? 'step' : undefined}
                onClick={() =>
                  startTransition(() => onGoToHistoryCursor(index + 1))
                }
                disabled={historyLocked || state === 'current'}
                title={formatTurnRecord(language, record)}
              >
                {formatTurnRecord(language, record)}
              </button>
            </li>
          );
        })}
      </ol>
      {onlineMatch ? (
        <p className={styles.statusNote}>
          {text(language, 'onlineHistoryDisabled')}
        </p>
      ) : null}
      {showMatchSetup ? (
        <div className={styles.footer}>
          <MatchSetupPanel compact embedded />
        </div>
      ) : null}
    </Panel>
  );
}
