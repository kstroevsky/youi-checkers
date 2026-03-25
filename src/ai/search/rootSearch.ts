import { evaluateState } from '@/ai/evaluation';
import {
  orderPrecomputedMoves,
  precomputeOrderedActions,
  type PrecomputedOrderedAction,
  type orderMoves,
} from '@/ai/moveOrdering';
import { buildParticipationState } from '@/ai/participation';
import { AI_DIFFICULTY_PRESETS } from '@/ai/presets';
import { getStrategicIntent } from '@/ai/strategy';
import type { AiSearchResult, ChooseComputerActionRequest } from '@/ai/types';
import { getLegalActions, type TurnAction } from '@/domain';

import {
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
import { actionKey, isSearchTimeout, makeTableKey, throwIfTimedOut } from '@/ai/search/shared';
import type { RootRankedAction, SearchContext, TranspositionEntry } from '@/ai/search/types';

/**
 * Builds a minimal ranked candidate when the search must fall back before it has
 * produced full root statistics.
 */
function createRootFallbackCandidate(
  entry: {
    action: TurnAction;
    movedMass: number;
    participationDelta: number;
    policyPrior: number;
    sourceFamily: string;
  },
  score: number,
  strategicIntent: AiSearchResult['strategicIntent'],
): RootRankedAction {
  return {
    action: entry.action,
    intent: strategicIntent,
    intentDelta: 0,
    isForced: false,
    isRepetition: false,
    isSelfUndo: false,
    isTactical: false,
    movedMass: entry.movedMass,
    participationDelta: entry.participationDelta,
    policyPrior: entry.policyPrior,
    score,
    sourceFamily: entry.sourceFamily,
    tags: [],
  };
}

/** Counts how many root-ordered moves actually received non-zero model guidance. */
function countPolicyPriorHits(ranked: Array<{ policyPrior: number }>): number {
  return ranked.reduce((count, entry) => count + (entry.policyPrior > 0 ? 1 : 0), 0);
}

/** Converts ordered-move entries into the public ranked-root shape used by fallback reporting. */
function toFallbackRanked(
  orderedMoves: ReturnType<typeof orderMoves>,
): RootRankedAction[] {
  return sortRankedActions(
    orderedMoves.map((entry) => ({
      action: entry.action,
      intent: entry.intent,
      intentDelta: entry.intentDelta,
      isForced: entry.isForced,
      isRepetition: entry.isRepetition,
      isSelfUndo: entry.isSelfUndo,
      isTactical: entry.isTactical,
      movedMass: entry.movedMass,
      participationDelta: entry.participationDelta,
      policyPrior: entry.policyPrior,
      score: entry.score,
      sourceFamily: entry.sourceFamily,
      tags: entry.tags,
    })),
  );
}

/** Chooses one computer move using iterative deepening negamax with alpha-beta pruning. */
export function chooseComputerAction({
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
  const legalActions = getLegalActions(state, ruleConfig);
  const inferredIntent = getStrategicIntent(state, state.currentPlayer).intent;
  const strategicIntent = modelGuidance?.strategicIntent ?? inferredIntent;
  const policyPriors = modelGuidance?.actionPriors ?? null;
  const rootParticipationState = buildParticipationState(state, preset.participationWindow);
  const rootPositionKey = makeTableKey(state);
  let fallbackScore: number | null = null;

  /** Lazily computes the root static fallback so timeout/error paths stay cheap unless needed. */
  function getFallbackScore(): number {
    fallbackScore ??= evaluateState(
      state,
      state.currentPlayer,
      ruleConfig,
      rootParticipationState,
      preset,
    );
    return fallbackScore;
  }

  if (!legalActions.length) {
    return {
      ...createEmptyResult(null, getFallbackScore()),
      fallbackKind: 'none',
      strategicIntent,
    };
  }

  const context: SearchContext = {
    continuationScores: new Map<string, number>(),
    deadline,
    diagnostics: createSearchDiagnostics(),
    evaluatedNodes: 0,
    historyScores: new Map<string, number>(),
    killerMovesByDepth: new Map<number, TurnAction[]>(),
    now,
    policyPriors,
    preset,
    pvMoveByDepth: new Map<number, TurnAction>(),
    rootParticipationState,
    rootPreviousOwnAction: getRootPreviousOwnAction(state),
    rootPreviousStrategicTags: getRootPreviousStrategicTags(state),
    rootStrategicIntent: strategicIntent,
    quiescenceDepthLimit: preset.maxDepth + MAX_QUIESCENCE_DEPTH,
    rootSelfUndoPositionKey: getRootSelfUndoPositionKey(state),
    ruleConfig,
    table: new Map<string, TranspositionEntry>(),
  };

  /**
   * Root ordering is rebuilt at each depth because heuristic tables, TT moves, and
   * PV hints evolve as the search learns more about the position.
   */
  const buildRootOrdering = (pvMove: TurnAction | null): ReturnType<typeof orderMoves> =>
    orderPrecomputedMoves(getRootPrecomputed(), preset, {
      deadline,
      historyScores: context.historyScores,
      includeAllQuietMoves: true,
      killerMoves: context.killerMovesByDepth.get(0) ?? [],
      now,
      previousActionKey: null,
      pvMove,
      continuationScores: context.continuationScores,
      ttMove: context.table.get(rootPositionKey)?.bestAction ?? null,
    });
  /** Timeout fallback ordering avoids the deadline check so it can always produce a legal answer. */
  const buildOrderedFallback = (): ReturnType<typeof orderMoves> =>
    orderPrecomputedMoves(getFallbackRootPrecomputed(), preset, {
      historyScores: context.historyScores,
      includeAllQuietMoves: true,
      killerMoves: context.killerMovesByDepth.get(0) ?? [],
      previousActionKey: null,
      continuationScores: context.continuationScores,
      ttMove: context.table.get(rootPositionKey)?.bestAction ?? null,
    });

  let completedDepth = 0;
  let completedRootMoves = 0;
  let bestAction = legalActions[0];
  let bestScore = getFallbackScore();
  let fallbackKind: AiSearchResult['fallbackKind'] = 'none';
  let timedOut = false;
  let rootCandidates: RootRankedAction[] = [];
  let rootPrecomputedActions: PrecomputedOrderedAction[] = [];
  let rootOrderedMoves: ReturnType<typeof orderMoves> = [];

  const createRootPrecomputed = (useDeadline: boolean): PrecomputedOrderedAction[] =>
    precomputeOrderedActions(state, state.currentPlayer, ruleConfig, preset, {
      actions: legalActions,
      deadline: useDeadline ? deadline : undefined,
      grandparentPositionKey: context.rootSelfUndoPositionKey,
      now: useDeadline ? now : undefined,
      participationState: rootParticipationState,
      policyPriors,
      policyPriorWeight: preset.policyPriorWeight,
      previousStrategicTags: context.rootPreviousStrategicTags,
      repetitionPenalty: preset.repetitionPenalty,
      samePlayerPreviousAction: context.rootPreviousOwnAction,
      selfUndoPenalty: preset.selfUndoPenalty,
    });

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
          completedDepth: 1,
          completedRootMoves: 1,
          diagnostics: context.diagnostics,
          elapsedMs: now() - startedAt,
          evaluatedNodes: 1,
          fallbackKind: 'none',
          principalVariation: [entry.action],
          rootCandidates: orderRootCandidates(
            [
              {
                action: entry.action,
                intent: entry.intent,
                intentDelta: entry.intentDelta,
                isForced: entry.isForced,
                isRepetition: entry.isRepetition,
                isSelfUndo: entry.isSelfUndo,
                isTactical: entry.isTactical,
                movedMass: entry.movedMass,
                participationDelta: entry.participationDelta,
                policyPrior: entry.policyPrior,
                score: 1_000_000,
                sourceFamily: entry.sourceFamily,
                tags: entry.tags,
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
      ? selectCandidateAction(fallbackRanked, preset, random)
      : null;
    const orderedFallbackScore = fallbackRanked[0]?.score ?? getFallbackScore();

    return {
      action: fallbackBest?.action ?? rootOrderedMoves[0]?.action ?? legalActions[0],
      completedDepth: 0,
      completedRootMoves: 0,
      diagnostics: context.diagnostics,
      elapsedMs: now() - startedAt,
      evaluatedNodes: 0,
      fallbackKind: 'orderedRoot',
      principalVariation: [fallbackBest?.action ?? rootOrderedMoves[0]?.action ?? legalActions[0]],
      rootCandidates: orderRootCandidates(
        fallbackRanked.length
          ? fallbackRanked
          : [
              createRootFallbackCandidate(
                {
                  action: legalActions[0],
                  movedMass: 0,
                  participationDelta: 0,
                  policyPrior: policyPriors?.[actionKey(legalActions[0])] ?? 0,
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
    const orderedMoves = buildRootOrdering(context.pvMoveByDepth.get(0) ?? null);

    context.diagnostics.policyPriorHits += countPolicyPriorHits(orderedMoves);

    for (const entry of orderedMoves) {
      throwIfTimedOut(now, deadline);

      let score = -negamax(
        entry.nextState,
        depth - 1,
        -betaWindow,
        -alphaWindow,
        1,
        [rootPositionKey, entry.nextPositionKey],
        [entry.action],
        entry.serializedAction,
        entry.nextParticipationState,
        context,
      );

      score -= getMovePenalty(entry, context);

      ranked.push({
        action: entry.action,
        intent: entry.intent,
        intentDelta: entry.intentDelta,
        isForced: entry.isForced,
        isRepetition: entry.isRepetition,
        isSelfUndo: entry.isSelfUndo,
        isTactical: entry.isTactical,
        movedMass: entry.movedMass,
        participationDelta: entry.participationDelta,
        policyPrior: entry.policyPrior,
        score,
        sourceFamily: entry.sourceFamily,
        tags: entry.tags,
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

          bestAction = partialBest.action;
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
                    movedMass: 0,
                    participationDelta: 0,
                    policyPrior: policyPriors?.[actionKey(legalActions[0])] ?? 0,
                    sourceFamily: 'none',
                  },
                  bestScore,
                  strategicIntent,
                ),
              ];
          bestAction = fallbackRanked.length
            ? selectCandidateAction(fallbackRanked, preset, random).action
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
    bestAction = selectCandidateAction(ranked, preset, random).action;
    fallbackKind = 'none';

    context.pvMoveByDepth.set(0, bestAction);
  }

  return {
    action: bestAction,
    completedDepth,
    completedRootMoves,
    diagnostics: context.diagnostics,
    elapsedMs: now() - startedAt,
    evaluatedNodes: context.evaluatedNodes,
    fallbackKind,
    principalVariation: buildPrincipalVariation(state, bestAction, completedDepth, context),
    rootCandidates: orderRootCandidates(rootCandidates, preset.rootCandidateLimit),
    score: bestScore,
    strategicIntent,
    timedOut,
  };
}
