import { describe, expect, it } from 'vitest';

import { AI_DIFFICULTY_PRESETS } from '@/ai/presets';
import {
  orderMoves,
  orderPrecomputedMoves,
  precomputeOrderedActions,
} from '@/ai/moveOrdering';
import { AI_MODEL_ACTION_COUNT } from '@/ai/model/actionSpace';
import {
  getRootPreviousOwnAction,
  getRootPreviousStrategicTags,
  getRootSelfUndoPositionKey,
} from '@/ai/search/heuristics';
import { actionId, actionKey } from '@/ai/search/shared';
import { buildParticipationState } from '@/ai/participation';
import { applyAction, createInitialState, getLegalActions } from '@/domain';
import { withConfig } from '@/test/factories';

describe('move ordering precomputation', () => {
  it('matches direct ordering when root features are precomputed and rescored', () => {
    const config = withConfig({ drawRule: 'threefold' });
    const preset = AI_DIFFICULTY_PRESETS.hard;
    const stateAfterWhite = applyAction(
      createInitialState(config),
      { type: 'climbOne', source: 'A1', target: 'B2' },
      config,
    );
    const state = applyAction(
      stateAfterWhite,
      { type: 'climbOne', source: 'F6', target: 'E5' },
      config,
    );
    const legalActions = getLegalActions(state, config);
    const rootPreviousOwnAction = getRootPreviousOwnAction(state);
    const previousActionId = rootPreviousOwnAction ? actionId(rootPreviousOwnAction) : null;
    const policyPriors: Float32Array | null = legalActions.length
      ? (() => {
          const arr = new Float32Array(AI_MODEL_ACTION_COUNT);
          const id0 = actionId(legalActions[0]);
          if (id0 >= 0) arr[id0] = 0.7;
          const id1 = actionId(legalActions[1] ?? legalActions[0]);
          if (id1 >= 0) arr[id1] = 0.15;
          return arr;
        })()
      : null;
    const historyScores = new Int32Array(AI_MODEL_ACTION_COUNT);
    legalActions.slice(0, 3).forEach((action, index) => {
      const id = actionId(action);
      if (id >= 0) historyScores[id] = (index + 1) * 400;
    });
    const continuationScores =
      previousActionId !== null
        ? new Map<number, number>(
            legalActions
              .slice(0, 2)
              .map((action, index) => [
                previousActionId * AI_MODEL_ACTION_COUNT + actionId(action),
                (index + 1) * 250,
              ]),
          )
        : new Map<number, number>();
    const killerIds = legalActions.length > 2
      ? [actionId(legalActions[2])]
      : legalActions.slice(0, 1).map(actionId);
    const pvMoveId = legalActions[1] != null ? actionId(legalActions[1]) : null;
    const ttMoveId = legalActions[0] != null ? actionId(legalActions[0]) : null;
    const orderingOptions = {
      actions: legalActions,
      continuationScores,
      grandparentPositionKey: getRootSelfUndoPositionKey(state),
      historyScores,
      includeAllQuietMoves: true,
      killerIds,
      participationState: buildParticipationState(state, preset.participationWindow),
      policyPriors,
      policyPriorWeight: preset.policyPriorWeight,
      previousActionId,
      previousStrategicTags: getRootPreviousStrategicTags(state),
      pvMoveId,
      repetitionPenalty: preset.repetitionPenalty,
      samePlayerPreviousAction: rootPreviousOwnAction,
      selfUndoPenalty: preset.selfUndoPenalty,
      ttMoveId,
    } as const;

    const direct = orderMoves(
      state,
      state.currentPlayer,
      config,
      preset,
      orderingOptions,
    );
    const precomputed = precomputeOrderedActions(
      state,
      state.currentPlayer,
      config,
      preset,
      orderingOptions,
    );
    const rescored = orderPrecomputedMoves(precomputed, preset, orderingOptions);

    expect(
      rescored.map((entry) => ({
        action: actionKey(entry.action),
        actionId: entry.actionId,
        isForced: entry.isForced,
        isRepetition: entry.isRepetition,
        isSelfUndo: entry.isSelfUndo,
        isTactical: entry.isTactical,
        nextPositionKey: entry.nextPositionKey,
        participationDelta: entry.participationDelta,
        policyPrior: entry.policyPrior,
        score: entry.score,
        sourceFamily: entry.sourceFamily,
        tags: entry.tags,
      })),
    ).toEqual(
      direct.map((entry) => ({
        action: actionKey(entry.action),
        actionId: entry.actionId,
        isForced: entry.isForced,
        isRepetition: entry.isRepetition,
        isSelfUndo: entry.isSelfUndo,
        isTactical: entry.isTactical,
        nextPositionKey: entry.nextPositionKey,
        participationDelta: entry.participationDelta,
        policyPrior: entry.policyPrior,
        score: entry.score,
        sourceFamily: entry.sourceFamily,
        tags: entry.tags,
      })),
    );
  });
});
