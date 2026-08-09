import {
  advanceEngineState,
  type EngineState,
  type TurnAction,
} from '@/domain';
import type {
  AiDifficultyPreset,
  AiRiskMode,
  AiRootCandidate,
  AiSearchDiagnostics,
  AiSearchResult,
} from '@/ai/types';
import type { AiBehaviorProfileId } from '@/shared/types/session';

import { getBehaviorActionBias, getBehaviorGeometryBias } from '@/ai/behavior';
import {
  getRiskCandidateAdjustment,
  hasCertifiedRiskProgress,
} from '@/ai/risk';
import { toRootCandidate } from '@/ai/search/heuristics';
import { actionId, makeTableKey } from '@/ai/search/shared';
import type { RootRankedAction, SearchContext } from '@/ai/search/types';

/** Creates the empty diagnostics payload used for all search results. */
export function createSearchDiagnostics(): AiSearchDiagnostics {
  return {
    adverseDrawTrapPenalties: 0,
    aspirationResearches: 0,
    betaCutoffs: 0,
    drawAversionApplications: 0,
    lateRiskTriggers: 0,
    orderedFallbacks: 0,
    participationPenalties: 0,
    policyPriorHits: 0,
    pvsResearches: 0,
    quiescenceNodes: 0,
    repetitionPenalties: 0,
    rootPreparationTransitions: 0,
    selfUndoPenalties: 0,
    sourceFamilyCollisions: 0,
    stagnationRiskTriggers: 0,
    transpositionHits: 0,
  };
}

/** Creates a minimal result used when no legal move exists. */
export function createEmptyResult(
  action: TurnAction | null,
  score: number,
): AiSearchResult {
  return {
    action,
    behaviorProfileId: null,
    bestSearchAction: action,
    bestSearchScore: score,
    completedDepth: 0,
    completedRootMoves: action ? 1 : 0,
    diagnostics: createSearchDiagnostics(),
    elapsedMs: 0,
    evaluatedNodes: 0,
    fallbackKind: action ? 'legalOrder' : 'none',
    partialDepth: null,
    partialRootMoves: 0,
    principalVariation: action ? [action] : [],
    riskMode: 'normal',
    rootCandidates: action
      ? [
          {
            action,
            drawTrapRisk: 0,
            emptyCellsDelta: 0,
            forced: false,
            freezeSwingBonus: 0,
            homeFieldDelta: 0,
            intentDelta: 0,
            isForced: false,
            isRepetition: false,
            isSelfUndo: false,
            isTactical: false,
            isTerminal: false,
            mobility: {
              actorBefore: 0,
              actorContinuationAfter: null,
              opponentReplyAfter: null,
              measuredAfter: false,
              samePlayerContinuation: false,
            },
            mobilityDelta: 0,
            movedMass: 0,
            participationDelta: 0,
            policyPrior: 0,
            repeatedPositionCount: 1,
            score,
            sixStackDelta: 0,
            sourceFamily: 'none',
            tags: [],
            terminalUtility: null,
            tiebreakEdgeKind: 'tied',
          },
        ]
      : [],
    score,
    selectedActionScore: score,
    selectionRegret: 0,
    strategicIntent: 'hybrid',
    timedOut: false,
  };
}

/** Derives score ownership from the full internal ranking, before diagnostic truncation. */
export function summarizeDecisionScores(
  ranked: RootRankedAction[],
  selectedAction: TurnAction | null,
  fallbackScore: number,
): Pick<
  AiSearchResult,
  | 'bestSearchAction'
  | 'bestSearchScore'
  | 'score'
  | 'selectedActionScore'
  | 'selectionRegret'
> {
  const best = ranked[0] ?? null;
  const selectedActionId = selectedAction ? actionId(selectedAction) : null;
  const selected =
    selectedActionId === null
      ? null
      : (ranked.find((entry) => actionId(entry.action) === selectedActionId) ??
        null);
  const bestSearchScore = best?.score ?? fallbackScore;
  const selectedActionScore = selected?.score ?? best?.score ?? fallbackScore;

  return {
    bestSearchAction: best?.action ?? selectedAction,
    bestSearchScore,
    score: selectedActionScore,
    selectedActionScore,
    selectionRegret: Math.max(0, bestSearchScore - selectedActionScore),
  };
}

/** Keeps ranked root actions in stable descending order. */
export function sortRankedActions(
  ranked: RootRankedAction[],
): RootRankedAction[] {
  ranked.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return actionId(left.action) - actionId(right.action);
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
    currentState = advanceEngineState(
      currentState,
      currentAction,
      context.ruleConfig,
    );

    if (currentState.status === 'gameOver') {
      break;
    }

    currentAction =
      context.table.get(makeTableKey(currentState))?.bestAction ?? null;
  }

  return variation;
}

/**
 * Computes the strength budget available to style selection.
 *
 * Relative score bands still adapt to position scale and low-confidence search,
 * but the difficulty ceiling is absolute: style can never spend more strength
 * merely because an opening or stagnation boost widened the exploratory band.
 */
export function getSelectionRegretBudget(
  bestScore: number,
  preset: AiDifficultyPreset,
  options: Pick<
    NonNullable<Parameters<typeof selectCandidateAction>[3]>,
    'bandBoost' | 'riskMode'
  > = {},
): number {
  const riskMode = options.riskMode ?? 'normal';
  const dynamicTolerance =
    Math.max(60, Math.abs(bestScore) * preset.varietyThreshold) +
    (riskMode === 'normal' ? 0 : Math.round(4_000 * preset.riskBandWidening)) +
    (options.bandBoost ?? 0);

  return Math.min(preset.maxSelectionRegret, dynamicTolerance);
}

/** Removes terminal outcomes that are strictly dominated before style is considered. */
function getTerminalSafeCandidates(
  ranked: RootRankedAction[],
): RootRankedAction[] {
  const immediateWins = ranked.filter(
    (entry) => entry.terminalUtility === 'win',
  );
  if (immediateWins.length) {
    return immediateWins;
  }

  const nonLosses = ranked.filter((entry) => entry.terminalUtility !== 'loss');
  const lossSafe = nonLosses.length ? nonLosses : ranked;
  const nonAdverseDraws = lossSafe.filter(
    (entry) => entry.terminalUtility !== 'unfavorableDraw',
  );

  return nonAdverseDraws.length ? nonAdverseDraws : lossSafe;
}

/** Chooses a stylistically varied action only after terminal and strength safety. */
export function selectCandidateAction(
  ranked: RootRankedAction[],
  preset: AiDifficultyPreset,
  random: () => number,
  options: {
    bandBoost?: number;
    behaviorProfileId?: AiBehaviorProfileId | null;
    behaviorSeed?: string | null;
    riskMode?: AiRiskMode;
  } = {},
): RootRankedAction {
  const riskMode = options.riskMode ?? 'normal';
  const bandBoost = options.bandBoost ?? 0;
  const rawBest = ranked[0];

  if (!rawBest) {
    return rawBest;
  }

  const terminalSafeCandidates = getTerminalSafeCandidates(ranked);
  const best = terminalSafeCandidates[0] ?? rawBest;

  if (
    best.isForced ||
    preset.varietyTopCount <= 1 ||
    terminalSafeCandidates.length === 1
  ) {
    return best;
  }

  const tolerance = getSelectionRegretBudget(best.score, preset, {
    bandBoost,
    riskMode,
  });
  const nearEqual = terminalSafeCandidates.filter(
    (entry) => best.score - entry.score <= tolerance,
  );
  const rerankEligibleCandidates = nearEqual
    .filter(
      (entry) =>
        !entry.isForced &&
        !entry.isSelfUndo &&
        !entry.isRepetition &&
        entry.drawTrapRisk < 0.95,
    )
    .slice(0, Math.max(preset.varietyTopCount * 6, preset.varietyTopCount));
  const riskCertifiedCandidates =
    riskMode === 'normal'
      ? rerankEligibleCandidates
      : rerankEligibleCandidates.filter(
          (entry) =>
            entry.drawTrapRisk < 0.72 &&
            hasCertifiedRiskProgress({
              drawTrapRisk: entry.drawTrapRisk,
              emptyCellsDelta: entry.emptyCellsDelta,
              freezeSwingBonus: entry.freezeSwingBonus,
              homeFieldDelta: entry.homeFieldDelta,
              isForced: entry.isForced,
              isManualUnfreeze: entry.action.type === 'manualUnfreeze',
              isRepetition: entry.isRepetition,
              isSelfUndo: entry.isSelfUndo,
              isTactical: entry.isTactical,
              mobilityDelta: entry.mobilityDelta,
              repeatedPositionCount: entry.repeatedPositionCount,
              sixStackDelta: entry.sixStackDelta,
              tags: entry.tags,
              tiebreakEdgeKind: entry.tiebreakEdgeKind,
            }),
        );
  const rerankCandidates =
    riskMode === 'normal' ? rerankEligibleCandidates : riskCertifiedCandidates;

  if (!rerankEligibleCandidates.length) {
    return best;
  }

  if (riskMode !== 'normal' && !rerankCandidates.length) {
    return best;
  }

  const uniqueFamilies = new Set<string>();
  const familyFirstPass: RootRankedAction[] = [];

  for (const entry of rerankCandidates) {
    if (uniqueFamilies.has(entry.sourceFamily)) {
      continue;
    }

    uniqueFamilies.add(entry.sourceFamily);
    familyFirstPass.push(entry);

    if (familyFirstPass.length >= preset.varietyTopCount) {
      break;
    }
  }

  const candidatePool =
    familyFirstPass.length > 1
      ? familyFirstPass
      : rerankCandidates.slice(0, preset.varietyTopCount);

  if (candidatePool.length === 1) {
    return candidatePool[0];
  }

  const coveredTags = new Set<AiRootCandidate['tags'][number]>();
  const coveredFamilies = new Set<string>();
  const scoreCompression =
    bandBoost <= 0 ? 1 : riskMode === 'normal' ? 0.2 : 0.1;
  const weighted = candidatePool.map((entry, index) => {
    const riskBonus =
      riskMode === 'normal'
        ? 0
        : getRiskCandidateAdjustment(
            {
              drawTrapRisk: entry.drawTrapRisk,
              emptyCellsDelta: entry.emptyCellsDelta,
              freezeSwingBonus: entry.freezeSwingBonus,
              homeFieldDelta: entry.homeFieldDelta,
              isForced: entry.isForced,
              isManualUnfreeze: entry.action.type === 'manualUnfreeze',
              isRepetition: entry.isRepetition,
              isSelfUndo: entry.isSelfUndo,
              isTactical: entry.isTactical,
              mobilityDelta: entry.mobilityDelta,
              repeatedPositionCount: entry.repeatedPositionCount,
              sixStackDelta: entry.sixStackDelta,
              tags: entry.tags,
              tiebreakEdgeKind: entry.tiebreakEdgeKind,
            },
            preset,
            riskMode,
          );
    const drawTrapPenalty =
      entry.isForced || entry.drawTrapRisk <= 0
        ? 0
        : Math.round(
            Math.max(180, preset.riskLoopPenalty * 1.1) *
              entry.drawTrapRisk *
              (entry.tiebreakEdgeKind === 'behind' ? 1 : 0.35),
          );
    const diversityBonus = entry.tags.some((tag) => !coveredTags.has(tag))
      ? 40
      : 0;
    const familyBonus = coveredFamilies.has(entry.sourceFamily) ? 0 : 55;
    const personaTagBonus =
      riskMode === 'normal'
        ? Math.round(
            getBehaviorActionBias(
              options.behaviorProfileId ?? null,
              entry.tags,
            ) * Math.max(0.25, preset.familyVarietyWeight / 120),
          )
        : 0;
    const seededGeometryBonus =
      riskMode === 'normal'
        ? Math.round(
            getBehaviorGeometryBias(
              options.behaviorProfileId ?? null,
              entry.action,
              options.behaviorSeed ?? null,
            ) * Math.max(1.5, preset.familyVarietyWeight / 10),
          )
        : 0;
    const compressedScore =
      best.score + (entry.score - best.score) * scoreCompression;

    coveredFamilies.add(entry.sourceFamily);
    entry.tags.forEach((tag) => coveredTags.add(tag));

    const adjustedScore =
      compressedScore +
      familyBonus +
      diversityBonus +
      personaTagBonus +
      seededGeometryBonus +
      Math.round(entry.participationDelta * 0.2) +
      Math.round(entry.policyPrior * 40) +
      riskBonus +
      -drawTrapPenalty +
      (entry.intent === 'hybrid' ? 15 : 0) -
      index * 5;

    return {
      adjustedScore,
      entry,
      weight: Math.exp(
        (adjustedScore - best.score) /
          Math.max(0.01, preset.varietyTemperature * 400),
      ),
    };
  });

  if (bandBoost > 0) {
    return weighted.reduce((currentBest, candidate) =>
      candidate.adjustedScore > currentBest.adjustedScore
        ? candidate
        : currentBest,
    ).entry;
  }

  const totalWeight = weighted.reduce(
    (sum, candidate) => sum + candidate.weight,
    0,
  );
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
