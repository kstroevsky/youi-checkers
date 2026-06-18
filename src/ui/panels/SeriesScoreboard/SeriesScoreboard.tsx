import { useShallow } from 'zustand/react/shallow';

import { useGameStore } from '@/app/providers/GameStoreProvider';
import { playerLabel, text } from '@/shared/i18n/catalog';
import type { Language } from '@/shared/i18n/types';
import type { MatchParticipant, MatchSettings } from '@/shared/types/session';
import { Panel } from '@/ui/primitives/Panel';

import styles from './style.module.scss';

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

export function SeriesScoreboard() {
  const { language, matchSettings, seriesState } = useGameStore(
    useShallow((state) => ({
      language: state.preferences.language,
      matchSettings: state.matchSettings,
      seriesState: state.seriesState,
    })),
  );

  if (!seriesState) {
    return null;
  }

  return (
    <Panel className={styles.root}>
      <div className={styles.header}>
        <h2>{text(language, 'matchScore')}</h2>
        <span>
          {text(language, 'gameLabel')} {seriesState.gameNumber}
        </span>
        <span>
          {text(language, 'targetLabel')}: {seriesState.targetPoints}
        </span>
      </div>

      <div className={styles.players}>
        {(['first', 'second'] as const).map((participant) => (
          <div key={participant} className={styles.player}>
            <strong>
              {participantLabel(language, participant, matchSettings)}
            </strong>
            <span>
              {playerLabel(language, seriesState.colors[participant])}
            </span>
            <span>
              {text(language, 'gamesLabel')}:{' '}
              {seriesState.gameWins[participant]}
            </span>
            <span>
              {text(language, 'pointsLabel')}: {seriesState.points[participant]}
              {seriesState.phase === 'finishing' &&
              seriesState.firstWinner === participant &&
              seriesState.pendingPoints > 0
                ? ` +${seriesState.pendingPoints}`
                : ''}
            </span>
          </div>
        ))}
      </div>

      {seriesState.phase === 'finishing' ? (
        <div className={styles.finishing} role="status">
          <strong>{text(language, 'finishingTitle')}</strong>
          <span>{text(language, 'finishingHint')}</span>
          <span>
            {text(language, 'pendingPoints')}: {seriesState.pendingPoints}
          </span>
        </div>
      ) : null}
    </Panel>
  );
}
