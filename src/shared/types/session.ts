import type {
  ActionKind,
  Coord,
  GameState,
  Player,
  RuleConfig,
  StateSnapshot,
  TurnRecord,
  Victory,
} from '@/domain/model/types';
import type { Language } from '@/shared/i18n/types';

export type AppPreferences = {
  passDeviceOverlayEnabled: boolean;
  language: Language;
};

export type AiBehaviorProfileId = 'expander' | 'hunter' | 'builder';

export type AiBehaviorProfile = {
  id: AiBehaviorProfileId;
  seed: string;
};

export type OpponentMode = 'hotSeat' | 'computer';
export type AiDifficulty = 'easy' | 'medium' | 'hard';
export type GameFormat = 'single' | 'series';
export type MatchParticipant = 'first' | 'second';

export type MatchSettings = {
  opponentMode: OpponentMode;
  humanPlayer: Player;
  aiDifficulty: AiDifficulty;
  gameFormat: GameFormat;
  targetPoints: number;
};

export type SeriesGameResult =
  | {
      outcome: 'draw';
      victory: Extract<Victory, { type: 'threefoldDraw' | 'stalemateDraw' }>;
    }
  | {
      outcome: 'win';
      pointsAwarded: number;
      victory: Exclude<
        Victory,
        { type: 'none' | 'threefoldDraw' | 'stalemateDraw' }
      >;
      winner: MatchParticipant;
    };

export type SeriesState = {
  colorChooser: MatchParticipant | null;
  colors: Record<MatchParticipant, Player>;
  finishingParticipant: MatchParticipant | null;
  firstVictory: Victory | null;
  firstWinner: MatchParticipant | null;
  gameNumber: number;
  gameOneCheckpoint: UndoFrame | null;
  gameWins: Record<MatchParticipant, number>;
  lastGame: SeriesGameResult | null;
  pendingPoints: number;
  phase: 'playing' | 'finishing' | 'betweenGames' | 'matchOver';
  points: Record<MatchParticipant, number>;
  targetPoints: number;
};

export type InteractionState =
  | { type: 'idle' }
  | { type: 'pieceSelected'; source: Coord; availableActions: ActionKind[] }
  | { type: 'jumpFollowUp'; source: Coord; availableTargets: Coord[] }
  | {
      type: 'choosingTarget';
      source: Coord;
      actionType: Exclude<ActionKind, 'jumpSequence' | 'manualUnfreeze'>;
      availableTargets: Coord[];
    }
  | {
      type: 'buildingJumpChain';
      source: Coord;
      path: Coord[];
      availableTargets: Coord[];
    }
  | { type: 'turnResolved'; nextPlayer: Player }
  | { type: 'passingDevice'; nextPlayer: Player }
  | { type: 'gameOver' };

export type UndoFrame = {
  snapshot: StateSnapshot;
  positionCounts: Record<string, number>;
  historyCursor: number;
};

export type SerializableSessionV1 = {
  version: 1;
  ruleConfig: RuleConfig;
  preferences: AppPreferences;
  present: GameState;
  past: GameState[];
  future: GameState[];
};

export type SerializableSessionV2 = {
  version: 2;
  ruleConfig: RuleConfig;
  preferences: AppPreferences;
  turnLog: TurnRecord[];
  present: UndoFrame;
  past: UndoFrame[];
  future: UndoFrame[];
};

export type SerializableSessionV3 = {
  version: 3;
  ruleConfig: RuleConfig;
  preferences: AppPreferences;
  matchSettings: MatchSettings;
  turnLog: TurnRecord[];
  present: UndoFrame;
  past: UndoFrame[];
  future: UndoFrame[];
};

export type SerializableSessionV4 = {
  version: 4;
  ruleConfig: RuleConfig;
  preferences: AppPreferences;
  matchSettings: MatchSettings;
  aiBehaviorProfile: AiBehaviorProfile | null;
  turnLog: TurnRecord[];
  present: UndoFrame;
  past: UndoFrame[];
  future: UndoFrame[];
};

export type SerializableSessionV5 = {
  version: 5;
  ruleConfig: RuleConfig;
  preferences: AppPreferences;
  matchSettings: MatchSettings;
  aiBehaviorProfile: AiBehaviorProfile | null;
  seriesState: SeriesState | null;
  turnLog: TurnRecord[];
  present: UndoFrame;
  past: UndoFrame[];
  future: UndoFrame[];
};

export type SerializableSession = SerializableSessionV5;

export type DeserializedSession =
  | SerializableSessionV1
  | SerializableSessionV2
  | SerializableSessionV3
  | SerializableSessionV4
  | SerializableSessionV5;
