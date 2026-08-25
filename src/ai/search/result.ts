import {
  advanceEngineState,
  type EngineState,
  type Player,
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
import { getNoveltyPenalty } from '@/ai/strategy';
import {
  rerankRootStyleV1,
  type RootStyleCalibrationV1,
  type RootStyleRawFeaturesV1,
} from '@/ai/rootStyleReranker';
import { parseCoord } from '@/domain/model/coordinates';

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
      (context.transpositionMode === 'disabled'
        ? null
        : context.table.get(
            makeTableKey(currentState, context.transpositionMode),
          )?.bestAction) ?? null;
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
    previousStrategicTags?: AiRootCandidate['tags'] | null;
    participationScale?: number;
    riskMode?: AiRiskMode;
    strategicIntent?: RootRankedAction['intent'];
  } = {},
): RootRankedAction {
  const riskMode = options.riskMode ?? 'normal';
  const participationScale = options.participationScale ?? 0.2;
  if (!Number.isFinite(participationScale) || participationScale < 0) {
    throw new RangeError('participationScale must be finite and non-negative.');
  }
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
    const planCoherenceBonus =
      !options.strategicIntent || options.strategicIntent === 'hybrid'
        ? 0
        : entry.intent === options.strategicIntent
          ? 90
          : entry.intent === 'hybrid'
            ? 20
            : -90;
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
      planCoherenceBonus +
      Math.round(entry.participationDelta * participationScale) +
      riskBonus +
      -drawTrapPenalty +
      -getNoveltyPenalty(entry.tags, options.previousStrategicTags ?? null) +
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

export type ExactTieParticipationDecisionV1 = {
  action: RootRankedAction;
  changed: boolean;
  eligible: boolean;
  reason:
    | 'ambiguous'
    | 'baselineNotTiedBest'
    | 'eligible'
    | 'incompleteEvidence'
    | 'noExactTie';
};

function sourceRegionForAction(action: TurnAction, player: Player): string {
  const coord = action.type === 'manualUnfreeze' ? action.coord : action.source;
  const { column, row } = parseCoord(coord);
  const file =
    column === 'A' || column === 'B'
      ? 'left'
      : column === 'E' || column === 'F'
        ? 'right'
        : 'center';
  const relativeRow = player === 'white' ? row : 7 - row;
  const rank = relativeRow <= 2 ? 'rear' : relativeRow <= 4 ? 'mid' : 'front';
  return `${file}-${rank}`;
}

function jaccardDistance(
  left: AiRootCandidate['tags'],
  right: AiRootCandidate['tags'] | null,
) {
  if (!right) return 0;
  const union = new Set([...left, ...right]);
  if (!union.size) return 0;
  const intersection = left.filter((value) => right.includes(value)).length;
  return 1 - intersection / union.size;
}

/** Stage-B SR: complete-root, product-safe, duplicate-invariant selection. */
export function selectRootStyleRerankerV1(
  ranked: RootRankedAction[],
  baseline: RootRankedAction,
  preset: AiDifficultyPreset,
  random: () => number,
  options: {
    behaviorProfileId: AiBehaviorProfileId | null;
    behaviorSeed: string | null;
    calibration: RootStyleCalibrationV1;
    completedDepth: number;
    completedRootMoves: number;
    legalRootMoves: number;
    previousSourceFamily: string | null;
    previousSourceRegion: string | null;
    previousStrategicTags: AiRootCandidate['tags'] | null;
    rootPlayer: Player;
    strategicIntent: RootRankedAction['intent'];
    temperature: 0.25 | 0.5 | 1 | 2;
  },
): RootRankedAction {
  if (
    options.completedDepth <= 0 ||
    options.completedRootMoves !== options.legalRootMoves ||
    ranked.length !== options.legalRootMoves
  )
    return baseline;
  const prepared = buildProductSafeRootStyleRowsV1(ranked, preset, options);
  if (prepared.eligible.length < 2) return baseline;
  const probabilities = rerankRootStyleV1({
    calibration: options.calibration,
    rows: prepared.rows,
    temperature: options.temperature,
  }).sort((left, right) => left.actionKey.localeCompare(right.actionKey));
  let threshold = random();
  for (const probability of probabilities) {
    threshold -= probability.probability;
    if (threshold <= 0) {
      return (
        prepared.eligible.find(
          (entry) => actionId(entry.action) === actionId(probability.action),
        ) ?? baseline
      );
    }
  }
  return baseline;
}

export function buildProductSafeRootStyleRowsV1(
  ranked: RootRankedAction[],
  preset: AiDifficultyPreset,
  options: Parameters<typeof buildRootStyleRowsV1>[2],
) {
  const terminalSafe = getTerminalSafeCandidates(ranked);
  const best = terminalSafe[0] ?? ranked[0];
  const tolerance = getSelectionRegretBudget(best.score, preset);
  const eligible = terminalSafe.filter(
    (entry) =>
      best.score - entry.score <= tolerance &&
      !entry.isForced &&
      !entry.isSelfUndo &&
      !entry.isRepetition &&
      entry.drawTrapRisk < 0.95,
  );
  return {
    eligible,
    rows: buildRootStyleRowsV1(eligible, best, options),
  };
}

export function buildRootStyleRowsV1(
  eligible: RootRankedAction[],
  best: RootRankedAction,
  options: Pick<
    NonNullable<Parameters<typeof selectRootStyleRerankerV1>[4]>,
    | 'behaviorProfileId'
    | 'behaviorSeed'
    | 'previousSourceFamily'
    | 'previousSourceRegion'
    | 'previousStrategicTags'
    | 'rootPlayer'
    | 'strategicIntent'
  >,
): RootStyleRawFeaturesV1[] {
  return eligible.map((entry) => {
    const region = sourceRegionForAction(entry.action, options.rootPlayer);
    const plan: RootStyleRawFeaturesV1['plan'] =
      options.strategicIntent === 'hybrid'
        ? 0.25
        : entry.intent === options.strategicIntent
          ? 1
          : entry.intent === 'hybrid'
            ? 0.25
            : -1;
    return {
      action: entry.action,
      actionKind: entry.action.type,
      drawTrapRisk: entry.drawTrapRisk,
      history:
        options.previousStrategicTags === null &&
        options.previousSourceFamily === null &&
        options.previousSourceRegion === null
          ? null
          : 0.5 * jaccardDistance(entry.tags, options.previousStrategicTags) +
            0.25 *
              (options.previousSourceFamily !== null &&
              entry.sourceFamily !== options.previousSourceFamily
                ? 1
                : 0) +
            0.25 *
              (options.previousSourceRegion !== null &&
              region !== options.previousSourceRegion
                ? 1
                : 0),
      participation: entry.participationDelta,
      persona:
        getBehaviorActionBias(options.behaviorProfileId, entry.tags) +
        6 *
          getBehaviorGeometryBias(
            options.behaviorProfileId,
            entry.action,
            options.behaviorSeed,
          ),
      plan,
      productRegret: best.score - entry.score,
      progress: Math.max(entry.homeFieldDelta, entry.sixStackDelta),
      sourceFamily: entry.sourceFamily,
      strategicIntent: entry.intent,
      tactical: entry.isTactical,
      tags: entry.tags,
      terminalClass: entry.terminalUtility ?? 'nonterminal',
    };
  });
}

/** Treatment E: a post-selector break of exact, complete product-score ties only. */
export function selectExactTieParticipationV1(
  ranked: RootRankedAction[],
  baseline: RootRankedAction,
  evidence: {
    completedDepth: number;
    completedRootMoves: number;
    legalRootMoves: number;
  },
): ExactTieParticipationDecisionV1 {
  if (
    evidence.completedDepth <= 0 ||
    evidence.completedRootMoves !== evidence.legalRootMoves ||
    ranked.length !== evidence.legalRootMoves
  ) {
    return {
      action: baseline,
      changed: false,
      eligible: false,
      reason: 'incompleteEvidence',
    };
  }
  const bestScore = Math.max(...ranked.map((entry) => entry.score));
  const tied = ranked.filter((entry) => entry.score === bestScore);
  if (tied.length < 2)
    return {
      action: baseline,
      changed: false,
      eligible: false,
      reason: 'noExactTie',
    };
  if (!tied.includes(baseline))
    return {
      action: baseline,
      changed: false,
      eligible: false,
      reason: 'baselineNotTiedBest',
    };
  const bestParticipation = Math.max(
    ...tied.map((entry) => entry.participationDelta),
  );
  const preferred = tied.filter(
    (entry) => entry.participationDelta === bestParticipation,
  );
  if (preferred.length !== 1)
    return {
      action: baseline,
      changed: false,
      eligible: true,
      reason: 'ambiguous',
    };
  return {
    action: preferred[0],
    changed: preferred[0] !== baseline,
    eligible: true,
    reason: 'eligible',
  };
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
