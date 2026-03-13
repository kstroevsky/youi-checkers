import { useShallow } from 'zustand/react/shallow';

import { useGameStore } from '@/app/providers/GameStoreProvider';
import { text } from '@/shared/i18n/catalog';
import { MatchSetupPanel } from '@/ui/panels/MatchSetupPanel';
import { ScoreCompactTable } from '@/ui/panels/ScoreCompactTable';
import { Panel } from '@/ui/primitives/Panel';

import styles from './style.module.scss';

export function GameInfoPane() {
  const { language, scoreSummary } = useGameStore(
    useShallow((state) => ({
      language: state.preferences.language,
      scoreSummary: state.scoreSummary,
    })),
  );

  return (
    <div className={styles.infoPane}>
      {scoreSummary ? (
        <ScoreCompactTable compact language={language} scoreSummary={scoreSummary} />
      ) : (
        <Panel className={styles.infoCard}>
          <div className={styles.infoHeading}>
            <strong>{text(language, 'scoreMode')}</strong>
          </div>
          <p className={styles.infoText}>{text(language, 'scoreDisabledHint')}</p>
        </Panel>
      )}
      <MatchSetupPanel compact />
    </div>
  );
}
