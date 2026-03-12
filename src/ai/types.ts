import type { EngineState, RuleConfig, TurnAction } from '@/domain';
import type { AiDifficulty, MatchSettings } from '@/shared/types/session';

/** Search-budget tuning for one exposed difficulty level. */
export type AiDifficultyPreset = {
  maxDepth: number;
  quietMoveLimit: number;
  balancedTopCount: number;
  balancedThreshold: number;
  repetitionPenalty: number;
  selfUndoPenalty: number;
  rootCandidateLimit: number;
  timeBudgetMs: number;
};

export type AiFallbackKind =
  | 'none'
  | 'partialCurrentDepth'
  | 'previousDepth'
  | 'legalOrder';

/** Inputs accepted by the pure search entrypoint. */
export type ChooseComputerActionRequest = {
  difficulty: AiDifficulty;
  now?: () => number;
  random?: () => number;
  ruleConfig: RuleConfig;
  state: EngineState;
};

export type AiRootCandidate = {
  action: TurnAction;
  isForced: boolean;
  isRepetition: boolean;
  isSelfUndo: boolean;
  isTactical: boolean;
  score: number;
};

export type AiSearchDiagnostics = {
  betaCutoffs: number;
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
