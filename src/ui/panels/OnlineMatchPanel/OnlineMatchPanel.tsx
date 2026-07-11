import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useGameStore } from '@/app/providers/GameStoreProvider';
import { text } from '@/shared/i18n/catalog';
import type { Language } from '@/shared/i18n/types';
import { Button } from '@/ui/primitives/Button';
import { Panel } from '@/ui/primitives/Panel';

import styles from './style.module.scss';

function statusLabel(
  language: Language,
  status: NonNullable<
    ReturnType<typeof useOnlineMatchState>['onlineMatch']
  >['status'],
): string {
  switch (status) {
    case 'connecting':
      return text(language, 'onlineConnecting');
    case 'waiting':
      return text(language, 'onlineWaiting');
    case 'connected':
      return text(language, 'onlineConnected');
    case 'reconnecting':
      return text(language, 'onlineReconnecting');
    case 'error':
      return text(language, 'onlineConnectionError');
  }
}

function useOnlineMatchState() {
  return useGameStore(
    useShallow((state) => ({
      language: state.preferences.language,
      onlineMatch: state.onlineMatch,
      onCreate: state.createOnlineMatch,
      onJoin: state.joinOnlineMatch,
      onLeave: state.leaveOnlineMatch,
    })),
  );
}

export function OnlineMatchPanel() {
  const { language, onlineMatch, onCreate, onJoin, onLeave } =
    useOnlineMatchState();
  const [inviteInput, setInviteInput] = useState('');
  const [copied, setCopied] = useState(false);
  const busy =
    onlineMatch?.status === 'connecting' ||
    onlineMatch?.status === 'reconnecting';

  const copyInvite = () => {
    if (!onlineMatch?.inviteUrl || !navigator.clipboard?.writeText) return;
    void navigator.clipboard.writeText(onlineMatch.inviteUrl).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    });
  };

  return (
    <Panel className={styles.root}>
      <div className={styles.heading}>
        <div>
          <h2>{text(language, 'onlinePlay')}</h2>
          <p>{text(language, 'onlinePlayHint')}</p>
        </div>
        {onlineMatch ? (
          <span className={styles.status} data-status={onlineMatch.status}>
            {statusLabel(language, onlineMatch.status)}
          </span>
        ) : null}
      </div>

      {onlineMatch ? (
        <div className={styles.active} aria-live="polite">
          <div className={styles.meta}>
            {onlineMatch.participant ? (
              <span>
                {text(
                  language,
                  onlineMatch.participant === 'first'
                    ? 'onlineFirstSeat'
                    : 'onlineSecondSeat',
                )}
              </span>
            ) : null}
            <span>
              {text(
                language,
                onlineMatch.directConnected
                  ? 'onlineDirectPath'
                  : 'onlineServerPath',
              )}
            </span>
            <span>r{onlineMatch.revision}</span>
          </div>
          {onlineMatch.error ? (
            <p className={styles.error}>{onlineMatch.error}</p>
          ) : null}
          {onlineMatch.inviteUrl ? (
            <div className={styles.inviteBlock}>
              <label htmlFor="online-invite-output">
                {text(language, 'onlineInviteLink')}
              </label>
              <div className={styles.inlineControls}>
                <input
                  id="online-invite-output"
                  readOnly
                  value={onlineMatch.inviteUrl}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <Button variant="ghost" onClick={copyInvite}>
                  {text(
                    language,
                    copied ? 'onlineInviteCopied' : 'copyOnlineInvite',
                  )}
                </Button>
              </div>
            </div>
          ) : null}
          <Button
            id="leave-online-match"
            variant="ghost"
            disabled={busy}
            onClick={onLeave}
          >
            {text(language, 'leaveOnlineMatch')}
          </Button>
        </div>
      ) : (
        <div className={styles.setup}>
          <Button
            id="create-online-match"
            disabled={busy}
            onClick={() => void onCreate()}
          >
            {text(language, 'createOnlineMatch')}
          </Button>
          <form
            className={styles.joinForm}
            onSubmit={(event) => {
              event.preventDefault();
              void onJoin(inviteInput);
            }}
          >
            <label className={styles.srOnly} htmlFor="online-invite-input">
              {text(language, 'onlineInvitePlaceholder')}
            </label>
            <input
              id="online-invite-input"
              placeholder={text(language, 'onlineInvitePlaceholder')}
              value={inviteInput}
              onChange={(event) => setInviteInput(event.target.value)}
            />
            <Button
              id="join-online-match"
              disabled={!inviteInput.trim() || busy}
              type="submit"
              variant="ghost"
            >
              {text(language, 'joinOnlineMatch')}
            </Button>
          </form>
        </div>
      )}
    </Panel>
  );
}
