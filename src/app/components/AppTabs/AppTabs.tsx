import { startTransition } from 'react';

import { text } from '@/shared/i18n/catalog';
import { cx } from '@/shared/utils/cx';
import type { Language } from '@/shared/i18n/types';

import styles from './style.module.scss';

export type AppTab = 'game' | 'instructions' | 'settings';

type AppTabsProps = {
  activeTab: AppTab;
  language: Language;
  onChange: (tab: AppTab) => void;
};

const TABS: AppTab[] = ['game', 'instructions', 'settings'];

function getTabLabel(language: Language, tab: AppTab): string {
  switch (tab) {
    case 'game':
      return text(language, 'tabGame');
    case 'instructions':
      return text(language, 'tabInstructions');
    case 'settings':
      return text(language, 'tabSettings');
  }
}

export function AppTabs({ activeTab, language, onChange }: AppTabsProps) {
  return (
    <div className={styles.root} role="tablist" aria-label={text(language, 'appSectionsLabel')}>
      {TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={activeTab === tab}
          className={cx(styles.tabButton)}
          onClick={() => startTransition(() => onChange(tab))}
        >
          {getTabLabel(language, tab)}
        </button>
      ))}
    </div>
  );
}
