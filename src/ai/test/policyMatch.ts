import type { AiPolicy, AiPolicyDecision } from '@/ai/test/policy';
import { AI_DIFFICULTY_PRESETS } from '@/ai/presets';
import type { AiSearchDiagnosticAblation } from '@/ai/types';
import {
  buildParticipationState,
  getActionParticipationProfile,
  type ParticipationState,
  type SourceRegion,
} from '@/ai/participation';
import type { StrengthFixture } from '@/ai/test/referenceStrength';
import {
  cloneStrengthState,
  getHorizonPointsForPlayer,
  getNaturalPointsForPlayer,
  getStrengthTerminalType,
  type StrengthTerminalType,
} from '@/ai/test/strengthOutcome';
import {
  applyAction,
  getLegalActions,
  hashPosition,
  type Player,
  type RuleConfig,
} from '@/domain';
import {
  getFinishingProgress,
  type FinishingProgress,
} from '@/domain/rules/finishingProgress';
import type { AiDifficulty } from '@/shared/types/session';

import { actionKey } from '@/ai/test/searchTestUtils';

export type PolicyMatchPly = {
  actionKey: string;
  actor: Player;
  afterPositionHash: string;
  beforePositionHash: string;
  decision: AiPolicyDecision;
  measurement?: PolicyMatchPlyMeasurement;
  policyId: string;
};

type PolicyMatchProgress = Pick<
  FinishingProgress,
  'frontCompletedStacks' | 'homeReadiness' | 'homeSingles' | 'sixStackReadiness'
>;

export type PolicyMatchPlyMeasurement = {
  actorProgressAfter: PolicyMatchProgress;
  actorProgressBefore: PolicyMatchProgress;
  beforeLegalActionCount: number;
  movedMass: number;
  opponentProgressAfter: PolicyMatchProgress;
  opponentProgressBefore: PolicyMatchProgress;
  opponentReplyCount: number | null;
  participationDelta: number;
  repeatsSourceFamily: boolean;
  repeatsSourceRegion: boolean;
  samePlayerContinuation: boolean;
  sourceFamily: string;
  sourceRegion: SourceRegion;
};

export type PolicyMatchGame = {
  adjudicatedPolicyAPoints: number | null;
  adjudicationType: 'horizonDomainTiebreak' | 'natural' | 'none';
  fixtureId: string;
  gameId: string;
  plies: PolicyMatchPly[];
  policyAColor: Player;
  policyAPoints: number | null;
  policyByColor: Record<Player, string>;
  terminalType: StrengthTerminalType;
  totalPlies: number;
  winner: Player | null;
};

export type PolicyMatchPair = {
  adjudicatedPairScore: number | null;
  fixtureId: string;
  games: [PolicyMatchGame, PolicyMatchGame];
  pairId: string;
  pairScore: number | null;
  policyAId: string;
  policyASeed: number;
  policyBId: string;
  policyBSeed: number;
};

export async function runPolicyMatchGame({
  adjudicateHorizon,
  diagnosticAblation,
  difficulty,
  fixture,
  gameId,
  maxPlies,
  nodeBudget,
  policyA,
  policyAColor,
  policyASeed,
  policyB,
  policyBSeed,
  retainDecisionDiagnostics = true,
  retainMeasurementEvidence = false,
  ruleConfig,
}: {
  adjudicateHorizon: boolean;
  diagnosticAblation?: AiSearchDiagnosticAblation | null;
  difficulty: AiDifficulty;
  fixture: StrengthFixture;
  gameId: string;
  maxPlies: number;
  nodeBudget: number;
  policyA: AiPolicy;
  policyAColor: Player;
  policyASeed: number;
  policyB: AiPolicy;
  policyBSeed: number;
  retainDecisionDiagnostics?: boolean;
  retainMeasurementEvidence?: boolean;
  ruleConfig: RuleConfig;
}): Promise<PolicyMatchGame> {
  let state = cloneStrengthState(fixture.state);
  const policyBColor: Player = policyAColor === 'white' ? 'black' : 'white';
  const sessions = {
    [policyAColor]: await policyA.createSession(policyASeed),
    [policyBColor]: await policyB.createSession(policyBSeed),
  } as const;
  const policies = {
    [policyAColor]: policyA,
    [policyBColor]: policyB,
  } as const;
  const plies: PolicyMatchPly[] = [];
  const preset = AI_DIFFICULTY_PRESETS[difficulty];
  let participationState: ParticipationState | null = retainMeasurementEvidence
    ? buildParticipationState(state, preset.participationWindow)
    : null;

  try {
    for (let ply = 0; ply < maxPlies && state.status !== 'gameOver'; ply += 1) {
      const actor = state.currentPlayer;
      const beforePositionHash = hashPosition(state);
      const decision = await sessions[actor].decide({
        diagnosticAblation,
        difficulty,
        ruleConfig,
        searchBudget: { maxEvaluatedNodes: nodeBudget, type: 'fixedNodes' },
        state,
      });

      if (!decision.action) break;
      const nextState = applyAction(state, decision.action, ruleConfig);
      const opponent: Player = actor === 'white' ? 'black' : 'white';
      const samePlayerContinuation = nextState.currentPlayer === actor;
      const participation = retainMeasurementEvidence
        ? getActionParticipationProfile(
            state,
            decision.action,
            nextState,
            actor,
            participationState,
            preset,
            {
              isTactical:
                decision.action.type === 'jumpSequence' ||
                decision.action.type === 'manualUnfreeze',
              winsImmediately:
                nextState.status === 'gameOver' &&
                'winner' in nextState.victory &&
                nextState.victory.winner === actor,
            },
          )
        : null;
      plies.push({
        actionKey: actionKey(decision.action),
        actor,
        afterPositionHash: hashPosition(nextState),
        beforePositionHash,
        decision: retainDecisionDiagnostics
          ? decision
          : { action: decision.action },
        ...(retainMeasurementEvidence && participation
          ? {
              measurement: {
                actorProgressAfter: getFinishingProgress(nextState, actor),
                actorProgressBefore: getFinishingProgress(state, actor),
                beforeLegalActionCount: getLegalActions(state, ruleConfig)
                  .length,
                movedMass: participation.movedMass,
                opponentProgressAfter: getFinishingProgress(
                  nextState,
                  opponent,
                ),
                opponentProgressBefore: getFinishingProgress(state, opponent),
                opponentReplyCount: samePlayerContinuation
                  ? null
                  : getLegalActions(nextState, ruleConfig).length,
                participationDelta: participation.participationDelta,
                repeatsSourceFamily: participation.repeatsSourceFamily,
                repeatsSourceRegion: participation.repeatsSourceRegion,
                samePlayerContinuation,
                sourceFamily: participation.sourceFamily,
                sourceRegion: participation.sourceRegion,
              },
            }
          : {}),
        policyId: policies[actor].id,
      });
      participationState =
        participation?.nextParticipationState ?? participationState;
      state = nextState;
    }
  } finally {
    await Promise.all(
      Object.values(sessions).map((session) => session.dispose()),
    );
  }

  const naturalPoints = getNaturalPointsForPlayer(state, policyAColor);
  return {
    adjudicatedPolicyAPoints:
      naturalPoints ??
      (adjudicateHorizon
        ? getHorizonPointsForPlayer(state, policyAColor)
        : null),
    adjudicationType:
      naturalPoints !== null
        ? 'natural'
        : adjudicateHorizon
          ? 'horizonDomainTiebreak'
          : 'none',
    fixtureId: fixture.id,
    gameId,
    plies,
    policyAColor,
    policyAPoints: naturalPoints,
    policyByColor: {
      [policyAColor]: policyA.id,
      [policyBColor]: policyB.id,
    } as Record<Player, string>,
    terminalType: getStrengthTerminalType(state),
    totalPlies: plies.length,
    winner:
      state.status === 'gameOver' && 'winner' in state.victory
        ? state.victory.winner
        : null,
  };
}

export async function runPolicyMatchPair({
  adjudicateHorizon,
  diagnosticAblation,
  difficulty,
  fixture,
  maxPlies,
  nodeBudget,
  pairId,
  policyA,
  policyASeed,
  policyB,
  policyBSeed,
  retainDecisionDiagnostics,
  retainMeasurementEvidence,
  ruleConfig,
}: Omit<Parameters<typeof runPolicyMatchGame>[0], 'gameId' | 'policyAColor'> & {
  pairId: string;
}): Promise<PolicyMatchPair> {
  const games = (await Promise.all([
    runPolicyMatchGame({
      adjudicateHorizon,
      diagnosticAblation,
      difficulty,
      fixture,
      gameId: `${pairId}/a-white`,
      maxPlies,
      nodeBudget,
      policyA,
      policyAColor: 'white',
      policyASeed,
      policyB,
      policyBSeed,
      retainDecisionDiagnostics,
      retainMeasurementEvidence,
      ruleConfig,
    }),
    runPolicyMatchGame({
      adjudicateHorizon,
      diagnosticAblation,
      difficulty,
      fixture,
      gameId: `${pairId}/a-black`,
      maxPlies,
      nodeBudget,
      policyA,
      policyAColor: 'black',
      policyASeed,
      policyB,
      policyBSeed,
      retainDecisionDiagnostics,
      retainMeasurementEvidence,
      ruleConfig,
    }),
  ])) as [PolicyMatchGame, PolicyMatchGame];
  const naturalScores = games.map((game) => game.policyAPoints);
  const adjudicatedScores = games.map((game) => game.adjudicatedPolicyAPoints);
  const pairScore = naturalScores.every(
    (score): score is number => score !== null,
  )
    ? (naturalScores[0] + naturalScores[1]) / 2
    : null;
  const adjudicatedPairScore = adjudicatedScores.every(
    (score): score is number => score !== null,
  )
    ? (adjudicatedScores[0] + adjudicatedScores[1]) / 2
    : null;

  return {
    adjudicatedPairScore,
    fixtureId: fixture.id,
    games,
    pairId,
    pairScore,
    policyAId: policyA.id,
    policyASeed,
    policyBId: policyB.id,
    policyBSeed,
  };
}
