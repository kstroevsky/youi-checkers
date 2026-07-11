import { useEffect, useEffectEvent, useId, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useGameStore } from '@/app/providers/GameStoreProvider';
import type { Player, Victory } from '@/domain';
import {
  formatGameResultTitle,
  formatVictory,
  playerLabel,
  text,
} from '@/shared/i18n/catalog';
import type { Language } from '@/shared/i18n/types';
import type {
  MatchParticipant,
  MatchSettings,
  SeriesState,
} from '@/shared/types/session';
import { Button } from '@/ui/primitives/Button';

import styles from './style.module.scss';

function getResultToken(
  status: 'active' | 'gameOver',
  historyCursor: number,
  victory: Victory,
  seriesState: SeriesState | null,
): string | null {
  if (
    seriesState?.phase === 'betweenGames' ||
    seriesState?.phase === 'matchOver'
  ) {
    return [
      'series',
      seriesState.gameNumber,
      seriesState.phase,
      seriesState.colorChooser ?? 'ready',
      seriesState.colors.first,
    ].join(':');
  }

  if (status !== 'gameOver') {
    return null;
  }

  const winner = 'winner' in victory ? victory.winner : 'draw';

  return `${historyCursor}:${victory.type}:${winner}`;
}

function participantLabel(
  language: Language,
  participant: MatchParticipant,
  matchSettings: MatchSettings,
): string {
  if (matchSettings.opponentMode === 'computer') {
    return participant === 'first'
      ? text(language, 'you')
      : text(language, 'computer');
  }

  return participant === 'first'
    ? text(language, 'playerOne')
    : text(language, 'playerTwo');
}

export function GameResultModal() {
  const {
    historyCursor,
    language,
    matchSettings,
    onlineMatch,
    seriesState,
    status,
    victory,
    onChooseNextSeriesColor,
    onStartNextSeriesGame,
  } = useGameStore(
    useShallow((state) => ({
      historyCursor: state.historyCursor,
      language: state.preferences.language,
      matchSettings: state.matchSettings,
      onlineMatch: state.onlineMatch,
      seriesState: state.seriesState,
      status: state.gameState.status,
      victory: state.gameState.victory,
      onChooseNextSeriesColor: state.chooseNextSeriesColor,
      onStartNextSeriesGame: state.startNextSeriesGame,
    })),
  );
  const titleId = useId();
  const descriptionId = useId();
  const resultToken = getResultToken(
    status,
    historyCursor,
    victory,
    seriesState,
  );
  const isBetweenGames = seriesState?.phase === 'betweenGames';
  const isMatchOver = seriesState?.phase === 'matchOver';
  const isSeriesGate = isBetweenGames || isMatchOver;
  const canDismiss = !isSeriesGate || isMatchOver;
  const [isOpen, setIsOpen] = useState(resultToken !== null);
  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === 'Escape' && canDismiss) {
      setIsOpen(false);
    }
  });

  useEffect(() => {
    setIsOpen(resultToken !== null);
  }, [resultToken]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, isOpen]);

  if (!isOpen || (status !== 'gameOver' && !isSeriesGate)) {
    return null;
  }

  const resultVictory = seriesState?.lastGame?.victory ?? victory;
  const title = isBetweenGames
    ? text(language, 'nextGame')
    : isMatchOver
      ? text(language, 'matchComplete')
      : formatGameResultTitle(language, victory);
  const seriesSummary = seriesState
    ? `${participantLabel(language, 'first', matchSettings)} ${seriesState.points.first} : ${seriesState.points.second} ${participantLabel(language, 'second', matchSettings)}`
    : null;
  const pointDifference =
    isMatchOver && seriesState
      ? Math.abs(seriesState.points.first - seriesState.points.second)
      : null;
  const canChooseNextColor =
    !onlineMatch ||
    (seriesState?.colorChooser === onlineMatch.participant &&
      !onlineMatch.pendingCommand &&
      onlineMatch.status === 'connected');

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onClick={() => {
        if (canDismiss) {
          setIsOpen(false);
        }
      }}
    >
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(event) => event.stopPropagation()}
      >
        <p className={styles.kicker}>{text(language, 'gameResult')}</p>
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId} className={styles.summary}>
          {formatVictory(language, resultVictory)}
        </p>
        {seriesSummary ? (
          <p className={styles.seriesSummary}>{seriesSummary}</p>
        ) : null}
        {pointDifference !== null ? (
          <p className={styles.seriesSummary}>
            {text(language, 'pointDifference')}: {pointDifference}
          </p>
        ) : null}
        {isBetweenGames && seriesState.colorChooser ? (
          <div className={styles.colorChoice}>
            <strong>{text(language, 'chooseNextColor')}</strong>
            <div className={styles.actions}>
              {(['white', 'black'] as const).map((color: Player) => (
                <Button
                  key={color}
                  disabled={!canChooseNextColor}
                  onClick={() => onChooseNextSeriesColor(color)}
                >
                  {playerLabel(language, color)}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        <div className={styles.actions}>
          {isBetweenGames ? (
            <Button
              autoFocus={!seriesState.colorChooser}
              disabled={
                seriesState.colorChooser !== null ||
                Boolean(onlineMatch?.pendingCommand) ||
                (onlineMatch !== null && onlineMatch.status !== 'connected')
              }
              onClick={onStartNextSeriesGame}
            >
              {text(language, 'startNextGame')}
            </Button>
          ) : (
            <Button autoFocus onClick={() => setIsOpen(false)}>
              {text(language, 'close')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
