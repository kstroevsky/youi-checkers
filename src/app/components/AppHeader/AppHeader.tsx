import { text } from '@/shared/i18n/catalog';
import type { Language } from '@/shared/i18n/types';

import { AppTabs } from '@/app/components/AppTabs';
import type { AppTab } from '@/app/components/AppTabs';
import { LanguageSwitch } from '@/app/components/LanguageSwitch';

import styles from './style.module.scss';

type AppHeaderProps = {
  activeTab: AppTab;
  language: Language;
  onChangeLanguage: (language: Language) => void;
  onChangeTab: (tab: AppTab) => void;
};

export function AppHeader({
  activeTab,
  language,
  onChangeLanguage,
  onChangeTab,
}: AppHeaderProps) {
  return (
    <header className={styles.root}>
      <div className={styles.main}>
        <div className={styles.title}>
          <h1>{text(language, 'appTitle')}</h1>
          <p>{text(language, 'appTagline')}</p>
        </div>
        <div className={styles.tabs}>
          <AppTabs activeTab={activeTab} language={language} onChange={onChangeTab} />
        </div>
        <div className={styles.switcher}>
          <LanguageSwitch language={language} onChange={onChangeLanguage} />
        </div>
      </div>
    </header>
  );
}
