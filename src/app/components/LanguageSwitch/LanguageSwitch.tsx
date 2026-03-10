import { Button } from '@/ui/primitives/Button';
import { text } from '@/shared/i18n/catalog';
import type { Language } from '@/shared/i18n/types';

import styles from './style.module.scss';

type LanguageSwitchProps = {
  language: Language;
  onChange: (language: Language) => void;
};

export function LanguageSwitch({ language, onChange }: LanguageSwitchProps) {
  return (
    <div className={styles.root} aria-label={text(language, 'languageSwitchLabel')}>
      <Button
        variant={language === 'russian' ? 'active' : 'ghost'}
        onClick={() => onChange('russian')}
      >
        {text(language, 'languageRussian')}
      </Button>
      <Button
        variant={language === 'english' ? 'active' : 'ghost'}
        onClick={() => onChange('english')}
      >
        {text(language, 'languageEnglish')}
      </Button>
    </div>
  );
}
