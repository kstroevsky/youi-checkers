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
  /** Maximum root-score regret that style selection may spend. */
  maxSelectionRegret: number;
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

/**
 * Measurement-only switches for reconstructing historical search semantics.
 * Product callers must omit this field; default false preserves production play.
 */
export type AiSearchDiagnosticAblation = {
  behaviorEvaluation?: boolean;
  behaviorOrdering?: boolean;
  noveltyOrdering?: boolean;
  participationEvaluation?: boolean;
  participationEvaluationScale?: number;
  participationOrdering?: boolean;
  rootParticipationScale?: number;
};

/** Inputs accepted by the pure search entrypoint. */
export type ChooseComputerActionRequest = {
  behaviorProfile?: AiBehaviorProfile | null;
  /** Measurement-only reconstruction of removed search signals. */
  diagnosticAblation?: AiSearchDiagnosticAblation | null;
  /** Measurement-only override for how many searched root scores are returned. */
  diagnosticRootCandidateLimit?: number;
  difficulty: AiDifficulty;
  modelGuidance?: AiModelGuidance | null;
  now?: () => number;
  previousStrategicIntent?: AiStrategicIntent | null;
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

/** Terminal outcome of a candidate, always expressed from the acting player's perspective. */
export type AiTerminalUtility =
  | 'win'
  | 'loss'
  | 'favorableDraw'
  | 'neutralDraw'
  | 'unfavorableDraw'
  | null;

/** Actor-aware branching counts around one candidate transition. */
export type AiMobilityTransition = {
  /** Legal actions available to the actor before the candidate. */
  actorBefore: number;
  /** Actor actions after a same-player continuation, when measured. */
  actorContinuationAfter: number | null;
  /** Opponent replies after a turn pass, when measured. */
  opponentReplyAfter: number | null;
  /** Whether the active post-transition player's branching count was measured. */
  measuredAfter: boolean;
  samePlayerContinuation: boolean;
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
  isTerminal: boolean;
  mobility: AiMobilityTransition;
  /** Same-actor continuation delta. Zero when the candidate passes the turn. */
  mobilityDelta: number;
  movedMass: number;
  participationDelta: number;
  policyPrior: number;
  repeatedPositionCount: number;
  score: number;
  sixStackDelta: number;
  sourceFamily: string;
  tags: AiStrategicTag[];
  terminalUtility: AiTerminalUtility;
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
  /** Candidate transitions simulated while preparing the root action set. */
  rootPreparationTransitions: number;
  selfUndoPenalties: number;
  sourceFamilyCollisions: number;
  stagnationRiskTriggers: number;
  transpositionHits: number;
};

/** Final decision metadata returned by the search. */
export type AiSearchResult = {
  action: TurnAction | null;
  behaviorProfileId: AiBehaviorProfileId | null;
  /** Highest-scoring action before bounded variety/persona selection. */
  bestSearchAction: TurnAction | null;
  /** Score owned by bestSearchAction. */
  bestSearchScore: number;
  /** Complete after-win action line. Present only when finishing search reaches victory. */
  completionPlan?: TurnAction[];
  completedDepth: number;
  /** Root actions evaluated at completedDepth; never overwritten by partial work. */
  completedRootMoves: number;
  diagnostics: AiSearchDiagnostics;
  elapsedMs: number;
  evaluatedNodes: number;
  fallbackKind: AiFallbackKind;
  /** Interrupted iterative-deepening depth, when at least one root action completed. */
  partialDepth: number | null;
  partialRootMoves: number;
  principalVariation: TurnAction[];
  riskMode: AiRiskMode;
  rootCandidates: AiRootCandidate[];
  /** Exact resource contract exercised by this decision. */
  searchBudget?: AiSearchBudgetReport;
  /** Backward-compatible alias for selectedActionScore. */
  score: number;
  /** Score owned by action, after the final candidate selection. */
  selectedActionScore: number;
  /** Non-negative score sacrificed by bounded variety/persona selection. */
  selectionRegret: number;
  strategicIntent: AiStrategicIntent;
  timedOut: boolean;
};

/** Message sent from the store to the worker. */
export type AiWorkerRequest = {
  behaviorProfile: AiBehaviorProfile | null;
  matchSettings: MatchSettings;
  requestId: number;
  previousStrategicIntent: AiStrategicIntent | null;
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
