import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { GameStoreProvider } from '@/app/providers/GameStoreProvider';
import { createInitialState } from '@/domain';
import { createSession, resetFactoryIds } from '@/test/factories';

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

function renderGameTab() {
  return render(
    <GameStoreProvider initialSession={createSession(createInitialState())}>
      <GameTab />
    </GameStoreProvider>,
  );
}

describe('GameTab compact layout', () => {
  beforeEach(() => {
    resetFactoryIds();
    setViewport(390, 844);
  });

  it('shows move input in the actions tray after selecting a cell', async () => {
    const user = userEvent.setup();
    renderGameTab();

    expect(screen.getByRole('tab', { name: 'Ходы' })).toHaveAttribute('aria-selected', 'true');

    await user.click(await screen.findByRole('button', { name: 'Клетка A1' }));

    expect(await screen.findByRole('button', { name: 'Восхождение' })).toBeInTheDocument();
  });

  it('shows score summary only inside the info tray on compact layout', async () => {
    const user = userEvent.setup();
    renderGameTab();

    expect(screen.queryByRole('table', { name: 'Подсчёт' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Инфо' }));

    expect(await screen.findByRole('table', { name: 'Подсчёт' })).toBeInTheDocument();
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
});
