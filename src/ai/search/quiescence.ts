import type { EngineState, TurnAction } from '@/domain';
import { evaluateState } from '@/ai/evaluation';
import { orderMoves, type OrderedAction } from '@/ai/moveOrdering';
import { getCachedLegalActions, getStatePerfBundle } from '@/ai/perf';
import type { ParticipationState } from '@/ai/participation';
import { FRONT_HOME_ROW, HOME_ROWS } from '@/domain/model/constants';
import { parseCoord } from '@/domain/model/coordinates';

import {
  getMovePenalty,
  getPreviousOwnActionFromLine,
  getPreviousOwnPositionKeyFromLine,
} from '@/ai/search/heuristics';
import { makeTableKey, throwIfTimedOut } from '@/ai/search/shared';
import type { SearchContext, SearchLineEntry } from '@/ai/search/types';

/** Chooses forcing moves only for the quiescence tail below the main search frontier. */
export function getQuiescenceMoves(
  state: EngineState,
  currentDepth: number,
  searchLine: SearchLineEntry[],
  previousActionKey: string | null,
  participationState: ParticipationState,
  context: SearchContext,
): OrderedAction[] {
  const perfBundle = getStatePerfBundle(state, context.ruleConfig, context.perfCache);
  const legalActions = getCachedLegalActions(state, context.ruleConfig, perfBundle.positionKey);

  if (!legalActions.length) {
    return [];
  }

  const candidateActions =
    legalActions.length === 1
      ? legalActions
      : legalActions.filter((action) => {
          if (action.type === 'jumpSequence' || action.type === 'manualUnfreeze') {
            return true;
          }

          const target = action.target;

          if (!target) {
            return false;
          }

          const { row } = parseCoord(target);

          return (
            HOME_ROWS[state.currentPlayer].has(row as never) ||
            row === FRONT_HOME_ROW[state.currentPlayer]
          );
        });

  if (!candidateActions.length) {
    return [];
  }

  const ordered = orderMoves(state, state.currentPlayer, context.ruleConfig, context.preset, {
    actions: candidateActions,
    behaviorProfile: context.behaviorProfile,
    deadline: context.deadline,
    grandparentPositionKey: getPreviousOwnPositionKeyFromLine(
      state.currentPlayer,
      searchLine,
      context,
    ),
    historyScores: context.historyScores,
    includeAllQuietMoves: true,
    killerMoves: context.killerMovesByDepth.get(currentDepth) ?? [],
    now: context.now,
    diagnostics: context.diagnostics,
    participationState,
    perfCache: context.perfCache,
    policyPriors: null,
    previousStrategicTags: null,
    previousActionKey,
    pvMove: context.pvMoveByDepth.get(currentDepth),
    repetitionPenalty: context.preset.repetitionPenalty,
    riskMode: context.riskMode,
    samePlayerPreviousAction: getPreviousOwnActionFromLine(
      state.currentPlayer,
      searchLine,
      context,
    ),
    selfUndoPenalty: context.preset.selfUndoPenalty,
    continuationScores: context.continuationScores,
    ttMove: context.table.get(makeTableKey(state))?.bestAction,
  });

  if (candidateActions.length === 1) {
    return ordered.slice(0, 1);
  }

  return ordered.filter(
    (entry) =>
      entry.isForced ||
      entry.winsImmediately ||
      entry.action.type === 'jumpSequence' ||
      (entry.action.type === 'manualUnfreeze' && entry.isTactical),
  );
}

/** Extends unstable tactical leaf nodes until the position becomes quiet. */
export function quiescence(
  state: EngineState,
  alpha: number,
  beta: number,
  currentDepth: number,
  searchLine: SearchLineEntry[],
  previousActionKey: string | null,
  participationState: ParticipationState,
  context: SearchContext,
): number {
  throwIfTimedOut(context.now, context.deadline);
  context.diagnostics.quiescenceNodes += 1;
  context.evaluatedNodes += 1;

  const standPat = evaluateState(
    state,
    state.currentPlayer,
    context.ruleConfig,
    {
      behaviorProfile: context.behaviorProfile,
      diagnostics: context.diagnostics,
      participationState,
      perfCache: context.perfCache,
      preset: context.preset,
      riskMode: context.riskMode,
    },
  );

  if (currentDepth >= context.quiescenceDepthLimit) {
    return standPat;
  }

  if (standPat >= beta) {
    return standPat;
  }

  alpha = Math.max(alpha, standPat);

  const forcingMoves = getQuiescenceMoves(
    state,
    currentDepth,
    searchLine,
    previousActionKey,
    participationState,
    context,
  );

  if (!forcingMoves.length) {
    return standPat;
  }

  let bestScore = standPat;

  for (const entry of forcingMoves) {
    const nextSearchLine = [
      ...searchLine,
      {
        action: entry.action,
        actor: state.currentPlayer,
        positionKey: entry.nextPositionKey,
      },
    ];
    const keepsTurn = entry.nextState.currentPlayer === state.currentPlayer;
    let score = keepsTurn
      ? quiescence(
          entry.nextState,
          alpha,
          beta,
          currentDepth + 1,
          nextSearchLine,
          entry.serializedAction,
          entry.nextParticipationState,
          context,
        )
      : -quiescence(
          entry.nextState,
          -beta,
          -alpha,
          currentDepth + 1,
          nextSearchLine,
          entry.serializedAction,
          entry.nextParticipationState,
          context,
        );

    score -= getMovePenalty(entry, context);

    if (score > bestScore) {
      bestScore = score;
    }

    alpha = Math.max(alpha, score);

    if (alpha >= beta) {
      context.diagnostics.betaCutoffs += 1;
      break;
    }
  }

  return bestScore;
}
