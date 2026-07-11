import { useShallow } from 'zustand/react/shallow';

import { RULE_TOGGLE_DESCRIPTORS } from '@/domain';
import { useGameStore } from '@/app/providers/GameStoreProvider';
import { text } from '@/shared/i18n/catalog';
import { useDiagnosticsPreference } from '@/shared/telemetry/useDiagnosticsPreference';
import { Panel } from '@/ui/primitives/Panel';
import { GlossaryTooltip } from '@/ui/tooltips/GlossaryTooltip';

import styles from './style.module.scss';

function checkboxId(section: string, name: string): string {
  return `${section}-${name}`;
}

export function RulesSessionSection() {
  const diagnostics = useDiagnosticsPreference();
  const {
    language,
    preferences,
    onlineMatch,
    ruleConfig,
    onSetPreference,
    onSetRuleConfig,
  } = useGameStore(
    useShallow((state) => ({
      language: state.preferences.language,
      preferences: state.preferences,
      onlineMatch: state.onlineMatch,
      ruleConfig: state.ruleConfig,
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
                  disabled={Boolean(onlineMatch)}
                  onChange={(event) =>
                    onSetRuleConfig(descriptor.getPatch(event.target.checked))
                  }
                />
                <span>{text(language, descriptor.labelKey)}</span>
              </label>
              <GlossaryTooltip
                language={language}
                termId={descriptor.glossaryTermId}
              />
            </div>
          );
        })}
        {onlineMatch ? (
          <p className={styles.diagnosticsHint}>
            {text(language, 'onlineSettingsLocked')}
          </p>
        ) : null}
        <div className={styles.row}>
          <label
            htmlFor={checkboxId('session', 'overlay')}
            className={styles.label}
          >
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
        <div className={styles.row}>
          <label
            htmlFor={checkboxId('session', 'diagnostics')}
            className={styles.label}
          >
            <input
              id={checkboxId('session', 'diagnostics')}
              type="checkbox"
              checked={diagnostics.enabled}
              aria-describedby={checkboxId(
                'session',
                'diagnostics-description',
              )}
              onChange={(event) => diagnostics.setEnabled(event.target.checked)}
            />
            <span>{text(language, 'anonymousDiagnostics')}</span>
          </label>
        </div>
        <p
          id={checkboxId('session', 'diagnostics-description')}
          className={styles.diagnosticsHint}
        >
          {text(language, 'diagnosticsDescription')}
        </p>
      </div>
    </Panel>
  );
}
