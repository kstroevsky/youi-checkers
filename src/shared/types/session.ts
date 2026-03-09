import type { ActionKind, Coord, GameState, Player, RuleConfig } from '@/domain/model/types';

export type LanguageMode = 'english' | 'russian' | 'bilingual';

export type AppPreferences = {
  passDeviceOverlayEnabled: boolean;
  languageMode: LanguageMode;
};

export type InteractionState =
  | { type: 'idle' }
  | { type: 'pieceSelected'; source: Coord; availableActions: ActionKind[] }
  | { type: 'actionTypeSelected'; source: Coord; actionType: ActionKind; availableTargets: Coord[] }
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

export type SerializableSession = {
  version: 1;
  ruleConfig: RuleConfig;
  preferences: AppPreferences;
  present: GameState;
  past: GameState[];
  future: GameState[];
};
