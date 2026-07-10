import type { EngineState, Player, RuleConfig, TurnAction } from '@/domain';
import type {
  GameFormat,
  MatchParticipant,
  SeriesGameResult,
} from '@/shared/types/session';

export type { MatchParticipant } from '@/shared/types/session';

export const MULTIPLAYER_PROTOCOL_VERSION = 1 as const;
export const MAX_INCREMENTAL_COMMANDS = 32;
export type MatchLifecycle = 'waiting' | 'active' | 'completed';

export type OnlineSeriesState = {
  colorChooser: MatchParticipant | null;
  colors: Record<MatchParticipant, Player>;
  finishingParticipant: MatchParticipant | null;
  firstVictory: EngineState['victory'] | null;
  firstWinner: MatchParticipant | null;
  gameNumber: number;
  gameWins: Record<MatchParticipant, number>;
  lastGame: SeriesGameResult | null;
  pendingPoints: number;
  phase: 'playing' | 'finishing' | 'betweenGames' | 'matchOver';
  points: Record<MatchParticipant, number>;
  targetPoints: number;
};

/** History-free deterministic state shared by the browser and MatchRoom. */
export type AuthoritativeMatchState = {
  engine: EngineState;
  format: GameFormat;
  rules: RuleConfig;
  series: OnlineSeriesState | null;
};

export type MatchCommand =
  | { type: 'submitAction'; action: TurnAction }
  | { type: 'chooseNextColor'; color: Player }
  | { type: 'startNextGame' };

export type MatchCommandEnvelope = {
  baseRevision: number;
  command: MatchCommand;
  commandId: string;
  predictedStateHash: string;
  previousStateHash: string;
};

export type CommittedMatchCommand = {
  actor: MatchParticipant;
  command: MatchCommand;
  commandId: string;
  revision: number;
  stateHash: string;
};

export type MatchSnapshot = {
  revision: number;
  state: AuthoritativeMatchState;
  stateHash: string;
};

export type ClientMessage =
  | {
      type: 'hello';
      protocol: typeof MULTIPLAYER_PROTOCOL_VERSION;
      revision: number;
      stateHash: string | null;
    }
  | { type: 'submit'; envelope: MatchCommandEnvelope }
  | { type: 'resync'; revision: number; stateHash: string | null }
  | { type: 'peerSignal'; signal: unknown };

export type ServerMessage =
  | {
      type: 'ready';
      participant: MatchParticipant;
      lifecycle: MatchLifecycle;
      revision: number;
      stateHash: string;
    }
  | { type: 'snapshot'; snapshot: MatchSnapshot }
  | { type: 'commands'; commands: CommittedMatchCommand[] }
  | { type: 'committed'; commit: CommittedMatchCommand }
  | {
      type: 'rejected';
      commandId: string;
      reason:
        | 'invalidCommand'
        | 'matchNotReady'
        | 'notYourTurn'
        | 'revisionConflict'
        | 'stateMismatch'
        | 'matchComplete';
      revision: number;
      stateHash: string;
    }
  | { type: 'peerSignal'; signal: unknown }
  | { type: 'peerPresence'; connected: boolean };

export type CreateMatchRequest = {
  format: GameFormat;
  rules: RuleConfig;
  targetPoints: number;
};

export type CreateMatchResponse = {
  matchId: string;
  participant: MatchParticipant;
  capability: string;
  inviteCapability: string;
};

export type CreateSessionRequest = {
  capability: string;
};

export type CreateSessionResponse = {
  matchId: string;
  participant: MatchParticipant;
};

export type MatchApplyResult = {
  repetitionReset: boolean;
  state: AuthoritativeMatchState;
  updatedPositionHash: string | null;
};
