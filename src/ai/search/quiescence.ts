import { getLegalActions, type EngineState, type TurnAction } from '@/domain';
import { evaluateState } from '@/ai/evaluation';
import { orderMoves, type OrderedAction } from '@/ai/moveOrdering';
import { FRONT_HOME_ROW, HOME_ROWS } from '@/domain/model/constants';
import { parseCoord } from '@/domain/model/coordinates';

import { getGrandparentPositionKey, getMovePenalty } from '@/ai/search/heuristics';
import { actionKey, makeTableKey, throwIfTimedOut } from '@/ai/search/shared';
import type { SearchContext } from '@/ai/search/types';

/** Chooses forcing moves only for the quiescence tail below the main search frontier. */
export function getQuiescenceMoves(
  state: EngineState,
  currentDepth: number,
  ancestorPositionKeys: string[],
  ancestorActions: TurnAction[],
  previousActionKey: string | null,
  context: SearchContext,
): OrderedAction[] {
  const legalActions = getLegalActions(state, context.ruleConfig);

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
    deadline: context.deadline,
    grandparentPositionKey: getGrandparentPositionKey(
      currentDepth,
      ancestorPositionKeys,
      context,
    ),
    historyScores: context.historyScores,
    includeAllQuietMoves: true,
    killerMoves: context.killerMovesByDepth.get(currentDepth) ?? [],
    now: context.now,
    policyPriors: null,
    previousStrategicTags: null,
    previousActionKey,
    pvMove: context.pvMoveByDepth.get(currentDepth),
    repetitionPenalty: context.preset.repetitionPenalty,
    samePlayerPreviousAction:
      currentDepth === 0 ? context.rootPreviousOwnAction : ancestorActions.at(-2) ?? null,
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
      entry.action.type === 'manualUnfreeze',
  );
}

/** Extends unstable tactical leaf nodes until the position becomes quiet. */
export function quiescence(
  state: EngineState,
  alpha: number,
  beta: number,
  currentDepth: number,
  ancestorPositionKeys: string[],
  ancestorActions: TurnAction[],
  previousActionKey: string | null,
  context: SearchContext,
): number {
  throwIfTimedOut(context.now, context.deadline);
  context.diagnostics.quiescenceNodes += 1;
  context.evaluatedNodes += 1;

  const standPat = evaluateState(state, state.currentPlayer, context.ruleConfig);

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
    ancestorPositionKeys,
    ancestorActions,
    previousActionKey,
    context,
  );

  if (!forcingMoves.length) {
    return standPat;
  }

  let bestScore = standPat;

  for (const entry of forcingMoves) {
    const nextPositionKey = makeTableKey(entry.nextState);
    let score = -quiescence(
      entry.nextState,
      -beta,
      -alpha,
      currentDepth + 1,
      [...ancestorPositionKeys, nextPositionKey],
      [...ancestorActions, entry.action],
      actionKey(entry.action),
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
