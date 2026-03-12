import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useShallow } from 'zustand/react/shallow';

import { GameStoreProvider, useGameStore } from '@/app/providers/GameStoreProvider';
import type { Coord } from '@/domain';
import { createInitialState } from '@/domain';
import { GameResultModal } from '@/app/components/GameResultModal/GameResultModal';
import { Board } from '@/ui/board/Board';
import { MoveInputPanel } from '@/ui/panels/MoveInputPanel';
import { ScoreCompactTable } from '@/ui/panels/ScoreCompactTable';
import { createSession, resetFactoryIds } from '@/test/factories';

const NO_SELECTABLE_COORDS: Coord[] = [];

type RenderProbeProps = {
  onRender: () => void;
};

function BoardProbe({ onRender }: RenderProbeProps) {
  const { board, language, legalTargets, selectedCell, selectableCoords, onSelectCell } = useGameStore(
    useShallow((state) => ({
      board: state.gameState.board,
      language: state.preferences.language,
      legalTargets: state.legalTargets,
      selectedCell: state.selectedCell,
      selectableCoords:
        state.interaction.type === 'passingDevice' ? NO_SELECTABLE_COORDS : state.selectableCoords,
      onSelectCell: state.selectCell,
    })),
  );

  onRender();

  return (
    <Board
      board={board}
      language={language}
      legalTargets={legalTargets}
      selectedCell={selectedCell}
      selectableCoords={selectableCoords}
      onSelectCell={onSelectCell}
    />
  );
}

function MoveProbe({ onRender }: RenderProbeProps) {
  const availableActionKinds = useGameStore((state) => state.availableActionKinds);

  onRender();

  return <output data-testid="move-probe">{availableActionKinds.join(',')}</output>;
}

function SessionProbe({ onRender }: RenderProbeProps) {
  const { importBuffer, setImportBuffer } = useGameStore(
    useShallow((state) => ({
      importBuffer: state.importBuffer,
      setImportBuffer: state.setImportBuffer,
    })),
  );

  onRender();

  return (
    <textarea
      aria-label="Import probe"
      value={importBuffer}
      onChange={(event) => setImportBuffer(event.target.value)}
    />
  );
}

function ScoreProbe({ onRender }: RenderProbeProps) {
  const { language, scoreSummary } = useGameStore(
    useShallow((state) => ({
      language: state.preferences.language,
      scoreSummary: state.scoreSummary,
    })),
  );

  onRender();

  return scoreSummary ? <ScoreCompactTable language={language} scoreSummary={scoreSummary} /> : null;
}

function HistoryProbe({ onRender }: RenderProbeProps) {
  const { historyCursor, turnLog } = useGameStore(
    useShallow((state) => ({
      historyCursor: state.historyCursor,
      turnLog: state.turnLog,
    })),
  );

  onRender();

  return (
    <output data-testid="history-probe">
      {turnLog.length}:{historyCursor}
    </output>
  );
}

function renderProbes(
  boardRender: () => void,
  moveRender: () => void,
  sessionRender: () => void,
  scoreRender: () => void,
  historyRender: () => void,
) {
  return render(
    <GameStoreProvider initialSession={createSession(createInitialState())}>
      <ScoreProbe onRender={scoreRender} />
      <BoardProbe onRender={boardRender} />
      <MoveProbe onRender={moveRender} />
      <SessionProbe onRender={sessionRender} />
      <HistoryProbe onRender={historyRender} />
    </GameStoreProvider>,
  );
}

describe('render containment', () => {
  beforeEach(() => {
    resetFactoryIds();
  });

  it('does not rerender the board when only the import buffer changes', async () => {
    const user = userEvent.setup();
    const boardRender = vi.fn();
    const moveRender = vi.fn();
    const sessionRender = vi.fn();
    const scoreRender = vi.fn();
    const historyRender = vi.fn();
    renderProbes(boardRender, moveRender, sessionRender, scoreRender, historyRender);

    expect(boardRender).toHaveBeenCalledTimes(1);
    expect(moveRender).toHaveBeenCalledTimes(1);
    expect(sessionRender).toHaveBeenCalledTimes(1);
    expect(scoreRender).toHaveBeenCalledTimes(1);
    expect(historyRender).toHaveBeenCalledTimes(1);

    await user.type(screen.getByRole('textbox', { name: 'Import probe' }), 'abc');

    expect(boardRender).toHaveBeenCalledTimes(1);
    expect(moveRender).toHaveBeenCalledTimes(1);
    expect(sessionRender.mock.calls.length).toBeGreaterThan(1);
    expect(scoreRender).toHaveBeenCalledTimes(1);
    expect(historyRender).toHaveBeenCalledTimes(1);
  });

  it('updates board selection and move actions without rerendering the session subtree', async () => {
    const user = userEvent.setup();
    const boardRender = vi.fn();
    const moveRender = vi.fn();
    const sessionRender = vi.fn();
    const scoreRender = vi.fn();
    const historyRender = vi.fn();
    renderProbes(boardRender, moveRender, sessionRender, scoreRender, historyRender);

    await user.click(screen.getByRole('button', { name: 'Клетка A1' }));

    expect(screen.getByTestId('move-probe')).toHaveTextContent('climbOne');
    expect(boardRender.mock.calls.length).toBeGreaterThan(1);
    expect(moveRender.mock.calls.length).toBeGreaterThan(1);
    expect(sessionRender).toHaveBeenCalledTimes(1);
    expect(scoreRender).toHaveBeenCalledTimes(1);
    expect(historyRender).toHaveBeenCalledTimes(1);
  });

  it('opens the lazy move dialog without rerendering the history subtree', async () => {
    const user = userEvent.setup();
    const boardRender = vi.fn();
    const historyRender = vi.fn();

    render(
      <GameStoreProvider initialSession={createSession(createInitialState())}>
        <BoardProbe onRender={boardRender} />
        <HistoryProbe onRender={historyRender} />
        <MoveInputPanel />
      </GameStoreProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Клетка A1' }));

    expect(await screen.findByRole('dialog', { name: 'Выберите ход' })).toBeInTheDocument();
    expect(boardRender.mock.calls.length).toBeGreaterThan(1);
    expect(historyRender).toHaveBeenCalledTimes(1);
  });

  it('dismisses the result modal without rerendering board or history probes', async () => {
    const user = userEvent.setup();
    const boardRender = vi.fn();
    const historyRender = vi.fn();

    render(
      <GameStoreProvider
        initialSession={createSession({
          ...createInitialState(),
          status: 'gameOver',
          victory: { type: 'threefoldDraw' },
        })}
      >
        <BoardProbe onRender={boardRender} />
        <HistoryProbe onRender={historyRender} />
        <GameResultModal />
      </GameStoreProvider>,
    );

    const dialog = await screen.findByRole('dialog', { name: 'Ничья' });

    await user.click(within(dialog).getByRole('button', { name: 'Закрыть' }));

    expect(screen.queryByRole('dialog', { name: 'Ничья' })).not.toBeInTheDocument();
    expect(boardRender).toHaveBeenCalledTimes(1);
    expect(historyRender).toHaveBeenCalledTimes(1);
  });
});
