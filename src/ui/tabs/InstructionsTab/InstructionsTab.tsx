import { useGameStore } from '@/app/providers/GameStoreProvider';
import { InstructionsView } from '@/ui/panels/InstructionsView';

import styles from './style.module.scss';

export function InstructionsTab() {
  const language = useGameStore((state) => state.preferences.language);

  return (
    <div className={styles.root} role="tabpanel">
      <InstructionsView language={language} />
    </div>
  );
}
