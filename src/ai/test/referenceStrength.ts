import {
  chooseComputerAction,
  type AiSearchResult,
  type AiStrategicIntent,
} from '@/ai';
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
import { resolveDrawOutcome } from '@/domain/rules/victory';
import { mirrorGameStateHorizontally } from '@/ai/test/symmetry';

export const AI_REFERENCE_STRENGTH_SCHEMA_VERSION = 3 as const;

export type StrengthFixtureSplit = 'development' | 'holdout';

export type StrengthFixture = {
  bucket: string;
  id: string;
  mirror: 'horizontal' | 'original';
  origin: 'initial' | 'randomLegal' | 'syntheticLoop';
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
  adjudicatedCandidatePoints: number | null;
  adjudicationType: 'horizonDomainTiebreak' | 'natural' | 'none';
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
  adjudicatedPairScore: number | null;
  candidateSeed: number;
  fixtureBucket: string;
  fixtureId: string;
  fixtureMirror: StrengthFixture['mirror'];
  fixtureOrigin: StrengthFixture['origin'];
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

/** Expands one scenario into a true geometric pair while retaining provenance. */
export function expandStrengthFixtureSymmetry(
  fixture: StrengthFixture,
): [StrengthFixture, StrengthFixture] {
  if (fixture.mirror !== 'original') {
    throw new Error(
      'Only an original strength fixture can be symmetry-expanded.',
    );
  }

  return [
    fixture,
    {
      ...fixture,
      id: `${fixture.id}-mirror-horizontal`,
      mirror: 'horizontal',
      state: mirrorGameStateHorizontally(fixture.state),
    },
  ];
}

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

function pointsForCandidate(
  state: GameState,
  candidateColor: Player,
): number | null {
  if (state.status !== 'gameOver') return null;
  if ('winner' in state.victory) {
    return state.victory.winner === candidateColor ? 1 : 0;
  }
  return 0.5;
}

function horizonAdjudicatedPoints(
  state: GameState,
  candidateColor: Player,
): number {
  const outcome = resolveDrawOutcome(state, 'stalemate');
  if ('winner' in outcome) return outcome.winner === candidateColor ? 1 : 0;
  return 0.5;
}

export function runReferenceStrengthGame({
  adjudicateHorizon,
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
  adjudicateHorizon: boolean;
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
  const behaviorProfile = createAiBehaviorProfile(
    `strength-candidate-${candidateSeed}`,
  );
  const plies: ReferenceStrengthPly[] = [];
  let candidateStrategicIntent: AiStrategicIntent | null = null;

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
        previousStrategicIntent: candidateStrategicIntent,
        random: candidateRandom,
        ruleConfig,
        searchBudget: { maxEvaluatedNodes: nodeBudget, type: 'fixedNodes' },
        state,
      });
      candidateStrategicIntent = searchResult.strategicIntent;
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

  const naturalPoints = pointsForCandidate(state, candidateColor);
  return {
    adjudicatedCandidatePoints:
      naturalPoints ??
      (adjudicateHorizon
        ? horizonAdjudicatedPoints(state, candidateColor)
        : null),
    adjudicationType:
      naturalPoints !== null
        ? 'natural'
        : adjudicateHorizon
          ? 'horizonDomainTiebreak'
          : 'none',
    candidateColor,
    candidatePoints: naturalPoints,
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
  adjudicateHorizon,
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
  adjudicateHorizon: boolean;
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
      adjudicateHorizon,
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
  const adjudicated = games.flatMap((game) =>
    game.adjudicatedCandidatePoints === null
      ? []
      : [game.adjudicatedCandidatePoints],
  );

  return {
    adjudicatedPairScore:
      adjudicated.length === games.length
        ? adjudicated.reduce((sum, value) => sum + value, 0) / games.length
        : null,
    candidateSeed,
    fixtureBucket: fixture.bucket,
    fixtureId: fixture.id,
    fixtureMirror: fixture.mirror,
    fixtureOrigin: fixture.origin,
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
