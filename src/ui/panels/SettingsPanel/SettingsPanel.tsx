import { ExportImportSection } from '@/ui/panels/ExportImportSection';
import { RulesSessionSection } from '@/ui/panels/RulesSessionSection';

import styles from './style.module.scss';

export function SettingsPanel() {
  return (
    <aside className={styles.root}>
      <RulesSessionSection />
      <ExportImportSection />
    </aside>
  );
}
