import { text } from '@/shared/i18n/catalog';
import type { Language } from '@/shared/i18n/types';

import { Button } from '@/ui/primitives/Button';

import styles from './style.module.scss';

type PwaStatusBannerProps = {
  applyUpdate: () => Promise<void>;
  language: Language;
  needRefresh: boolean;
  offlineReady: boolean;
  onDismissNeedRefresh: () => void;
  onDismissOfflineReady: () => void;
};

export function PwaStatusBanner({
  applyUpdate,
  language,
  needRefresh,
  offlineReady,
  onDismissNeedRefresh,
  onDismissOfflineReady,
}: PwaStatusBannerProps) {
  if (!needRefresh && !offlineReady) {
    return null;
  }

  const isUpdateBanner = needRefresh;

  return (
    <section
      className={styles.root}
      data-state={isUpdateBanner ? 'update' : 'ready'}
      role={isUpdateBanner ? 'alert' : 'status'}
      aria-live={isUpdateBanner ? 'assertive' : 'polite'}
    >
      {isUpdateBanner ? (
        <>
          <p>{text(language, 'pwaUpdateReady')}</p>
          <div className={styles.actions}>
            <Button onClick={() => void applyUpdate()}>{text(language, 'pwaUpdateAction')}</Button>
            <Button
              variant="ghost"
              onClick={isUpdateBanner ? onDismissNeedRefresh : onDismissOfflineReady}
            >
              {text(language, 'close')}
            </Button>
        </div>
        </>
      ) : null}
    </section>
  );
}
