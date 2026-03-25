import { describe, expect, it } from 'vitest';

import { AI_DIFFICULTY_PRESETS } from '@/ai/presets';
import {
  orderMoves,
  orderPrecomputedMoves,
  precomputeOrderedActions,
} from '@/ai/moveOrdering';
import {
  getRootPreviousOwnAction,
  getRootPreviousStrategicTags,
  getRootSelfUndoPositionKey,
} from '@/ai/search/heuristics';
import { actionKey } from '@/ai/search/shared';
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
    const previousActionKey = rootPreviousOwnAction ? actionKey(rootPreviousOwnAction) : null;
    const policyPriors = legalActions.length
      ? {
          [actionKey(legalActions[0])]: 0.7,
          [actionKey(legalActions[1] ?? legalActions[0])]: 0.15,
        }
      : null;
    const historyScores = new Map(
      legalActions.slice(0, 3).map((action, index) => [actionKey(action), (index + 1) * 400]),
    );
    const continuationScores = previousActionKey
      ? new Map(
          legalActions
            .slice(0, 2)
            .map((action, index) => [`${previousActionKey}->${actionKey(action)}`, (index + 1) * 250]),
        )
      : new Map<string, number>();
    const killerMoves = legalActions.length > 2 ? [legalActions[2]] : legalActions.slice(0, 1);
    const pvMove = legalActions[1] ?? null;
    const ttMove = legalActions[0] ?? null;
    const orderingOptions = {
      actions: legalActions,
      continuationScores,
      grandparentPositionKey: getRootSelfUndoPositionKey(state),
      historyScores,
      includeAllQuietMoves: true,
      killerMoves,
      participationState: buildParticipationState(state, preset.participationWindow),
      policyPriors,
      policyPriorWeight: preset.policyPriorWeight,
      previousActionKey,
      previousStrategicTags: getRootPreviousStrategicTags(state),
      pvMove,
      repetitionPenalty: preset.repetitionPenalty,
      samePlayerPreviousAction: rootPreviousOwnAction,
      selfUndoPenalty: preset.selfUndoPenalty,
      ttMove,
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
        isForced: entry.isForced,
        isRepetition: entry.isRepetition,
        isSelfUndo: entry.isSelfUndo,
        isTactical: entry.isTactical,
        nextPositionKey: entry.nextPositionKey,
        participationDelta: entry.participationDelta,
        policyPrior: entry.policyPrior,
        score: entry.score,
        serializedAction: entry.serializedAction,
        sourceFamily: entry.sourceFamily,
        tags: entry.tags,
      })),
    ).toEqual(
      direct.map((entry) => ({
        action: actionKey(entry.action),
        isForced: entry.isForced,
        isRepetition: entry.isRepetition,
        isSelfUndo: entry.isSelfUndo,
        isTactical: entry.isTactical,
        nextPositionKey: entry.nextPositionKey,
        participationDelta: entry.participationDelta,
        policyPrior: entry.policyPrior,
        score: entry.score,
        serializedAction: entry.serializedAction,
        sourceFamily: entry.sourceFamily,
        tags: entry.tags,
      })),
    );
  });
});
