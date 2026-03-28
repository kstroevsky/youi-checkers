import { describe, expect, it } from 'vitest';

import { AI_DIFFICULTY_PRESETS, chooseComputerAction, orderMoves } from '@/ai';
import { createAiBehaviorProfile, getBehaviorGeometryBias } from '@/ai/behavior';
import { selectCandidateAction } from '@/ai/search/result';
import type { RootRankedAction } from '@/ai/search/types';
import { applyAction, createInitialState, getLegalActions, hashPosition } from '@/domain';
import type { GameState, TurnAction } from '@/domain/model/types';
import { boardWithPieces, checker, gameStateWithBoard, resetFactoryIds, withConfig } from '@/test/factories';

import {
  actionKey,
  createHomeFieldWinState,
  createOpponentThreatState,
  createSixStackWinState,
  createTickingClock,
} from '@/ai/test/searchTestUtils';

describe('computer opponent search', () => {
  it('exposes the shipped difficulty presets', () => {
    expect(AI_DIFFICULTY_PRESETS).toEqual({
      easy: {
        drawAversionAhead: 220,
        drawAversionBehindRelief: 70,
        familyVarietyWeight: 30,
        frontierWidthWeight: 20,
        timeBudgetMs: 120,
        maxDepth: 2,
        participationBias: 14,
        participationWindow: 2,
        policyPriorWeight: 80,
        quietMoveLimit: 8,
        repetitionPenalty: 120,
        riskBandWidening: 0.08,
        riskLoopPenalty: 260,
        riskPolicyPriorScale: 0.45,
        riskProgressBonus: 420,
        riskTacticalBonus: 280,
        selfUndoPenalty: 220,
        rootCandidateLimit: 4,
        sourceReusePenalty: 70,
        stagnationDisplacementWeight: 16,
        stagnationMobilityWeight: 14,
        stagnationProgressWeight: 26,
        stagnationRepetitionWeight: 20,
        stagnationSelfUndoWeight: 24,
        stagnationThreshold: 0.42,
        varietyTemperature: 0.35,
        varietyThreshold: 0.08,
        varietyTopCount: 3,
      },
      medium: {
        drawAversionAhead: 180,
        drawAversionBehindRelief: 60,
        familyVarietyWeight: 42,
        frontierWidthWeight: 28,
        timeBudgetMs: 400,
        maxDepth: 4,
        participationBias: 18,
        participationWindow: 3,
        policyPriorWeight: 140,
        quietMoveLimit: 16,
        repetitionPenalty: 180,
        riskBandWidening: 0.06,
        riskLoopPenalty: 220,
        riskPolicyPriorScale: 0.6,
        riskProgressBonus: 360,
        riskTacticalBonus: 240,
        selfUndoPenalty: 320,
        rootCandidateLimit: 5,
        sourceReusePenalty: 100,
        stagnationDisplacementWeight: 15,
        stagnationMobilityWeight: 14,
        stagnationProgressWeight: 24,
        stagnationRepetitionWeight: 20,
        stagnationSelfUndoWeight: 20,
        stagnationThreshold: 0.46,
        varietyTemperature: 0.22,
        varietyThreshold: 0.03,
        varietyTopCount: 2,
      },
      hard: {
        drawAversionAhead: 140,
        drawAversionBehindRelief: 50,
        familyVarietyWeight: 56,
        frontierWidthWeight: 36,
        timeBudgetMs: 1200,
        maxDepth: 6,
        participationBias: 24,
        participationWindow: 3,
        policyPriorWeight: 220,
        quietMoveLimit: 28,
        repetitionPenalty: 300,
        riskBandWidening: 0.04,
        riskLoopPenalty: 240,
        riskPolicyPriorScale: 0.72,
        riskProgressBonus: 280,
        riskTacticalBonus: 200,
        selfUndoPenalty: 460,
        rootCandidateLimit: 6,
        sourceReusePenalty: 140,
        stagnationDisplacementWeight: 14,
        stagnationMobilityWeight: 14,
        stagnationProgressWeight: 22,
        stagnationRepetitionWeight: 18,
        stagnationSelfUndoWeight: 18,
        stagnationThreshold: 0.5,
        varietyTemperature: 0.15,
        varietyThreshold: 0.015,
        varietyTopCount: 3,
      },
    });
  });

  it('surfaces the hidden behavior profile and late risk mode in search results', () => {
    const behaviorProfile = createAiBehaviorProfile('seed-a');
    const result = chooseComputerAction({
      behaviorProfile,
      difficulty: 'easy',
      now: createTickingClock(10),
      random: () => 0,
      ruleConfig: withConfig(),
      state: {
        ...createInitialState(),
        moveNumber: 70,
      },
    });

    expect(result.behaviorProfileId).toBe(behaviorProfile.id);
    expect(result.riskMode).toBe('late');
  });

  it('always returns a legal move on sampled runtime states', () => {
    resetFactoryIds();
    const states = [
      createHomeFieldWinState(),
      createSixStackWinState(),
      createOpponentThreatState(),
    ];

    for (const state of states) {
      const result = chooseComputerAction({
        difficulty: 'easy',
        now: createTickingClock(),
        random: () => 0,
        ruleConfig: withConfig(),
        state,
      });
      const legalActions = getLegalActions(state, withConfig());

      expect(result.action).not.toBeNull();
      expect(legalActions.map(actionKey)).toContain(actionKey(result.action));
    }
  });

  it('finds immediate home-field and six-stack wins', () => {
    resetFactoryIds();
    const homeFieldResult = chooseComputerAction({
      difficulty: 'easy',
      now: createTickingClock(0.001),
      random: () => 0,
      ruleConfig: withConfig(),
      state: createHomeFieldWinState(),
    });
    const sixStackResult = chooseComputerAction({
      difficulty: 'easy',
      now: createTickingClock(0.001),
      random: () => 0,
      ruleConfig: withConfig(),
      state: createSixStackWinState(),
    });

    expect(homeFieldResult.action).toEqual({
      type: 'moveSingleToEmpty',
      source: 'C3',
      target: 'C4',
    });
    expect(homeFieldResult.completedRootMoves).toBe(1);
    expect(homeFieldResult.fallbackKind).toBe('none');
    expect(homeFieldResult.timedOut).toBe(false);
    expect(sixStackResult.action).toEqual({
      type: 'climbOne',
      source: 'A5',
      target: 'A6',
    });
    expect(sixStackResult.completedRootMoves).toBe(1);
    expect(sixStackResult.fallbackKind).toBe('none');
    expect(sixStackResult.timedOut).toBe(false);
    expect(homeFieldResult.principalVariation).toHaveLength(1);
    expect(homeFieldResult.rootCandidates).toHaveLength(1);
    expect(homeFieldResult.strategicIntent).toBe('home');
    expect(sixStackResult.strategicIntent).toBe('sixStack');
    expect(homeFieldResult.rootCandidates[0]).toMatchObject({
      forced: true,
      movedMass: 1,
      participationDelta: expect.any(Number),
      policyPrior: 0,
      sourceFamily: expect.any(String),
      tags: expect.any(Array),
    });
    expect(homeFieldResult.diagnostics.aspirationResearches).toBeGreaterThanOrEqual(0);
    expect(homeFieldResult.diagnostics.betaCutoffs).toBeGreaterThanOrEqual(0);
  });

  it('recognizes immediate threefold tiebreak wins as forced wins', () => {
    resetFactoryIds();
    const drawRuleConfig = withConfig({ drawRule: 'threefold' });
    const noDrawConfig = withConfig({ drawRule: 'none' });
    const winningAction: TurnAction = {
      type: 'moveSingleToEmpty',
      source: 'B1',
      target: 'B2',
    };
    const baseState = gameStateWithBoard(
      boardWithPieces({
        B1: [checker('black')],
        F3: [checker('white')],
      }),
      { currentPlayer: 'black' },
    );
    const repeatedState = applyAction(baseState, winningAction, noDrawConfig);
    const repeatedHash = hashPosition(repeatedState);
    const state: GameState = {
      ...baseState,
      positionCounts: {
        ...baseState.positionCounts,
        [repeatedHash]: 2,
      },
    };
    const ordered = orderMoves(
      state,
      state.currentPlayer,
      drawRuleConfig,
      AI_DIFFICULTY_PRESETS.hard,
      { includeAllQuietMoves: true },
    );
    const winningEntry = ordered.find(
      (entry) => actionKey(entry.action) === actionKey(winningAction),
    );
    const result = chooseComputerAction({
      difficulty: 'easy',
      now: createTickingClock(0.001),
      random: () => 0,
      ruleConfig: drawRuleConfig,
      state,
    });

    expect(winningEntry).toBeDefined();
    expect(winningEntry?.isForced).toBe(true);
    expect(winningEntry?.isTactical).toBe(true);
    expect(winningEntry?.nextState.victory).toMatchObject({
      type: 'threefoldTiebreakWin',
      winner: 'black',
      decidedBy: 'checkers',
    });
    expect(result.action).toEqual(winningAction);
    expect(result.completedRootMoves).toBe(1);
  });

  it('blocks the opponent from winning on the next move', () => {
    resetFactoryIds();
    const state = createOpponentThreatState();
    const result = chooseComputerAction({
      difficulty: 'easy',
      now: createTickingClock(),
      random: () => 0,
      ruleConfig: withConfig(),
      state,
    });

    expect(result.action).not.toBeNull();

    const nextState = applyAction(state, result.action as TurnAction, withConfig());
    const opponentWinsImmediately = getLegalActions(nextState, withConfig()).some((action) => {
      const replyState = applyAction(nextState, action, withConfig());

      return (
        replyState.status === 'gameOver' &&
        replyState.victory.type === 'sixStacks' &&
        replyState.victory.winner === 'black'
      );
    });

    expect(opponentWinsImmediately).toBe(false);
  });

  it('marks and de-prioritizes self-undo moves that return to the grandparent position', () => {
    const config = withConfig();
    const state = createInitialState(config);
    const orderedBase = orderMoves(state, state.currentPlayer, config, AI_DIFFICULTY_PRESETS.hard, {
      includeAllQuietMoves: true,
    });
    const quietCandidate = orderedBase.find(
      (entry) =>
        !entry.isTactical &&
        entry.action.type !== 'jumpSequence' &&
        entry.action.type !== 'manualUnfreeze',
    );

    expect(quietCandidate).toBeDefined();
    if (!quietCandidate) {
      return;
    }

    const ordered = orderMoves(state, state.currentPlayer, config, AI_DIFFICULTY_PRESETS.hard, {
      grandparentPositionKey: hashPosition(quietCandidate.nextState),
      includeAllQuietMoves: true,
      selfUndoPenalty: 10_000,
    });
    const baseEntry = orderedBase.find(
      (entry) => actionKey(entry.action) === actionKey(quietCandidate.action),
    );
    const undoEntry = ordered.find(
      (entry) => actionKey(entry.action) === actionKey(quietCandidate.action),
    );

    expect(baseEntry).toBeDefined();
    expect(undoEntry).toBeDefined();
    if (!baseEntry || !undoEntry) {
      return;
    }

    expect(undoEntry.isSelfUndo).toBe(true);
    expect(undoEntry.score).toBeLessThan(baseEntry.score);
  });

  it('penalizes repeated quiet moves based on positionCounts', () => {
    const config = withConfig();
    const state = createInitialState(config);
    const orderedBase = orderMoves(state, state.currentPlayer, config, AI_DIFFICULTY_PRESETS.hard, {
      includeAllQuietMoves: true,
      repetitionPenalty: 0,
    });
    const quietCandidate = orderedBase.find(
      (entry) =>
        !entry.isTactical &&
        entry.action.type !== 'jumpSequence' &&
        entry.action.type !== 'manualUnfreeze',
    );

    expect(quietCandidate).toBeDefined();
    if (!quietCandidate) {
      return;
    }

    const repeatedKey = hashPosition(quietCandidate.nextState);
    const loopState: GameState = {
      ...state,
      positionCounts: {
        ...state.positionCounts,
        [repeatedKey]: 2,
      },
    };
    const orderedRepeated = orderMoves(
      loopState,
      loopState.currentPlayer,
      config,
      AI_DIFFICULTY_PRESETS.hard,
      {
        includeAllQuietMoves: true,
        repetitionPenalty: 6_000,
      },
    );
    const baseEntry = orderedBase.find(
      (entry) => actionKey(entry.action) === actionKey(quietCandidate.action),
    );
    const repeatedEntry = orderedRepeated.find(
      (entry) => actionKey(entry.action) === actionKey(quietCandidate.action),
    );

    expect(baseEntry).toBeDefined();
    expect(repeatedEntry).toBeDefined();
    if (!baseEntry || !repeatedEntry) {
      return;
    }

    expect(repeatedEntry.isRepetition).toBe(true);
    expect(repeatedEntry.score).toBeLessThan(baseEntry.score);
  });

  it('keeps best root move parity-stable across odd/even depths on tactical wins', () => {
    const state = createHomeFieldWinState();
    const originalHardPreset = { ...AI_DIFFICULTY_PRESETS.hard };
    let depthThree;
    let depthFour;

    AI_DIFFICULTY_PRESETS.hard.timeBudgetMs = 1_200;

    try {
      AI_DIFFICULTY_PRESETS.hard.maxDepth = 3;
      depthThree = chooseComputerAction({
        difficulty: 'hard',
        now: () => 0,
        random: () => 0,
        ruleConfig: withConfig(),
        state,
      });
      AI_DIFFICULTY_PRESETS.hard.maxDepth = 4;
      depthFour = chooseComputerAction({
        difficulty: 'hard',
        now: () => 0,
        random: () => 0,
        ruleConfig: withConfig(),
        state,
      });
    } finally {
      Object.assign(AI_DIFFICULTY_PRESETS.hard, originalHardPreset);
    }

    expect(actionKey(depthThree.action)).toBe(actionKey(depthFour.action));
    expect(depthThree.fallbackKind).toBe('none');
    expect(depthFour.fallbackKind).toBe('none');
  });

  it('surfaces multiple quiet root candidates when hard-mode variety is widened', () => {
    const config = withConfig();
    const state = createInitialState(config);
    const originalHardPreset = { ...AI_DIFFICULTY_PRESETS.hard };
    let result;

    Object.assign(AI_DIFFICULTY_PRESETS.hard, {
      maxDepth: 1,
      timeBudgetMs: 2_000,
      varietyTemperature: 0.6,
      varietyThreshold: 1,
      varietyTopCount: 3,
    });

    try {
      result = chooseComputerAction({
        difficulty: 'hard',
        now: createTickingClock(0.01),
        random: () => 0,
        ruleConfig: config,
        state,
      });
    } finally {
      Object.assign(AI_DIFFICULTY_PRESETS.hard, originalHardPreset);
    }

    expect(result.rootCandidates.length).toBeGreaterThan(1);
    expect(result.rootCandidates.some((candidate) => !candidate.isTactical)).toBe(true);
    expect(result.rootCandidates.every((candidate) => Array.isArray(candidate.tags))).toBe(true);
  }, 30_000);

  it('samples different strategic tags across near-equal synthetic root candidates', () => {
    const originalHardPreset = { ...AI_DIFFICULTY_PRESETS.hard };

    Object.assign(AI_DIFFICULTY_PRESETS.hard, {
      varietyTemperature: 0.4,
      varietyThreshold: 0.2,
      varietyTopCount: 3,
    });

    try {
      const ranked: RootRankedAction[] = [
        {
          action: { type: 'climbOne', source: 'A1', target: 'B2' } as const,
          emptyCellsDelta: 1,
          freezeSwingBonus: 0,
          homeFieldDelta: 0.05,
          intent: 'home' as const,
          intentDelta: 80,
          isForced: false,
          isRepetition: false,
          isSelfUndo: false,
          isTactical: false,
          mobilityDelta: 1,
          movedMass: 1,
          participationDelta: 40,
          policyPrior: 0.2,
          repeatedPositionCount: 1,
          score: 500,
          sixStackDelta: 0,
          sourceFamily: 'white-001',
          tags: ['advanceMass'],
        },
        {
          action: { type: 'climbOne', source: 'B1', target: 'C2' } as const,
          emptyCellsDelta: 2,
          freezeSwingBonus: 0,
          homeFieldDelta: 0,
          intent: 'hybrid' as const,
          intentDelta: 65,
          isForced: false,
          isRepetition: false,
          isSelfUndo: false,
          isTactical: false,
          mobilityDelta: 2,
          movedMass: 1,
          participationDelta: 80,
          policyPrior: 0.1,
          repeatedPositionCount: 1,
          score: 495,
          sixStackDelta: 0,
          sourceFamily: 'white-002',
          tags: ['openLane'],
        },
        {
          action: { type: 'climbOne', source: 'C1', target: 'D2' } as const,
          emptyCellsDelta: 0,
          freezeSwingBonus: 0,
          homeFieldDelta: 0,
          intent: 'sixStack' as const,
          intentDelta: 60,
          isForced: false,
          isRepetition: false,
          isSelfUndo: false,
          isTactical: false,
          mobilityDelta: 0,
          movedMass: 1,
          participationDelta: 60,
          policyPrior: 0.05,
          repeatedPositionCount: 1,
          score: 492,
          sixStackDelta: 0.08,
          sourceFamily: 'white-003',
          tags: ['frontBuild'],
        },
      ];

      expect(actionKey(selectCandidateAction(ranked, AI_DIFFICULTY_PRESETS.hard, () => 0).action)).not.toBe(
        actionKey(selectCandidateAction(ranked, AI_DIFFICULTY_PRESETS.hard, () => 0.99).action),
      );
    } finally {
      Object.assign(AI_DIFFICULTY_PRESETS.hard, originalHardPreset);
    }
  });

  it('only reranks risk-mode candidates when they create certified progress', () => {
    const ranked: RootRankedAction[] = [
      {
        action: { type: 'climbOne', source: 'A1', target: 'B2' } as const,
        emptyCellsDelta: 0,
        freezeSwingBonus: 0,
        homeFieldDelta: 0,
        intent: 'hybrid' as const,
        intentDelta: 40,
        isForced: false,
        isRepetition: false,
        isSelfUndo: false,
        isTactical: false,
        mobilityDelta: 0,
        movedMass: 1,
        participationDelta: 30,
        policyPrior: 0.15,
        repeatedPositionCount: 1,
        score: 500,
        sixStackDelta: 0,
        sourceFamily: 'white-001',
        tags: ['advanceMass'],
      },
      {
        action: { type: 'climbOne', source: 'B1', target: 'C2' } as const,
        emptyCellsDelta: 2,
        freezeSwingBonus: 0,
        homeFieldDelta: 0,
        intent: 'hybrid' as const,
        intentDelta: 35,
        isForced: false,
        isRepetition: false,
        isSelfUndo: false,
        isTactical: false,
        mobilityDelta: 3,
        movedMass: 1,
        participationDelta: 25,
        policyPrior: 0.05,
        repeatedPositionCount: 1,
        score: 496,
        sixStackDelta: 0,
        sourceFamily: 'white-002',
        tags: ['decompress', 'openLane'],
      },
    ];

    expect(
      actionKey(
        selectCandidateAction(ranked, AI_DIFFICULTY_PRESETS.hard, () => 0.6, {
          riskMode: 'stagnation',
        }).action,
      ),
    ).toBe(actionKey(ranked[1].action));
  });

  it('keeps the search best move when risk mode only sees stagnant near-equal options', () => {
    const ranked: RootRankedAction[] = [
      {
        action: { type: 'climbOne', source: 'A1', target: 'B2' } as const,
        emptyCellsDelta: 0,
        freezeSwingBonus: 0,
        homeFieldDelta: 0,
        intent: 'hybrid' as const,
        intentDelta: 40,
        isForced: false,
        isRepetition: false,
        isSelfUndo: false,
        isTactical: false,
        mobilityDelta: 0,
        movedMass: 1,
        participationDelta: 30,
        policyPrior: 0.15,
        repeatedPositionCount: 1,
        score: 500,
        sixStackDelta: 0,
        sourceFamily: 'white-001',
        tags: ['advanceMass'],
      },
      {
        action: { type: 'climbOne', source: 'B1', target: 'C2' } as const,
        emptyCellsDelta: 0,
        freezeSwingBonus: 0,
        homeFieldDelta: 0,
        intent: 'hybrid' as const,
        intentDelta: 38,
        isForced: false,
        isRepetition: false,
        isSelfUndo: false,
        isTactical: false,
        mobilityDelta: 1,
        movedMass: 1,
        participationDelta: 28,
        policyPrior: 0.12,
        repeatedPositionCount: 1,
        score: 498,
        sixStackDelta: 0,
        sourceFamily: 'white-002',
        tags: ['advanceMass'],
      },
    ];

    expect(
      actionKey(
        selectCandidateAction(ranked, AI_DIFFICULTY_PRESETS.hard, () => 0.99, {
          riskMode: 'stagnation',
        }).action,
      ),
    ).toBe(actionKey(ranked[0].action));
  });

  it('lets hidden personas separate near-equal opening-style candidates', () => {
    const ranked: RootRankedAction[] = [
      {
        action: { type: 'climbOne', source: 'A1', target: 'B2' } as const,
        emptyCellsDelta: 2,
        freezeSwingBonus: 0,
        homeFieldDelta: 0,
        intent: 'hybrid' as const,
        intentDelta: 40,
        isForced: false,
        isRepetition: false,
        isSelfUndo: false,
        isTactical: false,
        mobilityDelta: 3,
        movedMass: 1,
        participationDelta: 30,
        policyPrior: 0.1,
        repeatedPositionCount: 1,
        score: 500,
        sixStackDelta: 0,
        sourceFamily: 'white-001',
        tags: ['decompress', 'openLane'],
      },
      {
        action: { type: 'climbOne', source: 'B1', target: 'C2' } as const,
        emptyCellsDelta: 0,
        freezeSwingBonus: 0,
        homeFieldDelta: 0,
        intent: 'sixStack' as const,
        intentDelta: 40,
        isForced: false,
        isRepetition: false,
        isSelfUndo: false,
        isTactical: false,
        mobilityDelta: 1,
        movedMass: 1,
        participationDelta: 30,
        policyPrior: 0.1,
        repeatedPositionCount: 1,
        score: 500,
        sixStackDelta: 0.07,
        sourceFamily: 'white-002',
        tags: ['frontBuild'],
      },
    ];

    const expanderChoice = selectCandidateAction(ranked, AI_DIFFICULTY_PRESETS.hard, () => 0.5, {
      behaviorProfileId: 'expander',
      riskMode: 'normal',
    });
    const builderChoice = selectCandidateAction(ranked, AI_DIFFICULTY_PRESETS.hard, () => 0.5, {
      behaviorProfileId: 'builder',
      riskMode: 'normal',
    });

    expect(actionKey(expanderChoice.action)).not.toBe(actionKey(builderChoice.action));
  });

  it('reranks non-forced tactical candidates inside the low-confidence risk band', () => {
    const ranked: RootRankedAction[] = [
      {
        action: { type: 'jumpSequence', source: 'C3', path: ['E5'] } as const,
        emptyCellsDelta: 0,
        freezeSwingBonus: 0,
        homeFieldDelta: 0.02,
        intent: 'hybrid' as const,
        intentDelta: 30,
        isForced: false,
        isRepetition: false,
        isSelfUndo: false,
        isTactical: true,
        mobilityDelta: 2,
        movedMass: 1,
        participationDelta: 30,
        policyPrior: 0.1,
        repeatedPositionCount: 1,
        score: 1_000,
        sixStackDelta: 0,
        sourceFamily: 'white-001',
        tags: ['advanceMass', 'openLane'],
      },
      {
        action: { type: 'jumpSequence', source: 'B3', path: ['D1'] } as const,
        emptyCellsDelta: 1,
        freezeSwingBonus: 1,
        homeFieldDelta: 0,
        intent: 'hybrid' as const,
        intentDelta: 25,
        isForced: false,
        isRepetition: false,
        isSelfUndo: false,
        isTactical: true,
        mobilityDelta: 3,
        movedMass: 1,
        participationDelta: 24,
        policyPrior: 0.05,
        repeatedPositionCount: 1,
        score: 700,
        sixStackDelta: 0,
        sourceFamily: 'white-002',
        tags: ['decompress', 'rescue'],
      },
    ];

    expect(
      actionKey(
        selectCandidateAction(ranked, AI_DIFFICULTY_PRESETS.hard, () => 0.5, {
          bandBoost: 4_000,
          riskMode: 'stagnation',
        }).action,
      ),
    ).toBe(actionKey(ranked[1].action));
  });

  it('exposes a geometry bias so personas can split symmetric openings', () => {
    expect(
      getBehaviorGeometryBias('expander', { type: 'climbOne', source: 'C3', target: 'B4' }),
    ).toBeGreaterThan(
      getBehaviorGeometryBias('expander', { type: 'climbOne', source: 'A3', target: 'A4' }),
    );
    expect(
      getBehaviorGeometryBias('hunter', { type: 'climbOne', source: 'B3', target: 'B4' }),
    ).toBeGreaterThan(
      getBehaviorGeometryBias('hunter', { type: 'climbOne', source: 'C3', target: 'B4' }),
    );
    expect(
      getBehaviorGeometryBias('builder', { type: 'climbOne', source: 'A3', target: 'A4' }),
    ).toBeGreaterThan(
      getBehaviorGeometryBias('builder', { type: 'climbOne', source: 'C3', target: 'B4' }),
    );
  });
});
