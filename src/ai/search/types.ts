import type { OrderedAction } from '@/ai/moveOrdering';
import type { SearchPerfCache } from '@/ai/perf';
import type { ParticipationState } from '@/ai/participation';
import type {
  AiDifficultyPreset,
  AiRiskMode,
  AiSearchDiagnostics,
  AiSearchDiagnosticAblation,
  AiStrategicIntent,
  AiStrategicTag,
  AiTranspositionMode,
} from '@/ai/types';
import type { Player, RuleConfig, TurnAction } from '@/domain';
import type { AiBehaviorProfile } from '@/shared/types/session';

export type BoundFlag = 'exact' | 'lower' | 'upper';

export type TranspositionEntry = {
  bestAction: TurnAction | null;
  depth: number;
  flag: BoundFlag;
  score: number;
};

export type SearchLineEntry = {
  action: TurnAction;
  actor: Player;
  positionKey: string;
};

/**
 * Fixed-capacity search stack that avoids Array.prototype.push/pop mutations.
 *
 * Using a fixed-capacity backing array with an explicit depth cursor keeps the
 * array's `length` property stable throughout the search. `new Array(capacity)`
 * is holey in V8, so no packed-elements guarantee is assumed; per-edge
 * SearchLineEntry objects are still allocated.
 */
export type SearchStack = {
  /** Fixed-capacity backing store. Only indices [0, depth) hold valid entries. */
  entries: (SearchLineEntry | undefined)[];
  /** Logical stack depth / cursor.  Mutated in place by push/pop callers. */
  depth: number;
};

export type RootRankedAction = Pick<
  OrderedAction,
  | 'action'
  | 'drawTrapRisk'
  | 'emptyCellsDelta'
  | 'freezeSwingBonus'
  | 'homeFieldDelta'
  | 'intent'
  | 'intentDelta'
  | 'isForced'
  | 'isRepetition'
  | 'isSelfUndo'
  | 'isTactical'
  | 'isTerminal'
  | 'mobility'
  | 'mobilityDelta'
  | 'movedMass'
  | 'participationDelta'
  | 'policyPrior'
  | 'repeatedPositionCount'
  | 'sixStackDelta'
  | 'sourceFamily'
  | 'tags'
  | 'terminalUtility'
  | 'tiebreakEdgeKind'
> & {
  score: number;
};

export type SearchContext = {
  behaviorProfile: AiBehaviorProfile | null;
  budgetExhaustion: 'none' | 'nodes' | 'time';
  /** Keyed by (previousActionId * AI_MODEL_ACTION_COUNT + actionId). */
  continuationScores: Map<number, number>;
  deadline: number;
  diagnostics: AiSearchDiagnostics;
  diagnosticAblation: AiSearchDiagnosticAblation | null;
  evaluatedNodes: number;
  /** Fixed-size typed array; index is the numeric action ID (0..AI_MODEL_ACTION_COUNT-1). */
  historyScores: Int32Array;
  killerMovesByDepth: Map<number, number[]>;
  maxEvaluatedNodes: number | null;
  now: () => number;
  perfCache: SearchPerfCache;
  preset: AiDifficultyPreset;
  policyPriors: Float32Array | null;
  /** Maps search depth to the numeric action ID of the PV move at that depth. */
  pvMoveByDepth: Map<number, number>;
  riskMode: AiRiskMode;
  rootParticipationState: ParticipationState;
  rootPlayer: Player;
  rootPreviousOwnAction: TurnAction | null;
  rootPreviousStrategicTags: AiStrategicTag[] | null;
  rootStrategicIntent: AiStrategicIntent;
  quiescenceDepthLimit: number;
  rootSelfUndoPositionKey: string | null;
  ruleConfig: RuleConfig;
  table: Map<string, TranspositionEntry>;
  transpositionMode: AiTranspositionMode;
};
