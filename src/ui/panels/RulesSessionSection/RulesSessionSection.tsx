import { useShallow } from 'zustand/react/shallow';

import { RULE_TOGGLE_DESCRIPTORS } from '@/domain';
import { useGameStore } from '@/app/providers/GameStoreProvider';
import { text } from '@/shared/i18n/catalog';
import { Button } from '@/ui/primitives/Button';
import { Panel } from '@/ui/primitives/Panel';
import { GlossaryTooltip } from '@/ui/tooltips/GlossaryTooltip';

import styles from './style.module.scss';

function checkboxId(section: string, name: string): string {
  return `${section}-${name}`;
}

export function RulesSessionSection() {
  const {
    language,
    preferences,
    ruleConfig,
    onRestart,
    onSetPreference,
    onSetRuleConfig,
  } = useGameStore(
    useShallow((state) => ({
      language: state.preferences.language,
      preferences: state.preferences,
      ruleConfig: state.ruleConfig,
      onRestart: state.restart,
      onSetPreference: state.setPreference,
      onSetRuleConfig: state.setRuleConfig,
    })),
  );

  return (
    <Panel className={styles.root}>
      <div className={styles.header}>
        <h2>{text(language, 'rulesAndSession')}</h2>
      </div>
      <div className={styles.settingsList}>
        {RULE_TOGGLE_DESCRIPTORS.map((descriptor) => {
          const inputId = checkboxId('rules', descriptor.key);

          return (
            <div key={descriptor.key} className={styles.row}>
              <label htmlFor={inputId} className={styles.label}>
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
        <div className={styles.row}>
          <label htmlFor={checkboxId('session', 'overlay')} className={styles.label}>
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
      <div className={styles.actions}>
        <Button onClick={onRestart}>{text(language, 'restart')}</Button>
      </div>
    </Panel>
  );
}
