import type { AiSearchResult, AiWorkerRequest, AiWorkerResponse } from '@/ai';
import type { SessionArchive } from '@/app/store/sessionArchive';
import { applyAction, createInitialState, getLegalActions } from '@/domain';
import { createSession, undoFrame, withConfig } from '@/test/factories';

type ArchiveRecord = Awaited<ReturnType<SessionArchive['loadLatest']>>;

export function createMemoryStorage(
  initialEntries: Record<string, string> = {},
  options: {
    onSetItem?: (key: string, value: string) => void;
  } = {},
): Storage {
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
      options.onSetItem?.(key, value);
      store.set(key, value);
    },
  };
}

export function createQuotaExceededError(): Error {
  try {
    return new DOMException(
      "Failed to execute 'setItem' on 'Storage': Setting the value exceeded the quota.",
      'QuotaExceededError',
    );
  } catch {
    const error = new Error('Quota exceeded.');
    error.name = 'QuotaExceededError';
    return error;
  }
}

export function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, reject, resolve };
}

export class FakeArchive implements SessionArchive {
  constructor(
    private readonly loadImpl: () => Promise<ArchiveRecord>,
    private readonly saveImpl: (
      envelope: Parameters<SessionArchive['saveLatest']>[0],
    ) => Promise<void> = async () => undefined,
  ) {}

  loadLatest() {
    return this.loadImpl();
  }

  saveLatest(envelope: Parameters<SessionArchive['saveLatest']>[0]) {
    return this.saveImpl(envelope);
  }
}

export class FakeAiWorker {
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

export function createAiResult(overrides: Partial<AiSearchResult> = {}): AiSearchResult {
  return {
    action: null,
    completedDepth: 1,
    completedRootMoves: 1,
    diagnostics: {
      aspirationResearches: 0,
      betaCutoffs: 0,
      orderedFallbacks: 0,
      participationPenalties: 0,
      policyPriorHits: 0,
      pvsResearches: 0,
      quiescenceNodes: 0,
      repetitionPenalties: 0,
      selfUndoPenalties: 0,
      sourceFamilyCollisions: 0,
      transpositionHits: 0,
    },
    elapsedMs: 0,
    evaluatedNodes: 1,
    fallbackKind: 'none',
    principalVariation: [],
    rootCandidates: [],
    score: 10,
    strategicIntent: 'hybrid',
    timedOut: false,
    ...overrides,
  };
}

export function createHistorySession(turnCount: number, historyCursor = turnCount) {
  const config = withConfig();
  const states = [createInitialState(config)];

  for (let index = 0; index < turnCount; index += 1) {
    const previous = states.at(-1);

    if (!previous) {
      break;
    }

    const action = getLegalActions(previous, config)[0];

    if (!action) {
      break;
    }

    states.push(applyAction(previous, action, config));
  }

  const liveState = states.at(-1) ?? createInitialState(config);
  const presentState = states[historyCursor] ?? liveState;

  return {
    session: createSession(liveState, {
      future: states.slice(historyCursor + 1).map(undoFrame),
      past: states.slice(0, historyCursor).map(undoFrame),
      present: undoFrame(presentState),
      turnLog: liveState.history,
    }),
    states,
  };
}
