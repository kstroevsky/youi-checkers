import { evaluateState } from '@/ai/evaluation';
import { actionKey } from '@/ai/search/shared';
import type { WdlProofResultV1 } from '@/ai/test/wdlProof.node';
import { wdlProofStateKeyV1 } from '@/ai/test/wdlProof.node';
import {
  advanceGeneratedEngineState,
  getLegalActions,
  withRuleDefaults,
  type EngineState,
  type Player,
  type RuleConfig,
  type TurnAction,
} from '@/domain';
import { resolveDrawOutcome } from '@/domain/rules/victory';

export const OUTCOME_CONTINUATION_POLICY_VERSION = 1 as const;
export const OUTCOME_CONTINUATION_PLIES = 160 as const;
export const NEXT_OPPONENT_BOUNDARY_MAX_ACTIONS = 8 as const;

export type WdlSnapshotLookupV1 = ReadonlyMap<string, WdlProofResultV1>;

function invert(value: 'loss' | 'draw' | 'win') {
  return value === 'loss' ? 'win' : value === 'win' ? 'loss' : 'draw';
}

function parentActionWdl(
  parent: EngineState,
  child: EngineState,
  result: WdlProofResultV1,
): 'loss' | 'draw' | 'win' | null {
  if (result.bounds.lower !== result.bounds.upper) return null;
  return child.currentPlayer === parent.currentPlayer
    ? result.bounds.lower
    : invert(result.bounds.lower);
}

function depthTwoScores(
  root: EngineState,
  config: RuleConfig,
): Array<{ action: TurnAction; score: number }> {
  const perspective = root.currentPlayer;
  const search = (state: EngineState, depth: number): number => {
    if (state.status === 'gameOver' || depth === 0)
      return evaluateState(state, perspective, config, {
        preset: null,
        riskMode: 'normal',
      });
    const scores = getLegalActions(state, config).map((action) =>
      search(advanceGeneratedEngineState(state, action, config), depth - 1),
    );
    if (!scores.length)
      return evaluateState(state, perspective, config, {
        preset: null,
        riskMode: 'normal',
      });
    return state.currentPlayer === perspective
      ? Math.max(...scores)
      : Math.min(...scores);
  };
  return getLegalActions(root, config).map((action) => ({
    action,
    score: search(advanceGeneratedEngineState(root, action, config), 1),
  }));
}

/** Snapshot proof first; deterministic fixed-depth-two reference otherwise. */
export function chooseOutcomeContinuationActionV1({
  config: configInput,
  proofSnapshot,
  state,
}: {
  config: Partial<RuleConfig>;
  proofSnapshot: WdlSnapshotLookupV1;
  state: EngineState;
}): {
  action: TurnAction | null;
  source: 'fixedDepth2' | 'snapshotWdl' | 'terminal';
} {
  const config = withRuleDefaults(configInput);
  if (state.status === 'gameOver') return { action: null, source: 'terminal' };
  const actions = getLegalActions(state, config)
    .slice()
    .sort((left, right) => actionKey(left).localeCompare(actionKey(right)));
  const proved = actions.map((action) => {
    const child = advanceGeneratedEngineState(state, action, config);
    const proof = proofSnapshot.get(wdlProofStateKeyV1(child, config));
    return { action, wdl: proof ? parentActionWdl(state, child, proof) : null };
  });
  if (proved.length > 0 && proved.every((entry) => entry.wdl !== null)) {
    const rank = { draw: 1, loss: 0, win: 2 } as const;
    const best = Math.max(
      ...proved.map((entry) => rank[entry.wdl as keyof typeof rank]),
    );
    return {
      action:
        proved.find((entry) => rank[entry.wdl as keyof typeof rank] === best)
          ?.action ?? null,
      source: 'snapshotWdl',
    };
  }
  const fallback = depthTwoScores(state, config).sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return actionKey(left.action).localeCompare(actionKey(right.action));
  })[0];
  return { action: fallback?.action ?? null, source: 'fixedDepth2' };
}

export type OutcomeContinuationResultV1 = {
  adjudication: 'fixed160' | 'natural';
  committedActions: number;
  pointShare: number;
  rootPlayer: Player;
  sources: Record<'fixedDepth2' | 'snapshotWdl', number>;
  terminal: boolean;
  version: 1;
};

export function runOutcomeContinuationV1({
  config: configInput,
  forcedAction,
  proofSnapshot,
  root,
}: {
  config: Partial<RuleConfig>;
  forcedAction: TurnAction;
  proofSnapshot: WdlSnapshotLookupV1;
  root: EngineState;
}): OutcomeContinuationResultV1 {
  const config = withRuleDefaults(configInput);
  const rootPlayer = root.currentPlayer;
  let state = advanceGeneratedEngineState(
    structuredClone(root),
    forcedAction,
    config,
  );
  let committedActions = 1;
  const sources = { fixedDepth2: 0, snapshotWdl: 0 };
  while (
    state.status !== 'gameOver' &&
    committedActions < OUTCOME_CONTINUATION_PLIES
  ) {
    const decision = chooseOutcomeContinuationActionV1({
      config,
      proofSnapshot,
      state,
    });
    if (!decision.action || decision.source === 'terminal') break;
    sources[decision.source] += 1;
    state = advanceGeneratedEngineState(state, decision.action, config);
    committedActions += 1;
  }
  const natural =
    state.status === 'gameOver'
      ? 'winner' in state.victory
        ? state.victory.winner === rootPlayer
          ? 1
          : 0
        : 0.5
      : null;
  const horizon = resolveDrawOutcome(state, 'stalemate');
  const horizonPoints =
    'winner' in horizon ? (horizon.winner === rootPlayer ? 1 : 0) : 0.5;
  return {
    adjudication: natural === null ? 'fixed160' : 'natural',
    committedActions,
    pointShare: natural ?? horizonPoints,
    rootPlayer,
    sources,
    terminal: state.status === 'gameOver',
    version: 1,
  };
}

export type NextOpponentDecisionBoundaryV1 =
  | { kind: 'terminal'; state: EngineState; traversedActions: number }
  | { kind: 'opponentDecision'; state: EngineState; traversedActions: number }
  | { kind: 'unknown'; reason: 'cycle' | 'overflow'; traversedActions: number };

export function findNextOpponentDecisionBoundaryV1({
  actualRetainedAction,
  config: configInput,
  initialAction,
  mode,
  proofSnapshot,
  root,
}: {
  actualRetainedAction?: (state: EngineState) => TurnAction | null;
  config: Partial<RuleConfig>;
  initialAction: TurnAction;
  mode: 'actual' | 'counterfactualProjection';
  proofSnapshot: WdlSnapshotLookupV1;
  root: EngineState;
}): NextOpponentDecisionBoundaryV1 {
  const config = withRuleDefaults(configInput);
  const actor = root.currentPlayer;
  let state = advanceGeneratedEngineState(root, initialAction, config);
  let traversedActions = 1;
  const visited = new Set<string>();
  while (true) {
    if (state.status === 'gameOver')
      return { kind: 'terminal', state, traversedActions };
    if (state.currentPlayer !== actor && getLegalActions(state, config).length)
      return { kind: 'opponentDecision', state, traversedActions };
    const key = wdlProofStateKeyV1(state, config);
    if (visited.has(key))
      return { kind: 'unknown', reason: 'cycle', traversedActions };
    visited.add(key);
    if (traversedActions >= 1 + NEXT_OPPONENT_BOUNDARY_MAX_ACTIONS)
      return { kind: 'unknown', reason: 'overflow', traversedActions };
    const action =
      mode === 'actual'
        ? (actualRetainedAction?.(state) ?? null)
        : chooseOutcomeContinuationActionV1({ config, proofSnapshot, state })
            .action;
    if (!action)
      return { kind: 'unknown', reason: 'overflow', traversedActions };
    state = advanceGeneratedEngineState(state, action, config);
    traversedActions += 1;
  }
}
