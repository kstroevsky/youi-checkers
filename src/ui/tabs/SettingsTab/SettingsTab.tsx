import { SettingsPanel } from '@/ui/panels/SettingsPanel';

import styles from './style.module.scss';

export function SettingsTab() {
  return (
    <div className={styles.root} role="tabpanel">
      <SettingsPanel />
    </div>
  );
}
