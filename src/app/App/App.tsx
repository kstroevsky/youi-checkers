import { lazy, Suspense, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { AppHeader } from '@/app/components/AppHeader';
import type { AppTab } from '@/app/components/AppTabs';
import { TabLoading } from '@/app/components/TabLoading';
import { TurnOverlay } from '@/app/components/TurnOverlay';
import { useGameStore } from '@/app/providers/GameStoreProvider';

import styles from './style.module.scss';

const GameTab = lazy(() => import('@/ui/tabs/GameTab').then((module) => ({ default: module.GameTab })));
const InstructionsTab = lazy(() =>
  import('@/ui/tabs/InstructionsTab').then((module) => ({ default: module.InstructionsTab })),
);
const SettingsTab = lazy(() =>
  import('@/ui/tabs/SettingsTab').then((module) => ({ default: module.SettingsTab })),
);

export function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('game');
  const { language, setPreference } = useGameStore(
    useShallow((state) => ({
      language: state.preferences.language,
      setPreference: state.setPreference,
    })),
  );

  return (
    <>
      <main className={styles.shell}>
        <AppHeader
          activeTab={activeTab}
          language={language}
          onChangeLanguage={(nextLanguage) => setPreference({ language: nextLanguage })}
          onChangeTab={setActiveTab}
        />

        <section className={styles.content}>
          <Suspense fallback={<TabLoading />}>
            {activeTab === 'game' ? <GameTab /> : null}
            {activeTab === 'instructions' ? <InstructionsTab /> : null}
            {activeTab === 'settings' ? <SettingsTab /> : null}
          </Suspense>
        </section>
      </main>

      <TurnOverlay />
    </>
  );
}
