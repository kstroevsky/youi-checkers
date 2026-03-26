import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AI_DIFFICULTY_PRESETS } from '@/ai';
import { createGameStore } from '@/app/store/createGameStore';
import { AI_MOVE_REVEAL_MS, AI_WATCHDOG_BUFFER_MS } from '@/app/store/createGameStore/constants';
import { applyAction, createInitialState, getLegalActions, type TurnAction } from '@/domain';
import type { MatchSettings } from '@/shared/types/session';
import {
  boardWithPieces,
  checker,
  createSession,
  gameStateWithBoard,
  resetFactoryIds,
  undoFrame,
  withConfig,
} from '@/test/factories';

import {
  createAiResult,
  createMemoryStorage,
  createQuotaExceededError,
  FakeAiWorker,
} from '@/app/store/createGameStore.testUtils';

const AI_COLD_START_BUFFER_MS = 1500;
const EASY_WATCHDOG_MS = AI_DIFFICULTY_PRESETS.easy.timeBudgetMs + AI_WATCHDOG_BUFFER_MS;
const EASY_COLD_START_WATCHDOG_MS = EASY_WATCHDOG_MS + AI_COLD_START_BUFFER_MS;

function commitTurnAction(store: ReturnType<typeof createGameStore>, action: TurnAction): void {
  const state = store.getState();

  switch (action.type) {
    case 'manualUnfreeze':
      state.selectCell(action.coord);
      state.chooseActionType('manualUnfreeze');
      return;
    case 'jumpSequence':
      state.selectCell(action.source);
      state.chooseActionType('jumpSequence');
      for (const target of action.path) {
        store.getState().selectCell(target);
      }
      return;
    default:
      state.selectCell(action.source);
      state.chooseActionType(action.type);
      store.getState().selectCell(action.target);
  }
}

describe('createGameStore AI integration', () => {
  beforeEach(() => {
    resetFactoryIds();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the computer turn flow alive when local storage quota is exceeded on a new game', () => {
    const worker = new FakeAiWorker();
    const storage = createMemoryStorage({}, {
      onSetItem: () => {
        throw createQuotaExceededError();
      },
    });
    const store = createGameStore({
      createAiWorker: () => worker,
      storage,
    });

    expect(() =>
      store.getState().startNewGame({
        opponentMode: 'computer',
        humanPlayer: 'black',
        aiDifficulty: 'easy',
      }),
    ).not.toThrow();
    expect(store.getState().aiStatus).toBe('thinking');
    expect(worker.requests).toHaveLength(1);
  });

  it('still schedules the computer reply when a committed move cannot be written to local storage', () => {
    const worker = new FakeAiWorker();
    const storage = createMemoryStorage({}, {
      onSetItem: () => {
        throw createQuotaExceededError();
      },
    });
    const store = createGameStore({
      createAiWorker: () => worker,
      storage,
    });

    store.getState().startNewGame({
      opponentMode: 'computer',
      humanPlayer: 'white',
      aiDifficulty: 'easy',
    });
    store.getState().selectCell('A1');
    store.getState().chooseActionType('climbOne');

    expect(() => store.getState().selectCell('B2')).not.toThrow();
    expect(store.getState().aiStatus).toBe('thinking');
    expect(worker.requests).toHaveLength(1);
  });

  it('allows the first computer reply to arrive during the cold-start watchdog buffer', () => {
    vi.useFakeTimers();

    const worker = new FakeAiWorker();
    const store = createGameStore({
      createAiWorker: () => worker,
      storage: undefined,
    });

    store.getState().startNewGame({
      opponentMode: 'computer',
      humanPlayer: 'black',
      aiDifficulty: 'easy',
    });

    vi.advanceTimersByTime(EASY_WATCHDOG_MS + 50);

    expect(store.getState().aiStatus).toBe('thinking');
    expect(worker.terminated).toBe(false);

    const aiAction = getLegalActions(store.getState().gameState, store.getState().ruleConfig)[0];

    expect(aiAction).toBeDefined();
    if (!aiAction) {
      return;
    }

    worker.reply(createAiResult({ action: aiAction }));

    expect(store.getState().aiStatus).toBe('idle');
    expect(store.getState().gameState.history).toHaveLength(1);
  });

  it('keeps the tighter watchdog for warm follow-up requests on the same worker', () => {
    vi.useFakeTimers();

    const worker = new FakeAiWorker();
    const store = createGameStore({
      createAiWorker: () => worker,
      storage: undefined,
    });

    store.getState().startNewGame({
      opponentMode: 'computer',
      humanPlayer: 'white',
      aiDifficulty: 'easy',
    });

    const humanOpening = getLegalActions(store.getState().gameState, store.getState().ruleConfig)[0];

    expect(humanOpening).toBeDefined();
    if (!humanOpening) {
      return;
    }

    commitTurnAction(store, humanOpening);
    expect(store.getState().aiStatus).toBe('thinking');

    const firstAiReply = getLegalActions(store.getState().gameState, store.getState().ruleConfig)[0];

    expect(firstAiReply).toBeDefined();
    if (!firstAiReply) {
      return;
    }

    worker.reply(createAiResult({ action: firstAiReply }));

    expect(store.getState().aiStatus).toBe('idle');
    expect(worker.requests).toHaveLength(1);

    const secondHumanTurn = getLegalActions(store.getState().gameState, store.getState().ruleConfig)[0];

    expect(secondHumanTurn).toBeDefined();
    if (!secondHumanTurn) {
      return;
    }

    commitTurnAction(store, secondHumanTurn);

    expect(store.getState().aiStatus).toBe('thinking');
    expect(worker.requests).toHaveLength(2);

    vi.advanceTimersByTime(EASY_WATCHDOG_MS + 1);

    expect(worker.terminated).toBe(true);
    expect(store.getState().aiStatus).toBe('error');
  });

  it('starts a computer match as black and locks input while the AI is thinking', () => {
    const worker = new FakeAiWorker();
    const store = createGameStore({
      createAiWorker: () => worker,
      storage: undefined,
    });

    store.getState().startNewGame({
      opponentMode: 'computer',
      humanPlayer: 'black',
      aiDifficulty: 'easy',
    });

    expect(store.getState().matchSettings).toEqual<MatchSettings>({
      opponentMode: 'computer',
      humanPlayer: 'black',
      aiDifficulty: 'easy',
    });
    expect(store.getState().aiStatus).toBe('thinking');
    expect(worker.requests).toHaveLength(1);

    store.getState().selectCell('A1');
    expect(store.getState().selectedCell).toBeNull();

    const aiAction = getLegalActions(store.getState().gameState, store.getState().ruleConfig)[0];
    expect(aiAction).toBeDefined();
    if (!aiAction) {
      return;
    }

    worker.reply(createAiResult({ action: aiAction }));

    const humanSource = store.getState().selectableCoords[0];
    expect(store.getState().interaction.type).toBe('idle');
    expect(humanSource).toBeDefined();
    if (!humanSource) {
      return;
    }

    store.getState().selectCell(humanSource);
    expect(store.getState().selectedCell).toBe(humanSource);
  });

  it('defaults new computer matches to threefold draws when the current draw rule is none', () => {
    const store = createGameStore({
      storage: undefined,
    });

    expect(store.getState().ruleConfig.drawRule).toBe('none');

    store.getState().startNewGame({
      opponentMode: 'computer',
      humanPlayer: 'white',
      aiDifficulty: 'medium',
    });

    expect(store.getState().ruleConfig.drawRule).toBe('threefold');
  });

  it('undoes the full human-plus-computer turn pair in computer mode', () => {
    const worker = new FakeAiWorker();
    const store = createGameStore({
      createAiWorker: () => worker,
      storage: undefined,
    });

    store.getState().startNewGame({
      opponentMode: 'computer',
      humanPlayer: 'white',
      aiDifficulty: 'easy',
    });

    store.getState().selectCell('A1');
    store.getState().chooseActionType('climbOne');
    store.getState().selectCell('B2');

    const aiAction = getLegalActions(store.getState().gameState, store.getState().ruleConfig)[0];
    worker.reply(createAiResult({ action: aiAction }));

    expect(store.getState().gameState.currentPlayer).toBe('white');

    store.getState().undo();

    expect(store.getState().historyCursor).toBe(0);
    expect(store.getState().gameState.currentPlayer).toBe('white');
  });

  it('redoes the full human-plus-computer turn pair in computer mode', () => {
    const worker = new FakeAiWorker();
    const store = createGameStore({
      createAiWorker: () => worker,
      storage: undefined,
    });

    store.getState().startNewGame({
      opponentMode: 'computer',
      humanPlayer: 'white',
      aiDifficulty: 'easy',
    });

    store.getState().selectCell('A1');
    store.getState().chooseActionType('climbOne');
    store.getState().selectCell('B2');

    const aiAction = getLegalActions(store.getState().gameState, store.getState().ruleConfig)[0];
    worker.reply(createAiResult({ action: aiAction }));

    expect(store.getState().historyCursor).toBe(2);

    store.getState().undo();

    expect(store.getState().historyCursor).toBe(0);

    store.getState().redo();

    expect(store.getState().historyCursor).toBe(2);
    expect(store.getState().gameState.currentPlayer).toBe('white');
  });

  it('auto-schedules AI only when a loaded computer session is at the live tip', async () => {
    const liveWorker = new FakeAiWorker();
    createGameStore({
      createAiWorker: () => liveWorker,
      initialSession: createSession(createInitialState(), {
        matchSettings: {
          opponentMode: 'computer',
          humanPlayer: 'black',
          aiDifficulty: 'easy',
        },
      }),
      storage: undefined,
    });

    await Promise.resolve();
    expect(liveWorker.requests).toHaveLength(1);

    const rewoundWorker = new FakeAiWorker();
    const state0 = createInitialState();
    const state1 = applyAction(
      state0,
      { type: 'climbOne', source: 'A1', target: 'B2' },
      withConfig(),
    );
    const rewoundStore = createGameStore({
      createAiWorker: () => rewoundWorker,
      initialSession: createSession(state1, {
        matchSettings: {
          opponentMode: 'computer',
          humanPlayer: 'black',
          aiDifficulty: 'easy',
        },
        past: [undoFrame(state0)],
        present: undoFrame(state0),
        turnLog: state1.history,
      }),
      storage: undefined,
    });

    await Promise.resolve();

    expect(rewoundWorker.requests).toHaveLength(0);
    expect(rewoundStore.getState().historyCursor).toBe(0);
  });

  it('waits for the reveal pause before scheduling the AI follow-up action after a jump with continuation', async () => {
    vi.useFakeTimers();

    const worker = new FakeAiWorker();
    const state = gameStateWithBoard(
      boardWithPieces({
        A1: [checker('white')],
        B2: [checker('white')],
        D4: [checker('white')],
        F6: [checker('black')],
      }),
    );
    createGameStore({
      createAiWorker: () => worker,
      initialSession: createSession(state, {
        matchSettings: {
          opponentMode: 'computer',
          humanPlayer: 'black',
          aiDifficulty: 'easy',
        },
      }),
      storage: undefined,
    });

    await Promise.resolve();

    expect(worker.requests).toHaveLength(1);

    worker.reply(
      createAiResult({
        action: {
          type: 'jumpSequence',
          source: 'A1',
          path: ['C3'],
        },
      }),
    );

    expect(worker.requests).toHaveLength(1);

    vi.advanceTimersByTime(AI_MOVE_REVEAL_MS - 1);

    expect(worker.requests).toHaveLength(1);

    vi.advanceTimersByTime(1);

    expect(worker.requests).toHaveLength(2);
    expect(worker.requests[1]?.state.currentPlayer).toBe('white');
    expect(worker.requests[1]?.state.pendingJump?.source).toBe('C3');
  });

  it('keeps scheduling AI jumps while the same jumper keeps leaving another continuation', async () => {
    vi.useFakeTimers();

    const worker = new FakeAiWorker();
    const state = gameStateWithBoard(
      boardWithPieces({
        A1: [checker('white')],
        B2: [checker('white')],
        D4: [checker('white')],
        E4: [checker('white')],
      }),
    );
    createGameStore({
      createAiWorker: () => worker,
      initialSession: createSession(state, {
        matchSettings: {
          opponentMode: 'computer',
          humanPlayer: 'black',
          aiDifficulty: 'easy',
        },
      }),
      storage: undefined,
    });

    await Promise.resolve();

    expect(worker.requests).toHaveLength(1);

    worker.reply(
      createAiResult({
        action: {
          type: 'jumpSequence',
          source: 'A1',
          path: ['C3'],
        },
      }),
    );

    vi.advanceTimersByTime(AI_MOVE_REVEAL_MS);

    expect(worker.requests).toHaveLength(2);
    expect(worker.requests[1]?.state.pendingJump?.source).toBe('C3');

    worker.reply(
      createAiResult({
        action: {
          type: 'jumpSequence',
          source: 'C3',
          path: ['E5'],
        },
      }),
    );

    vi.advanceTimersByTime(AI_MOVE_REVEAL_MS);

    expect(worker.requests).toHaveLength(3);
    expect(worker.requests[2]?.state.currentPlayer).toBe('white');
    expect(worker.requests[2]?.state.pendingJump?.source).toBe('E5');
  });

  it('recovers from a hung computer worker via the watchdog timeout', () => {
    vi.useFakeTimers();

    const workers: FakeAiWorker[] = [];
    const store = createGameStore({
      createAiWorker: () => {
        const worker = new FakeAiWorker();

        workers.push(worker);
        return worker;
      },
      storage: undefined,
    });

    store.getState().startNewGame({
      opponentMode: 'computer',
      humanPlayer: 'black',
      aiDifficulty: 'easy',
    });

    vi.advanceTimersByTime(EASY_WATCHDOG_MS + 1);

    expect(workers[0]?.terminated).toBe(false);
    expect(store.getState().aiStatus).toBe('thinking');

    vi.advanceTimersByTime(AI_COLD_START_BUFFER_MS);

    expect(workers[0]?.terminated).toBe(true);
    expect(store.getState().aiStatus).toBe('error');

    store.getState().retryComputerMove();

    expect(store.getState().aiStatus).toBe('thinking');
    expect(workers).toHaveLength(2);
    expect(workers[1]?.requests).toHaveLength(1);
  });

  it('ignores stale AI replies after restarting the worker', () => {
    vi.useFakeTimers();

    const workers: FakeAiWorker[] = [];
    const store = createGameStore({
      createAiWorker: () => {
        const worker = new FakeAiWorker();

        workers.push(worker);
        return worker;
      },
      storage: undefined,
    });

    store.getState().startNewGame({
      opponentMode: 'computer',
      humanPlayer: 'black',
      aiDifficulty: 'easy',
    });

    const firstWorker = workers[0];
    const staleRequestId = firstWorker?.requests[0]?.requestId;

    vi.advanceTimersByTime(EASY_COLD_START_WATCHDOG_MS + 1);
    store.getState().retryComputerMove();

    const secondWorker = workers[1];
    const freshRequestId = secondWorker?.requests[0]?.requestId;
    const legalAction = getLegalActions(
      store.getState().gameState,
      store.getState().ruleConfig,
    )[0];

    expect(freshRequestId).toBe(2);
    expect(legalAction).toBeDefined();
    if (!secondWorker || !legalAction) {
      return;
    }

    secondWorker.dispatch(staleRequestId as number, createAiResult({ action: legalAction }));

    expect(store.getState().aiStatus).toBe('thinking');
    expect(store.getState().gameState.history).toHaveLength(0);

    secondWorker.dispatch(freshRequestId as number, createAiResult({ action: legalAction }));

    expect(store.getState().aiStatus).toBe('idle');
    expect(store.getState().gameState.history).toHaveLength(1);
  });
});
