import { advanceEngineState, type EngineState, type TurnAction } from '@/domain';
import type {
  AiDifficultyPreset,
  AiRootCandidate,
  AiSearchDiagnostics,
  AiSearchResult,
} from '@/ai/types';

import { toRootCandidate } from '@/ai/search/heuristics';
import { actionKey, makeTableKey } from '@/ai/search/shared';
import type { RootRankedAction, SearchContext } from '@/ai/search/types';

/** Creates the empty diagnostics payload used for all search results. */
export function createSearchDiagnostics(): AiSearchDiagnostics {
  return {
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
  };
}

/** Creates a minimal result used when no legal move exists. */
export function createEmptyResult(action: TurnAction | null, score: number): AiSearchResult {
  return {
    action,
    completedDepth: 0,
    completedRootMoves: action ? 1 : 0,
    diagnostics: createSearchDiagnostics(),
    elapsedMs: 0,
    evaluatedNodes: 0,
    fallbackKind: action ? 'legalOrder' : 'none',
    principalVariation: action ? [action] : [],
    rootCandidates: action
      ? [
          {
            action,
            forced: false,
            intentDelta: 0,
            isForced: false,
            isRepetition: false,
            isSelfUndo: false,
            isTactical: false,
            movedMass: 0,
            participationDelta: 0,
            policyPrior: 0,
            score,
            sourceFamily: 'none',
            tags: [],
          },
        ]
      : [],
    score,
    strategicIntent: 'hybrid',
    timedOut: false,
  };
}

/** Keeps ranked root actions in stable descending order. */
export function sortRankedActions(ranked: RootRankedAction[]): RootRankedAction[] {
  ranked.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return actionKey(left.action).localeCompare(actionKey(right.action));
  });

  return ranked;
}

/** Replays principal-variation actions from the transposition table. */
export function buildPrincipalVariation(
  state: EngineState,
  bestAction: TurnAction | null,
  completedDepth: number,
  context: SearchContext,
): TurnAction[] {
  if (!bestAction || completedDepth <= 0) {
    return [];
  }

  const variation: TurnAction[] = [];
  let currentState = state;
  let currentAction: TurnAction | null = bestAction;

  while (currentAction && variation.length < completedDepth) {
    variation.push(currentAction);
    currentState = advanceEngineState(currentState, currentAction, context.ruleConfig);

    if (currentState.status === 'gameOver') {
      break;
    }

    currentAction = context.table.get(makeTableKey(currentState))?.bestAction ?? null;
  }

  return variation;
}

/** Chooses a top candidate with the preset's near-equal balancing policy. */
export function selectCandidateAction(
  ranked: RootRankedAction[],
  preset: AiDifficultyPreset,
  random: () => number,
): RootRankedAction {
  const best = ranked[0];

  if (!best || preset.varietyTopCount <= 1 || ranked.length === 1) {
    return best;
  }

  if (best.isForced || best.isTactical) {
    return best;
  }

  const tolerance = Math.max(60, Math.abs(best.score) * preset.varietyThreshold);
  const nearEqual = ranked.filter((entry) => Math.abs(best.score - entry.score) <= tolerance);
  const quietCandidates = nearEqual
    .filter(
      (entry) =>
        !entry.isForced &&
        !entry.isTactical &&
        !entry.isSelfUndo &&
        !entry.isRepetition,
    )
    .slice(0, Math.max(preset.varietyTopCount * 6, preset.varietyTopCount));

  if (!quietCandidates.length) {
    return best;
  }

  const uniqueFamilies = new Set<string>();
  const familyFirstPass: RootRankedAction[] = [];

  for (const entry of quietCandidates) {
    if (uniqueFamilies.has(entry.sourceFamily)) {
      continue;
    }

    uniqueFamilies.add(entry.sourceFamily);
    familyFirstPass.push(entry);

    if (familyFirstPass.length >= preset.varietyTopCount) {
      break;
    }
  }

  const candidatePool = familyFirstPass.length > 1
    ? familyFirstPass
    : quietCandidates.slice(0, preset.varietyTopCount);

  if (candidatePool.length === 1) {
    return candidatePool[0];
  }

  const coveredTags = new Set<AiRootCandidate['tags'][number]>();
  const coveredFamilies = new Set<string>();
  const weighted = candidatePool.map((entry, index) => {
    const diversityBonus = entry.tags.some((tag) => !coveredTags.has(tag)) ? 40 : 0;
    const familyBonus = coveredFamilies.has(entry.sourceFamily) ? 0 : 55;

    coveredFamilies.add(entry.sourceFamily);
    entry.tags.forEach((tag) => coveredTags.add(tag));

    const adjustedScore =
      entry.score +
      familyBonus +
      diversityBonus +
      Math.round(entry.participationDelta * 0.2) +
      Math.round(entry.policyPrior * 40) +
      (entry.intent === 'hybrid' ? 15 : 0) -
      index * 5;

    return {
      entry,
      weight: Math.exp((adjustedScore - best.score) / Math.max(0.01, preset.varietyTemperature * 400)),
    };
  });
  const totalWeight = weighted.reduce((sum, candidate) => sum + candidate.weight, 0);
  let threshold = random() * totalWeight;

  for (const candidate of weighted) {
    threshold -= candidate.weight;

    if (threshold <= 0) {
      return candidate.entry;
    }
  }

  return weighted.at(-1)?.entry ?? best;
}

/** Converts ranked root actions into the public candidate list with the preset limit. */
export function orderRootCandidates(
  ranked: RootRankedAction[],
  limit: number,
): AiRootCandidate[] {
  const ordered = sortRankedActions(ranked);
  const candidates: RootRankedAction[] = [];
  const seenFamilies = new Set<string>();

  for (const entry of ordered) {
    if (seenFamilies.has(entry.sourceFamily)) {
      continue;
    }

    seenFamilies.add(entry.sourceFamily);
    candidates.push(entry);

    if (candidates.length >= limit) {
      return candidates.map(toRootCandidate);
    }
  }

  for (const entry of ordered) {
    if (candidates.includes(entry)) {
      continue;
    }

    candidates.push(entry);

    if (candidates.length >= limit) {
      break;
    }
  }

  return candidates.map(toRootCandidate);
}
