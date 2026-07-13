import type { ParticipationState } from '@/ai/participation';
import { actionKey, makeTableKey } from '@/ai/search/shared';
import type { TranspositionEntry } from '@/ai/search/types';
import type { EngineState, TurnAction } from '@/domain';

export type TranspositionSemanticContext = {
  currentDepth: number;
  participationState: ParticipationState;
  previousActionId: number | null;
  previousOwnAction: TurnAction | null;
  previousOwnPositionKey: string | null;
};

type StoredTranspositionEntry = TranspositionEntry & {
  semantic: {
    currentDepth: number;
    moveNumber: number;
    participationState: ParticipationState;
    positionCounts: EngineState['positionCounts'];
    previousActionId: number | null;
    previousOwnActionKey: string | null;
    previousOwnPositionKey: string | null;
  };
};

export type TranspositionTable = Map<string, StoredTranspositionEntry[]>;

const MAX_SEMANTIC_VARIANTS = 4;
const participationKeys = new WeakMap<ParticipationState, string>();

function getParticipationKey(state: ParticipationState): string {
  const cached = participationKeys.get(state);

  if (cached !== undefined) {
    return cached;
  }

  const key = JSON.stringify(state);
  participationKeys.set(state, key);
  return key;
}

function haveEqualPositionCounts(
  left: EngineState['positionCounts'],
  right: EngineState['positionCounts'],
): boolean {
  if (left === right) {
    return true;
  }

  const leftKeys = Object.keys(left);

  if (leftKeys.length !== Object.keys(right).length) {
    return false;
  }

  for (const key of leftKeys) {
    if (left[key] !== right[key]) {
      return false;
    }
  }

  return true;
}

function haveEqualParticipation(
  left: ParticipationState,
  right: ParticipationState,
): boolean {
  return (
    left === right || getParticipationKey(left) === getParticipationKey(right)
  );
}

function matchesSemanticContext(
  stored: StoredTranspositionEntry,
  state: EngineState,
  context: TranspositionSemanticContext,
): boolean {
  const semantic = stored.semantic;

  return (
    semantic.currentDepth === context.currentDepth &&
    semantic.moveNumber === state.moveNumber &&
    semantic.previousActionId === context.previousActionId &&
    semantic.previousOwnActionKey ===
      (context.previousOwnAction
        ? actionKey(context.previousOwnAction)
        : null) &&
    semantic.previousOwnPositionKey === context.previousOwnPositionKey &&
    haveEqualPositionCounts(semantic.positionCounts, state.positionCounts) &&
    haveEqualParticipation(
      semantic.participationState,
      context.participationState,
    )
  );
}

function toStoredEntry(
  state: EngineState,
  context: TranspositionSemanticContext,
  entry: TranspositionEntry,
): StoredTranspositionEntry {
  return {
    ...entry,
    semantic: {
      currentDepth: context.currentDepth,
      moveNumber: state.moveNumber,
      participationState: context.participationState,
      positionCounts: state.positionCounts,
      previousActionId: context.previousActionId,
      previousOwnActionKey: context.previousOwnAction
        ? actionKey(context.previousOwnAction)
        : null,
      previousOwnPositionKey: context.previousOwnPositionKey,
    },
  };
}

/** Finds a reusable score only after all non-structural score inputs match. */
export function findTranspositionEntry(
  table: TranspositionTable,
  state: EngineState,
  context: TranspositionSemanticContext,
): TranspositionEntry | null {
  const bucket = table.get(makeTableKey(state));

  if (!bucket) {
    return null;
  }

  return (
    bucket.find((entry) => matchesSemanticContext(entry, state, context)) ??
    null
  );
}

/** Stores a bounded number of exact semantic variants behind one structural hash. */
export function storeTranspositionEntry(
  table: TranspositionTable,
  state: EngineState,
  context: TranspositionSemanticContext,
  entry: TranspositionEntry,
): void {
  const tableKey = makeTableKey(state);
  const bucket = table.get(tableKey);
  const storedEntry = toStoredEntry(state, context, entry);

  if (!bucket) {
    table.set(tableKey, [storedEntry]);
    return;
  }

  const matchingIndex = bucket.findIndex((candidate) =>
    matchesSemanticContext(candidate, state, context),
  );

  if (matchingIndex >= 0) {
    bucket[matchingIndex] = storedEntry;
    return;
  }

  if (bucket.length >= MAX_SEMANTIC_VARIANTS) {
    bucket.shift();
  }

  bucket.push(storedEntry);
}
