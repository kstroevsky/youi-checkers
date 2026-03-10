import { useShallow } from 'zustand/react/shallow';

import type { GameState, Victory } from '@/domain';
import { useGameStore } from '@/app/providers/GameStoreProvider';
import type { GlossaryTermId } from '@/features/glossary/terms';
import { describeInteraction, formatVictory, playerLabel, text } from '@/shared/i18n/catalog';
import type { Language } from '@/shared/i18n/types';
import { Panel } from '@/ui/primitives/Panel';
import { GlossaryTooltip } from '@/ui/tooltips/GlossaryTooltip';
import { ScoreCompactTable } from '@/ui/panels/ScoreCompactTable';

import styles from './style.module.scss';

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

export function StatusSection() {
  const { currentPlayer, interaction, moveNumber, scoreSummary, selectedCell, victory, language } = useGameStore(
    useShallow((state) => ({
      currentPlayer: state.gameState.currentPlayer,
      interaction: state.interaction,
      moveNumber: state.gameState.moveNumber,
      scoreSummary: state.scoreSummary,
      selectedCell: state.selectedCell,
      victory: state.gameState.victory,
      language: state.preferences.language,
    })),
  );
  const victoryTermId = getVictoryTermId(victory);

  return (
    <Panel className={styles.root}>
      <div className={styles.turnBanner}>
        <p>{getTurnLabel(language, currentPlayer)}</p>
        <small>{describeInteraction(language, interaction)}</small>
      </div>
      <p className={styles.textRow}>
        <strong>{text(language, 'moveNumberLabel')}:</strong> {moveNumber}
      </p>
      <p className={styles.textRowInline}>
        <strong>{text(language, 'statusLabel')}:</strong> {formatVictory(language, victory)}
        {victoryTermId ? <GlossaryTooltip language={language} termId={victoryTermId} /> : null}
      </p>
      {selectedCell ? (
        <p className={styles.textRow}>
          <strong>{text(language, 'selectedCellLabel')}:</strong> {selectedCell}
        </p>
      ) : null}
      {scoreSummary ? <ScoreCompactTable language={language} scoreSummary={scoreSummary} /> : null}
    </Panel>
  );
}
