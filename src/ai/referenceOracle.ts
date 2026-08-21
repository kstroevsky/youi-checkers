import { evaluateState } from '@/ai/evaluation';
import { actionKey } from '@/ai/search/shared';
import {
  advanceGeneratedEngineState,
  getLegalActions,
  hashPosition,
  withRuleDefaults,
  type EngineState,
  type Player,
  type RuleConfig,
  type TurnAction,
} from '@/domain';

export const REFERENCE_STRENGTH_ORACLE_VERSION = 1 as const;
export const REFERENCE_STRENGTH_DEPTH = 4 as const;

export type ReferenceScoreV1 = {
  action: TurnAction;
  actionKey: string;
  score: number;
};

export type RootCoverageEvidenceV1 = {
  commonDepth: number;
  exactReferenceCount: number;
  interrupted: boolean;
  legalCount: number;
  lowerBoundCount: number;
  nodeCount: number;
  shortcutBypassed: boolean;
  source: 'referenceStrengthV1';
  unknownCount: number;
  upperBoundCount: number;
};

export type ReferenceStrengthResultV1 = {
  coverage: RootCoverageEvidenceV1;
  depth: typeof REFERENCE_STRENGTH_DEPTH;
  rootPlayer: Player;
  scores: ReferenceScoreV1[];
  version: typeof REFERENCE_STRENGTH_ORACLE_VERSION;
};

type ReferenceTableEntry = {
  depth: number;
  flag: 'exact' | 'lower' | 'upper';
  score: number;
};

function canonicalRuleId(config: RuleConfig): string {
  return JSON.stringify({
    allowNonAdjacentFriendlyStackTransfer:
      config.allowNonAdjacentFriendlyStackTransfer,
    drawRule: config.drawRule,
    scoringMode: config.scoringMode,
  });
}

function canonicalRepetitionContext(
  positionCounts: EngineState['positionCounts'],
): string {
  return Object.keys(positionCounts)
    .sort()
    .map((key) => `${key}=${Math.min(positionCounts[key] ?? 0, 2)}`)
    .join('\n');
}

/**
 * Collision-free reference identity for an active state. Product search uses
 * its compact Zobrist key; proof and strength evidence deliberately do not.
 */
export function referenceOracleStateKeyV1(
  state: EngineState,
  ruleConfig: Partial<RuleConfig> = {},
): string {
  if (state.status !== 'active') {
    throw new Error(
      'Reference oracle keys are defined only for active states.',
    );
  }
  const config = withRuleDefaults(ruleConfig);
  return [
    'reference-oracle-state-v1',
    canonicalRuleId(config),
    hashPosition(state),
    canonicalRepetitionContext(state.positionCounts),
  ].join('\u0000');
}

function canonicalActions(
  state: EngineState,
  ruleConfig: RuleConfig,
): TurnAction[] {
  return getLegalActions(state, ruleConfig)
    .slice()
    .sort((left, right) => actionKey(left).localeCompare(actionKey(right)));
}

/**
 * Fixed-depth, all-actions reference search. It has no product deadline,
 * persona, novelty, participation, model prior, selective extension,
 * quiescence, pruning reduction, or immediate-win shortcut.
 */
export function runReferenceStrengthOracleV1(
  root: EngineState,
  ruleConfig: Partial<RuleConfig> = {},
): ReferenceStrengthResultV1 {
  const config = withRuleDefaults(ruleConfig);
  const rootState = structuredClone(root);
  const rootPlayer = rootState.currentPlayer;
  const table = new Map<string, ReferenceTableEntry>();
  let nodeCount = 0;

  const search = (
    state: EngineState,
    depth: number,
    alphaInput: number,
    betaInput: number,
  ): number => {
    nodeCount += 1;

    // Terminal resolution must precede both depth evaluation and TT access.
    if (state.status === 'gameOver') {
      return evaluateState(state, rootPlayer, config, {
        preset: null,
        riskMode: 'normal',
      });
    }
    if (depth === 0) {
      return evaluateState(state, rootPlayer, config, {
        preset: null,
        riskMode: 'normal',
      });
    }

    const stateKey = referenceOracleStateKeyV1(state, config);
    const tableKey = `${depth}\u0000${stateKey}`;
    const cached = table.get(tableKey);
    let alpha = alphaInput;
    let beta = betaInput;
    if (cached && cached.depth >= depth) {
      if (cached.flag === 'exact') return cached.score;
      if (cached.flag === 'lower') alpha = Math.max(alpha, cached.score);
      else beta = Math.min(beta, cached.score);
      if (alpha >= beta) return cached.score;
    }

    const actions = canonicalActions(state, config);
    if (!actions.length) {
      return evaluateState(state, rootPlayer, config, {
        preset: null,
        riskMode: 'normal',
      });
    }

    const originalAlpha = alpha;
    const originalBeta = beta;
    const maximizing = state.currentPlayer === rootPlayer;
    let best = maximizing ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;

    for (const action of actions) {
      const next = advanceGeneratedEngineState(state, action, config);
      const score = search(next, depth - 1, alpha, beta);
      if (maximizing) {
        best = Math.max(best, score);
        alpha = Math.max(alpha, best);
      } else {
        best = Math.min(best, score);
        beta = Math.min(beta, best);
      }
      if (alpha >= beta) break;
    }

    table.set(tableKey, {
      depth,
      flag:
        best <= originalAlpha
          ? 'upper'
          : best >= originalBeta
            ? 'lower'
            : 'exact',
      score: best,
    });
    return best;
  };

  const legalActions = canonicalActions(rootState, config);
  const scores = legalActions.map((action): ReferenceScoreV1 => {
    const next = advanceGeneratedEngineState(rootState, action, config);
    // Each root subtree receives a full window; no root action is pruned.
    const score = search(
      next,
      REFERENCE_STRENGTH_DEPTH - 1,
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    );
    return { action, actionKey: actionKey(action), score };
  });

  return {
    coverage: {
      commonDepth: REFERENCE_STRENGTH_DEPTH,
      exactReferenceCount: scores.length,
      interrupted: false,
      legalCount: legalActions.length,
      lowerBoundCount: 0,
      nodeCount,
      shortcutBypassed: true,
      source: 'referenceStrengthV1',
      unknownCount: 0,
      upperBoundCount: 0,
    },
    depth: REFERENCE_STRENGTH_DEPTH,
    rootPlayer,
    scores,
    version: REFERENCE_STRENGTH_ORACLE_VERSION,
  };
}

export function isReferenceOnlyCoverageV1(
  evidence: RootCoverageEvidenceV1,
): boolean {
  return (
    evidence.commonDepth === REFERENCE_STRENGTH_DEPTH &&
    evidence.exactReferenceCount === evidence.legalCount &&
    !evidence.interrupted &&
    evidence.lowerBoundCount === 0 &&
    evidence.shortcutBypassed &&
    evidence.unknownCount === 0 &&
    evidence.upperBoundCount === 0
  );
}
