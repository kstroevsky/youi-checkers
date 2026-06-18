import { createEmptyBoard } from '@/domain/model/board';
import { allCoords } from '@/domain/model/coordinates';
import { withRuleDefaults } from '@/domain/model/ruleConfig';
import type {
  Board,
  Checker,
  Coord,
  PendingJump,
  Player,
  RuleConfig,
  StateSnapshot,
  TurnAction,
  TurnRecord,
  Victory,
} from '@/domain/model/types';
import { DEFAULT_MATCH_SETTINGS } from '@/shared/constants/match';
import type {
  AiBehaviorProfile,
  AppPreferences,
  MatchParticipant,
  MatchSettings,
  SeriesState,
  UndoFrame,
} from '@/shared/types/session';
import { isRecord } from '@/shared/utils/collections';

const COORD_SET = new Set(allCoords());

/** Runtime guard that narrows unknown payload to a valid player token. */
export function assertPlayer(value: unknown, label: string): Player {
  if (value !== 'white' && value !== 'black') {
    throw new Error(`Invalid ${label}.`);
  }

  return value;
}

function assertPlayerCountRecord(
  value: unknown,
  label: string,
): Record<Player, number> {
  if (
    !isRecord(value) ||
    typeof value.white !== 'number' ||
    typeof value.black !== 'number'
  ) {
    throw new Error(`Invalid ${label}.`);
  }

  return {
    white: value.white,
    black: value.black,
  };
}

/** Runtime guard that validates coordinate values against board coordinates. */
export function assertCoord(value: unknown, label: string): Coord {
  if (typeof value !== 'string' || !COORD_SET.has(value as Coord)) {
    throw new Error(`Invalid ${label}.`);
  }

  return value as Coord;
}

/** Runtime guard for encoded post-jump follow-up state. */
export function assertPendingJump(value: unknown): PendingJump | null {
  if (value == null) {
    return null;
  }

  if (!isRecord(value)) {
    throw new Error('Invalid pending jump state.');
  }

  const jumpedCheckerIds = Array.isArray(value.jumpedCheckerIds)
    ? value.jumpedCheckerIds.filter(
        (entry): entry is string => typeof entry === 'string',
      )
    : [];
  const visitedCoords = Array.isArray(value.visitedCoords)
    ? value.visitedCoords.map((entry, index) =>
        assertCoord(entry, `pendingJump.visitedCoords[${index}]`),
      )
    : [];
  const visitedStateKeys = Array.isArray(value.visitedStateKeys)
    ? value.visitedStateKeys.filter(
        (entry): entry is string => typeof entry === 'string',
      )
    : [];

  const firstJumpedOwner: Player | undefined =
    value.firstJumpedOwner === 'white' || value.firstJumpedOwner === 'black'
      ? value.firstJumpedOwner
      : undefined;

  return {
    source: assertCoord(value.source, 'pendingJump.source'),
    jumpedCheckerIds,
    ...(firstJumpedOwner !== undefined ? { firstJumpedOwner } : {}),
    ...(visitedCoords.length ? { visitedCoords } : {}),
    ...(visitedStateKeys.length ? { visitedStateKeys } : {}),
  };
}

/** Runtime guard and normalizer for persisted victory payloads. */
export function assertVictory(value: unknown): Victory {
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new Error('Invalid victory state.');
  }

  switch (value.type) {
    case 'none':
    case 'threefoldDraw':
    case 'stalemateDraw':
      return { type: value.type };
    case 'threefoldTiebreakWin':
    case 'stalemateTiebreakWin': {
      if (value.decidedBy !== 'checkers' && value.decidedBy !== 'stacks') {
        throw new Error('Invalid victory decidedBy.');
      }

      return {
        type: value.type,
        winner: assertPlayer(value.winner, 'victory winner'),
        ownFieldCheckers: assertPlayerCountRecord(
          value.ownFieldCheckers,
          'victory ownFieldCheckers',
        ),
        completedHomeStacks: assertPlayerCountRecord(
          value.completedHomeStacks,
          'victory completedHomeStacks',
        ),
        decidedBy: value.decidedBy,
      };
    }
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

/** Runtime guard for rule config with fallback to current defaults. */
export function assertRuleConfig(value: unknown): RuleConfig {
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

/** Runtime guard for app preferences, including legacy language migration. */
export function assertPreferences(value: unknown): AppPreferences {
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
      value.language === 'english' ||
      value.language === 'russian' ||
      value.language === 'ukrainian'
        ? value.language
        : legacyLanguageMode === 'english'
          ? 'english'
          : 'russian',
  };
}

/** Runtime guard for persisted match settings with defaults for legacy sessions. */
export function assertMatchSettings(value: unknown): MatchSettings {
  if (!isRecord(value)) {
    return DEFAULT_MATCH_SETTINGS;
  }

  return {
    opponentMode:
      value.opponentMode === 'computer' || value.opponentMode === 'hotSeat'
        ? value.opponentMode
        : DEFAULT_MATCH_SETTINGS.opponentMode,
    humanPlayer:
      value.humanPlayer === 'white' || value.humanPlayer === 'black'
        ? value.humanPlayer
        : DEFAULT_MATCH_SETTINGS.humanPlayer,
    aiDifficulty:
      value.aiDifficulty === 'easy' ||
      value.aiDifficulty === 'medium' ||
      value.aiDifficulty === 'hard'
        ? value.aiDifficulty
        : DEFAULT_MATCH_SETTINGS.aiDifficulty,
    gameFormat:
      value.gameFormat === 'single' || value.gameFormat === 'series'
        ? value.gameFormat
        : DEFAULT_MATCH_SETTINGS.gameFormat,
    targetPoints:
      typeof value.targetPoints === 'number' &&
      Number.isSafeInteger(value.targetPoints) &&
      value.targetPoints > 0
        ? value.targetPoints
        : DEFAULT_MATCH_SETTINGS.targetPoints,
  };
}

function assertMatchParticipant(
  value: unknown,
  label: string,
): MatchParticipant {
  if (value !== 'first' && value !== 'second') {
    throw new Error(`Invalid ${label}.`);
  }

  return value;
}

function assertOptionalMatchParticipant(
  value: unknown,
  label: string,
): MatchParticipant | null {
  return value == null ? null : assertMatchParticipant(value, label);
}

function assertParticipantCounts(
  value: unknown,
  label: string,
): Record<MatchParticipant, number> {
  if (
    !isRecord(value) ||
    typeof value.first !== 'number' ||
    !Number.isSafeInteger(value.first) ||
    value.first < 0 ||
    typeof value.second !== 'number' ||
    !Number.isSafeInteger(value.second) ||
    value.second < 0
  ) {
    throw new Error(`Invalid ${label}.`);
  }

  return {
    first: value.first,
    second: value.second,
  };
}

function assertSeriesCheckpoint(value: unknown): UndoFrame | null {
  if (value == null) {
    return null;
  }

  if (
    !isRecord(value) ||
    typeof value.historyCursor !== 'number' ||
    !Number.isSafeInteger(value.historyCursor) ||
    value.historyCursor < 0
  ) {
    throw new Error('Invalid series checkpoint.');
  }

  return {
    historyCursor: value.historyCursor,
    positionCounts: assertPositionCounts(value.positionCounts),
    snapshot: assertStateSnapshot(value.snapshot),
  };
}

/** Runtime guard for the persisted multi-game match state. */
export function assertSeriesState(value: unknown): SeriesState | null {
  if (value == null) {
    return null;
  }

  if (!isRecord(value)) {
    throw new Error('Invalid series state.');
  }

  const firstColor = assertPlayer(
    value.colors && isRecord(value.colors) ? value.colors.first : null,
    'series first color',
  );
  const secondColor = assertPlayer(
    value.colors && isRecord(value.colors) ? value.colors.second : null,
    'series second color',
  );

  if (firstColor === secondColor) {
    throw new Error('Series participants must have different colors.');
  }

  const phase =
    value.phase === 'playing' ||
    value.phase === 'finishing' ||
    value.phase === 'betweenGames' ||
    value.phase === 'matchOver'
      ? value.phase
      : null;

  if (!phase) {
    throw new Error('Invalid series phase.');
  }

  const lastGame = (() => {
    if (value.lastGame == null) {
      return null;
    }

    if (!isRecord(value.lastGame)) {
      throw new Error('Invalid last series game.');
    }

    const victory = assertVictory(value.lastGame.victory);

    if (
      value.lastGame.outcome === 'draw' &&
      (victory.type === 'threefoldDraw' || victory.type === 'stalemateDraw')
    ) {
      return { outcome: 'draw' as const, victory };
    }

    if (
      value.lastGame.outcome === 'win' &&
      victory.type !== 'none' &&
      victory.type !== 'threefoldDraw' &&
      victory.type !== 'stalemateDraw' &&
      typeof value.lastGame.pointsAwarded === 'number' &&
      Number.isSafeInteger(value.lastGame.pointsAwarded) &&
      value.lastGame.pointsAwarded >= 0
    ) {
      return {
        outcome: 'win' as const,
        pointsAwarded: value.lastGame.pointsAwarded,
        victory,
        winner: assertMatchParticipant(
          value.lastGame.winner,
          'last game winner',
        ),
      };
    }

    throw new Error('Invalid last series game.');
  })();

  if (
    typeof value.gameNumber !== 'number' ||
    !Number.isSafeInteger(value.gameNumber) ||
    value.gameNumber < 1 ||
    typeof value.pendingPoints !== 'number' ||
    !Number.isSafeInteger(value.pendingPoints) ||
    value.pendingPoints < 0 ||
    typeof value.targetPoints !== 'number' ||
    !Number.isSafeInteger(value.targetPoints) ||
    value.targetPoints < 1
  ) {
    throw new Error('Invalid series counters.');
  }

  return {
    colorChooser: assertOptionalMatchParticipant(
      value.colorChooser,
      'series color chooser',
    ),
    colors: { first: firstColor, second: secondColor },
    finishingParticipant: assertOptionalMatchParticipant(
      value.finishingParticipant,
      'finishing participant',
    ),
    firstVictory:
      value.firstVictory == null ? null : assertVictory(value.firstVictory),
    firstWinner: assertOptionalMatchParticipant(
      value.firstWinner,
      'first winner',
    ),
    gameNumber: value.gameNumber,
    gameOneCheckpoint: assertSeriesCheckpoint(value.gameOneCheckpoint),
    gameWins: assertParticipantCounts(value.gameWins, 'series game wins'),
    lastGame,
    pendingPoints: value.pendingPoints,
    phase,
    points: assertParticipantCounts(value.points, 'series points'),
    targetPoints: value.targetPoints,
  };
}

/** Runtime guard for the hidden per-match AI persona persisted with computer games. */
export function assertAiBehaviorProfile(
  value: unknown,
): AiBehaviorProfile | null {
  if (value == null) {
    return null;
  }

  if (
    !isRecord(value) ||
    typeof value.seed !== 'string' ||
    (value.id !== 'expander' && value.id !== 'hunter' && value.id !== 'builder')
  ) {
    throw new Error('Invalid AI behavior profile.');
  }

  return {
    id: value.id,
    seed: value.seed,
  };
}

/** Runtime guard for single checker payload. */
export function assertChecker(value: unknown): Checker {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.frozen !== 'boolean'
  ) {
    throw new Error('Invalid checker.');
  }

  return {
    id: value.id,
    owner: assertPlayer(value.owner, 'checker owner'),
    frozen: value.frozen,
  };
}

/** Runtime guard for full board payload with per-cell checker parsing. */
export function assertBoard(value: unknown): Board {
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

/** Runtime guard for one serialized action union variant. */
export function assertAction(value: unknown): TurnAction {
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
        path: value.path.map((entry, index) =>
          assertCoord(entry, `jumpSequence.path[${index}]`),
        ),
      };
    case 'climbOne':
    case 'moveSingleToEmpty':
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

/** Runtime guard for game snapshot records embedded in history. */
export function assertStateSnapshot(value: unknown): StateSnapshot {
  if (!isRecord(value)) {
    throw new Error('Invalid state snapshot.');
  }

  return {
    board: assertBoard(value.board),
    currentPlayer: assertPlayer(value.currentPlayer, 'snapshot currentPlayer'),
    moveNumber:
      typeof value.moveNumber === 'number' &&
      Number.isInteger(value.moveNumber) &&
      value.moveNumber > 0
        ? value.moveNumber
        : 1,
    status:
      value.status === 'active' || value.status === 'gameOver'
        ? value.status
        : 'active',
    victory: assertVictory(value.victory),
    pendingJump: assertPendingJump(value.pendingJump),
  };
}

/** Runtime guard for one historical turn record. */
export function assertTurnRecord(value: unknown): TurnRecord {
  if (!isRecord(value) || !Array.isArray(value.autoPasses)) {
    throw new Error('Invalid turn record.');
  }

  return {
    actor: assertPlayer(value.actor, 'turn record actor'),
    action: assertAction(value.action),
    beforeState: assertStateSnapshot(value.beforeState),
    afterState: assertStateSnapshot(value.afterState),
    autoPasses: value.autoPasses.map((entry, index) =>
      assertPlayer(entry, `autoPasses[${index}]`),
    ),
    victoryAfter: assertVictory(value.victoryAfter),
    positionHash:
      typeof value.positionHash === 'string' ? value.positionHash : '',
  };
}

/** Runtime guard for repetition counter map. */
export function assertPositionCounts(value: unknown): Record<string, number> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, number>>(
    (counts, [key, entry]) => {
      if (typeof entry === 'number' && Number.isFinite(entry)) {
        counts[key] = entry;
      }
      return counts;
    },
    {},
  );
}
