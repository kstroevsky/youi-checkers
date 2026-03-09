import { createEmptyBoard } from '@/domain/model/board';
import { allCoords } from '@/domain/model/coordinates';
import { hashPosition } from '@/domain/model/hash';
import { withRuleDefaults } from '@/domain/model/ruleConfig';
import type {
  Board,
  Checker,
  Coord,
  GameState,
  Player,
  RuleConfig,
  StateSnapshot,
  TurnAction,
  TurnRecord,
  Victory,
} from '@/domain/model/types';
import { validateGameState } from '@/domain/validators/stateValidators';
import type { AppPreferences, SerializableSession } from '@/shared/types/session';
import { isRecord } from '@/shared/utils/collections';

function assertPlayer(value: unknown, label: string): Player {
  if (value !== 'white' && value !== 'black') {
    throw new Error(`Invalid ${label}.`);
  }

  return value;
}

function assertCoord(value: unknown, label: string): Coord {
  if (typeof value !== 'string' || !allCoords().includes(value as Coord)) {
    throw new Error(`Invalid ${label}.`);
  }

  return value as Coord;
}

function assertVictory(value: unknown): Victory {
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new Error('Invalid victory state.');
  }

  switch (value.type) {
    case 'none':
    case 'threefoldDraw':
    case 'stalemateDraw':
      return { type: value.type };
    case 'homeField':
    case 'sixStacks':
      return {
        type: value.type,
        winner: assertPlayer(value.winner, 'victory winner'),
      };
    default:
      throw new Error('Unsupported victory state.');
  }
}

function assertRuleConfig(value: unknown): RuleConfig {
  if (!isRecord(value)) {
    throw new Error('Invalid rule config.');
  }

  return withRuleDefaults({
    allowNonAdjacentFriendlyStackTransfer:
      typeof value.allowNonAdjacentFriendlyStackTransfer === 'boolean'
        ? value.allowNonAdjacentFriendlyStackTransfer
        : undefined,
    drawRule:
      value.drawRule === 'none' || value.drawRule === 'threefold'
        ? value.drawRule
        : undefined,
    scoringMode:
      value.scoringMode === 'off' || value.scoringMode === 'basic'
        ? value.scoringMode
        : undefined,
  });
}

function assertPreferences(value: unknown): AppPreferences {
  if (!isRecord(value)) {
    throw new Error('Invalid preferences.');
  }

  const legacyLanguageMode =
    value.languageMode === 'english' ||
    value.languageMode === 'russian' ||
    value.languageMode === 'bilingual'
      ? value.languageMode
      : null;

  return {
    passDeviceOverlayEnabled:
      typeof value.passDeviceOverlayEnabled === 'boolean'
        ? value.passDeviceOverlayEnabled
        : true,
    language:
      value.language === 'english' || value.language === 'russian'
        ? value.language
        : legacyLanguageMode === 'english'
          ? 'english'
          : 'russian',
  };
}

function assertChecker(value: unknown): Checker {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.frozen !== 'boolean') {
    throw new Error('Invalid checker.');
  }

  return {
    id: value.id,
    owner: assertPlayer(value.owner, 'checker owner'),
    frozen: value.frozen,
  };
}

function assertBoard(value: unknown): Board {
  if (!isRecord(value)) {
    throw new Error('Invalid board.');
  }

  const board = createEmptyBoard();

  for (const coord of allCoords()) {
    const rawCell = value[coord];

    if (!isRecord(rawCell) || !Array.isArray(rawCell.checkers)) {
      throw new Error(`Invalid cell at ${coord}.`);
    }

    board[coord] = {
      checkers: rawCell.checkers.map(assertChecker),
    };
  }

  return board;
}

function assertAction(value: unknown): TurnAction {
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new Error('Invalid action.');
  }

  switch (value.type) {
    case 'manualUnfreeze':
      return {
        type: 'manualUnfreeze',
        coord: assertCoord(value.coord, 'manualUnfreeze.coord'),
      };
    case 'jumpSequence':
      if (!Array.isArray(value.path)) {
        throw new Error('Invalid jump path.');
      }

      return {
        type: 'jumpSequence',
        source: assertCoord(value.source, 'jumpSequence.source'),
        path: value.path.map((entry, index) => assertCoord(entry, `jumpSequence.path[${index}]`)),
      };
    case 'climbOne':
    case 'splitOneFromStack':
    case 'splitTwoFromStack':
    case 'friendlyStackTransfer':
      return {
        type: value.type,
        source: assertCoord(value.source, `${value.type}.source`),
        target: assertCoord(value.target, `${value.type}.target`),
      };
    default:
      throw new Error('Unsupported action type.');
  }
}

function assertStateSnapshot(value: unknown): StateSnapshot {
  if (!isRecord(value)) {
    throw new Error('Invalid state snapshot.');
  }

  return {
    board: assertBoard(value.board),
    currentPlayer: assertPlayer(value.currentPlayer, 'snapshot currentPlayer'),
    moveNumber:
      typeof value.moveNumber === 'number' && Number.isInteger(value.moveNumber) && value.moveNumber > 0
        ? value.moveNumber
        : 1,
    status: value.status === 'active' || value.status === 'gameOver' ? value.status : 'active',
    victory: assertVictory(value.victory),
  };
}

function assertTurnRecord(value: unknown): TurnRecord {
  if (!isRecord(value) || !Array.isArray(value.autoPasses)) {
    throw new Error('Invalid turn record.');
  }

  return {
    actor: assertPlayer(value.actor, 'turn record actor'),
    action: assertAction(value.action),
    beforeState: assertStateSnapshot(value.beforeState),
    afterState: assertStateSnapshot(value.afterState),
    autoPasses: value.autoPasses.map((entry, index) => assertPlayer(entry, `autoPasses[${index}]`)),
    victoryAfter: assertVictory(value.victoryAfter),
    positionHash: typeof value.positionHash === 'string' ? value.positionHash : '',
  };
}

function assertPositionCounts(value: unknown): Record<string, number> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, number>>((counts, [key, entry]) => {
    if (typeof entry === 'number' && Number.isFinite(entry)) {
      counts[key] = entry;
    }
    return counts;
  }, {});
}

function incrementPositionCount(
  counts: Record<string, number>,
  state: Pick<StateSnapshot, 'board' | 'currentPlayer'>,
): void {
  const positionHash = hashPosition(state);
  counts[positionHash] = (counts[positionHash] ?? 0) + 1;
}

function normalizeGameState(gameState: GameState): GameState {
  const history = gameState.history.map((record) => ({
    ...record,
    positionHash: hashPosition(record.afterState),
  }));
  const positionCounts: Record<string, number> = {};

  if (history.length) {
    incrementPositionCount(positionCounts, history[0].beforeState);

    for (const record of history) {
      incrementPositionCount(positionCounts, record.afterState);
    }
  } else {
    incrementPositionCount(positionCounts, gameState);
  }

  return {
    ...gameState,
    history,
    positionCounts,
  };
}

function assertGameState(value: unknown): GameState {
  if (!isRecord(value) || !Array.isArray(value.history)) {
    throw new Error('Invalid game state.');
  }

  const gameState = normalizeGameState({
    ...assertStateSnapshot(value),
    history: value.history.map(assertTurnRecord),
    positionCounts: assertPositionCounts(value.positionCounts),
  });
  const validation = validateGameState(gameState);

  if (!validation.valid) {
    throw new Error(validation.reason);
  }

  return gameState;
}

function assertGameStates(value: unknown): GameState[] {
  if (!Array.isArray(value)) {
    throw new Error('Expected game states array.');
  }

  return value.map(assertGameState);
}

export function serializeSession(session: SerializableSession): string {
  return JSON.stringify(session, null, 2);
}

export function deserializeSession(serialized: string): SerializableSession {
  const parsed = JSON.parse(serialized) as unknown;

  if (!isRecord(parsed) || parsed.version !== 1) {
    throw new Error('Unsupported session payload.');
  }

  return {
    version: 1,
    ruleConfig: assertRuleConfig(parsed.ruleConfig),
    preferences: assertPreferences(parsed.preferences),
    present: assertGameState(parsed.present),
    past: assertGameStates(parsed.past),
    future: assertGameStates(parsed.future),
  };
}
