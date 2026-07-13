import type { EngineState, TurnAction } from '@/domain';

import { encodeActionIndex } from '@/ai/model/actionSpace';
import type { ParticipationState } from '@/ai/participation';
import { zobristHash } from '@/ai/search/zobristHash';

/** Shared timeout sentinel used across search and move ordering. */
export const AI_SEARCH_TIMEOUT = 'AI_SEARCH_TIMEOUT';

/** Serializes an action into a stable key for ordering, caches, and tests. */
export function actionKey(action: TurnAction): string {
  switch (action.type) {
    case 'manualUnfreeze':
      return `${action.type}:${action.coord}`;
    case 'jumpSequence':
      return `${action.type}:${action.source}:${action.path.join('>')}`;
    default:
      return `${action.type}:${action.source}:${action.target}`;
  }
}

/** Returns the fixed numeric ID for an action in the AI model action space, or -1 if unrepresentable. */
export function actionId(action: TurnAction): number {
  return encodeActionIndex(action) ?? -1;
}

/** Detects the sentinel timeout error produced by the search engine. */
export function isSearchTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === AI_SEARCH_TIMEOUT;
}

/** Singleton timeout error — pre-allocated to avoid V8 stack-trace capture cost on every throw. */
const TIMEOUT_ERROR = new Error(AI_SEARCH_TIMEOUT);

/** Aborts the current search phase once the preset deadline has elapsed. */
export function throwIfTimedOut(now: () => number, deadline: number): void {
  if (now() >= deadline) {
    throw TIMEOUT_ERROR;
  }
}

/** Builds the transposition-table key for one engine state. */
export function makeTableKey(state: EngineState): string {
  return zobristHash(state);
}

export type SearchTableKeyContext = {
  currentDepth: number;
  participationState: ParticipationState;
  previousActionId: number | null;
  previousOwnAction: TurnAction | null;
  previousOwnPositionKey: string | null;
};

const positionCountsKeys = new WeakMap<EngineState, string>();
const participationKeys = new WeakMap<ParticipationState, string>();

function getPositionCountsKey(state: EngineState): string {
  const cached = positionCountsKeys.get(state);

  if (cached !== undefined) {
    return cached;
  }

  const key = JSON.stringify(
    Object.entries(state.positionCounts).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
  positionCountsKeys.set(state, key);
  return key;
}

function getParticipationKey(state: ParticipationState): string {
  const cached = participationKeys.get(state);

  if (cached !== undefined) {
    return cached;
  }

  const key = JSON.stringify(state);
  participationKeys.set(state, key);
  return key;
}

/**
 * Builds an exact score-cache key for every input that can change the searched
 * value. The shorter structural key remains useful for best-move ordering hints.
 */
export function makeSearchTableKey(
  state: EngineState,
  context: SearchTableKeyContext,
): string {
  return JSON.stringify([
    makeTableKey(state),
    state.moveNumber,
    getPositionCountsKey(state),
    context.currentDepth,
    context.previousActionId,
    context.previousOwnAction ? actionKey(context.previousOwnAction) : null,
    context.previousOwnPositionKey,
    getParticipationKey(context.participationState),
  ]);
}
