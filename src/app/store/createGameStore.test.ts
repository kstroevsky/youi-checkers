import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AiSearchResult, AiWorkerRequest, AiWorkerResponse } from '@/ai';
import { createGameStore } from '@/app/store/createGameStore';
import {
  applyAction,
  createInitialState,
  deserializeSession,
  getLegalActions,
  serializeSession,
} from '@/domain';
import type { MatchSettings } from '@/shared/types/session';
import { SESSION_STORAGE_KEY } from '@/shared/constants/storage';
import {
  boardWithPieces,
  checker,
  createSession,
  gameStateWithBoard,
  resetFactoryIds,
  undoFrame,
  withConfig,
} from '@/test/factories';

function createMemoryStorage(initialEntries: Record<string, string> = {}): Storage {
  const store = new Map(Object.entries(initialEntries));

  return {
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, value);
    },
  };
}

class FakeAiWorker {
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessage: ((event: MessageEvent<AiWorkerResponse>) => void) | null = null;
  requests: AiWorkerRequest[] = [];
  terminated = false;

  postMessage(message: AiWorkerRequest) {
    this.requests.push(message);
  }

  dispatch(requestId: number, result: AiSearchResult): void {
    if (!this.onmessage) {
      return;
    }

    this.onmessage({
      data: {
        requestId,
        result,
        type: 'result',
      },
    } as MessageEvent<AiWorkerResponse>);
  }

  reply(result: AiSearchResult): void {
    const request = this.requests.at(-1);

    if (!request) {
      return;
    }

    this.dispatch(request.requestId, result);
  }

  terminate() {
    this.terminated = true;
    this.onmessage = null;
    this.onerror = null;
  }
}

function createAiResult(overrides: Partial<AiSearchResult> = {}): AiSearchResult {
  return {
    action: null,
    completedDepth: 1,
    completedRootMoves: 1,
    diagnostics: {
      betaCutoffs: 0,
      quiescenceNodes: 0,
      repetitionPenalties: 0,
      selfUndoPenalties: 0,
      transpositionHits: 0,
    },
    elapsedMs: 0,
    evaluatedNodes: 1,
    fallbackKind: 'none',
    principalVariation: [],
    rootCandidates: [],
    score: 10,
    timedOut: false,
    ...overrides,
  };
}

describe('createGameStore', () => {
  beforeEach(() => {
    resetFactoryIds();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses updated default rule toggles and pass-device preference in a fresh store', () => {
    const store = createGameStore({
      storage: undefined,
    });

    expect(store.getState().ruleConfig).toEqual({
      allowNonAdjacentFriendlyStackTransfer: false,
      drawRule: 'none',
      scoringMode: 'basic',
    });
    expect(store.getState().preferences.passDeviceOverlayEnabled).toBe(true);
  });

  it('applies missing rule fields from defaults while deserializing sessions', () => {
    const baseSession = createSession(createInitialState());
    const sessionWithPartialRuleConfig = {
      ...baseSession,
      ruleConfig: {
        scoringMode: 'off',
      },
    };
    const deserialized = deserializeSession(JSON.stringify(sessionWithPartialRuleConfig));

    expect(deserialized.ruleConfig).toEqual({
      allowNonAdjacentFriendlyStackTransfer: false,
      drawRule: 'none',
      scoringMode: 'off',
    });
  });

  it('migrates untouched legacy persisted defaults to updated OFF/OFF/ON defaults', () => {
    const legacySession = createSession(createInitialState(), {
      ruleConfig: {
        allowNonAdjacentFriendlyStackTransfer: true,
        drawRule: 'threefold',
        scoringMode: 'basic',
      },
    });
    const storage = createMemoryStorage({
      [SESSION_STORAGE_KEY]: serializeSession(legacySession),
    });
    const store = createGameStore({ storage });
    const persisted = storage.getItem(SESSION_STORAGE_KEY);

    expect(store.getState().ruleConfig).toEqual({
      allowNonAdjacentFriendlyStackTransfer: false,
      drawRule: 'none',
      scoringMode: 'basic',
    });
    expect(persisted).not.toBeNull();
    expect(deserializeSession(String(persisted)).ruleConfig).toEqual({
      allowNonAdjacentFriendlyStackTransfer: false,
      drawRule: 'none',
      scoringMode: 'basic',
    });
  });

  it('keeps legacy rule choices when session already has game history', () => {
    const config = withConfig({
      allowNonAdjacentFriendlyStackTransfer: true,
      drawRule: 'threefold',
      scoringMode: 'basic',
    });
    const state0 = createInitialState(config);
    const state1 = applyAction(state0, { type: 'climbOne', source: 'A1', target: 'B2' }, config);
    const legacySession = createSession(state1, {
      ruleConfig: config,
      turnLog: state1.history,
      past: [undoFrame(state0)],
    });
    const storage = createMemoryStorage({
      [SESSION_STORAGE_KEY]: serializeSession(legacySession),
    });
    const store = createGameStore({ storage });

    expect(store.getState().ruleConfig).toEqual(config);
  });

  it('keeps export JSON stale until explicitly refreshed', () => {
    const store = createGameStore({
      initialSession: createSession(createInitialState()),
      storage: undefined,
    });

    expect(store.getState().exportBuffer).toBe('');

    store.getState().refreshExportBuffer();
    const initialExport = store.getState().exportBuffer;

    expect(initialExport).toContain('\n');
    expect(initialExport).toContain('"version": 3');

    store.getState().setImportBuffer('{"draft": true}');
    expect(store.getState().exportBuffer).toBe(initialExport);

    store.getState().setPreference({ language: 'english' });
    expect(store.getState().exportBuffer).toBe(initialExport);

    store.getState().selectCell('A1');
    store.getState().chooseActionType('climbOne');
    store.getState().selectCell('B2');
    store.getState().acknowledgePassScreen();
    expect(store.getState().exportBuffer).toBe(initialExport);

    store.getState().undo();
    expect(store.getState().exportBuffer).toBe(initialExport);

    store.getState().redo();
    expect(store.getState().exportBuffer).toBe(initialExport);

    store.getState().refreshExportBuffer();

    expect(store.getState().exportBuffer).not.toBe(initialExport);
  });

  it('restores undo and redo from shared turn-log frames', () => {
    const config = withConfig();
    const state0 = createInitialState(config);
    const state1 = applyAction(state0, { type: 'climbOne', source: 'A1', target: 'B2' }, config);
    const state2 = applyAction(state1, getLegalActions(state1, config)[0], config);
    const store = createGameStore({
      initialSession: createSession(state2, {
        turnLog: state2.history,
        past: [undoFrame(state0), undoFrame(state1)],
      }),
      storage: undefined,
    });

    expect(store.getState().historyCursor).toBe(2);
    expect(store.getState().gameState.history).toHaveLength(2);

    store.getState().undo();

    expect(store.getState().historyCursor).toBe(1);
    expect(store.getState().gameState.history).toHaveLength(1);
    expect(store.getState().gameState.positionCounts).toEqual(state1.positionCounts);

    store.getState().redo();

    expect(store.getState().historyCursor).toBe(2);
    expect(store.getState().gameState.history).toHaveLength(2);
    expect(store.getState().gameState.positionCounts).toEqual(state2.positionCounts);
  });

  it('recomputes selectable cells when undo crosses game-over/active states with same board hash', () => {
    const activeState = createInitialState();
    const gameOverState = {
      ...activeState,
      status: 'gameOver' as const,
      victory: { type: 'threefoldDraw' as const },
    };
    const store = createGameStore({
      initialSession: createSession(gameOverState, {
        present: undoFrame(gameOverState),
        past: [undoFrame(activeState)],
        turnLog: [],
      }),
      storage: undefined,
    });

    expect(store.getState().gameState.status).toBe('gameOver');
    expect(store.getState().selectableCoords).toEqual([]);

    store.getState().undo();

    expect(store.getState().gameState.status).toBe('active');
    expect(store.getState().selectableCoords.length).toBeGreaterThan(0);

    const source = store.getState().selectableCoords[0];
    expect(source).toBeDefined();
    if (!source) {
      return;
    }

    store.getState().selectCell(source);
    expect(store.getState().availableActionKinds.length).toBeGreaterThan(0);
  });

  it('matches repeated undo/redo when traveling to a cursor directly', () => {
    const config = withConfig();
    const state0 = createInitialState(config);
    const state1 = applyAction(state0, { type: 'climbOne', source: 'A1', target: 'B2' }, config);
    const state2 = applyAction(state1, getLegalActions(state1, config)[0], config);
    const state3 = applyAction(state2, getLegalActions(state2, config)[0], config);
    const session = createSession(state3, {
      turnLog: state3.history,
      past: [undoFrame(state0), undoFrame(state1), undoFrame(state2)],
    });
    const byButtons = createGameStore({
      initialSession: session,
      storage: undefined,
    });
    const byCursor = createGameStore({
      initialSession: session,
      storage: undefined,
    });

    byButtons.getState().undo();
    byButtons.getState().undo();
    byButtons.getState().redo();

    byCursor.getState().goToHistoryCursor(1);
    byCursor.getState().goToHistoryCursor(2);

    expect(byCursor.getState().historyCursor).toBe(byButtons.getState().historyCursor);
    expect(byCursor.getState().gameState).toEqual(byButtons.getState().gameState);
    expect(byCursor.getState().past).toEqual(byButtons.getState().past);
    expect(byCursor.getState().future).toEqual(byButtons.getState().future);
  });

  it('erases future branch after new move from rewound history', () => {
    const config = withConfig();
    const state0 = createInitialState(config);
    const state1 = applyAction(state0, { type: 'climbOne', source: 'A1', target: 'B2' }, config);
    const state2 = applyAction(state1, getLegalActions(state1, config)[0], config);
    const store = createGameStore({
      initialSession: createSession(state2, {
        turnLog: state2.history,
        past: [undoFrame(state0), undoFrame(state1)],
      }),
      storage: undefined,
    });

    store.getState().undo();

    expect(store.getState().future).toHaveLength(1);
    expect(store.getState().historyCursor).toBe(1);

    const source = store.getState().selectableCoords[0];
    expect(source).toBeDefined();
    if (!source) {
      return;
    }

    store.getState().selectCell(source);

    const actionType = store.getState().availableActionKinds[0];
    expect(actionType).toBeDefined();
    if (!actionType) {
      return;
    }

    store.getState().chooseActionType(actionType);

    if (actionType !== 'manualUnfreeze') {
      const target = store.getState().legalTargets[0];
      expect(target).toBeDefined();
      if (!target) {
        return;
      }
      store.getState().selectCell(target);
    }

    expect(store.getState().historyCursor).toBe(2);
    expect(store.getState().future).toHaveLength(0);
    expect(store.getState().turnLog).toHaveLength(store.getState().historyCursor);

    const cursorBeforeRedo = store.getState().historyCursor;
    store.getState().redo();
    expect(store.getState().historyCursor).toBe(cursorBeforeRedo);
  });

  it('shows single-step move targets and commits moveSingleToEmpty from store flow', () => {
    const state = gameStateWithBoard(
      boardWithPieces({
        B2: [checker('white')],
        F6: [checker('black')],
      }),
    );
    const store = createGameStore({
      initialSession: createSession(state),
      storage: undefined,
    });

    store.getState().selectCell('B2');

    expect(store.getState().availableActionKinds).toContain('moveSingleToEmpty');

    store.getState().chooseActionType('moveSingleToEmpty');

    expect(store.getState().legalTargets).toContain('A1');

    store.getState().selectCell('A1');

    expect(store.getState().gameState.history).toHaveLength(1);
    expect(store.getState().gameState.history[0].action).toEqual({
      type: 'moveSingleToEmpty',
      source: 'B2',
      target: 'A1',
    });
  });

  it('moves full controlled stack with moveSingleToEmpty', () => {
    const state = gameStateWithBoard(
      boardWithPieces({
        C3: [checker('white'), checker('white')],
        F6: [checker('black')],
      }),
    );
    const store = createGameStore({
      initialSession: createSession(state),
      storage: undefined,
    });

    store.getState().selectCell('C3');

    expect(store.getState().availableActionKinds).toContain('moveSingleToEmpty');

    store.getState().chooseActionType('moveSingleToEmpty');
    store.getState().selectCell('D4');

    expect(store.getState().gameState.board.C3.checkers).toHaveLength(0);
    expect(store.getState().gameState.board.D4.checkers).toHaveLength(2);
  });

  it('keeps jump-chain selection active on non-target clicks and commits stack jump', () => {
    const state = gameStateWithBoard(
      boardWithPieces({
        B2: [checker('white'), checker('white')],
        C3: [checker('black')],
        F6: [checker('black')],
      }),
    );
    const store = createGameStore({
      initialSession: createSession(state),
      storage: undefined,
    });

    store.getState().selectCell('B2');
    store.getState().chooseActionType('jumpSequence');

    expect(store.getState().legalTargets).toContain('D4');

    store.getState().selectCell('A1');

    expect(store.getState().selectedCell).toBe('B2');
    expect(store.getState().selectedActionType).toBe('jumpSequence');
    expect(store.getState().interaction.type).toBe('buildingJumpChain');

    store.getState().selectCell('D4');

    expect(store.getState().gameState.history).toHaveLength(1);
    expect(store.getState().gameState.history[0].action).toEqual({
      type: 'jumpSequence',
      source: 'B2',
      path: ['D4'],
    });
  });

  it('commits each jump segment immediately and keeps forced continuation selected', () => {
    const state = gameStateWithBoard(
      boardWithPieces({
        A1: [checker('white')],
        B2: [checker('white')],
        D4: [checker('white')],
        F6: [checker('black')],
      }),
    );
    const store = createGameStore({
      initialSession: createSession(state),
      storage: undefined,
    });

    store.getState().selectCell('A1');
    store.getState().chooseActionType('jumpSequence');
    store.getState().selectCell('C3');

    expect(store.getState().gameState.history).toHaveLength(1);
    expect(store.getState().gameState.history[0].action).toEqual({
      type: 'jumpSequence',
      source: 'A1',
      path: ['C3'],
    });
    expect(store.getState().gameState.currentPlayer).toBe('white');
    expect(store.getState().selectedCell).toBe('C3');
    expect(store.getState().selectedActionType).toBe('jumpSequence');
    expect(store.getState().legalTargets).toEqual(['E5']);

    store.getState().selectCell('E5');

    expect(store.getState().gameState.history).toHaveLength(2);
    expect(store.getState().gameState.history[1].action).toEqual({
      type: 'jumpSequence',
      source: 'C3',
      path: ['E5'],
    });
  });

  it('prevents clearing forced jump continuation before the next segment', () => {
    const state = gameStateWithBoard(
      boardWithPieces({
        A1: [checker('white')],
        B2: [checker('white')],
        D4: [checker('white')],
        F6: [checker('black')],
      }),
    );
    const store = createGameStore({
      initialSession: createSession(state),
      storage: undefined,
    });

    store.getState().selectCell('A1');
    store.getState().chooseActionType('jumpSequence');
    store.getState().selectCell('C3');

    store.getState().cancelInteraction();

    expect(store.getState().selectedCell).toBe('C3');
    expect(store.getState().selectedActionType).toBe('jumpSequence');
    expect(store.getState().legalTargets).toEqual(['E5']);
    expect(store.getState().gameState.currentPlayer).toBe('white');
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

    worker.reply(
      createAiResult({
        action: aiAction,
      }),
    );

    const humanSource = store.getState().selectableCoords[0];
    expect(store.getState().interaction.type).toBe('idle');
    expect(humanSource).toBeDefined();
    if (!humanSource) {
      return;
    }

    store.getState().selectCell(humanSource);

    expect(store.getState().selectedCell).toBe(humanSource);
  });

  it('defaults new computer matches to threefold draws when current draw rule is none', () => {
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

    expect(store.getState().historyCursor).toBe(1);
    expect(store.getState().aiStatus).toBe('thinking');

    const aiAction = getLegalActions(store.getState().gameState, store.getState().ruleConfig)[0];

    worker.reply(
      createAiResult({
        action: aiAction,
      }),
    );

    expect(store.getState().historyCursor).toBeGreaterThanOrEqual(2);
    expect(store.getState().gameState.currentPlayer).toBe('white');

    store.getState().undo();

    expect(store.getState().historyCursor).toBe(0);
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

    expect(store.getState().aiStatus).toBe('thinking');
    expect(workers).toHaveLength(1);

    vi.advanceTimersByTime(371);

    expect(workers[0]?.terminated).toBe(true);
    expect(store.getState().aiStatus).toBe('error');
    expect(store.getState().aiError).toBe('Computer move timed out.');
    expect(store.getState().pendingAiRequestId).toBeNull();

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

    expect(staleRequestId).toBe(1);

    vi.advanceTimersByTime(371);
    store.getState().retryComputerMove();

    const secondWorker = workers[1];
    const freshRequestId = secondWorker?.requests[0]?.requestId;
    const currentState = store.getState().gameState;
    const legalAction = getLegalActions(currentState, store.getState().ruleConfig)[0];

    expect(freshRequestId).toBe(2);
    expect(legalAction).toBeDefined();
    if (!secondWorker || !legalAction) {
      return;
    }

    secondWorker.dispatch(
      staleRequestId as number,
      createAiResult({
        action: legalAction,
      }),
    );

    expect(store.getState().aiStatus).toBe('thinking');
    expect(store.getState().gameState.history).toHaveLength(0);

    secondWorker.dispatch(
      freshRequestId as number,
      createAiResult({
        action: legalAction,
      }),
    );

    expect(store.getState().aiStatus).toBe('idle');
    expect(store.getState().gameState.history).toHaveLength(1);
  });
});
