import { useShallow } from 'zustand/react/shallow';

import { useGameStore } from '@/app/providers/GameStoreProvider';
import { Button } from '@/ui/primitives/Button';
import { playerLabel, text } from '@/shared/i18n/catalog';
import type { Language } from '@/shared/i18n/types';

import styles from './style.module.scss';

function getTurnOverlayTitle(language: Language, player: 'white' | 'black'): string {
  return language === 'russian'
    ? `${playerLabel(language, player)} ходят`
    : `${playerLabel(language, player)} turn`;
}

function getPassOverlayLabel(language: Language, player: 'white' | 'black'): string {
  return language === 'russian'
    ? `Передайте устройство: ${playerLabel(language, player).toLowerCase()}.`
    : `Pass the device to ${playerLabel(language, player)}.`;
}

export function TurnOverlay() {
  const { interaction, language, acknowledgePassScreen } = useGameStore(
    useShallow((state) => ({
      interaction: state.interaction,
      language: state.preferences.language,
      acknowledgePassScreen: state.acknowledgePassScreen,
    })),
  );

  if (interaction.type !== 'passingDevice' && interaction.type !== 'turnResolved') {
    return null;
  }

  return (
    <div className={styles.overlay} role="presentation">
      <div className={styles.panel}>
        <p>{getTurnOverlayTitle(language, interaction.nextPlayer)}</p>
        <small>{getPassOverlayLabel(language, interaction.nextPlayer)}</small>
        <Button onClick={acknowledgePassScreen}>{text(language, 'continue')}</Button>
      </div>
    </div>
  );
}
