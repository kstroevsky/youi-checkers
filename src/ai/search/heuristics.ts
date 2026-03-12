import type { OrderedAction } from '@/ai/moveOrdering';
import { getActionStrategicProfile } from '@/ai/strategy';
import type { AiRootCandidate, AiStrategicTag } from '@/ai/types';
import type { EngineState, TurnAction } from '@/domain';

import { actionKey } from '@/ai/search/shared';
import type { RootRankedAction, SearchContext } from '@/ai/search/types';

/** Hard cap keeps the browser-side transposition table memory bounded. */
export const TRANSPOSITION_LIMIT = 50_000;

/** Extra tactical depth searched after the normal iterative-deepening frontier. */
export const MAX_QUIESCENCE_DEPTH = 6;

/** Applies repetition and self-undo penalties while updating diagnostics. */
export function getMovePenalty(entry: OrderedAction, context: SearchContext): number {
  let penalty = 0;

  if (entry.isRepetition) {
    context.diagnostics.repetitionPenalties += 1;
    penalty += context.preset.repetitionPenalty * (entry.repeatedPositionCount - 1);
  }

  if (entry.isSelfUndo && !entry.isTactical) {
    context.diagnostics.selfUndoPenalties += 1;
    penalty += context.preset.selfUndoPenalty;
  }

  return penalty;
}

/** Records a quiet cutoff move into the history, continuation, and killer heuristics. */
export function rememberCutoffMove(
  entry: OrderedAction,
  depth: number,
  currentDepth: number,
  previousActionKey: string | null,
  context: SearchContext,
): void {
  if (entry.isTactical) {
    return;
  }

  const serialized = actionKey(entry.action);
  const bonus = Math.max(1, depth * depth);
  const historyScore = context.historyScores.get(serialized) ?? 0;

  context.historyScores.set(serialized, Math.min(32_000, historyScore + bonus * 24));

  if (previousActionKey) {
    const continuationKey = `${previousActionKey}->${serialized}`;
    const continuationScore = context.continuationScores.get(continuationKey) ?? 0;

    context.continuationScores.set(
      continuationKey,
      Math.min(24_000, continuationScore + bonus * 16),
    );
  }

  const killers = context.killerMovesByDepth.get(currentDepth) ?? [];

  if (killers.some((killer) => actionKey(killer) === serialized)) {
    return;
  }

  context.killerMovesByDepth.set(currentDepth, [entry.action, ...killers].slice(0, 2));
}

/** Converts internal ranked-root data into the public diagnostic result shape. */
export function toRootCandidate(entry: RootRankedAction): AiRootCandidate {
  return {
    action: entry.action,
    forced: entry.isForced,
    intentDelta: entry.intentDelta,
    isForced: entry.isForced,
    isRepetition: entry.isRepetition,
    isSelfUndo: entry.isSelfUndo,
    isTactical: entry.isTactical,
    policyPrior: entry.policyPrior,
    score: entry.score,
    tags: entry.tags,
  };
}

/** Reconstructs the latest same-side position key used for root self-undo detection. */
export function getRootSelfUndoPositionKey(state: EngineState): string | null {
  if (!('history' in state) || !Array.isArray(state.history)) {
    return null;
  }

  for (let index = state.history.length - 1; index >= 0; index -= 1) {
    const record = state.history[index];

    if (record.actor === state.currentPlayer) {
      return record.positionHash;
    }
  }

  return null;
}

/** Reconstructs the latest same-side action for self-undo move ordering. */
export function getRootPreviousOwnAction(state: EngineState): TurnAction | null {
  if (!('history' in state) || !Array.isArray(state.history)) {
    return null;
  }

  for (let index = state.history.length - 1; index >= 0; index -= 1) {
    const record = state.history[index];

    if (record.actor === state.currentPlayer) {
      return record.action;
    }
  }

  return null;
}

/** Rebuilds the tags for the previous same-side action to support root novelty scoring. */
export function getRootPreviousStrategicTags(
  state: EngineState,
): AiStrategicTag[] | null {
  if (!('history' in state) || !Array.isArray(state.history)) {
    return null;
  }

  for (let index = state.history.length - 1; index >= 0; index -= 1) {
    const record = state.history[index];

    if (record.actor !== state.currentPlayer) {
      continue;
    }

    const beforeState: EngineState = {
      ...record.beforeState,
      positionCounts: state.positionCounts,
    };
    const afterState: EngineState = {
      ...record.afterState,
      positionCounts: state.positionCounts,
    };

    return getActionStrategicProfile(beforeState, record.action, afterState, record.actor).tags;
  }

  return null;
}

/** Returns the previous same-side position used as the grandparent anti-undo target. */
export function getGrandparentPositionKey(
  currentDepth: number,
  ancestorPositionKeys: string[],
  context: SearchContext,
): string | null {
  if (currentDepth === 0) {
    return context.rootSelfUndoPositionKey;
  }

  return ancestorPositionKeys.at(-2) ?? null;
}
