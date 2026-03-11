import type { EngineState, RuleConfig, TurnAction } from '@/domain';
import type { AiDifficulty, MatchSettings } from '@/shared/types/session';

/** Search-budget tuning for one exposed difficulty level. */
export type AiDifficultyPreset = {
  maxDepth: number;
  pickTopCount: number;
  randomThreshold: number;
  quietMoveLimit: number;
  timeBudgetMs: number;
};

/** Inputs accepted by the pure search entrypoint. */
export type ChooseComputerActionRequest = {
  difficulty: AiDifficulty;
  now?: () => number;
  random?: () => number;
  ruleConfig: RuleConfig;
  state: EngineState;
};

/** Final decision metadata returned by the search. */
export type AiSearchResult = {
  action: TurnAction | null;
  completedDepth: number;
  elapsedMs: number;
  evaluatedNodes: number;
  score: number;
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
