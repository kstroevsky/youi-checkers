import { createEmptyBoard } from '@/domain/model/board';
import { hashPosition } from '@/domain/model/hash';
import { withRuleDefaults } from '@/domain/model/ruleConfig';
import type {
  Board,
  Checker,
  Coord,
  GameState,
  Player,
  RuleConfig,
} from '@/domain/model/types';
import type { AppPreferences, SerializableSession } from '@/shared/types/session';

let checkerIndex = 1;

function nextId(owner: Player): string {
  const id = `${owner}-${String(checkerIndex).padStart(3, '0')}`;
  checkerIndex += 1;
  return id;
}

export function resetFactoryIds(): void {
  checkerIndex = 1;
}

export function checker(owner: Player, frozen = false, id = nextId(owner)): Checker {
  return { id, owner, frozen };
}

export function boardWithPieces(pieces: Partial<Record<Coord, Checker[]>>): Board {
  const board = createEmptyBoard();

  for (const [coord, checkers] of Object.entries(pieces) as [Coord, Checker[]][]) {
    board[coord].checkers = checkers.map((entry) => ({ ...entry }));
  }

  return board;
}

export function gameStateWithBoard(
  board: Board,
  overrides: Partial<GameState> = {},
): GameState {
  const seed: GameState = {
    board,
    currentPlayer: 'white',
    moveNumber: 1,
    status: 'active',
    victory: { type: 'none' },
    history: [],
    positionCounts: {},
  };
  const state = {
    ...seed,
    ...overrides,
  };
  const positionHash = hashPosition(state);

  return {
    ...state,
    positionCounts:
      overrides.positionCounts ??
      {
        [positionHash]: 1,
      },
  };
}

export function createSession(
  present: GameState,
  overrides: Partial<SerializableSession> = {},
): SerializableSession {
  const ruleConfig = overrides.ruleConfig ?? withRuleDefaults();
  const preferences: AppPreferences =
    overrides.preferences ?? {
      passDeviceOverlayEnabled: true,
      language: 'russian',
    };

  return {
    version: 1,
    ruleConfig,
    preferences,
    present,
    past: overrides.past ?? [],
    future: overrides.future ?? [],
  };
}

export function withConfig(overrides: Partial<RuleConfig> = {}): RuleConfig {
  return withRuleDefaults(overrides);
}
