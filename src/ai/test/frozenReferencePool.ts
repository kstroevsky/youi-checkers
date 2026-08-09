import {
  applyAction,
  getLegalActions,
  getScoreSummary,
  type GameState,
  type Player,
  type RuleConfig,
  type TurnAction,
} from '@/domain';

export const FROZEN_REFERENCE_POOL_VERSION = 1 as const;

export type FrozenReferenceId =
  | 'canonical-legal-v1'
  | 'seeded-legal-v1'
  | 'tactical-greedy-v1';

export type FrozenReferenceDefinition = {
  description: string;
  id: FrozenReferenceId;
  implementationVersion: 1;
};

/**
 * This manifest is an evaluation fixture. Changing it invalidates paired
 * comparisons and requires a deliberate pool-version bump.
 */
export const FROZEN_REFERENCE_POOL: readonly FrozenReferenceDefinition[] = [
  {
    description: 'Selects the first action in canonical lexical order.',
    id: 'canonical-legal-v1',
    implementationVersion: 1,
  },
  {
    description: 'Selects uniformly from canonical legal actions with a seeded PRNG.',
    id: 'seeded-legal-v1',
    implementationVersion: 1,
  },
  {
    description:
      'Prefers immediate wins, avoids one-reply losses, then maximizes a frozen score heuristic.',
    id: 'tactical-greedy-v1',
    implementationVersion: 1,
  },
] as const;

export type FrozenReferenceCandidate = {
  action: TurnAction;
  actionKey: string;
  allowsImmediateLoss: boolean;
  immediateWin: boolean;
  staticScore: number;
};

export type FrozenReferenceDecision = {
  action: TurnAction | null;
  candidates: FrozenReferenceCandidate[];
  referenceId: FrozenReferenceId;
};

export function frozenActionKey(action: TurnAction): string {
  switch (action.type) {
    case 'manualUnfreeze':
      return `${action.type}:${action.coord}`;
    case 'jumpSequence':
      return `${action.type}:${action.source}:${action.path.join('>')}`;
    default:
      return `${action.type}:${action.source}:${action.target}`;
  }
}

function opponentOf(player: Player): Player {
  return player === 'white' ? 'black' : 'white';
}

function isWinFor(state: GameState, player: Player): boolean {
  return (
    state.status === 'gameOver' &&
    'winner' in state.victory &&
    state.victory.winner === player
  );
}

function allowsImmediateLoss(
  state: GameState,
  actor: Player,
  ruleConfig: RuleConfig,
): boolean {
  if (state.status === 'gameOver' || state.currentPlayer === actor) return false;
  const opponent = opponentOf(actor);
  return getLegalActions(state, ruleConfig).some((reply) =>
    isWinFor(applyAction(state, reply, ruleConfig), opponent),
  );
}

function frozenStaticScore(state: GameState, actor: Player): number {
  if (state.status === 'gameOver') {
    if ('winner' in state.victory) {
      return state.victory.winner === actor ? 1_000_000 : -1_000_000;
    }
    return 0;
  }

  const opponent = opponentOf(actor);
  const summary = getScoreSummary(state);
  const value = (player: Player): number =>
    summary.homeFieldSingles[player] * 120 +
    summary.controlledHomeRowHeightThreeStacks[player] * 900 +
    summary.controlledStacks[player] * 45 +
    summary.frozenEnemySingles[player] * 70;
  return value(actor) - value(opponent);
}

export function rankFrozenReferenceActions(
  state: GameState,
  ruleConfig: RuleConfig,
): FrozenReferenceCandidate[] {
  const actor = state.currentPlayer;
  return getLegalActions(state, ruleConfig)
    .map((action) => {
      const nextState = applyAction(state, action, ruleConfig);
      return {
        action,
        actionKey: frozenActionKey(action),
        allowsImmediateLoss: allowsImmediateLoss(nextState, actor, ruleConfig),
        immediateWin: isWinFor(nextState, actor),
        staticScore: frozenStaticScore(nextState, actor),
      };
    })
    .sort((left, right) => left.actionKey.localeCompare(right.actionKey));
}

export function chooseFrozenReferenceAction({
  random,
  referenceId,
  ruleConfig,
  state,
}: {
  random: () => number;
  referenceId: FrozenReferenceId;
  ruleConfig: RuleConfig;
  state: GameState;
}): FrozenReferenceDecision {
  const candidates = rankFrozenReferenceActions(state, ruleConfig);
  if (!candidates.length) return { action: null, candidates, referenceId };

  if (referenceId === 'canonical-legal-v1') {
    return { action: candidates[0].action, candidates, referenceId };
  }
  if (referenceId === 'seeded-legal-v1') {
    const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
    return { action: candidates[index].action, candidates, referenceId };
  }

  const immediateWins = candidates.filter((candidate) => candidate.immediateWin);
  const safeCandidates = candidates.filter((candidate) => !candidate.allowsImmediateLoss);
  const eligible = immediateWins.length
    ? immediateWins
    : safeCandidates.length
      ? safeCandidates
      : candidates;
  const bestScore = Math.max(...eligible.map((candidate) => candidate.staticScore));
  const best = eligible.filter((candidate) => candidate.staticScore === bestScore);
  const index = Math.min(best.length - 1, Math.floor(random() * best.length));
  return { action: best[index].action, candidates, referenceId };
}
