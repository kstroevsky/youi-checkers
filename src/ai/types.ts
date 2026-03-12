import type { EngineState, RuleConfig, TurnAction } from '@/domain';
import type { AiDifficulty, MatchSettings } from '@/shared/types/session';

export type AiStrategicIntent = 'home' | 'sixStack' | 'hybrid';
export type AiStrategicTag =
  | 'advanceMass'
  | 'captureControl'
  | 'decompress'
  | 'freezeBlock'
  | 'frontBuild'
  | 'openLane'
  | 'rescue';

/** Search-budget tuning for one exposed difficulty level. */
export type AiDifficultyPreset = {
  maxDepth: number;
  policyPriorWeight: number;
  quietMoveLimit: number;
  repetitionPenalty: number;
  rootCandidateLimit: number;
  selfUndoPenalty: number;
  timeBudgetMs: number;
  varietyTemperature: number;
  varietyThreshold: number;
  varietyTopCount: number;
};

export type AiFallbackKind =
  | 'none'
  | 'partialCurrentDepth'
  | 'previousDepth'
  | 'legalOrder';

/** Inputs accepted by the pure search entrypoint. */
export type ChooseComputerActionRequest = {
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
  forced: boolean;
  intentDelta: number;
  isForced: boolean;
  isRepetition: boolean;
  isSelfUndo: boolean;
  isTactical: boolean;
  policyPrior: number;
  score: number;
  tags: AiStrategicTag[];
};

export type AiSearchDiagnostics = {
  aspirationResearches: number;
  betaCutoffs: number;
  policyPriorHits: number;
  pvsResearches: number;
  quiescenceNodes: number;
  repetitionPenalties: number;
  selfUndoPenalties: number;
  transpositionHits: number;
};

/** Final decision metadata returned by the search. */
export type AiSearchResult = {
  action: TurnAction | null;
  completedDepth: number;
  completedRootMoves: number;
  diagnostics: AiSearchDiagnostics;
  elapsedMs: number;
  evaluatedNodes: number;
  fallbackKind: AiFallbackKind;
  principalVariation: TurnAction[];
  rootCandidates: AiRootCandidate[];
  score: number;
  strategicIntent: AiStrategicIntent;
  timedOut: boolean;
};

/** Message sent from the store to the worker. */
export type AiWorkerRequest = {
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
