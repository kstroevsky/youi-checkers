import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '@/app/App';
import { setPwaLifecycleStateForTests } from '@/app/pwa/pwaLifecycleStore';
import { GameStoreProvider } from '@/app/providers/GameStoreProvider';
import { createSeriesState } from '@/app/store/createGameStore/series';
import { createInitialState } from '@/domain';
import type {
  MatchSettings,
  SerializableSession,
} from '@/shared/types/session';
import {
  boardWithPieces,
  checker,
  createSession,
  gameStateWithBoard,
  resetFactoryIds,
} from '@/test/factories';

function renderApp(session = createSession(createInitialState())) {
  return render(
    <GameStoreProvider initialSession={session}>
      <App />
    </GameStoreProvider>,
  );
}

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

  window.dispatchEvent(new Event('resize'));
}

describe('App', () => {
  beforeEach(() => {
    resetFactoryIds();
    setViewport(1440, 900);
  });

  it('reveals localized legal move buttons after selecting a cell', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(
      await screen.findByRole(
        'button',
        { name: 'Клетка A1' },
        { timeout: 3000 },
      ),
    );

    expect(
      await screen.findByRole(
        'button',
        { name: 'Восхождение' },
        { timeout: 6000 },
      ),
    ).toBeInTheDocument();
  }, 10000);

  it('opens move choice in a dialog after selecting a checker', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole('button', { name: 'Клетка A1' }));

    const dialog = await screen.findByRole('dialog', { name: 'Выберите ход' });

    expect(
      within(dialog).getByText(
        (_, element) => element?.textContent === 'Выбранная клетка: A1',
      ),
    ).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole('button', { name: 'Восхождение' }),
    );

    expect(
      screen.queryByRole('dialog', { name: 'Выберите ход' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Клетка B2' })).toHaveAttribute(
      'data-target',
      'true',
    );
  });

  it('shows a jump-follow-up callout and source highlight after a jump', async () => {
    const user = userEvent.setup();
    const session = createSession(
      gameStateWithBoard(
        boardWithPieces({
          A1: [checker('white')],
          B2: [checker('white')],
          D4: [checker('white')],
          F6: [checker('black')],
        }),
      ),
    );

    renderApp(session);

    await user.click(await screen.findByRole('button', { name: 'Клетка A1' }));
    await user.click(await screen.findByRole('button', { name: 'Прыжок' }));
    await user.click(screen.getByRole('button', { name: 'Клетка C3' }));

    expect(
      await screen.findByText(
        /Цепочка прыжков готова из C3/i,
        {},
        { timeout: 3000 },
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Эта подсвеченная шашка может продолжать прыгать/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Клетка C3' })).toHaveAttribute(
      'data-followup',
      'true',
    );
  }, 10_000);

  it('shows the waiting-update banner and applies the update on demand', async () => {
    const user = userEvent.setup();
    const applyUpdate = vi.fn(() => Promise.resolve());

    setPwaLifecycleStateForTests({
      applyUpdate,
      needRefresh: true,
      offlineReady: false,
    });

    renderApp();

    expect(
      await screen.findByText(
        'Готова новая версия. Обновите приложение, когда текущий ход можно безопасно прервать.',
      ),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Обновить приложение' }),
    );

    expect(applyUpdate).toHaveBeenCalledTimes(1);
  });

  it('switches the interface language globally, including lazy-loaded tabs', async () => {
    const user = userEvent.setup();
    setViewport(390, 844);
    renderApp();

    await user.click(await screen.findByRole('button', { name: 'EN' }));

    expect(screen.getByText('Match setup')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Cell A1' }, { timeout: 6000 }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Instructions' }));

    expect(
      await screen.findByRole(
        'heading',
        { name: 'Canonical instructions' },
        { timeout: 6000 },
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Precise game instruction - English'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Settings' }));

    expect(
      await screen.findByRole(
        'heading',
        { name: 'Rules and session' },
        { timeout: 6000 },
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Export / Import' }),
    ).toBeInTheDocument();
  }, 10000);

  it('keeps the game state when switching between game, instructions, and settings tabs', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole('button', { name: 'Клетка A1' }));
    await user.click(
      await screen.findByRole('button', { name: 'Восхождение' }),
    );
    await user.click(screen.getByRole('button', { name: 'Клетка B2' }));
    await user.click(await screen.findByRole('button', { name: 'Продолжить' }));
    await user.click(screen.getByRole('tab', { name: 'Инструкция' }));

    expect(
      await screen.findByRole('heading', { name: 'Каноническая инструкция' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Настройки' }));

    expect(
      await screen.findByRole('heading', { name: 'Правила и партия' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Игра' }));

    expect(
      await screen.findByText('Белые: Восхождение A1 -> B2'),
    ).toBeInTheDocument();
    expect(screen.getByText('Чёрные ходят')).toBeInTheDocument();
  });

  it('moves rule and import sections out of the game tab and into settings', async () => {
    const user = userEvent.setup();
    renderApp();

    await screen.findByRole('button', { name: 'Клетка A1' });

    expect(
      screen.queryByRole('heading', { name: 'Правила и партия' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Экспорт / импорт' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Настройки' }));

    expect(
      await screen.findByRole('heading', { name: 'Правила и партия' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Экспорт / импорт' }),
    ).toBeInTheDocument();
  });

  it('shows match setup on the game tab instead of inside settings', async () => {
    const user = userEvent.setup();
    setViewport(390, 844);
    renderApp();

    expect(
      await screen.findByRole('heading', { name: 'Параметры матча' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Начать новую партию' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Настройки' }));

    expect(
      await screen.findByRole('heading', { name: 'Правила и партия' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Параметры матча' }),
    ).not.toBeInTheDocument();
  });

  it('configures a multi-game match and its target score from match setup', async () => {
    const user = userEvent.setup();
    setViewport(390, 844);
    renderApp();

    expect(screen.queryByText('Формат игры')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('spinbutton', { name: 'Очки для победы' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: 'Включить матч' }),
    ).not.toBeInTheDocument();

    await user.click(
      await screen.findByRole('button', { name: 'Включить матч' }),
    );

    const targetInput = screen.getByRole('spinbutton', {
      name: 'Очки для победы',
    });

    expect(targetInput).toHaveValue(100);

    await user.clear(targetInput);
    await user.type(targetInput, '25');
    await user.click(
      screen.getByRole('button', { name: 'Начать новую партию' }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Счёт матча' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Цель: 25')).toBeInTheDocument();
  });

  it('switches a live game into match mode and back during game one', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(
      await screen.findByRole('button', { name: 'Включить матч' }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Счёт матча' }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Вернуться к одной партии' }),
    );

    expect(
      screen.queryByRole('heading', { name: 'Счёт матча' }),
    ).not.toBeInTheDocument();
  });

  it('requires the previous winner to choose a color before starting the next game', async () => {
    const user = userEvent.setup();
    const matchSettings: MatchSettings = {
      opponentMode: 'hotSeat',
      humanPlayer: 'white',
      aiDifficulty: 'medium',
      gameFormat: 'series',
      targetPoints: 100,
    };
    const victory = { type: 'homeField' as const, winner: 'white' as const };
    const seriesState = {
      ...createSeriesState(matchSettings),
      colorChooser: 'first' as const,
      firstVictory: victory,
      firstWinner: 'first' as const,
      gameWins: { first: 1, second: 0 },
      lastGame: {
        outcome: 'win' as const,
        pointsAwarded: 3,
        victory,
        winner: 'first' as const,
      },
      phase: 'betweenGames' as const,
      points: { first: 3, second: 0 },
    };
    const session = createSession(
      {
        ...createInitialState(),
        status: 'gameOver',
        victory,
      },
      {
        matchSettings,
        seriesState,
      },
    );

    renderApp(session);

    const dialog = await screen.findByRole('dialog', {
      name: 'Следующая партия',
    });
    const startButton = within(dialog).getByRole('button', {
      name: 'Начать следующую партию',
    });

    expect(startButton).toBeDisabled();

    await user.click(within(dialog).getByRole('button', { name: 'Чёрные' }));

    expect(startButton).toBeEnabled();

    await user.click(startButton);

    expect(
      screen.queryByRole('dialog', { name: 'Следующая партия' }),
    ).not.toBeInTheDocument();
    expect(await screen.findByText('Партия 2')).toBeInTheDocument();
  });

  it('shows clickable glossary tooltips for gameplay terms', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole('button', { name: 'Клетка A1' }));
    await user.click(
      screen.getByRole('button', { name: 'Подробнее: Восхождение' }),
    );

    expect(
      screen.getByText(
        /Перенести одну активную верхнюю шашку на соседнюю занятую активную клетку/i,
      ),
    ).toBeInTheDocument();
  });

  it('clears current move selection when rule toggles change from settings tab', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole('button', { name: 'Клетка A1' }));
    await user.click(screen.getByRole('button', { name: 'Восхождение' }));

    await user.click(screen.getByRole('tab', { name: 'Настройки' }));
    await user.click(
      await screen.findByRole('checkbox', { name: 'Базовый подсчёт' }),
    );

    await user.click(screen.getByRole('tab', { name: 'Игра' }));

    expect(screen.queryByText(/Выбранная клетка/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Восхождение' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByText('Выберите шашку или контролируемую горку.'),
    ).not.toHaveLength(0);
  });

  it('hides compact score table when score mode is turned off', async () => {
    const user = userEvent.setup();
    renderApp();

    expect(
      await screen.findByRole('table', { name: 'Подсчёт' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Настройки' }));
    await user.click(
      await screen.findByRole('checkbox', { name: 'Базовый подсчёт' }),
    );
    await user.click(screen.getByRole('tab', { name: 'Игра' }));

    expect(
      screen.queryByRole('table', { name: 'Подсчёт' }),
    ).not.toBeInTheDocument();
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

    expect(
      screen.getAllByText('Ничья по трёхкратному повторению'),
    ).not.toHaveLength(0);
    expect(
      screen.queryByRole('button', { name: 'Восхождение' }),
    ).not.toBeInTheDocument();
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
    expect(
      within(dialog).getByText('Ничья по трёхкратному повторению'),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Закрыть' }));

    expect(
      screen.queryByRole('dialog', { name: 'Ничья' }),
    ).not.toBeInTheDocument();
  });

  it('supports history back/forward, fogged future moves, and click-to-travel', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole('button', { name: 'Клетка A1' }));
    await user.click(screen.getByRole('button', { name: 'Восхождение' }));
    await user.click(screen.getByRole('button', { name: 'Клетка B2' }));
    await user.click(await screen.findByRole('button', { name: 'Продолжить' }));

    await user.click(screen.getByRole('button', { name: 'Клетка F6' }));
    await user.click(screen.getByRole('button', { name: 'Восхождение' }));
    await user.click(screen.getByRole('button', { name: 'Клетка E5' }));
    await user.click(await screen.findByRole('button', { name: 'Продолжить' }));

    const historyList = screen.getByRole('list');
    expect(historyList).toBeInTheDocument();

    expect(
      screen.getByRole('button', { name: 'Чёрные: Восхождение F6 -> E5' }),
    ).toHaveAttribute('aria-current', 'step');

    const backButton = screen.getByRole('button', { name: 'Назад' });
    const forwardButton = screen.getByRole('button', { name: 'Вперёд' });

    expect(backButton).toBeEnabled();
    expect(forwardButton).toBeDisabled();

    await user.click(backButton);

    expect(screen.getByText(/Позиция истории:\s*1/)).toBeInTheDocument();
    expect(forwardButton).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Чёрные: Восхождение F6 -> E5' }),
    ).toHaveAttribute('data-state', 'future');

    await user.click(
      screen.getByRole('button', { name: 'Чёрные: Восхождение F6 -> E5' }),
    );

    expect(screen.getByText(/Позиция истории:\s*2/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Вперёд' })).toBeDisabled();

    await user.click(
      screen.getByRole('button', { name: 'Белые: Восхождение A1 -> B2' }),
    );

    expect(screen.getByText(/Позиция истории:\s*1/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Вперёд' })).toBeEnabled();
  }, 20000);
});
