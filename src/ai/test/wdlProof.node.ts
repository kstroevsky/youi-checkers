import { createHash } from 'node:crypto';

import { referenceOracleStateKeyV1 } from '@/ai/referenceOracle';
import { actionKey } from '@/ai/search/shared';
import {
  advanceGeneratedEngineState,
  getLegalActions,
  hashPosition,
  withRuleDefaults,
  type EngineState,
  type RuleConfig,
  type TurnAction,
} from '@/domain';
import type { WdlBoundsV1, WdlValueV1 } from '@/ai/test/rootScoreEvidence';

export const WDL_PROOF_PROTOCOL_VERSION = 1 as const;
export const WDL_PROOF_LIMITS_V1 = {
  maxMemoryBytes: 8 * 1024 * 1024 * 1024,
  maxMilliseconds: 30 * 60 * 1_000,
  maxStates: 10_000_000,
} as const;

export type WdlProofLimitsV1 = {
  maxMemoryBytes: number;
  maxMilliseconds: number;
  maxStates: number;
};

export type WdlProofCertificateV1 = {
  outcome: WdlValueV1;
  queryId: string;
  rootStateKey: string;
  stateOutcomes: Array<{
    edges: Array<{
      action: TurnAction;
      childKey: string;
      controlChanged: boolean;
    }>;
    outcome: WdlValueV1;
    state: EngineState;
    stateKey: string;
    witnessActionKey: string | null;
  }>;
  version: 1;
};

export type WdlProofResultV1 = {
  bounds: WdlBoundsV1;
  certificate: WdlProofCertificateV1 | null;
  exhaustion: 'none' | 'memory' | 'states' | 'time';
  exploredStates: number;
  proofProtocolHash: string;
  queryId: string;
  rootStateKey: string;
  source: 'exhaustiveProof' | 'terminal' | 'unknown';
  version: 1;
};

type GraphEdge = {
  action: TurnAction;
  actionKey: string;
  childKey: string;
  controlChanged: boolean;
};

type GraphNode = {
  edges: GraphEdge[];
  expanded: boolean;
  state: EngineState;
  terminal: WdlValueV1 | null;
};

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(',')}}`;
}

function hash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export const WDL_PROOF_PROTOCOL_HASH_V1 = hash({
  canonicalization: 'referenceOracleStateKeyV1',
  cycleSemantics: 'fully-expanded-unresolved-SCC-is-draw',
  limits: WDL_PROOF_LIMITS_V1,
  terminalBeforeCache: true,
  traversal: 'canonical-breadth-first',
  version: WDL_PROOF_PROTOCOL_VERSION,
});

function terminalOutcome(state: EngineState): WdlValueV1 | null {
  if (state.status !== 'gameOver') return null;
  if (!('winner' in state.victory)) return 'draw';
  return state.victory.winner === state.currentPlayer ? 'win' : 'loss';
}

export function wdlProofStateKeyV1(
  state: EngineState,
  config: RuleConfig,
): string {
  if (state.status === 'active')
    return referenceOracleStateKeyV1(state, config);
  return `terminal\u0000${hashPosition(state)}\u0000${hash(
    Object.entries(state.positionCounts)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, count]) => [key, Math.min(count, 2)]),
  )}\u0000${state.victory.type}`;
}

function invert(outcome: WdlValueV1): WdlValueV1 {
  return outcome === 'win' ? 'loss' : outcome === 'loss' ? 'win' : 'draw';
}

function actionOutcome(childOutcome: WdlValueV1, edge: GraphEdge): WdlValueV1 {
  return edge.controlChanged ? invert(childOutcome) : childOutcome;
}

function estimatedGraphBytes(graph: Map<string, GraphNode>): number {
  let bytes = 0;
  for (const [key, node] of graph) {
    bytes += key.length * 2 + 256 + node.edges.length * 96;
  }
  return bytes;
}

export function solveWdlProofQueryV1({
  config: configInput,
  limits = WDL_PROOF_LIMITS_V1,
  now = () => performance.now(),
  queryId,
  state: input,
}: {
  config: Partial<RuleConfig>;
  limits?: WdlProofLimitsV1;
  now?: () => number;
  queryId: string;
  state: EngineState;
}): WdlProofResultV1 {
  const config = withRuleDefaults(configInput);
  const root = structuredClone(input);
  const rootKey = wdlProofStateKeyV1(root, config);
  const rootTerminal = terminalOutcome(root);
  if (rootTerminal) {
    return {
      bounds: { lower: rootTerminal, upper: rootTerminal },
      certificate: {
        outcome: rootTerminal,
        queryId,
        rootStateKey: rootKey,
        stateOutcomes: [
          {
            edges: [],
            outcome: rootTerminal,
            state: root,
            stateKey: rootKey,
            witnessActionKey: null,
          },
        ],
        version: 1,
      },
      exhaustion: 'none',
      exploredStates: 1,
      proofProtocolHash: WDL_PROOF_PROTOCOL_HASH_V1,
      queryId,
      rootStateKey: rootKey,
      source: 'terminal',
      version: 1,
    };
  }

  const started = now();
  const graph = new Map<string, GraphNode>([
    [rootKey, { edges: [], expanded: false, state: root, terminal: null }],
  ]);
  const queue = [rootKey];
  let cursor = 0;
  let exhaustion: WdlProofResultV1['exhaustion'] = 'none';
  const outcomes = new Map<string, WdlValueV1>();
  const propagateResolved = (): void => {
    let changed = true;
    while (changed) {
      changed = false;
      for (const [key, node] of graph) {
        if (outcomes.has(key) || !node.expanded) continue;
        const resolved = node.edges.map((edge) => {
          const child = outcomes.get(edge.childKey);
          return child ? actionOutcome(child, edge) : null;
        });
        const outcome = resolved.includes('win')
          ? 'win'
          : resolved.length > 0 && resolved.every((entry) => entry === 'loss')
            ? 'loss'
            : null;
        if (outcome) {
          outcomes.set(key, outcome);
          changed = true;
        }
      }
    }
  };

  while (cursor < queue.length) {
    if (now() - started >= limits.maxMilliseconds) {
      exhaustion = 'time';
      break;
    }
    if (graph.size >= limits.maxStates) {
      exhaustion = 'states';
      break;
    }
    if (estimatedGraphBytes(graph) >= limits.maxMemoryBytes) {
      exhaustion = 'memory';
      break;
    }
    const key = queue[cursor++];
    const node = graph.get(key);
    if (!node || node.expanded) continue;
    const actions = getLegalActions(node.state, config)
      .slice()
      .sort((left, right) => actionKey(left).localeCompare(actionKey(right)));
    node.edges = actions.map((action: TurnAction): GraphEdge => {
      const next = advanceGeneratedEngineState(node.state, action, config);
      const childKey = wdlProofStateKeyV1(next, config);
      if (!graph.has(childKey)) {
        graph.set(childKey, {
          edges: [],
          expanded: next.status === 'gameOver',
          state: next,
          terminal: terminalOutcome(next),
        });
        const childTerminal = terminalOutcome(next);
        if (childTerminal) outcomes.set(childKey, childTerminal);
        if (next.status !== 'gameOver') queue.push(childKey);
      }
      return {
        action: structuredClone(action),
        actionKey: actionKey(action),
        childKey,
        controlChanged: next.currentPlayer !== node.state.currentPlayer,
      };
    });
    node.expanded = true;
    propagateResolved();
    if (outcomes.has(rootKey)) break;
  }

  for (const [key, node] of graph) {
    if (node.terminal) outcomes.set(key, node.terminal);
  }
  propagateResolved();

  if (exhaustion === 'none' && cursor >= queue.length) {
    // In a fully enumerated finite graph, nodes outside both win and loss
    // attractors form draw SCCs (or can force entry into one).
    for (const key of graph.keys()) {
      if (!outcomes.has(key)) outcomes.set(key, 'draw');
    }
  }

  const rootOutcome = outcomes.get(rootKey) ?? null;
  const certificate: WdlProofCertificateV1 | null = rootOutcome
    ? {
        outcome: rootOutcome,
        queryId,
        rootStateKey: rootKey,
        stateOutcomes: [...outcomes.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, outcome]) => {
            const node = graph.get(key);
            if (!node) throw new Error('Proof graph lost a resolved state.');
            const witness = node.edges.find((edge) => {
              const child = outcomes.get(edge.childKey);
              return child && actionOutcome(child, edge) === outcome;
            });
            return {
              edges: node.edges.map((edge) => ({
                action: structuredClone(edge.action),
                childKey: edge.childKey,
                controlChanged: edge.controlChanged,
              })),
              outcome,
              state: structuredClone(node.state),
              stateKey: key,
              witnessActionKey: witness?.actionKey ?? null,
            };
          }),
        version: 1,
      }
    : null;

  return {
    bounds: rootOutcome
      ? { lower: rootOutcome, upper: rootOutcome }
      : { lower: 'loss', upper: 'win' },
    certificate,
    exhaustion,
    exploredStates: graph.size,
    proofProtocolHash: WDL_PROOF_PROTOCOL_HASH_V1,
    queryId,
    rootStateKey: rootKey,
    source: rootOutcome ? 'exhaustiveProof' : 'unknown',
    version: 1,
  };
}

export function verifyWdlProofCertificateV1(
  result: WdlProofResultV1,
  configInput: Partial<RuleConfig> = {},
): {
  errors: string[];
  valid: boolean;
} {
  const errors: string[] = [];
  const certificate = result.certificate;
  if (!certificate) errors.push('missingCertificate');
  if (certificate && certificate.queryId !== result.queryId)
    errors.push('queryIdMismatch');
  if (certificate && certificate.rootStateKey !== result.rootStateKey)
    errors.push('rootStateKeyMismatch');
  if (
    certificate &&
    (result.bounds.lower !== certificate.outcome ||
      result.bounds.upper !== certificate.outcome)
  )
    errors.push('outcomeMismatch');
  if (
    certificate &&
    !certificate.stateOutcomes.some(
      (entry) =>
        entry.stateKey === result.rootStateKey &&
        entry.outcome === certificate.outcome,
    )
  )
    errors.push('missingRootRecord');
  if (certificate) {
    const config = withRuleDefaults(configInput);
    const records = new Map(
      certificate.stateOutcomes.map((record) => [record.stateKey, record]),
    );
    if (records.size !== certificate.stateOutcomes.length)
      errors.push('duplicateStateRecord');

    for (const record of certificate.stateOutcomes) {
      if (wdlProofStateKeyV1(record.state, config) !== record.stateKey) {
        errors.push(`stateKeyReplayMismatch:${record.stateKey}`);
        continue;
      }
      const terminal = terminalOutcome(record.state);
      if (terminal) {
        if (terminal !== record.outcome)
          errors.push(`terminalOutcomeMismatch:${record.stateKey}`);
        continue;
      }
      const legal = new Set(
        getLegalActions(record.state, config).map((action) =>
          actionKey(action),
        ),
      );
      const actionOutcomes: WdlValueV1[] = [];
      for (const edge of record.edges) {
        const key = actionKey(edge.action);
        if (!legal.has(key)) {
          errors.push(`illegalCertificateAction:${record.stateKey}:${key}`);
          continue;
        }
        const next = advanceGeneratedEngineState(
          record.state,
          edge.action,
          config,
        );
        if (wdlProofStateKeyV1(next, config) !== edge.childKey)
          errors.push(`childReplayMismatch:${record.stateKey}:${key}`);
        if (
          (next.currentPlayer !== record.state.currentPlayer) !==
          edge.controlChanged
        )
          errors.push(`controlChangeMismatch:${record.stateKey}:${key}`);
        const child = records.get(edge.childKey);
        if (child) {
          actionOutcomes.push(
            edge.controlChanged ? invert(child.outcome) : child.outcome,
          );
        }
      }
      if (record.outcome === 'win' && !actionOutcomes.includes('win'))
        errors.push(`missingWinWitness:${record.stateKey}`);
      if (
        record.outcome === 'loss' &&
        (actionOutcomes.length !== record.edges.length ||
          !actionOutcomes.every((outcome) => outcome === 'loss'))
      )
        errors.push(`lossNotExhaustive:${record.stateKey}`);
      if (
        record.outcome === 'draw' &&
        (actionOutcomes.includes('win') || !actionOutcomes.includes('draw'))
      )
        errors.push(`drawNotSupported:${record.stateKey}`);
    }
  }
  return { errors, valid: errors.length === 0 };
}
