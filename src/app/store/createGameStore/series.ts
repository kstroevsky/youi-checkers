import { hashPosition } from '@/domain';
import type { GameState, Player, Victory } from '@/domain';
import type {
  MatchParticipant,
  MatchSettings,
  SeriesState,
  UndoFrame,
} from '@/shared/types/session';

function otherParticipant(participant: MatchParticipant): MatchParticipant {
  return participant === 'first' ? 'second' : 'first';
}

function swapColors(colors: SeriesState['colors']): SeriesState['colors'] {
  return {
    first: colors.second,
    second: colors.first,
  };
}

function isDrawVictory(
  victory: Victory,
): victory is Extract<Victory, { type: 'threefoldDraw' | 'stalemateDraw' }> {
  return victory.type === 'threefoldDraw' || victory.type === 'stalemateDraw';
}

function isNormalVictory(
  victory: Victory,
): victory is Extract<Victory, { type: 'homeField' | 'sixStacks' }> {
  return victory.type === 'homeField' || victory.type === 'sixStacks';
}

function cloneCheckpoint(checkpoint: UndoFrame): UndoFrame {
  return {
    historyCursor: checkpoint.historyCursor,
    positionCounts: { ...checkpoint.positionCounts },
    snapshot: structuredClone(checkpoint.snapshot),
  };
}

export function createSeriesState(settings: MatchSettings): SeriesState {
  const firstColor =
    settings.opponentMode === 'computer' ? settings.humanPlayer : 'white';

  return {
    colorChooser: null,
    colors: {
      first: firstColor,
      second: firstColor === 'white' ? 'black' : 'white',
    },
    finishingParticipant: null,
    firstVictory: null,
    firstWinner: null,
    gameNumber: 1,
    gameOneCheckpoint: null,
    gameWins: { first: 0, second: 0 },
    lastGame: null,
    pendingPoints: 0,
    phase: 'playing',
    points: { first: 0, second: 0 },
    targetPoints: Math.max(1, Math.trunc(settings.targetPoints)),
  };
}

export function participantForColor(
  series: Pick<SeriesState, 'colors'>,
  color: Player,
): MatchParticipant {
  return series.colors.first === color ? 'first' : 'second';
}

export function colorForParticipant(
  series: Pick<SeriesState, 'colors'>,
  participant: MatchParticipant,
): Player {
  return series.colors[participant];
}

export function reopenGameForFinishing(
  gameState: GameState,
  series: SeriesState,
): GameState {
  if (series.phase !== 'finishing' || !series.finishingParticipant) {
    throw new Error('The series is not in the finishing phase.');
  }

  const reopened: GameState = {
    ...gameState,
    currentPlayer: colorForParticipant(series, series.finishingParticipant),
    pendingJump: null,
    status: 'active',
    victory: { type: 'none' },
  };
  const positionHash = hashPosition(reopened);

  return {
    ...reopened,
    positionCounts: {
      [positionHash]: 1,
    },
  };
}

export function matchSettingsForSeriesColors(
  matchSettings: MatchSettings,
  series: SeriesState,
): MatchSettings {
  return matchSettings.opponentMode === 'computer'
    ? {
        ...matchSettings,
        humanPlayer: series.colors.first,
      }
    : matchSettings;
}

export function beginSeriesGameResolution(
  series: SeriesState,
  victory: Exclude<Victory, { type: 'none' }>,
  checkpoint: UndoFrame,
): SeriesState {
  if (series.phase !== 'playing') {
    throw new Error('The series game is not active.');
  }

  const gameOneCheckpoint =
    series.gameNumber === 1
      ? cloneCheckpoint(checkpoint)
      : series.gameOneCheckpoint;

  if (isDrawVictory(victory)) {
    return {
      ...series,
      colors: swapColors(series.colors),
      gameOneCheckpoint,
      lastGame: { outcome: 'draw', victory },
      phase: 'betweenGames',
    };
  }

  const winner = participantForColor(series, victory.winner);
  const gameWins = {
    ...series.gameWins,
    [winner]: series.gameWins[winner] + 1,
  };

  if (isNormalVictory(victory)) {
    return {
      ...series,
      finishingParticipant: otherParticipant(winner),
      firstVictory: victory,
      firstWinner: winner,
      gameOneCheckpoint,
      gameWins,
      pendingPoints: 0,
      phase: 'finishing',
    };
  }

  return {
    ...series,
    colorChooser: winner,
    firstVictory: victory,
    firstWinner: winner,
    gameOneCheckpoint,
    gameWins,
    lastGame: {
      outcome: 'win',
      pointsAwarded: 0,
      victory,
      winner,
    },
    phase: 'betweenGames',
  };
}

export function countFinishingAction(series: SeriesState): SeriesState {
  if (series.phase !== 'finishing') {
    throw new Error('The series is not in the finishing phase.');
  }

  return {
    ...series,
    pendingPoints: series.pendingPoints + 1,
  };
}

export function completeFinishingPhase(
  series: SeriesState,
  victory: Extract<Victory, { type: 'homeField' | 'sixStacks' }>,
): SeriesState {
  if (
    series.phase !== 'finishing' ||
    !series.firstWinner ||
    !series.finishingParticipant
  ) {
    throw new Error('The series is not in the finishing phase.');
  }

  if (
    participantForColor(series, victory.winner) !== series.finishingParticipant
  ) {
    throw new Error('Only the finishing participant may complete the game.');
  }

  const winner = series.firstWinner;
  const points = {
    ...series.points,
    [winner]: series.points[winner] + series.pendingPoints,
  };
  const matchOver = points[winner] >= series.targetPoints;

  return {
    ...series,
    colorChooser: matchOver ? null : winner,
    lastGame: {
      outcome: 'win',
      pointsAwarded: series.pendingPoints,
      victory: series.firstVictory as Exclude<
        Victory,
        { type: 'none' | 'threefoldDraw' | 'stalemateDraw' }
      >,
      winner,
    },
    phase: matchOver ? 'matchOver' : 'betweenGames',
    points,
  };
}

export function chooseNextSeriesColor(
  series: SeriesState,
  participant: MatchParticipant,
  color: Player,
): SeriesState {
  if (series.phase !== 'betweenGames' || series.colorChooser !== participant) {
    throw new Error('This participant cannot choose the next color.');
  }

  return {
    ...series,
    colorChooser: null,
    colors: {
      [participant]: color,
      [otherParticipant(participant)]: color === 'white' ? 'black' : 'white',
    } as SeriesState['colors'],
  };
}

export function startNextSeriesGame(series: SeriesState): SeriesState {
  if (series.phase !== 'betweenGames') {
    throw new Error('The series is not between games.');
  }

  if (series.colorChooser) {
    throw new Error('Choose the next color first.');
  }

  return {
    ...series,
    finishingParticipant: null,
    firstVictory: null,
    firstWinner: null,
    gameNumber: series.gameNumber + 1,
    gameOneCheckpoint: null,
    lastGame: null,
    pendingPoints: 0,
    phase: 'playing',
  };
}
