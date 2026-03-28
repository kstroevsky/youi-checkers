import type { EngineState, RuleConfig, TurnAction } from '@/domain';
import type { AiDifficulty, MatchSettings } from '@/shared/types/session';
import type { AiBehaviorProfile, AiBehaviorProfileId } from '@/shared/types/session';

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

/** Inputs accepted by the pure search entrypoint. */
export type ChooseComputerActionRequest = {
  behaviorProfile?: AiBehaviorProfile | null;
  difficulty: AiDifficulty;
  modelGuidance?: AiModelGuidance | null;
  now?: () => number;
  random?: () => number;
  ruleConfig: RuleConfig;
  state: EngineState;
};

export type AiModelGuidance = {
  actionPriors: Record<string, number>;
  source: 'none' | 'onnx';
  strategicIntent: AiStrategicIntent | null;
  valueEstimate: number | null;
};

export type AiRootCandidate = {
  action: TurnAction;
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
};

export type AiSearchDiagnostics = {
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
  completedDepth: number;
  completedRootMoves: number;
  diagnostics: AiSearchDiagnostics;
  elapsedMs: number;
  evaluatedNodes: number;
  fallbackKind: AiFallbackKind;
  principalVariation: TurnAction[];
  riskMode: AiRiskMode;
  rootCandidates: AiRootCandidate[];
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
