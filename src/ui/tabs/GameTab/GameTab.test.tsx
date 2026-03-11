import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { GameStoreProvider } from '@/app/providers/GameStoreProvider';
import type { GameState, TurnRecord } from '@/domain';
import { createInitialState } from '@/domain';
import type { SerializableSession } from '@/shared/types/session';
import { createSession, resetFactoryIds, undoFrame } from '@/test/factories';

import { GameTab } from './GameTab';

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    writable: true,
    value: height,
  });

  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

function snapshotFromState(state: GameState) {
  return {
    board: state.board,
    currentPlayer: state.currentPlayer,
    moveNumber: state.moveNumber,
    status: state.status,
    victory: state.victory,
  };
}

function createHistoryHeavySession(): SerializableSession {
  const baseState = createInitialState();
  const snapshot = snapshotFromState(baseState);
  const turnLog: TurnRecord[] = Array.from({ length: 12 }, (_, index) => ({
    actor: index % 2 === 0 ? 'white' : 'black',
    action: {
      type: 'moveSingleToEmpty',
      source: 'A1',
      target: 'A2',
    },
    beforeState: snapshot,
    afterState: snapshot,
    autoPasses: [],
    victoryAfter: { type: 'none' },
    positionHash: `position-${index + 1}`,
  }));
  const present = {
    ...baseState,
    history: turnLog,
  };

  return createSession(present, {
    present: {
      ...undoFrame(present),
      historyCursor: turnLog.length,
    },
    turnLog,
  });
}

function renderGameTab(session = createSession(createInitialState())) {
  return render(
    <GameStoreProvider initialSession={session}>
      <GameTab />
    </GameStoreProvider>,
  );
}

describe('GameTab compact layout', () => {
  beforeEach(() => {
    resetFactoryIds();
    setViewport(390, 844);
  });

  it('opens the move choice dialog from a board selection without an actions tray', async () => {
    const user = userEvent.setup();
    renderGameTab();

    expect(screen.queryByRole('tab', { name: 'Ходы' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'История' })).toHaveAttribute('aria-selected', 'true');

    await user.click(await screen.findByRole('button', { name: 'Клетка A1' }));

    const dialog = await screen.findByRole('dialog', { name: 'Выберите ход' });
    expect(within(dialog).getByRole('button', { name: 'Восхождение' })).toBeInTheDocument();
  });

  it('shows score summary only inside the info tray on compact layout', async () => {
    const user = userEvent.setup();
    renderGameTab();

    expect(screen.queryByRole('table', { name: 'Подсчёт' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Инфо' }));

    expect(await screen.findByRole('table', { name: 'Подсчёт' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Белые' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Чёрные' })).toBeInTheDocument();
  });

  it('shows history controls in the history tray on compact layout', async () => {
    const user = userEvent.setup();
    renderGameTab();

    await user.click(await screen.findByRole('button', { name: 'Клетка A1' }));
    await user.click(screen.getByRole('button', { name: 'Восхождение' }));
    await user.click(screen.getByRole('button', { name: 'Клетка B2' }));

    await user.click(screen.getByRole('tab', { name: 'История' }));

    expect(await screen.findByRole('heading', { name: 'История' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Назад' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Вперёд' })).toBeInTheDocument();
  });

  it('renders the full history list instead of truncating to ten moves', async () => {
    const user = userEvent.setup();
    renderGameTab(createHistoryHeavySession());

    await user.click(screen.getByRole('tab', { name: 'История' }));

    expect(screen.getByText('Всего: 12')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(12);
  });
});
