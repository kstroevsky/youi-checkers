import {
  createInitialState,
  hashPosition,
  runEngineCommand,
  type EngineState,
  type Player,
} from '@/domain';
import type {
  GameFormat,
  MatchParticipant,
  SeriesGameResult,
} from '@/shared/types/session';

import type {
  AuthoritativeMatchState,
  MatchApplyResult,
  MatchCommand,
  OnlineSeriesState,
} from './contracts';

function otherParticipant(participant: MatchParticipant): MatchParticipant {
  return participant === 'first' ? 'second' : 'first';
}

function otherColor(color: Player): Player {
  return color === 'white' ? 'black' : 'white';
}

function engineStateOnly(
  state: ReturnType<typeof createInitialState>,
): EngineState {
  return {
    board: state.board,
    currentPlayer: state.currentPlayer,
    moveNumber: state.moveNumber,
    pendingJump: state.pendingJump,
    positionCounts: state.positionCounts,
    status: state.status,
    victory: state.victory,
  };
}

export function createOnlineSeriesState(
  targetPoints: number,
): OnlineSeriesState {
  return {
    colorChooser: null,
    colors: { first: 'white', second: 'black' },
    finishingParticipant: null,
    firstVictory: null,
    firstWinner: null,
    gameNumber: 1,
    gameWins: { first: 0, second: 0 },
    lastGame: null,
    pendingPoints: 0,
    phase: 'playing',
    points: { first: 0, second: 0 },
    targetPoints: Math.max(1, Math.trunc(targetPoints)),
  };
}

export function createAuthoritativeMatchState(options: {
  format: GameFormat;
  rules: AuthoritativeMatchState['rules'];
  targetPoints: number;
}): AuthoritativeMatchState {
  return {
    engine: engineStateOnly(createInitialState(options.rules)),
    format: options.format,
    rules: structuredClone(options.rules),
    series:
      options.format === 'series'
        ? createOnlineSeriesState(options.targetPoints)
        : null,
  };
}

export function participantForColor(
  series: Pick<OnlineSeriesState, 'colors'> | null,
  color: Player,
): MatchParticipant {
  if (!series) {
    return color === 'white' ? 'first' : 'second';
  }

  return series.colors.first === color ? 'first' : 'second';
}

export function participantToMove(
  state: AuthoritativeMatchState,
): MatchParticipant | null {
  if (
    state.series?.phase === 'betweenGames' ||
    state.series?.phase === 'matchOver'
  ) {
    return null;
  }

  return participantForColor(state.series, state.engine.currentPlayer);
}

function reopenForFinishing(
  engine: EngineState,
  series: OnlineSeriesState,
): EngineState {
  if (series.phase !== 'finishing' || !series.finishingParticipant) {
    throw new Error('The series is not in the finishing phase.');
  }

  const reopened: EngineState = {
    ...engine,
    currentPlayer: series.colors[series.finishingParticipant],
    pendingJump: null,
    status: 'active',
    victory: { type: 'none' },
  };
  const positionHash = hashPosition(reopened);

  return { ...reopened, positionCounts: { [positionHash]: 1 } };
}

function beginSeriesResolution(
  series: OnlineSeriesState,
  victory: Exclude<EngineState['victory'], { type: 'none' }>,
): OnlineSeriesState {
  if (series.phase !== 'playing') {
    throw new Error('The series game is not active.');
  }

  if (victory.type === 'threefoldDraw' || victory.type === 'stalemateDraw') {
    return {
      ...series,
      colors: {
        first: otherColor(series.colors.first),
        second: otherColor(series.colors.second),
      },
      lastGame: { outcome: 'draw', victory },
      phase: 'betweenGames',
    };
  }

  const winner = participantForColor(series, victory.winner);
  const gameWins = {
    ...series.gameWins,
    [winner]: series.gameWins[winner] + 1,
  };
  const requiresFinishing =
    victory.type === 'homeField' || victory.type === 'sixStacks';

  if (requiresFinishing) {
    return {
      ...series,
      finishingParticipant: otherParticipant(winner),
      firstVictory: victory,
      firstWinner: winner,
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

function completeFinishing(
  series: OnlineSeriesState,
  victory: Extract<EngineState['victory'], { type: 'homeField' | 'sixStacks' }>,
): OnlineSeriesState {
  if (
    series.phase !== 'finishing' ||
    !series.firstWinner ||
    !series.finishingParticipant ||
    participantForColor(series, victory.winner) !== series.finishingParticipant
  ) {
    throw new Error('The finishing participant did not complete the game.');
  }

  const winner = series.firstWinner;
  const points = {
    ...series.points,
    [winner]: series.points[winner] + series.pendingPoints,
  };
  const matchOver = points[winner] >= series.targetPoints;
  const lastGame: SeriesGameResult = {
    outcome: 'win',
    pointsAwarded: series.pendingPoints,
    victory: series.firstVictory as Exclude<
      EngineState['victory'],
      { type: 'none' | 'threefoldDraw' | 'stalemateDraw' }
    >,
    winner,
  };

  return {
    ...series,
    colorChooser: matchOver ? null : winner,
    lastGame,
    phase: matchOver ? 'matchOver' : 'betweenGames',
    points,
  };
}

function applyActionCommand(
  state: AuthoritativeMatchState,
  actor: MatchParticipant,
  command: Extract<MatchCommand, { type: 'submitAction' }>,
): MatchApplyResult {
  if (
    state.series?.phase === 'matchOver' ||
    state.engine.status === 'gameOver'
  ) {
    throw new Error('The match is complete.');
  }

  if (participantToMove(state) !== actor) {
    throw new Error('It is not this participant’s turn.');
  }

  const finishing = state.series?.phase === 'finishing';
  const transition = runEngineCommand(
    state.engine,
    { type: 'submitAction', action: command.action },
    state.rules,
    finishing
      ? {
          drawResolution: 'disabled',
          emitEvents: false,
          turnMode: 'samePlayer',
          victoryPlayer: state.engine.currentPlayer,
        }
      : { emitEvents: false },
  );
  let engine = transition.state;
  let series = state.series;
  let repetitionReset = false;

  if (series?.phase === 'finishing') {
    series = { ...series, pendingPoints: series.pendingPoints + 1 };

    if (
      engine.status === 'gameOver' &&
      (engine.victory.type === 'homeField' ||
        engine.victory.type === 'sixStacks')
    ) {
      series = completeFinishing(series, engine.victory);
    }
  } else if (
    series?.phase === 'playing' &&
    engine.status === 'gameOver' &&
    engine.victory.type !== 'none'
  ) {
    series = beginSeriesResolution(series, engine.victory);

    if (series.phase === 'finishing') {
      engine = reopenForFinishing(engine, series);
      repetitionReset = true;
    }
  }

  return {
    repetitionReset,
    state: { ...state, engine, series },
    updatedPositionHash: repetitionReset
      ? (Object.keys(engine.positionCounts)[0] ?? null)
      : transition.positionHash,
  };
}

function chooseNextColor(
  state: AuthoritativeMatchState,
  actor: MatchParticipant,
  color: Player,
): MatchApplyResult {
  const series = state.series;

  if (
    !series ||
    series.phase !== 'betweenGames' ||
    series.colorChooser !== actor
  ) {
    throw new Error('This participant cannot choose the next color.');
  }

  return {
    repetitionReset: false,
    state: {
      ...state,
      series: {
        ...series,
        colorChooser: null,
        colors: {
          [actor]: color,
          [otherParticipant(actor)]: otherColor(color),
        } as OnlineSeriesState['colors'],
      },
    },
    updatedPositionHash: null,
  };
}

function startNextGame(state: AuthoritativeMatchState): MatchApplyResult {
  const series = state.series;

  if (!series || series.phase !== 'betweenGames') {
    throw new Error('The series is not between games.');
  }

  if (series.colorChooser) {
    throw new Error('Choose the next color first.');
  }

  const engine = engineStateOnly(createInitialState(state.rules));

  return {
    repetitionReset: true,
    state: {
      ...state,
      engine,
      series: {
        ...series,
        finishingParticipant: null,
        firstVictory: null,
        firstWinner: null,
        gameNumber: series.gameNumber + 1,
        lastGame: null,
        pendingPoints: 0,
        phase: 'playing',
      },
    },
    updatedPositionHash: Object.keys(engine.positionCounts)[0] ?? null,
  };
}

/** The only authoritative rule transition used by both client prediction and server arbitration. */
export function applyMatchCommand(
  state: AuthoritativeMatchState,
  actor: MatchParticipant,
  command: MatchCommand,
): MatchApplyResult {
  switch (command.type) {
    case 'submitAction':
      return applyActionCommand(state, actor, command);
    case 'chooseNextColor':
      return chooseNextColor(state, actor, command.color);
    case 'startNextGame':
      return startNextGame(state);
  }
}
