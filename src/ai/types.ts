import type { EngineState, RuleConfig, TurnAction } from '@/domain';
import type { AiDifficulty, MatchSettings } from '@/shared/types/session';
import type {
  AiBehaviorProfile,
  AiBehaviorProfileId,
} from '@/shared/types/session';

export type AiStrategicIntent = 'home' | 'sixStack' | 'hybrid';
export type AiStrategicTag =
  | 'advanceMass'
  | 'captureControl'
  | 'decompress'
  | 'freezeBlock'
  | 'frontBuild'
  | 'openLane'
  | 'rescue';

export type AiRiskMode = 'normal' | 'stagnation' | 'late';
export type AiSearchMode = 'normal' | 'finishing';
export type AiTiebreakEdgeKind = 'ahead' | 'tied' | 'behind';

/** Search-budget tuning for one exposed difficulty level. */
export type AiDifficultyPreset = {
  drawAversionAhead: number;
  drawAversionBehindRelief: number;
  familyVarietyWeight: number;
  maxDepth: number;
  participationBias: number;
  participationWindow: number;
  policyPriorWeight: number;
  quietMoveLimit: number;
  repetitionPenalty: number;
  rootCandidateLimit: number;
  riskBandWidening: number;
  riskLoopPenalty: number;
  riskPolicyPriorScale: number;
  riskProgressBonus: number;
  riskTacticalBonus: number;
  sourceReusePenalty: number;
  stagnationDisplacementWeight: number;
  stagnationMobilityWeight: number;
  stagnationProgressWeight: number;
  stagnationRepetitionWeight: number;
  stagnationSelfUndoWeight: number;
  stagnationThreshold: number;
  selfUndoPenalty: number;
  timeBudgetMs: number;
  frontierWidthWeight: number;
  varietyTemperature: number;
  varietyThreshold: number;
  varietyTopCount: number;
};

export type AiFallbackKind =
  | 'none'
  | 'orderedRoot'
  | 'partialCurrentDepth'
  | 'previousDepth'
  | 'legalOrder';

/**
 * Optional normal-search controls used by deterministic measurement harnesses.
 *
 * Product callers omit this field and continue to use the selected difficulty's
 * wall-clock preset. Fixed-depth and fixed-node modes deliberately live at the
 * pure search boundary so reports can compare logic and equal work separately.
 */
export type AiSearchBudget =
  | {
      maxDepth?: number;
      timeBudgetMs: number;
      type: 'wallClock';
    }
  | {
      depth: number;
      type: 'fixedDepth';
    }
  | {
      maxDepth?: number;
      maxEvaluatedNodes: number;
      type: 'fixedNodes';
    };

export type AiSearchBudgetReport = {
  exhaustedBy: 'none' | 'nodes' | 'time';
  maxDepth: number;
  maxEvaluatedNodes: number | null;
  timeBudgetMs: number | null;
  type: 'presetTime' | AiSearchBudget['type'];
};

/** Inputs accepted by the pure search entrypoint. */
export type ChooseComputerActionRequest = {
  behaviorProfile?: AiBehaviorProfile | null;
  difficulty: AiDifficulty;
  modelGuidance?: AiModelGuidance | null;
  now?: () => number;
  random?: () => number;
  ruleConfig: RuleConfig;
  searchBudget?: AiSearchBudget;
  searchMode?: AiSearchMode;
  state: EngineState;
};

export type AiModelGuidance = {
  actionPriors: Float32Array;
  source: 'none' | 'onnx';
  strategicIntent: AiStrategicIntent | null;
  valueEstimate: number | null;
};

export type AiRootCandidate = {
  action: TurnAction;
  drawTrapRisk: number;
  emptyCellsDelta: number;
  forced: boolean;
  freezeSwingBonus: number;
  homeFieldDelta: number;
  intentDelta: number;
  isForced: boolean;
  isRepetition: boolean;
  isSelfUndo: boolean;
  isTactical: boolean;
  mobilityDelta: number;
  movedMass: number;
  participationDelta: number;
  policyPrior: number;
  repeatedPositionCount: number;
  score: number;
  sixStackDelta: number;
  sourceFamily: string;
  tags: AiStrategicTag[];
  tiebreakEdgeKind: AiTiebreakEdgeKind;
};

export type AiSearchDiagnostics = {
  adverseDrawTrapPenalties: number;
  aspirationResearches: number;
  betaCutoffs: number;
  drawAversionApplications: number;
  lateRiskTriggers: number;
  orderedFallbacks: number;
  participationPenalties: number;
  policyPriorHits: number;
  pvsResearches: number;
  quiescenceNodes: number;
  repetitionPenalties: number;
  selfUndoPenalties: number;
  sourceFamilyCollisions: number;
  stagnationRiskTriggers: number;
  transpositionHits: number;
};

/** Final decision metadata returned by the search. */
export type AiSearchResult = {
  action: TurnAction | null;
  behaviorProfileId: AiBehaviorProfileId | null;
  /** Complete after-win action line. Present only when finishing search reaches victory. */
  completionPlan?: TurnAction[];
  completedDepth: number;
  completedRootMoves: number;
  diagnostics: AiSearchDiagnostics;
  elapsedMs: number;
  evaluatedNodes: number;
  fallbackKind: AiFallbackKind;
  principalVariation: TurnAction[];
  riskMode: AiRiskMode;
  rootCandidates: AiRootCandidate[];
  /** Exact resource contract exercised by this decision. */
  searchBudget?: AiSearchBudgetReport;
  score: number;
  strategicIntent: AiStrategicIntent;
  timedOut: boolean;
};

/** Message sent from the store to the worker. */
export type AiWorkerRequest = {
  behaviorProfile: AiBehaviorProfile | null;
  matchSettings: MatchSettings;
  requestId: number;
  ruleConfig: RuleConfig;
  searchMode: AiSearchMode;
  state: EngineState;
  type: 'chooseMove';
};

/** Message returned from the worker to the store. */
export type AiWorkerResponse =
  | {
      requestId: number;
      result: AiSearchResult;
      type: 'result';
    }
  | {
      message: string;
      requestId: number;
      type: 'error';
    };
