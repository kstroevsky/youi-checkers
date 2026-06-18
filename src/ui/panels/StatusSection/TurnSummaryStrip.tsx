import { useShallow } from 'zustand/react/shallow';

import type { Victory } from '@/domain';
import { useGameStore } from '@/app/providers/GameStoreProvider';
import type { GlossaryTermId } from '@/features/glossary/terms';
import {
  describeInteraction,
  formatTurnBanner,
  formatVictory,
  playerLabel,
  text,
} from '@/shared/i18n/catalog';
import type { Language } from '@/shared/i18n/types';
import { Button } from '@/ui/primitives/Button';
import { GlossaryTooltip } from '@/ui/tooltips/GlossaryTooltip';

import styles from './style.module.scss';

type TurnSummaryStripProps = {
  compact?: boolean;
};

function getDifficultyLabel(
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

export function getVictoryTermId(victory: Victory): GlossaryTermId | null {
  switch (victory.type) {
    case 'homeField':
      return 'homeFieldVictory';
    case 'sixStacks':
      return 'sixStacksVictory';
    case 'threefoldTiebreakWin':
    case 'threefoldDraw':
      return 'threefoldDraw';
    default:
      return null;
  }
}

export function TurnSummaryStrip({ compact = false }: TurnSummaryStripProps) {
  const {
    aiStatus,
    availableActionKinds,
    currentPlayer,
    interaction,
    language,
    matchSettings,
    moveNumber,
    selectedCell,
    seriesState,
    victory,
    onCancel,
    onRetryComputerMove,
    onSetGameFormat,
  } = useGameStore(
    useShallow((state) => ({
      aiStatus: state.aiStatus,
      availableActionKinds: state.availableActionKinds,
      currentPlayer: state.gameState.currentPlayer,
      interaction: state.interaction,
      language: state.preferences.language,
      matchSettings: state.matchSettings,
      moveNumber: state.gameState.moveNumber,
      selectedCell: state.selectedCell,
      seriesState: state.seriesState,
      victory: state.gameState.victory,
      onCancel: state.cancelInteraction,
      onRetryComputerMove: state.retryComputerMove,
      onSetGameFormat: state.setGameFormat,
    })),
  );

  const isMoveActive = selectedCell !== null && availableActionKinds.length > 0;
  const victoryTermId = getVictoryTermId(victory);
  const jumpFollowUp = interaction.type === 'jumpFollowUp' ? interaction : null;
  const isComputerTurn =
    matchSettings.opponentMode === 'computer' &&
    currentPlayer !== matchSettings.humanPlayer;
  const interactionCopy =
    isComputerTurn && aiStatus === 'error'
      ? text(language, 'computerMoveFailed')
      : isComputerTurn
        ? text(language, 'computerThinking')
        : describeInteraction(language, interaction);
  const matchModeCopy =
    matchSettings.opponentMode === 'computer'
      ? `${text(language, 'computerOpponent')} • ${text(language, 'playAs')} ${playerLabel(language, matchSettings.humanPlayer)} • ${getDifficultyLabel(language, matchSettings.aiDifficulty)}`
      : text(language, 'hotSeat');

  return (
    <div className={styles.summary} data-compact={compact || undefined}>
      <div className={styles.turnBanner}>
        <div>
          <p>{formatTurnBanner(language, currentPlayer)}</p>
          <small>{interactionCopy}</small>
        </div>
        <Button variant="active" onClick={onCancel} disabled={!isMoveActive}>
          {text(language, 'clear')}
        </Button>
      </div>

      {jumpFollowUp ? (
        <div className={styles.jumpFollowUpCallout}>
          <p className={styles.jumpFollowUpLabel}>
            {text(language, 'jumpPathLabel')}
          </p>
          <strong>{jumpFollowUp.source}</strong>
          <small>{text(language, 'jumpPathHint')}</small>
        </div>
      ) : null}

      <div className={styles.metaGrid}>
        <p className={styles.textRow}>
          <strong>{text(language, 'moveNumberLabel')}:</strong> {moveNumber}
        </p>
        <p className={styles.textRow}>
          <strong>{text(language, 'matchModeLabel')}:</strong> {matchModeCopy}
        </p>
        <div className={styles.formatAction}>
          {matchSettings.gameFormat === 'single' ? (
            <Button variant="ghost" onClick={() => onSetGameFormat('series')}>
              {text(language, 'switchToMulti')}
            </Button>
          ) : seriesState?.gameNumber === 1 ? (
            <Button variant="ghost" onClick={() => onSetGameFormat('single')}>
              {text(language, 'switchToSingle')}
            </Button>
          ) : null}
        </div>
        <p className={styles.textRowInline}>
          <strong>{text(language, 'statusLabel')}:</strong>{' '}
          {formatVictory(language, victory)}
          {victoryTermId ? (
            <GlossaryTooltip language={language} termId={victoryTermId} />
          ) : null}
        </p>
        {selectedCell ? (
          <p className={styles.textRow}>
            <strong>{text(language, 'selectedCellLabel')}:</strong>{' '}
            {selectedCell}
          </p>
        ) : null}
        {isComputerTurn && aiStatus === 'error' ? (
          <div className={styles.retryRow}>
            <Button onClick={onRetryComputerMove}>
              {text(language, 'retryComputerMove')}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
