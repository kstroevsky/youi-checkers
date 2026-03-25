import { createUndoFrame, restoreGameState, type TurnRecord } from '@/domain';

import { isComputerTurn } from '@/app/store/createGameStore/match';
import type { GameStoreData, GameStoreState } from '@/app/store/createGameStore/types';

/** Groups consecutive turn records by actor for computer-mode undo behavior. */
export function getTurnSpans(
  turnLog: TurnRecord[],
  historyCursor: number,
): Array<{ actor: TurnRecord['actor']; end: number; start: number }> {
  const spans: Array<{ actor: TurnRecord['actor']; end: number; start: number }> = [];

  for (let index = 0; index < historyCursor; index += 1) {
    const record = turnLog[index];
    const currentSpan = spans.at(-1);

    if (!currentSpan || currentSpan.actor !== record.actor) {
      spans.push({
        actor: record.actor,
        end: index + 1,
        start: index,
      });
      continue;
    }

    currentSpan.end = index + 1;
  }

  return spans;
}


/** Returns the history cursor the undo action should target in computer mode. */
export function getComputerUndoTarget(state: GameStoreState): number {
  const spans = getTurnSpans(state.turnLog, state.historyCursor);
  const lastSpan = spans.at(-1);

  if (!lastSpan) {
    return state.historyCursor;
  }

  if (
    isComputerTurn(state.gameState, state.matchSettings) &&
    (state.aiStatus === 'thinking' || state.aiStatus === 'error')
  ) {
    return lastSpan.start;
  }

  if (lastSpan.actor !== state.matchSettings.humanPlayer) {
    const previousHumanSpan = [...spans]
      .reverse()
      .find((span) => span.actor === state.matchSettings.humanPlayer && span.start < lastSpan.start);

    return previousHumanSpan?.start ?? lastSpan.start;
  }

  return lastSpan.start;
}

/** Produces one undo or redo transition payload without mutating the store. */
export function getHistoryStepData(
  state: Pick<
    GameStoreData,
    'ruleConfig' | 'preferences' | 'matchSettings' | 'gameState' | 'turnLog' | 'past' | 'future'
  >,
  direction: 'backward' | 'forward',
  getBoardDerivation: (gameState: GameStoreData['gameState'], ruleConfig: GameStoreData['ruleConfig']) => Pick<
    GameStoreData,
    'selectableCoords' | 'scoreSummary'
  >,
): Pick<
  GameStoreData,
  | 'ruleConfig'
  | 'preferences'
  | 'matchSettings'
  | 'gameState'
  | 'turnLog'
  | 'past'
  | 'future'
  | 'historyCursor'
  | 'selectableCoords'
  | 'scoreSummary'
> | null {
  if (direction === 'backward') {
    const previous = state.past.at(-1);

    if (!previous) {
      return null;
    }

    const previousGameState = restoreGameState(previous, state.turnLog);
    const nextPast = state.past.slice(0, -1);
    const nextFuture = [createUndoFrame(state.gameState), ...state.future];

    return {
      ruleConfig: state.ruleConfig,
      preferences: state.preferences,
      matchSettings: state.matchSettings,
      gameState: previousGameState,
      turnLog: state.turnLog,
      past: nextPast,
      future: nextFuture,
      historyCursor: previous.historyCursor,
      ...getBoardDerivation(previousGameState, state.ruleConfig),
    };
  }

  const next = state.future[0];

  if (!next) {
    return null;
  }

  const nextGameState = restoreGameState(next, state.turnLog);
  const nextPast = [...state.past, createUndoFrame(state.gameState)];
  const nextFuture = state.future.slice(1);

  return {
    ruleConfig: state.ruleConfig,
    preferences: state.preferences,
    matchSettings: state.matchSettings,
    gameState: nextGameState,
    turnLog: state.turnLog,
    past: nextPast,
    future: nextFuture,
    historyCursor: next.historyCursor,
    ...getBoardDerivation(nextGameState, state.ruleConfig),
  };
}
