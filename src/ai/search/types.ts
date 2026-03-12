import type { OrderedAction } from '@/ai/moveOrdering';
import type {
  AiDifficultyPreset,
  AiSearchDiagnostics,
  AiStrategicIntent,
  AiStrategicTag,
} from '@/ai/types';
import type { RuleConfig, TurnAction } from '@/domain';

export type BoundFlag = 'exact' | 'lower' | 'upper';

export type TranspositionEntry = {
  bestAction: TurnAction | null;
  depth: number;
  flag: BoundFlag;
  score: number;
};

export type RootRankedAction = Pick<
  OrderedAction,
  | 'action'
  | 'intent'
  | 'intentDelta'
  | 'isForced'
  | 'isRepetition'
  | 'isSelfUndo'
  | 'isTactical'
  | 'policyPrior'
  | 'tags'
> & {
  score: number;
};

export type SearchContext = {
  continuationScores: Map<string, number>;
  deadline: number;
  diagnostics: AiSearchDiagnostics;
  evaluatedNodes: number;
  historyScores: Map<string, number>;
  killerMovesByDepth: Map<number, TurnAction[]>;
  now: () => number;
  preset: AiDifficultyPreset;
  policyPriors: Record<string, number> | null;
  pvMoveByDepth: Map<number, TurnAction>;
  rootPreviousOwnAction: TurnAction | null;
  rootPreviousStrategicTags: AiStrategicTag[] | null;
  rootStrategicIntent: AiStrategicIntent;
  quiescenceDepthLimit: number;
  rootSelfUndoPositionKey: string | null;
  ruleConfig: RuleConfig;
  table: Map<string, TranspositionEntry>;
};
