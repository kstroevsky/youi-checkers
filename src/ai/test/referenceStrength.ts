import { chooseComputerAction, type AiSearchResult } from '@/ai';
import { createAiBehaviorProfile } from '@/ai/behavior';
import {
  FROZEN_REFERENCE_POOL_VERSION,
  chooseFrozenReferenceAction,
  frozenActionKey,
  type FrozenReferenceCandidate,
  type FrozenReferenceId,
} from '@/ai/test/frozenReferencePool';
import {
  applyAction,
  hashPosition,
  type GameState,
  type Player,
  type RuleConfig,
  type TurnAction,
  type Victory,
} from '@/domain';
import type { AiDifficulty } from '@/shared/types/session';

export const AI_REFERENCE_STRENGTH_SCHEMA_VERSION = 1 as const;

export type StrengthFixtureSplit = 'development' | 'holdout';

export type StrengthFixture = {
  bucket: string;
  id: string;
  split: StrengthFixtureSplit;
  state: GameState;
};

export type ReferenceStrengthPly = {
  actionKey: string;
  actor: Player;
  actorKind: 'candidate' | 'reference';
  afterPositionHash: string;
  beforePositionHash: string;
  referenceCandidates: FrozenReferenceCandidate[] | null;
  searchResult: AiSearchResult | null;
};

export type ReferenceStrengthGame = {
  candidateColor: Player;
  candidatePoints: number | null;
  candidateSeed: number;
  fixtureId: string;
  gameId: string;
  kind: 'strengthGame';
  plies: ReferenceStrengthPly[];
  referenceId: FrozenReferenceId;
  referenceSeed: number;
  terminalType: Exclude<Victory['type'], 'none'> | 'unfinished';
  totalPlies: number;
  winner: Player | null;
};

export type ReferenceStrengthPair = {
  candidateSeed: number;
  fixtureBucket: string;
  fixtureId: string;
  games: [ReferenceStrengthGame, ReferenceStrengthGame];
  kind: 'strengthPair';
  pairId: string;
  pairScore: number | null;
  referenceId: FrozenReferenceId;
  referencePoolVersion: typeof FROZEN_REFERENCE_POOL_VERSION;
  referenceSeed: number;
  resolvedGameCount: number;
  stratumId: string;
};

function createSeededRandom(seed: number): () => number {
  let current = seed >>> 0;
  return () => {
    current = (current * 1_664_525 + 1_013_904_223) >>> 0;
    return current / 0x1_0000_0000;
  };
}

function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

function terminalType(state: GameState): ReferenceStrengthGame['terminalType'] {
  return state.status === 'gameOver' && state.victory.type !== 'none'
    ? state.victory.type
    : 'unfinished';
}

function pointsForCandidate(state: GameState, candidateColor: Player): number | null {
  if (state.status !== 'gameOver') return null;
  if ('winner' in state.victory) {
    return state.victory.winner === candidateColor ? 1 : 0;
  }
  return 0.5;
}

export function runReferenceStrengthGame({
  candidateColor,
  candidateDifficulty,
  candidateSeed,
  fixture,
  gameId,
  maxPlies,
  nodeBudget,
  referenceId,
  referenceSeed,
  ruleConfig,
}: {
  candidateColor: Player;
  candidateDifficulty: AiDifficulty;
  candidateSeed: number;
  fixture: StrengthFixture;
  gameId: string;
  maxPlies: number;
  nodeBudget: number;
  referenceId: FrozenReferenceId;
  referenceSeed: number;
  ruleConfig: RuleConfig;
}): ReferenceStrengthGame {
  let state = cloneState(fixture.state);
  const candidateRandom = createSeededRandom(candidateSeed);
  const referenceRandom = createSeededRandom(referenceSeed);
  const behaviorProfile = createAiBehaviorProfile(`strength-candidate-${candidateSeed}`);
  const plies: ReferenceStrengthPly[] = [];

  for (let ply = 0; ply < maxPlies && state.status !== 'gameOver'; ply += 1) {
    const actor = state.currentPlayer;
    const beforePositionHash = hashPosition(state);
    let action: TurnAction | null;
    let referenceCandidates: FrozenReferenceCandidate[] | null = null;
    let searchResult: AiSearchResult | null = null;

    if (actor === candidateColor) {
      searchResult = chooseComputerAction({
        behaviorProfile,
        difficulty: candidateDifficulty,
        random: candidateRandom,
        ruleConfig,
        searchBudget: { maxEvaluatedNodes: nodeBudget, type: 'fixedNodes' },
        state,
      });
      action = searchResult.action;
    } else {
      const decision = chooseFrozenReferenceAction({
        random: referenceRandom,
        referenceId,
        ruleConfig,
        state,
      });
      action = decision.action;
      referenceCandidates = decision.candidates;
    }

    if (!action) break;
    const nextState = applyAction(state, action, ruleConfig);
    plies.push({
      actionKey: frozenActionKey(action),
      actor,
      actorKind: actor === candidateColor ? 'candidate' : 'reference',
      afterPositionHash: hashPosition(nextState),
      beforePositionHash,
      referenceCandidates,
      searchResult,
    });
    state = nextState;
  }

  return {
    candidateColor,
    candidatePoints: pointsForCandidate(state, candidateColor),
    candidateSeed,
    fixtureId: fixture.id,
    gameId,
    kind: 'strengthGame',
    plies,
    referenceId,
    referenceSeed,
    terminalType: terminalType(state),
    totalPlies: plies.length,
    winner:
      state.status === 'gameOver' && 'winner' in state.victory
        ? state.victory.winner
        : null,
  };
}

export function runReferenceStrengthPair({
  candidateDifficulty,
  candidateSeed,
  fixture,
  maxPlies,
  nodeBudget,
  pairIndex,
  referenceId,
  referenceSeed,
  ruleConfig,
}: {
  candidateDifficulty: AiDifficulty;
  candidateSeed: number;
  fixture: StrengthFixture;
  maxPlies: number;
  nodeBudget: number;
  pairIndex: number;
  referenceId: FrozenReferenceId;
  referenceSeed: number;
  ruleConfig: RuleConfig;
}): ReferenceStrengthPair {
  const pairId = `${fixture.id}/${referenceId}/seed-${pairIndex}`;
  const createGame = (candidateColor: Player): ReferenceStrengthGame =>
    runReferenceStrengthGame({
      candidateColor,
      candidateDifficulty,
      candidateSeed,
      fixture,
      gameId: `${pairId}/${candidateColor}`,
      maxPlies,
      nodeBudget,
      referenceId,
      referenceSeed,
      ruleConfig,
    });
  const games: [ReferenceStrengthGame, ReferenceStrengthGame] = [
    createGame('white'),
    createGame('black'),
  ];
  const resolved = games.flatMap((game) =>
    game.candidatePoints === null ? [] : [game.candidatePoints],
  );

  return {
    candidateSeed,
    fixtureBucket: fixture.bucket,
    fixtureId: fixture.id,
    games,
    kind: 'strengthPair',
    pairId,
    pairScore:
      resolved.length === games.length
        ? resolved.reduce((sum, value) => sum + value, 0) / games.length
        : null,
    referenceId,
    referencePoolVersion: FROZEN_REFERENCE_POOL_VERSION,
    referenceSeed,
    resolvedGameCount: resolved.length,
    stratumId: `${fixture.id}::${referenceId}`,
  };
}
