import type {
  ActionKind,
  Coord,
  GameState,
  Player,
  RuleConfig,
  StateSnapshot,
  TurnRecord,
} from '@/domain/model/types';
import type { Language } from '@/shared/i18n/types';

export type AppPreferences = {
  passDeviceOverlayEnabled: boolean;
  language: Language;
};

export type OpponentMode = 'hotSeat' | 'computer';
export type AiDifficulty = 'easy' | 'medium' | 'hard';

export type MatchSettings = {
  opponentMode: OpponentMode;
  humanPlayer: Player;
  aiDifficulty: AiDifficulty;
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
  | { type: 'buildingJumpChain'; source: Coord; path: Coord[]; availableTargets: Coord[] }
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

export type SerializableSession = SerializableSessionV3;

export type DeserializedSession = SerializableSessionV1 | SerializableSessionV2 | SerializableSessionV3;
