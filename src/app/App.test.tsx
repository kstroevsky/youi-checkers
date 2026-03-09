import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, beforeEach } from 'vitest';

import { App } from '@/app/App';
import { GameStoreProvider } from '@/app/providers/GameStoreProvider';
import { createInitialState } from '@/domain';
import type { SerializableSession } from '@/shared/types/session';
import { createSession, resetFactoryIds } from '@/test/factories';

function renderApp(session = createSession(createInitialState())) {
  return render(
    <GameStoreProvider initialSession={session}>
      <App />
    </GameStoreProvider>,
  );
}

describe('App', () => {
  beforeEach(() => {
    resetFactoryIds();
  });

  it('reveals localized legal move buttons after selecting a cell', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Клетка A1' }));

    expect(screen.getByRole('button', { name: 'Восхождение' })).toBeInTheDocument();
  });

  it('switches the interface language globally, including the instructions tab', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'English' }));

    expect(screen.getByText('Local hot-seat play on one screen.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cell A1' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Instructions' }));

    expect(screen.getByRole('heading', { name: 'Canonical instructions' })).toBeInTheDocument();
    expect(screen.getByText('Precise game instruction - English')).toBeInTheDocument();
  });

  it('keeps the game state when switching between the game and instructions tabs', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Клетка A1' }));
    await user.click(screen.getByRole('button', { name: 'Восхождение' }));
    await user.click(screen.getByRole('button', { name: 'Клетка B2' }));
    await user.click(screen.getByRole('button', { name: 'Продолжить' }));
    await user.click(screen.getByRole('tab', { name: 'Инструкция' }));

    expect(screen.getByRole('heading', { name: 'Каноническая инструкция' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Игра' }));

    expect(screen.getByText('Белые: Восхождение A1 -> B2')).toBeInTheDocument();
    expect(screen.getByText('Чёрные ходят')).toBeInTheDocument();
  });

  it('shows clickable glossary tooltips for gameplay terms', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Клетка A1' }));
    await user.click(screen.getByRole('button', { name: 'Подробнее: Восхождение' }));

    expect(
      screen.getByText(/Перенести одну активную верхнюю шашку на соседнюю занятую активную клетку/i),
    ).toBeInTheDocument();
  });

  it('clears the current move selection when rule toggles change', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole('button', { name: 'Клетка A1' }));
    await user.click(screen.getByRole('button', { name: 'Восхождение' }));
    await user.click(screen.getByRole('checkbox', { name: 'Базовый подсчёт' }));

    expect(screen.queryByText(/Выбранная клетка/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Восхождение' })).not.toBeInTheDocument();
    expect(
      screen.getByText('Выберите шашку или свою горку, чтобы увидеть ходы.'),
    ).toBeInTheDocument();
  });

  it('locks move input when the game is over', async () => {
    const user = userEvent.setup();
    const session: SerializableSession = createSession({
      ...createInitialState(),
      status: 'gameOver',
      victory: { type: 'threefoldDraw' },
    });

    renderApp(session);

    await user.click(screen.getByRole('button', { name: 'Клетка A1' }));

    expect(screen.getAllByText('Ничья по трёхкратному повторению')).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Восхождение' })).not.toBeInTheDocument();
  });
});
