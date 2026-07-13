import type { EngineState, TurnAction } from '@/domain';

import { encodeActionIndex } from '@/ai/model/actionSpace';
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
