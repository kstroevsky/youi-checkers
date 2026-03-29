import type { OrderedAction } from '@/ai/moveOrdering';
import type { SearchPerfCache } from '@/ai/perf';
import type { ParticipationState } from '@/ai/participation';
import type {
  AiDifficultyPreset,
  AiRiskMode,
  AiSearchDiagnostics,
  AiStrategicIntent,
  AiStrategicTag,
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
  | 'mobilityDelta'
  | 'movedMass'
  | 'participationDelta'
  | 'policyPrior'
  | 'repeatedPositionCount'
  | 'sixStackDelta'
  | 'sourceFamily'
  | 'tags'
  | 'tiebreakEdgeKind'
> & {
  score: number;
};

export type SearchContext = {
  behaviorProfile: AiBehaviorProfile | null;
  continuationScores: Map<string, number>;
  deadline: number;
  diagnostics: AiSearchDiagnostics;
  evaluatedNodes: number;
  historyScores: Map<string, number>;
  killerMovesByDepth: Map<number, TurnAction[]>;
  now: () => number;
  perfCache: SearchPerfCache;
  preset: AiDifficultyPreset;
  policyPriors: Record<string, number> | null;
  pvMoveByDepth: Map<number, TurnAction>;
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
};
