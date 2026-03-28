import type { OrderedAction } from '@/ai/moveOrdering';
import { getActionStrategicProfile } from '@/ai/strategy';
import type { AiRootCandidate, AiStrategicTag } from '@/ai/types';
import type { EngineState, Player, TurnAction } from '@/domain';

import { actionKey } from '@/ai/search/shared';
import type {
  RootRankedAction,
  SearchContext,
  SearchLineEntry,
} from '@/ai/search/types';

/** Hard cap keeps the browser-side transposition table memory bounded. */
export const TRANSPOSITION_LIMIT = 50_000;

/** Extra tactical depth searched after the normal iterative-deepening frontier. */
export const MAX_QUIESCENCE_DEPTH = 6;

/** Applies repetition and self-undo penalties while updating diagnostics. */
export function getMovePenalty(entry: OrderedAction, context: SearchContext): number {
  let penalty = 0;

  if (entry.participationDelta < 0) {
    context.diagnostics.participationPenalties += 1;
  }

  if (entry.repeatsSourceFamily || entry.repeatsSourceRegion) {
    context.diagnostics.sourceFamilyCollisions += 1;
  }

  if (entry.isRepetition) {
    context.diagnostics.repetitionPenalties += 1;
    penalty += context.preset.repetitionPenalty * (entry.repeatedPositionCount - 1);
  }

  if (entry.isSelfUndo && !entry.isForced) {
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

  const serialized = entry.serializedAction;
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
    emptyCellsDelta: entry.emptyCellsDelta,
    forced: entry.isForced,
    freezeSwingBonus: entry.freezeSwingBonus,
    homeFieldDelta: entry.homeFieldDelta,
    intentDelta: entry.intentDelta,
    isForced: entry.isForced,
    isRepetition: entry.isRepetition,
    isSelfUndo: entry.isSelfUndo,
    isTactical: entry.isTactical,
    mobilityDelta: entry.mobilityDelta,
    movedMass: entry.movedMass,
    participationDelta: entry.participationDelta,
    policyPrior: entry.policyPrior,
    repeatedPositionCount: entry.repeatedPositionCount,
    score: entry.score,
    sixStackDelta: entry.sixStackDelta,
    sourceFamily: entry.sourceFamily,
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

function getPreviousOwnLineEntry(
  player: Player,
  searchLine: SearchLineEntry[],
): SearchLineEntry | null {
  for (let index = searchLine.length - 1; index >= 0; index -= 1) {
    const entry = searchLine[index];

    if (entry?.actor === player) {
      return entry;
    }
  }

  return null;
}

/** Resolves the latest same-side action from the actor-aware search line. */
export function getPreviousOwnActionFromLine(
  player: Player,
  searchLine: SearchLineEntry[],
  context: SearchContext,
): TurnAction | null {
  const lineEntry = getPreviousOwnLineEntry(player, searchLine);

  if (lineEntry) {
    return lineEntry.action;
  }

  return player === context.rootPlayer ? context.rootPreviousOwnAction : null;
}

/** Resolves the latest same-side position key from the actor-aware search line. */
export function getPreviousOwnPositionKeyFromLine(
  player: Player,
  searchLine: SearchLineEntry[],
  context: SearchContext,
): string | null {
  const lineEntry = getPreviousOwnLineEntry(player, searchLine);

  if (lineEntry) {
    return lineEntry.positionKey;
  }

  return player === context.rootPlayer ? context.rootSelfUndoPositionKey : null;
}
