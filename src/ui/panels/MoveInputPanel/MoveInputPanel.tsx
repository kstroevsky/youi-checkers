import { useShallow } from 'zustand/react/shallow';

import { useGameStore } from '@/app/providers/GameStoreProvider';
import { actionLabel, text } from '@/shared/i18n/catalog';
import { Button } from '@/ui/primitives/Button';
import { Panel } from '@/ui/primitives/Panel';
import { GlossaryTooltip } from '@/ui/tooltips/GlossaryTooltip';

import styles from './style.module.scss';

export function MoveInputPanel() {
  const {
    availableActionKinds,
    language,
    selectedActionType,
    selectedCell,
    onCancel,
    onChooseAction,
  } = useGameStore(
    useShallow((state) => ({
      availableActionKinds: state.availableActionKinds,
      language: state.preferences.language,
      selectedActionType: state.selectedActionType,
      selectedCell: state.selectedCell,
      onCancel: state.cancelInteraction,
      onChooseAction: state.chooseActionType,
    })),
  );

  const hint =
    selectedActionType === 'jumpSequence' && selectedCell
      ? `${text(language, 'jumpPathLabel')}: ${selectedCell}`
      : text(language, 'noActionsSelected');

  return (
    <Panel className={styles.root}>
      <div className={styles.titleRow}>
        <strong>{text(language, 'moveInput')}</strong>
        <Button variant="ghost" onClick={onCancel}>
          {text(language, 'clear')}
        </Button>
      </div>
      <div className={styles.actionGrid}>
        {availableActionKinds.length ? (
          availableActionKinds.map((actionKind) => (
            <div key={actionKind} className={styles.actionChip}>
              <Button
                fullWidth
                variant={selectedActionType === actionKind ? 'active' : 'solid'}
                onClick={() => onChooseAction(actionKind)}
              >
                {actionLabel(language, actionKind)}
              </Button>
              <GlossaryTooltip language={language} termId={actionKind} />
            </div>
          ))
        ) : (
          <span className={styles.empty}>{text(language, 'moveUnavailable')}</span>
        )}
      </div>
      <p className={styles.hint}>{hint}</p>
      {selectedActionType === 'jumpSequence' ? (
        <p className={styles.hintSecondary}>{text(language, 'jumpPathHint')}</p>
      ) : null}
    </Panel>
  );
}
