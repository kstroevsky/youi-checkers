import { evaluateState } from '@/ai/evaluation';
import { orderMoves } from '@/ai/moveOrdering';
import { actionId } from '@/ai/search/shared';
import type { ParticipationState } from '@/ai/participation';
import type { EngineState, TurnAction } from '@/domain';

import {
  getSelectiveExtension,
  getMovePenalty,
  getPreviousOwnActionFromLine,
  getPreviousOwnPositionKeyFromLine,
  rememberCutoffMove,
  TRANSPOSITION_LIMIT,
} from '@/ai/search/heuristics';
import { makeTableKey, throwIfTimedOut } from '@/ai/search/shared';
import type { BoundFlag, SearchContext, SearchStack } from '@/ai/search/types';
import { quiescence } from '@/ai/search/quiescence';

/** Main negamax search with alpha-beta pruning and transposition lookups. */
export function negamax(
  state: EngineState,
  depth: number,
  alpha: number,
  beta: number,
  currentDepth: number,
  stack: SearchStack,
  previousActionId: number | null,
  participationState: ParticipationState,
  context: SearchContext,
): number {
  throwIfTimedOut(context.now, context.deadline);

  if (state.status === 'gameOver') {
    context.evaluatedNodes += 1;
    return evaluateState(state, state.currentPlayer, context.ruleConfig, {
      behaviorProfile: context.behaviorProfile,
      diagnostics: context.diagnostics,
      participationState,
      perfCache: context.perfCache,
      preset: context.preset,
      riskMode: context.riskMode,
    });
  }

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

  if (depth === 0) {
    return quiescence(
      state,
      alpha,
      beta,
      currentDepth,
      stack,
      previousActionId,
      participationState,
      context,
    );
  }

  const orderedMoves = orderMoves(
    state,
    state.currentPlayer,
    context.ruleConfig,
    context.preset,
    {
      behaviorProfile: context.behaviorProfile,
      deadline: context.deadline,
      grandparentPositionKey: getPreviousOwnPositionKeyFromLine(
        state.currentPlayer,
        stack,
        context,
      ),
      historyScores: context.historyScores,
      killerIds: context.killerMovesByDepth.get(currentDepth) ?? [],
      now: context.now,
      diagnostics: context.diagnostics,
      participationState,
      perfCache: context.perfCache,
      policyPriors: null,
      previousStrategicTags:
        currentDepth === 0 ? context.rootPreviousStrategicTags : null,
      previousActionId,
      pvMoveId: context.pvMoveByDepth.get(currentDepth) ?? null,
      repetitionPenalty: context.preset.repetitionPenalty,
      riskMode: context.riskMode,
      samePlayerPreviousAction: getPreviousOwnActionFromLine(
        state.currentPlayer,
        stack,
        context,
      ),
      selfUndoPenalty: context.preset.selfUndoPenalty,
      continuationScores: context.continuationScores,
      ttMoveId: cached?.bestAction ? actionId(cached.bestAction) : null,
    },
  );

  if (!orderedMoves.length) {
    context.evaluatedNodes += 1;
    return evaluateState(state, state.currentPlayer, context.ruleConfig, {
      behaviorProfile: context.behaviorProfile,
      diagnostics: context.diagnostics,
      participationState,
      perfCache: context.perfCache,
      preset: context.preset,
      riskMode: context.riskMode,
    });
  }

  let bestAction: TurnAction | null = cached?.bestAction ?? null;
  let bestScore = Number.NEGATIVE_INFINITY;
  let searchedFirstChild = false;

  for (const entry of orderedMoves) {
    const keepsTurn = entry.nextState.currentPlayer === state.currentPlayer;
    const extension = getSelectiveExtension(entry, depth, currentDepth);
    const nextDepth = Math.max(0, depth - 1 + extension);
    let score: number;

    // Write into the pre-allocated slot at the current depth; no array resize.
    stack.entries[stack.depth] = {
      action: entry.action,
      actor: state.currentPlayer,
      positionKey: entry.nextPositionKey,
    };
    stack.depth += 1;

    try {
      if (!searchedFirstChild) {
        score = keepsTurn
          ? negamax(
              entry.nextState,
              nextDepth,
              alpha,
              beta,
              currentDepth + 1,
              stack,
              entry.actionId,
              entry.nextParticipationState,
              context,
            )
          : -negamax(
              entry.nextState,
              nextDepth,
              -beta,
              -alpha,
              currentDepth + 1,
              stack,
              entry.actionId,
              entry.nextParticipationState,
              context,
            );
        searchedFirstChild = true;
      } else {
        score = keepsTurn
          ? negamax(
              entry.nextState,
              nextDepth,
              alpha,
              alpha + 1,
              currentDepth + 1,
              stack,
              entry.actionId,
              entry.nextParticipationState,
              context,
            )
          : -negamax(
              entry.nextState,
              nextDepth,
              -alpha - 1,
              -alpha,
              currentDepth + 1,
              stack,
              entry.actionId,
              entry.nextParticipationState,
              context,
            );

        if (score > alpha && score < beta) {
          context.diagnostics.pvsResearches += 1;
          score = keepsTurn
            ? negamax(
                entry.nextState,
                nextDepth,
                alpha,
                beta,
                currentDepth + 1,
                stack,
                entry.actionId,
                entry.nextParticipationState,
                context,
              )
            : -negamax(
                entry.nextState,
                nextDepth,
                -beta,
                -alpha,
                currentDepth + 1,
                stack,
                entry.actionId,
                entry.nextParticipationState,
                context,
              );
        }
      }
    } finally {
      stack.depth -= 1;
    }

    score -= getMovePenalty(entry, context);

    if (score > bestScore) {
      bestScore = score;
      bestAction = entry.action;
    }

    alpha = Math.max(alpha, score);

    if (alpha >= beta) {
      context.diagnostics.betaCutoffs += 1;
      rememberCutoffMove(entry, depth, currentDepth, previousActionId, context);
      break;
    }
  }

  const flag: BoundFlag =
    bestScore <= originalAlpha
      ? 'upper'
      : bestScore >= originalBeta
        ? 'lower'
        : 'exact';

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
    context.pvMoveByDepth.set(currentDepth, actionId(bestAction));
  }

  return bestScore;
}
