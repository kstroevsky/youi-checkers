import { describe, expect, it } from 'vitest';

import { createSearchPerfCache } from '@/ai/perf';
import { AI_DIFFICULTY_PRESETS } from '@/ai/presets';
import {
  getPreviousOwnActionFromLine,
  getPreviousOwnPositionKeyFromLine,
} from '@/ai/search/heuristics';
import type { SearchContext, SearchLineEntry } from '@/ai/search/types';
import type { ParticipationState } from '@/ai/participation';
import type { TurnAction } from '@/domain';
import { withConfig } from '@/test/factories';

function createSearchContext(): SearchContext {
  return {
    behaviorProfile: null,
    continuationScores: new Map<string, number>(),
    deadline: 0,
    diagnostics: {
      adverseDrawTrapPenalties: 0,
      aspirationResearches: 0,
      betaCutoffs: 0,
      drawAversionApplications: 0,
      lateRiskTriggers: 0,
      orderedFallbacks: 0,
      participationPenalties: 0,
      policyPriorHits: 0,
      pvsResearches: 0,
      quiescenceNodes: 0,
      repetitionPenalties: 0,
      selfUndoPenalties: 0,
      sourceFamilyCollisions: 0,
      stagnationRiskTriggers: 0,
      transpositionHits: 0,
    },
    evaluatedNodes: 0,
    historyScores: new Map<string, number>(),
    killerMovesByDepth: new Map<number, TurnAction[]>(),
    now: () => 0,
    perfCache: createSearchPerfCache(),
    policyPriors: null,
    preset: AI_DIFFICULTY_PRESETS.hard,
    pvMoveByDepth: new Map<number, TurnAction>(),
    riskMode: 'normal',
    rootParticipationState: {} as ParticipationState,
    rootPlayer: 'white',
    rootPreviousOwnAction: {
      type: 'climbOne',
      source: 'A1',
      target: 'B2',
    },
    rootPreviousStrategicTags: null,
    rootSelfUndoPositionKey: 'root-white',
    rootStrategicIntent: 'hybrid',
    quiescenceDepthLimit: 8,
    ruleConfig: withConfig(),
    table: new Map(),
  };
}

describe('search line ancestry helpers', () => {
  it('falls back to root same-side history only for the root actor', () => {
    const context = createSearchContext();

    expect(getPreviousOwnActionFromLine('white', [], context)).toEqual({
      type: 'climbOne',
      source: 'A1',
      target: 'B2',
    });
    expect(getPreviousOwnPositionKeyFromLine('white', [], context)).toBe('root-white');
    expect(getPreviousOwnActionFromLine('black', [], context)).toBeNull();
    expect(getPreviousOwnPositionKeyFromLine('black', [], context)).toBeNull();
  });

  it('matches alternating same-side ancestry without using ply parity', () => {
    const context = createSearchContext();
    const whiteAction: TurnAction = { type: 'climbOne', source: 'B2', target: 'C3' };
    const blackAction: TurnAction = { type: 'moveSingleToEmpty', source: 'E4', target: 'E3' };
    const searchLine: SearchLineEntry[] = [
      { action: whiteAction, actor: 'white', positionKey: 'after-white' },
      { action: blackAction, actor: 'black', positionKey: 'after-black' },
    ];

    expect(getPreviousOwnActionFromLine('white', searchLine, context)).toEqual(whiteAction);
    expect(getPreviousOwnPositionKeyFromLine('white', searchLine, context)).toBe('after-white');
    expect(getPreviousOwnActionFromLine('black', searchLine, context)).toEqual(blackAction);
    expect(getPreviousOwnPositionKeyFromLine('black', searchLine, context)).toBe('after-black');
  });

  it('tracks the latest same-actor move through continuation lines and later reply nodes', () => {
    const context = createSearchContext();
    const whiteAction: TurnAction = { type: 'climbOne', source: 'B2', target: 'C3' };
    const blackJump: TurnAction = { type: 'jumpSequence', source: 'A1', path: ['A3'] };
    const blackFollowUp: TurnAction = { type: 'jumpSequence', source: 'A3', path: ['C5'] };
    const searchLine: SearchLineEntry[] = [
      { action: whiteAction, actor: 'white', positionKey: 'after-white' },
      { action: blackJump, actor: 'black', positionKey: 'after-black-jump' },
      { action: blackFollowUp, actor: 'black', positionKey: 'after-black-follow-up' },
    ];

    expect(getPreviousOwnActionFromLine('black', searchLine, context)).toEqual(blackFollowUp);
    expect(getPreviousOwnPositionKeyFromLine('black', searchLine, context)).toBe(
      'after-black-follow-up',
    );
    expect(getPreviousOwnActionFromLine('white', searchLine, context)).toEqual(whiteAction);
    expect(getPreviousOwnPositionKeyFromLine('white', searchLine, context)).toBe('after-white');
  });
});
