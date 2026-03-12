import { evaluateState } from '@/ai/evaluation';
import { orderMoves } from '@/ai/moveOrdering';
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

function createRootFallbackCandidate(
  action: TurnAction,
  score: number,
  policyPrior: number,
  strategicIntent: AiSearchResult['strategicIntent'],
): RootRankedAction {
  return {
    action,
    intent: strategicIntent,
    intentDelta: 0,
    isForced: false,
    isRepetition: false,
    isSelfUndo: false,
    isTactical: false,
    policyPrior,
    score,
    tags: [],
  };
}

function countPolicyPriorHits(ranked: Array<{ policyPrior: number }>): number {
  return ranked.reduce((count, entry) => count + (entry.policyPrior > 0 ? 1 : 0), 0);
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
  const rootPositionKey = makeTableKey(state);
  let fallbackScore: number | null = null;

  function getFallbackScore(): number {
    fallbackScore ??= evaluateState(state, state.currentPlayer, ruleConfig);
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
    rootPreviousOwnAction: getRootPreviousOwnAction(state),
    rootPreviousStrategicTags: getRootPreviousStrategicTags(state),
    rootStrategicIntent: strategicIntent,
    quiescenceDepthLimit: preset.maxDepth + MAX_QUIESCENCE_DEPTH,
    rootSelfUndoPositionKey: getRootSelfUndoPositionKey(state),
    ruleConfig,
    table: new Map<string, TranspositionEntry>(),
  };

  const buildRootOrdering = (pvMove: TurnAction | null): ReturnType<typeof orderMoves> =>
    orderMoves(state, state.currentPlayer, ruleConfig, preset, {
      actions: legalActions,
      deadline,
      grandparentPositionKey: context.rootSelfUndoPositionKey,
      historyScores: context.historyScores,
      includeAllQuietMoves: true,
      killerMoves: context.killerMovesByDepth.get(0) ?? [],
      now,
      policyPriors,
      previousStrategicTags: context.rootPreviousStrategicTags,
      previousActionKey: null,
      policyPriorWeight: preset.policyPriorWeight,
      pvMove,
      repetitionPenalty: preset.repetitionPenalty,
      samePlayerPreviousAction: context.rootPreviousOwnAction,
      selfUndoPenalty: preset.selfUndoPenalty,
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

  try {
    const rootOrderedMoves = buildRootOrdering(null);
    context.diagnostics.policyPriorHits += countPolicyPriorHits(rootOrderedMoves);

    for (const entry of rootOrderedMoves) {
      if (
        entry.nextState.status === 'gameOver' &&
        (entry.nextState.victory.type === 'homeField' ||
          entry.nextState.victory.type === 'sixStacks') &&
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
                policyPrior: entry.policyPrior,
                score: 1_000_000,
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

    return {
      action: legalActions[0],
      completedDepth: 0,
      completedRootMoves: 0,
      diagnostics: context.diagnostics,
      elapsedMs: now() - startedAt,
      evaluatedNodes: 0,
      fallbackKind: 'legalOrder',
      principalVariation: [legalActions[0]],
      rootCandidates: orderRootCandidates(
        [
          createRootFallbackCandidate(
            legalActions[0],
            getFallbackScore(),
            policyPriors?.[actionKey(legalActions[0])] ?? 0,
            strategicIntent,
          ),
        ],
        preset.rootCandidateLimit,
      ),
      score: getFallbackScore(),
      strategicIntent,
      timedOut: true,
    };
  }

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
        [rootPositionKey, makeTableKey(entry.nextState)],
        [entry.action],
        actionKey(entry.action),
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
        policyPrior: entry.policyPrior,
        score,
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
          fallbackKind = 'legalOrder';
          bestScore = getFallbackScore();
          completedRootMoves = 0;
          rootCandidates = [
            createRootFallbackCandidate(
              legalActions[0],
              bestScore,
              policyPriors?.[actionKey(legalActions[0])] ?? 0,
              strategicIntent,
            ),
          ];
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
