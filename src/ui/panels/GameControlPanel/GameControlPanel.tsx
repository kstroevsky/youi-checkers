import { HistorySection } from '@/ui/panels/HistorySection';
import { StatusSection } from '@/ui/panels/StatusSection';

import styles from './style.module.scss';

export function GameControlPanel() {
  return (
    <aside className={styles.root}>
      <StatusSection />
      <HistorySection />
    </aside>
  );
}
