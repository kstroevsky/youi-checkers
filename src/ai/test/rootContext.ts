import { applyAction, hashPosition } from '@/domain';
import type {
  EngineState,
  GameState,
  RuleConfig,
  StateSnapshot,
  TurnRecord,
} from '@/domain';

export const AI_ROOT_CONTEXT_VERSION = 1;
export const AI_ROOT_PARTICIPATION_WINDOW = 10;

export type AiRootContextV1 = {
  historyPrelude: readonly TurnRecord[] | null;
  historyStatus: 'completeForParticipationWindow' | 'truncated' | 'unavailable';
  positionCountsBeforePrelude: Readonly<Record<string, 1 | 2>> | null;
  repetitionStatus: 'reconstructible' | 'unavailable';
  state: EngineState;
  version: 1;
};

function capPositionCount(value: number): 1 | 2 {
  return value >= 2 ? 2 : 1;
}

export function capRepetitionCounts(
  counts: Readonly<Record<string, number>>,
): Record<string, 1 | 2> {
  return Object.fromEntries(
    Object.entries(counts)
      .filter(([, count]) => count > 0)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, count]) => [key, capPositionCount(count)]),
  );
}

function engineStateFromSnapshot(
  snapshot: StateSnapshot,
  positionCounts: Record<string, 1 | 2>,
): GameState {
  return {
    ...structuredClone(snapshot),
    history: [],
    positionCounts: { ...positionCounts },
  };
}

function completePreludeStart(
  history: readonly TurnRecord[],
  participationWindow: number,
): number {
  const starts = (['white', 'black'] as const).map((player) => {
    const indices = history
      .map((record, index) => ({ index, record }))
      .filter(({ record }) => record.actor === player)
      .map(({ index }) => index);
    return indices.length < participationWindow
      ? 0
      : indices[indices.length - participationWindow];
  });
  return Math.min(...starts);
}

function countsBeforeHistoryIndex(
  history: readonly TurnRecord[],
  startIndex: number,
  fallback: EngineState,
): Record<string, 1 | 2> {
  if (!history.length) return capRepetitionCounts(fallback.positionCounts);
  const counts: Record<string, number> = {
    [hashPosition(history[0].beforeState)]: 1,
  };
  for (const record of history.slice(0, startIndex)) {
    const key = hashPosition(record.afterState);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return capRepetitionCounts(counts);
}

function visibleEngineState(state: GameState): EngineState {
  return {
    board: structuredClone(state.board),
    currentPlayer: state.currentPlayer,
    moveNumber: state.moveNumber,
    pendingJump: structuredClone(state.pendingJump),
    positionCounts: { ...state.positionCounts },
    status: state.status,
    victory: structuredClone(state.victory),
  };
}

export function createCompleteAiRootContext(
  state: GameState,
  participationWindow = AI_ROOT_PARTICIPATION_WINDOW,
): AiRootContextV1 {
  if (!Number.isSafeInteger(participationWindow) || participationWindow <= 0) {
    throw new RangeError(
      'participationWindow must be a positive safe integer.',
    );
  }
  const startIndex = completePreludeStart(state.history, participationWindow);
  return {
    historyPrelude: structuredClone(state.history.slice(startIndex)),
    historyStatus: 'completeForParticipationWindow',
    positionCountsBeforePrelude: countsBeforeHistoryIndex(
      state.history,
      startIndex,
      state,
    ),
    repetitionStatus: 'reconstructible',
    state: visibleEngineState(state),
    version: AI_ROOT_CONTEXT_VERSION,
  };
}

export function createUnavailableAiRootContext(
  state: EngineState,
): AiRootContextV1 {
  return {
    historyPrelude: null,
    historyStatus: 'unavailable',
    positionCountsBeforePrelude: null,
    repetitionStatus: 'unavailable',
    state: structuredClone(state),
    version: AI_ROOT_CONTEXT_VERSION,
  };
}

function comparableState(state: EngineState) {
  return {
    board: state.board,
    currentPlayer: state.currentPlayer,
    moveNumber: state.moveNumber,
    pendingJump: state.pendingJump,
    positionCounts: capRepetitionCounts(state.positionCounts),
    status: state.status,
    victory: state.victory,
  };
}

export function replayAiRootContext(
  context: AiRootContextV1,
  ruleConfig: RuleConfig,
): GameState {
  if (
    context.historyStatus !== 'completeForParticipationWindow' ||
    context.repetitionStatus !== 'reconstructible' ||
    !context.historyPrelude ||
    !context.positionCountsBeforePrelude
  ) {
    throw new Error('AI root context is not fully replayable.');
  }
  const first = context.historyPrelude[0];
  if (!first) {
    return {
      ...structuredClone(context.state),
      history: [],
    };
  }
  let replay = engineStateFromSnapshot(first.beforeState, {
    ...context.positionCountsBeforePrelude,
  });
  for (const expected of context.historyPrelude) {
    if (replay.currentPlayer !== expected.actor) {
      throw new Error('AI root context actor chronology is invalid.');
    }
    replay = applyAction(replay, expected.action, ruleConfig);
  }
  if (
    JSON.stringify(comparableState(replay)) !==
    JSON.stringify(comparableState(context.state))
  ) {
    throw new Error(
      'AI root context replay does not reproduce the visible state.',
    );
  }
  return replay;
}

export function assertCompleteParticipationHistory(
  context: AiRootContextV1,
  participationWindow = AI_ROOT_PARTICIPATION_WINDOW,
): void {
  if (
    context.historyStatus !== 'completeForParticipationWindow' ||
    !context.historyPrelude
  ) {
    throw new Error('Complete participation history is required.');
  }
  for (const player of ['white', 'black'] as const) {
    const count = context.historyPrelude.filter(
      (record) => record.actor === player,
    ).length;
    if (count < participationWindow && context.state.moveNumber > count) {
      const first = context.historyPrelude[0];
      if (first && first.beforeState.moveNumber > 1) {
        throw new Error(`Participation history for ${player} is truncated.`);
      }
    }
  }
}
