import { evaluateState } from '@/ai/evaluation';
import { AI_MODEL_ACTION_COUNT } from '@/ai/model/actionSpace';
import {
  orderPrecomputedMoves,
  precomputeOrderedActions,
  type OrderedAction,
  type PrecomputedOrderedAction,
} from '@/ai/moveOrdering';
import {
  createSearchPerfCache,
  getCachedLegalActions,
  getPerfStrategicIntent,
  getStatePerfBundle,
} from '@/ai/perf';
import { buildParticipationState } from '@/ai/participation';
import { AI_DIFFICULTY_PRESETS } from '@/ai/presets';
import { getRiskProfile, hasCertifiedRiskProgress } from '@/ai/risk';
import type { AiSearchResult, ChooseComputerActionRequest } from '@/ai/types';
import type { TurnAction } from '@/domain';

import {
  getSelectiveExtension,
  getMovePenalty,
  getRootPreviousOwnAction,
  getRootPreviousStrategicTags,
  getRootSelfUndoPositionKey,
  MAX_QUIESCENCE_DEPTH,
} from '@/ai/search/heuristics';
import { negamax } from '@/ai/search/negamax';
import {
  buildPrincipalVariation,
  createEmptyResult,
  createSearchDiagnostics,
  orderRootCandidates,
  selectCandidateAction,
  sortRankedActions,
} from '@/ai/search/result';
import { actionId, isSearchTimeout, makeTableKey, throwIfTimedOut } from '@/ai/search/shared';
import type { RootRankedAction, SearchContext, TranspositionEntry } from '@/ai/search/types';

/**
 * Builds a minimal ranked candidate when the search must fall back before it has
 * produced full root statistics.
 */
function createRootFallbackCandidate(
  entry: {
    action: TurnAction;
    drawTrapRisk?: number;
    emptyCellsDelta?: number;
    freezeSwingBonus?: number;
    homeFieldDelta?: number;
    mobilityDelta?: number;
    movedMass: number;
    participationDelta: number;
    policyPrior: number;
    repeatedPositionCount?: number;
    sixStackDelta?: number;
    sourceFamily: string;
    tiebreakEdgeKind?: AiSearchResult['rootCandidates'][number]['tiebreakEdgeKind'];
  },
  score: number,
  strategicIntent: AiSearchResult['strategicIntent'],
): RootRankedAction {
  return {
    action: entry.action,
    drawTrapRisk: entry.drawTrapRisk ?? 0,
    emptyCellsDelta: entry.emptyCellsDelta ?? 0,
    freezeSwingBonus: entry.freezeSwingBonus ?? 0,
    homeFieldDelta: entry.homeFieldDelta ?? 0,
    intent: strategicIntent,
    intentDelta: 0,
    isForced: false,
    isRepetition: false,
    isSelfUndo: false,
    isTactical: false,
    mobilityDelta: entry.mobilityDelta ?? 0,
    movedMass: entry.movedMass,
    participationDelta: entry.participationDelta,
    policyPrior: entry.policyPrior,
    repeatedPositionCount: entry.repeatedPositionCount ?? 1,
    score,
    sixStackDelta: entry.sixStackDelta ?? 0,
    sourceFamily: entry.sourceFamily,
    tags: [],
    tiebreakEdgeKind: entry.tiebreakEdgeKind ?? 'tied',
  };
}

/** Counts how many root-ordered moves actually received non-zero model guidance. */
function countPolicyPriorHits(ranked: Array<{ policyPrior: number }>): number {
  return ranked.reduce((count, entry) => count + (entry.policyPrior > 0 ? 1 : 0), 0);
}

function hasRiskWorthwhileRootCandidate(
  orderedMoves: PrecomputedOrderedAction[],
): boolean {
  return orderedMoves.some(
    (entry) =>
      !entry.isForced &&
      !entry.isRepetition &&
      !entry.isSelfUndo &&
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
}

/**
 * Root score gaps are much less trustworthy when the search never completed a
 * depth or the game is still in the first few opening moves.
 *
 * In those cases we widen the rerank band so personas and risk mode can shape
 * play inside a bounded "safe enough" set instead of following noisy root scores
 * too rigidly.
 */
function getSelectionBandBoost(
  moveNumber: number,
  riskMode: AiSearchResult['riskMode'],
  options: {
    completedDepth: number;
    fallbackKind: AiSearchResult['fallbackKind'];
  },
): number {
  let boost = moveNumber <= 6 ? 900 : 0;

  if (riskMode !== 'normal' && (options.completedDepth === 0 || options.fallbackKind !== 'none')) {
    boost += 4_000;
  }

  return boost;
}

/** Converts ordered-move entries into the public ranked-root shape used by fallback reporting. */
function toFallbackRanked(
  orderedMoves: OrderedAction[],
): RootRankedAction[] {
  return sortRankedActions(
    orderedMoves.map((entry) => ({
      action: entry.action,
      drawTrapRisk: entry.drawTrapRisk,
      emptyCellsDelta: entry.emptyCellsDelta,
      freezeSwingBonus: entry.freezeSwingBonus,
      homeFieldDelta: entry.homeFieldDelta,
      intent: entry.intent,
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
      tiebreakEdgeKind: entry.tiebreakEdgeKind,
    })),
  );
}

/** Chooses one computer move using iterative deepening negamax with alpha-beta pruning. */
export function chooseComputerAction({
  behaviorProfile = null,
  difficulty,
  modelGuidance = null,
  now = () => performance.now(),
  random = Math.random,
  ruleConfig,
  state,
}: ChooseComputerActionRequest): AiSearchResult {
  const preset = AI_DIFFICULTY_PRESETS[difficulty];
  const startedAt = now();
  const deadline = startedAt + preset.timeBudgetMs;
  const perfCache = createSearchPerfCache();
  const rootPerfBundle = getStatePerfBundle(state, ruleConfig, perfCache);
  const legalActions = getCachedLegalActions(state, ruleConfig, rootPerfBundle.positionKey);
  const inferredIntent = getPerfStrategicIntent(rootPerfBundle, state, state.currentPlayer).intent;
  const diagnostics = createSearchDiagnostics();
  const riskProfile = getRiskProfile(state, ruleConfig, preset, diagnostics);
  const policyPriors = modelGuidance?.actionPriors ?? null;
  const rootParticipationState = buildParticipationState(state, preset.participationWindow);
  const rootPositionKey = makeTableKey(state);
  const rootPreviousOwnAction = getRootPreviousOwnAction(state);
  const rootPreviousStrategicTags = getRootPreviousStrategicTags(state);
  const rootSelfUndoPositionKey = getRootSelfUndoPositionKey(state);
  const openingVarietyActive = state.moveNumber <= 6 && behaviorProfile !== null;
  let effectiveRiskMode = riskProfile.riskMode;
  let rootPolicyPriorWeight =
    effectiveRiskMode === 'normal'
      ? preset.policyPriorWeight
      : preset.policyPriorWeight * preset.riskPolicyPriorScale;
  let rootPrecomputedActions: PrecomputedOrderedAction[] = [];

  if (openingVarietyActive) {
    rootPolicyPriorWeight *= 0.3;
  }

  const createRootPrecomputed = (
    useDeadline: boolean,
    riskMode = effectiveRiskMode,
    policyPriorWeight = rootPolicyPriorWeight,
  ): PrecomputedOrderedAction[] =>
    precomputeOrderedActions(state, state.currentPlayer, ruleConfig, preset, {
      actions: legalActions,
      behaviorProfile,
      deadline: useDeadline ? deadline : undefined,
      diagnostics,
      grandparentPositionKey: rootSelfUndoPositionKey,
      now: useDeadline ? now : undefined,
      participationState: rootParticipationState,
      perfCache,
      policyPriors,
      policyPriorWeight,
      previousStrategicTags: rootPreviousStrategicTags,
      repetitionPenalty: preset.repetitionPenalty,
      riskMode,
      samePlayerPreviousAction: rootPreviousOwnAction,
      selfUndoPenalty: preset.selfUndoPenalty,
    });

  if (effectiveRiskMode !== 'normal') {
    const riskProbe = createRootPrecomputed(false);

    if (hasRiskWorthwhileRootCandidate(riskProbe)) {
      rootPrecomputedActions = riskProbe;
    } else {
      effectiveRiskMode = 'normal';
      rootPolicyPriorWeight = preset.policyPriorWeight;
    }
  }

  const strategicIntent =
    effectiveRiskMode === 'normal'
      ? modelGuidance?.strategicIntent ?? inferredIntent
      : inferredIntent;
  let fallbackScore: number | null = null;

  /** Lazily computes the root static fallback so timeout/error paths stay cheap unless needed. */
  function getFallbackScore(): number {
    fallbackScore ??= evaluateState(
      state,
      state.currentPlayer,
      ruleConfig,
      {
        behaviorProfile,
        diagnostics,
        perfCache,
        participationState: rootParticipationState,
        preset,
        riskMode: effectiveRiskMode,
      },
    );
    return fallbackScore;
  }

  if (!legalActions.length) {
    return {
      ...createEmptyResult(null, getFallbackScore()),
      behaviorProfileId: behaviorProfile?.id ?? null,
      fallbackKind: 'none',
      riskMode: effectiveRiskMode,
      strategicIntent,
    };
  }

  const context: SearchContext = {
    behaviorProfile,
    continuationScores: new Map<number, number>(),
    deadline,
    diagnostics,
    evaluatedNodes: 0,
    historyScores: new Int32Array(AI_MODEL_ACTION_COUNT),
    killerMovesByDepth: new Map<number, number[]>(),
    now,
    perfCache,
    policyPriors,
    preset,
    pvMoveByDepth: new Map<number, number>(),
    riskMode: effectiveRiskMode,
    rootParticipationState,
    rootPlayer: state.currentPlayer,
    rootPreviousOwnAction,
    rootPreviousStrategicTags,
    rootStrategicIntent: strategicIntent,
    quiescenceDepthLimit: preset.maxDepth + MAX_QUIESCENCE_DEPTH,
    rootSelfUndoPositionKey,
    ruleConfig,
    table: new Map<string, TranspositionEntry>(),
  };

  /**
   * Root ordering is rebuilt at each depth because heuristic tables, TT moves, and
   * PV hints evolve as the search learns more about the position.
   */
  const buildRootOrdering = (pvMoveId: number | null): OrderedAction[] =>
    orderPrecomputedMoves(getRootPrecomputed(), preset, {
      deadline,
      historyScores: context.historyScores,
      includeAllQuietMoves: true,
      killerIds: context.killerMovesByDepth.get(0) ?? [],
      now,
      previousActionId: null,
      pvMoveId,
      continuationScores: context.continuationScores,
      ttMoveId: (() => { const a = context.table.get(rootPositionKey)?.bestAction ?? null; return a ? actionId(a) : null; })(),
    });
  /** Timeout fallback ordering avoids the deadline check so it can always produce a legal answer. */
  const buildOrderedFallback = (): OrderedAction[] =>
    orderPrecomputedMoves(getFallbackRootPrecomputed(), preset, {
      historyScores: context.historyScores,
      includeAllQuietMoves: true,
      killerIds: context.killerMovesByDepth.get(0) ?? [],
      previousActionId: null,
      continuationScores: context.continuationScores,
      ttMoveId: (() => { const a = context.table.get(rootPositionKey)?.bestAction ?? null; return a ? actionId(a) : null; })(),
    });

  let completedDepth = 0;
  let completedRootMoves = 0;
  let bestAction = legalActions[0];
  let bestScore = getFallbackScore();
  let fallbackKind: AiSearchResult['fallbackKind'] = 'none';
  let timedOut = false;
  let rootCandidates: RootRankedAction[] = [];
  let rootOrderedMoves: OrderedAction[] = [];
  let rootPvMoveId: number | null = null;

  const getRootPrecomputed = (): PrecomputedOrderedAction[] => {
    if (!rootPrecomputedActions.length) {
      rootPrecomputedActions = createRootPrecomputed(true);
    }

    return rootPrecomputedActions;
  };

  const getFallbackRootPrecomputed = (): PrecomputedOrderedAction[] => {
    if (!rootPrecomputedActions.length) {
      rootPrecomputedActions = createRootPrecomputed(false);
    }

    return rootPrecomputedActions;
  };

  try {
    rootOrderedMoves = buildRootOrdering(null);
    context.diagnostics.policyPriorHits += countPolicyPriorHits(rootOrderedMoves);

    for (const entry of rootOrderedMoves) {
      if (
        entry.nextState.status === 'gameOver' &&
        'winner' in entry.nextState.victory &&
        entry.nextState.victory.winner === state.currentPlayer
      ) {
        return {
          action: entry.action,
          behaviorProfileId: behaviorProfile?.id ?? null,
          completedDepth: 1,
          completedRootMoves: 1,
          diagnostics: context.diagnostics,
          elapsedMs: now() - startedAt,
          evaluatedNodes: 1,
          fallbackKind: 'none',
          principalVariation: [entry.action],
          riskMode: effectiveRiskMode,
          rootCandidates: orderRootCandidates(
            [
              {
                action: entry.action,
                drawTrapRisk: entry.drawTrapRisk,
                emptyCellsDelta: entry.emptyCellsDelta,
                freezeSwingBonus: entry.freezeSwingBonus,
                homeFieldDelta: entry.homeFieldDelta,
                intent: entry.intent,
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
                score: 1_000_000,
                sixStackDelta: entry.sixStackDelta,
                sourceFamily: entry.sourceFamily,
                tags: entry.tags,
                tiebreakEdgeKind: entry.tiebreakEdgeKind,
              },
            ],
            preset.rootCandidateLimit,
          ),
          score: 1_000_000,
          strategicIntent,
          timedOut: false,
        };
      }
    }
  } catch (error) {
    if (!isSearchTimeout(error)) {
      throw error;
    }

    context.diagnostics.orderedFallbacks += 1;
    rootOrderedMoves = rootOrderedMoves.length > 0 ? rootOrderedMoves : buildOrderedFallback();
    const fallbackRanked = toFallbackRanked(rootOrderedMoves);
    const fallbackBest = fallbackRanked.length
      ? selectCandidateAction(fallbackRanked, preset, random, {
          behaviorProfileId: behaviorProfile?.id ?? null,
          riskMode: effectiveRiskMode,
        })
      : null;
    const orderedFallbackScore = fallbackRanked[0]?.score ?? getFallbackScore();

    return {
      action: fallbackBest?.action ?? rootOrderedMoves[0]?.action ?? legalActions[0],
      behaviorProfileId: behaviorProfile?.id ?? null,
      completedDepth: 0,
      completedRootMoves: 0,
      diagnostics: context.diagnostics,
      elapsedMs: now() - startedAt,
      evaluatedNodes: 0,
      fallbackKind: 'orderedRoot',
      principalVariation: [fallbackBest?.action ?? rootOrderedMoves[0]?.action ?? legalActions[0]],
      riskMode: effectiveRiskMode,
      rootCandidates: orderRootCandidates(
        fallbackRanked.length
          ? fallbackRanked
          : [
              createRootFallbackCandidate(
                {
                  action: legalActions[0],
                  movedMass: 0,
                  participationDelta: 0,
                  policyPrior: policyPriors ? (policyPriors[actionId(legalActions[0])] ?? 0) : 0,
                  sourceFamily: 'none',
                },
                orderedFallbackScore,
                strategicIntent,
              ),
            ],
        preset.rootCandidateLimit,
      ),
      score: orderedFallbackScore,
      strategicIntent,
      timedOut: true,
    };
  }

  /**
   * Searches one complete root depth using the current aspiration window.
   *
   * A full ranked root list is returned so the caller can both pick the move and
   * expose diagnostics/candidates without re-searching.
   */
  const runDepthSearch = (
    depth: number,
    alphaWindow: number,
    betaWindow: number,
  ): RootRankedAction[] => {
    const ranked: RootRankedAction[] = [];
    const orderedMoves = buildRootOrdering(rootPvMoveId);

    context.diagnostics.policyPriorHits += countPolicyPriorHits(orderedMoves);

    for (const entry of orderedMoves) {
      throwIfTimedOut(now, deadline);

      const keepsTurn = entry.nextState.currentPlayer === state.currentPlayer;
      let score = keepsTurn
        ? negamax(
            entry.nextState,
            Math.max(0, depth - 1 + getSelectiveExtension(entry, depth, 0)),
            alphaWindow,
            betaWindow,
            1,
            [
              {
                action: entry.action,
                actor: state.currentPlayer,
                positionKey: entry.nextPositionKey,
              },
            ],
            entry.actionId,
            entry.nextParticipationState,
            context,
          )
        : -negamax(
            entry.nextState,
            Math.max(0, depth - 1 + getSelectiveExtension(entry, depth, 0)),
            -betaWindow,
            -alphaWindow,
            1,
            [
              {
                action: entry.action,
                actor: state.currentPlayer,
                positionKey: entry.nextPositionKey,
              },
            ],
            entry.actionId,
            entry.nextParticipationState,
            context,
          );

      score -= getMovePenalty(entry, context);

      ranked.push({
        action: entry.action,
        drawTrapRisk: entry.drawTrapRisk,
        emptyCellsDelta: entry.emptyCellsDelta,
        freezeSwingBonus: entry.freezeSwingBonus,
        homeFieldDelta: entry.homeFieldDelta,
        intent: entry.intent,
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
        score,
        sixStackDelta: entry.sixStackDelta,
        sourceFamily: entry.sourceFamily,
        tags: entry.tags,
        tiebreakEdgeKind: entry.tiebreakEdgeKind,
      });
    }

    return sortRankedActions(ranked);
  };

  for (let depth = 1; depth <= preset.maxDepth; depth += 1) {
    let ranked: RootRankedAction[] = [];
    const hasAspirationCenter = completedDepth > 0 && Number.isFinite(bestScore);
    const windowSize = 220 + depth * 80;
    let alphaWindow = hasAspirationCenter ? bestScore - windowSize : Number.NEGATIVE_INFINITY;
    let betaWindow = hasAspirationCenter ? bestScore + windowSize : Number.POSITIVE_INFINITY;

    try {
      throwIfTimedOut(now, deadline);
      ranked = runDepthSearch(depth, alphaWindow, betaWindow);

      const aspirationMiss =
        hasAspirationCenter &&
        ranked.length > 0 &&
        (ranked[0].score <= alphaWindow || ranked[0].score >= betaWindow);

      if (aspirationMiss) {
        context.diagnostics.aspirationResearches += 1;
        alphaWindow = Number.NEGATIVE_INFINITY;
        betaWindow = Number.POSITIVE_INFINITY;
        ranked = runDepthSearch(depth, alphaWindow, betaWindow);
      }
    } catch (error) {
      if (isSearchTimeout(error)) {
        timedOut = true;

        if (ranked.length > 0) {
          const partialBest = ranked[0];

          bestAction = selectCandidateAction(ranked, preset, random, {
            bandBoost: getSelectionBandBoost(state.moveNumber, effectiveRiskMode, {
              completedDepth: 0,
              fallbackKind: 'partialCurrentDepth',
            }),
            behaviorProfileId: behaviorProfile?.id ?? null,
            behaviorSeed: behaviorProfile?.seed ?? null,
            riskMode: effectiveRiskMode,
          }).action;
          bestScore = partialBest.score;
          completedRootMoves = ranked.length;
          rootCandidates = ranked;
          fallbackKind = 'partialCurrentDepth';
        } else if (completedDepth > 0) {
          fallbackKind = 'previousDepth';
        } else {
          const fallbackOrderedMoves = buildOrderedFallback();
          const orderedFallback = fallbackOrderedMoves[0];
          const fallbackRanked = toFallbackRanked(fallbackOrderedMoves);

          context.diagnostics.orderedFallbacks += 1;
          fallbackKind = 'orderedRoot';
          bestScore = fallbackRanked[0]?.score ?? orderedFallback?.score ?? getFallbackScore();
          completedRootMoves = 0;
          rootCandidates = fallbackRanked.length
            ? fallbackRanked
            : [
                createRootFallbackCandidate(
                  orderedFallback ?? {
                    action: legalActions[0],
                    emptyCellsDelta: 0,
                    freezeSwingBonus: 0,
                    homeFieldDelta: 0,
                    mobilityDelta: 0,
                    movedMass: 0,
                    participationDelta: 0,
                    policyPrior: policyPriors ? (policyPriors[actionId(legalActions[0])] ?? 0) : 0,
                    repeatedPositionCount: 1,
                    sixStackDelta: 0,
                    sourceFamily: 'none',
                  },
                  bestScore,
                  strategicIntent,
                ),
              ];
          bestAction = fallbackRanked.length
            ? selectCandidateAction(fallbackRanked, preset, random, {
                bandBoost: getSelectionBandBoost(state.moveNumber, effectiveRiskMode, {
                  completedDepth: 0,
                  fallbackKind,
                }),
                behaviorProfileId: behaviorProfile?.id ?? null,
                behaviorSeed: behaviorProfile?.seed ?? null,
                riskMode: effectiveRiskMode,
              }).action
            : orderedFallback?.action ?? legalActions[0];
        }

        break;
      }

      throw error;
    }

    if (!ranked.length) {
      break;
    }

    completedDepth = depth;
    completedRootMoves = ranked.length;
    rootCandidates = ranked;
    bestScore = ranked[0].score;
    bestAction = selectCandidateAction(ranked, preset, random, {
      bandBoost: getSelectionBandBoost(state.moveNumber, effectiveRiskMode, {
        completedDepth: depth,
        fallbackKind: 'none',
      }),
      behaviorProfileId: behaviorProfile?.id ?? null,
      behaviorSeed: behaviorProfile?.seed ?? null,
      riskMode: effectiveRiskMode,
    }).action;
    fallbackKind = 'none';

    rootPvMoveId = actionId(bestAction);
  }

  return {
    action: bestAction,
    behaviorProfileId: behaviorProfile?.id ?? null,
    completedDepth,
    completedRootMoves,
    diagnostics: context.diagnostics,
    elapsedMs: now() - startedAt,
    evaluatedNodes: context.evaluatedNodes,
    fallbackKind,
    principalVariation: buildPrincipalVariation(state, bestAction, completedDepth, context),
    riskMode: effectiveRiskMode,
    rootCandidates: orderRootCandidates(rootCandidates, preset.rootCandidateLimit),
    score: bestScore,
    strategicIntent,
    timedOut,
  };
}
