import { describe, expect, it } from 'vitest';

import { AI_MODEL_ACTION_COUNT } from '@/ai/model/actionSpace';
import { orderMoves, type OrderedAction } from '@/ai/moveOrdering';
import {
  createSearchPerfCache,
  getCachedLegalActions,
  getStatePerfBundle,
} from '@/ai/perf';
import {
  buildParticipationState,
  type ParticipationState,
} from '@/ai/participation';
import { AI_DIFFICULTY_PRESETS } from '@/ai/presets';
import {
  getPreviousOwnActionFromLine,
  getPreviousOwnPositionKeyFromLine,
} from '@/ai/search/heuristics';
import { getQuiescenceMoves } from '@/ai/search/quiescence';
import { createSearchDiagnostics } from '@/ai/search/result';
import { actionId, makeTableKey } from '@/ai/search/shared';
import type { SearchContext, SearchStack } from '@/ai/search/types';
import { createInitialState, type EngineState } from '@/domain';
import { FRONT_HOME_ROW, HOME_ROWS } from '@/domain/model/constants';
import { parseCoord } from '@/domain/model/coordinates';
import { withConfig } from '@/test/factories';

import { createRandomPlayPerfState } from '../../../scripts/lateGamePerfFixtures';

function createContext(state: EngineState): SearchContext {
  const preset = AI_DIFFICULTY_PRESETS.hard;

  return {
    behaviorProfile: null,
    continuationScores: new Map(),
    deadline: Number.POSITIVE_INFINITY,
    diagnostics: createSearchDiagnostics(),
    evaluatedNodes: 0,
    historyScores: new Int32Array(AI_MODEL_ACTION_COUNT),
    killerMovesByDepth: new Map(),
    now: () => 0,
    perfCache: createSearchPerfCache(),
    policyPriors: null,
    preset,
    pvMoveByDepth: new Map(),
    quiescenceDepthLimit: 8,
    riskMode: 'normal',
    rootParticipationState: buildParticipationState(
      state,
      preset.participationWindow,
    ),
    rootPlayer: state.currentPlayer,
    rootPreviousOwnAction: null,
    rootPreviousStrategicTags: null,
    rootSelfUndoPositionKey: null,
    rootStrategicIntent: 'hybrid',
    ruleConfig: withConfig(),
    table: new Map(),
  };
}

/** Frozen oracle for the pre-staging implementation. */
function getLegacyQuiescenceMoves(
  state: EngineState,
  currentDepth: number,
  stack: SearchStack,
  previousActionId: number | null,
  participationState: ParticipationState,
  context: SearchContext,
): OrderedAction[] {
  const perfBundle = getStatePerfBundle(
    state,
    context.ruleConfig,
    context.perfCache,
  );
  const legalActions = getCachedLegalActions(
    state,
    context.ruleConfig,
    perfBundle.positionKey,
  );

  if (!legalActions.length) {
    return [];
  }

  const candidateActions =
    legalActions.length === 1
      ? legalActions
      : legalActions.filter((action) => {
          if (
            action.type === 'jumpSequence' ||
            action.type === 'manualUnfreeze'
          ) {
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

  const ttBestAction =
    context.table.get(makeTableKey(state))?.bestAction ?? null;
  const ordered = orderMoves(
    state,
    state.currentPlayer,
    context.ruleConfig,
    context.preset,
    {
      actions: candidateActions,
      behaviorProfile: context.behaviorProfile,
      deadline: context.deadline,
      grandparentPositionKey: getPreviousOwnPositionKeyFromLine(
        state.currentPlayer,
        stack,
        context,
      ),
      historyScores: context.historyScores,
      includeAllQuietMoves: true,
      killerIds: context.killerMovesByDepth.get(currentDepth) ?? [],
      now: context.now,
      diagnostics: context.diagnostics,
      participationState,
      perfCache: context.perfCache,
      policyPriors: null,
      previousStrategicTags: null,
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
      ttMoveId: ttBestAction ? actionId(ttBestAction) : null,
    },
  );

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

describe('quiescence move staging', () => {
  const config = withConfig();
  const fixtures = [
    ['opening', createInitialState(config)],
    ['benchmark midgame 20', createRandomPlayPerfState(20, config, 0x1a2b3c)],
    ['benchmark midgame 40', createRandomPlayPerfState(40, config, 0x4d5e6f)],
    ['single filtered candidate', createRandomPlayPerfState(20, config, 21)],
  ] as const;

  it.each(fixtures)(
    'preserves legacy ordered moves for %s',
    (_label, state) => {
      const legacyContext = createContext(state);
      const stagedContext = createContext(state);
      const stack: SearchStack = { entries: [], depth: 0 };
      const participationState = buildParticipationState(
        state,
        AI_DIFFICULTY_PRESETS.hard.participationWindow,
      );

      expect(
        getQuiescenceMoves(
          state,
          0,
          stack,
          null,
          participationState,
          stagedContext,
        ),
      ).toEqual(
        getLegacyQuiescenceMoves(
          state,
          0,
          stack,
          null,
          participationState,
          legacyContext,
        ),
      );
    },
  );

  it('preserves the old single-filtered-candidate exception', () => {
    const state = createRandomPlayPerfState(20, config, 21);
    const context = createContext(state);
    const participationState = buildParticipationState(
      state,
      context.preset.participationWindow,
    );

    const moves = getQuiescenceMoves(
      state,
      0,
      { entries: [], depth: 0 },
      null,
      participationState,
      context,
    );

    expect(moves).toHaveLength(1);
    expect(moves[0]?.action).toEqual({
      path: ['A6'],
      source: 'C6',
      type: 'jumpSequence',
    });
  });
});
