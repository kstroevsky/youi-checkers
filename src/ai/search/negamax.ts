import { evaluateState } from '@/ai/evaluation';
import { orderMoves } from '@/ai/moveOrdering';
import type { EngineState, TurnAction } from '@/domain';

import {
  getGrandparentPositionKey,
  getMovePenalty,
  rememberCutoffMove,
  TRANSPOSITION_LIMIT,
} from '@/ai/search/heuristics';
import { actionKey, makeTableKey, throwIfTimedOut } from '@/ai/search/shared';
import type { BoundFlag, SearchContext } from '@/ai/search/types';
import { quiescence } from '@/ai/search/quiescence';

/** Main negamax search with alpha-beta pruning and transposition lookups. */
export function negamax(
  state: EngineState,
  depth: number,
  alpha: number,
  beta: number,
  currentDepth: number,
  ancestorPositionKeys: string[],
  ancestorActions: TurnAction[],
  previousActionKey: string | null,
  context: SearchContext,
): number {
  throwIfTimedOut(context.now, context.deadline);

  const originalAlpha = alpha;
  const originalBeta = beta;
  const tableKey = makeTableKey(state);
  const cached = context.table.get(tableKey);

  if (cached && cached.depth >= depth) {
    context.diagnostics.transpositionHits += 1;

    if (cached.flag === 'exact') {
      return cached.score;
    }

    if (cached.flag === 'lower') {
      alpha = Math.max(alpha, cached.score);
    } else {
      beta = Math.min(beta, cached.score);
    }

    if (alpha >= beta) {
      return cached.score;
    }
  }

  if (state.status === 'gameOver') {
    context.evaluatedNodes += 1;
    return evaluateState(state, state.currentPlayer, context.ruleConfig);
  }

  if (depth === 0) {
    return quiescence(
      state,
      alpha,
      beta,
      currentDepth,
      ancestorPositionKeys,
      ancestorActions,
      previousActionKey,
      context,
    );
  }

  const orderedMoves = orderMoves(state, state.currentPlayer, context.ruleConfig, context.preset, {
    deadline: context.deadline,
    grandparentPositionKey: getGrandparentPositionKey(
      currentDepth,
      ancestorPositionKeys,
      context,
    ),
    historyScores: context.historyScores,
    killerMoves: context.killerMovesByDepth.get(currentDepth) ?? [],
    now: context.now,
    policyPriors: null,
    previousStrategicTags: currentDepth === 0 ? context.rootPreviousStrategicTags : null,
    previousActionKey,
    pvMove: context.pvMoveByDepth.get(currentDepth),
    repetitionPenalty: context.preset.repetitionPenalty,
    samePlayerPreviousAction:
      currentDepth === 0 ? context.rootPreviousOwnAction : ancestorActions.at(-2) ?? null,
    selfUndoPenalty: context.preset.selfUndoPenalty,
    continuationScores: context.continuationScores,
    ttMove: cached?.bestAction,
  });

  if (!orderedMoves.length) {
    context.evaluatedNodes += 1;
    return evaluateState(state, state.currentPlayer, context.ruleConfig);
  }

  let bestAction: TurnAction | null = cached?.bestAction ?? null;
  let bestScore = Number.NEGATIVE_INFINITY;
  let searchedFirstChild = false;

  for (const entry of orderedMoves) {
    const nextPositionKey = makeTableKey(entry.nextState);
    const nextAncestorPositionKeys = [...ancestorPositionKeys, nextPositionKey];
    const nextAncestorActions = [...ancestorActions, entry.action];
    let score: number;

    if (!searchedFirstChild) {
      score = -negamax(
        entry.nextState,
        depth - 1,
        -beta,
        -alpha,
        currentDepth + 1,
        nextAncestorPositionKeys,
        nextAncestorActions,
        actionKey(entry.action),
        context,
      );
      searchedFirstChild = true;
    } else {
      score = -negamax(
        entry.nextState,
        depth - 1,
        -alpha - 1,
        -alpha,
        currentDepth + 1,
        nextAncestorPositionKeys,
        nextAncestorActions,
        actionKey(entry.action),
        context,
      );

      if (score > alpha && score < beta) {
        context.diagnostics.pvsResearches += 1;
        score = -negamax(
          entry.nextState,
          depth - 1,
          -beta,
          -alpha,
          currentDepth + 1,
          nextAncestorPositionKeys,
          nextAncestorActions,
          actionKey(entry.action),
          context,
        );
      }
    }

    score -= getMovePenalty(entry, context);

    if (score > bestScore) {
      bestScore = score;
      bestAction = entry.action;
    }

    alpha = Math.max(alpha, score);

    if (alpha >= beta) {
      context.diagnostics.betaCutoffs += 1;
      rememberCutoffMove(entry, depth, currentDepth, previousActionKey, context);
      break;
    }
  }

  const flag: BoundFlag =
    bestScore <= originalAlpha ? 'upper' : bestScore >= originalBeta ? 'lower' : 'exact';

  if (context.table.size >= TRANSPOSITION_LIMIT) {
    const oldestKey = context.table.keys().next().value;

    if (oldestKey) {
      context.table.delete(oldestKey);
    }
  }

  context.table.set(tableKey, {
    bestAction,
    depth,
    flag,
    score: bestScore,
  });

  if (bestAction) {
    context.pvMoveByDepth.set(currentDepth, bestAction);
  }

  return bestScore;
}
