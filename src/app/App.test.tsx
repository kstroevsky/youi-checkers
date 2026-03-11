import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

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

    await user.click(await screen.findByRole('button', { name: 'Клетка A1' }));

    expect(await screen.findByRole('button', { name: 'Восхождение' })).toBeInTheDocument();
  });

  it('opens move choice in a dialog after selecting a checker', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole('button', { name: 'Клетка A1' }));

    const dialog = await screen.findByRole('dialog', { name: 'Выберите ход' });

    expect(
      within(dialog).getByText((_, element) => element?.textContent === 'Выбранная клетка: A1'),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Восхождение' }));

    expect(screen.queryByRole('dialog', { name: 'Выберите ход' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Клетка B2' })).toHaveAttribute('data-target', 'true');
  });

  it('switches the interface language globally, including lazy-loaded tabs', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole('button', { name: 'English' }));

    expect(screen.getByText('Local hot-seat play on one screen.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Cell A1' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Instructions' }));

    expect(await screen.findByRole('heading', { name: 'Canonical instructions' })).toBeInTheDocument();
    expect(screen.getByText('Precise game instruction - English')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Settings' }));

    expect(await screen.findByRole('heading', { name: 'Rules and session' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Export / Import' })).toBeInTheDocument();
  });

  it('keeps the game state when switching between game, instructions, and settings tabs', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole('button', { name: 'Клетка A1' }));
    await user.click(screen.getByRole('button', { name: 'Восхождение' }));
    await user.click(screen.getByRole('button', { name: 'Клетка B2' }));
    await user.click(screen.getByRole('button', { name: 'Продолжить' }));
    await user.click(screen.getByRole('tab', { name: 'Инструкция' }));

    expect(await screen.findByRole('heading', { name: 'Каноническая инструкция' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Настройки' }));

    expect(await screen.findByRole('heading', { name: 'Правила и партия' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Игра' }));

    expect(await screen.findByText('Белые: Восхождение A1 -> B2')).toBeInTheDocument();
    expect(screen.getByText('Чёрные ходят')).toBeInTheDocument();
  });

  it('moves rule and import sections out of the game tab and into settings', async () => {
    const user = userEvent.setup();
    renderApp();

    await screen.findByRole('button', { name: 'Клетка A1' });

    expect(screen.queryByRole('heading', { name: 'Правила и партия' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Экспорт / импорт' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Настройки' }));

    expect(await screen.findByRole('heading', { name: 'Правила и партия' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Экспорт / импорт' })).toBeInTheDocument();
  });

  it('shows clickable glossary tooltips for gameplay terms', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole('button', { name: 'Клетка A1' }));
    await user.click(screen.getByRole('button', { name: 'Подробнее: Восхождение' }));

    expect(
      screen.getByText(/Перенести одну активную верхнюю шашку на соседнюю занятую активную клетку/i),
    ).toBeInTheDocument();
  });

  it('clears current move selection when rule toggles change from settings tab', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole('button', { name: 'Клетка A1' }));
    await user.click(screen.getByRole('button', { name: 'Восхождение' }));

    await user.click(screen.getByRole('tab', { name: 'Настройки' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Базовый подсчёт' }));

    await user.click(screen.getByRole('tab', { name: 'Игра' }));

    expect(screen.queryByText(/Выбранная клетка/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Восхождение' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Выберите шашку или контролируемую горку.')).not.toHaveLength(0);
  });

  it('hides compact score table when score mode is turned off', async () => {
    const user = userEvent.setup();
    renderApp();

    expect(await screen.findByRole('table', { name: 'Подсчёт' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Настройки' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Базовый подсчёт' }));
    await user.click(screen.getByRole('tab', { name: 'Игра' }));

    expect(screen.queryByRole('table', { name: 'Подсчёт' })).not.toBeInTheDocument();
  });

  it('locks move input when the game is over', async () => {
    const user = userEvent.setup();
    const session: SerializableSession = createSession({
      ...createInitialState(),
      status: 'gameOver',
      victory: { type: 'threefoldDraw' },
    });

    renderApp(session);

    await user.click(await screen.findByRole('button', { name: 'Клетка A1' }));

    expect(screen.getAllByText('Ничья по трёхкратному повторению')).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Восхождение' })).not.toBeInTheDocument();
  });

  it('shows a final-result modal for finished games and lets the user dismiss it', async () => {
    const user = userEvent.setup();
    const session: SerializableSession = createSession({
      ...createInitialState(),
      status: 'gameOver',
      victory: { type: 'threefoldDraw' },
    });

    renderApp(session);

    const dialog = await screen.findByRole('dialog', { name: 'Ничья' });

    expect(within(dialog).getByText('Итог партии')).toBeInTheDocument();
    expect(within(dialog).getByText('Ничья по трёхкратному повторению')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Закрыть' }));

    expect(screen.queryByRole('dialog', { name: 'Ничья' })).not.toBeInTheDocument();
  });

  it(
    'supports history back/forward, fogged future moves, and click-to-travel',
    async () => {
      const user = userEvent.setup();
      renderApp();

      await user.click(await screen.findByRole('button', { name: 'Клетка A1' }));
      await user.click(screen.getByRole('button', { name: 'Восхождение' }));
      await user.click(screen.getByRole('button', { name: 'Клетка B2' }));
      await user.click(screen.getByRole('button', { name: 'Продолжить' }));

      await user.click(screen.getByRole('button', { name: 'Клетка F6' }));
      await user.click(screen.getByRole('button', { name: 'Восхождение' }));
      await user.click(screen.getByRole('button', { name: 'Клетка E5' }));
      await user.click(screen.getByRole('button', { name: 'Продолжить' }));

      const historyList = screen.getByRole('list');
      expect(historyList).toBeInTheDocument();

      expect(screen.getByRole('button', { name: 'Чёрные: Восхождение F6 -> E5' })).toHaveAttribute(
        'aria-current',
        'step',
      );

      const backButton = screen.getByRole('button', { name: 'Назад' });
      const forwardButton = screen.getByRole('button', { name: 'Вперёд' });

      expect(backButton).toBeEnabled();
      expect(forwardButton).toBeDisabled();

      await user.click(backButton);

      expect(screen.getByText((_, element) => element?.textContent === 'Позиция истории: 1')).toBeInTheDocument();
      expect(forwardButton).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Чёрные: Восхождение F6 -> E5' })).toHaveAttribute(
        'data-state',
        'future',
      );

      await user.click(screen.getByRole('button', { name: 'Чёрные: Восхождение F6 -> E5' }));

      expect(screen.getByText((_, element) => element?.textContent === 'Позиция истории: 2')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Вперёд' })).toBeDisabled();

      await user.click(screen.getByRole('button', { name: 'Белые: Восхождение A1 -> B2' }));

      expect(screen.getByText((_, element) => element?.textContent === 'Позиция истории: 1')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Вперёд' })).toBeEnabled();
    },
    10000,
  );
});
