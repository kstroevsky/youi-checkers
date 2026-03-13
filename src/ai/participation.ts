import { analyzePosition } from '@/ai/strategy';
import type { AiDifficultyPreset } from '@/ai/types';
import {
  getCell,
  getCellHeight,
  getTopChecker,
  isStack,
} from '@/domain/model/board';
import { allCoords, parseCoord } from '@/domain/model/coordinates';
import type {
  Board,
  Coord,
  EngineState,
  Player,
  StateSnapshot,
  TurnAction,
} from '@/domain/model/types';
import { isControlledStack, isMovableSingle } from '@/domain/validators/stateValidators';

type FileBand = 'center' | 'left' | 'right';
type RankBand = 'front' | 'mid' | 'rear';

export type SourceRegion = `${FileBand}-${RankBand}` | 'none';

type ParticipationEntry = {
  movedCheckerIds: string[];
  movedMass: number;
  source: Coord | null;
  sourceFamily: string;
  sourceRegion: SourceRegion;
};

type PlayerParticipationState = {
  activeCheckerIds: string[];
  checkerCounts: Record<string, number>;
  distinctFamilies: number;
  hotRegionCounts: Record<string, number>;
  hotSourceCounts: Record<string, number>;
  lastSourceFamily: string | null;
  lastSourceRegion: SourceRegion | null;
  recent: ParticipationEntry[];
  sameFamilyReuseStreak: number;
  sameRegionReuseStreak: number;
};

export type ParticipationState = {
  players: Record<Player, PlayerParticipationState>;
  window: number;
};

type ParticipationProfile = {
  activeCheckerCount: number;
  distinctFamilyCount: number;
  frontierWidth: number;
  hotRegionConcentration: number;
  hotSourceConcentration: number;
  idleReserveMass: number;
  sameFamilyReuseStreak: number;
  sameRegionReuseStreak: number;
};

export type ActionParticipationProfile = {
  movedMass: number;
  nextParticipationState: ParticipationState;
  participationDelta: number;
  repeatsSourceFamily: boolean;
  repeatsSourceRegion: boolean;
  sourceFamily: string;
  sourceRegion: SourceRegion;
};

function getOpponent(player: Player): Player {
  return player === 'white' ? 'black' : 'white';
}

function createPlayerParticipationState(): PlayerParticipationState {
  return {
    activeCheckerIds: [],
    checkerCounts: {},
    distinctFamilies: 0,
    hotRegionCounts: {},
    hotSourceCounts: {},
    lastSourceFamily: null,
    lastSourceRegion: null,
    recent: [],
    sameFamilyReuseStreak: 0,
    sameRegionReuseStreak: 0,
  };
}

function createParticipationState(window: number): ParticipationState {
  return {
    players: {
      black: createPlayerParticipationState(),
      white: createPlayerParticipationState(),
    },
    window,
  };
}

function getActionSource(action: TurnAction): Coord | null {
  switch (action.type) {
    case 'manualUnfreeze':
      return action.coord;
    case 'jumpSequence':
      return action.source;
    default:
      return action.source;
  }
}

function getMovedCheckerIds(board: Board, action: TurnAction): string[] {
  switch (action.type) {
    case 'manualUnfreeze': {
      const checker = getTopChecker(board, action.coord);
      return checker ? [checker.id] : [];
    }
    case 'jumpSequence': {
      const checker = getTopChecker(board, action.source);
      return checker ? [checker.id] : [];
    }
    case 'splitTwoFromStack':
      return getCell(board, action.source).checkers.slice(-2).map((checker) => checker.id);
    case 'moveSingleToEmpty': {
      if (!isStack(board, action.source)) {
        const checker = getTopChecker(board, action.source);
        return checker ? [checker.id] : [];
      }

      return getCell(board, action.source).checkers.map((checker) => checker.id);
    }
    default: {
      const checker = getTopChecker(board, action.source);
      return checker ? [checker.id] : [];
    }
  }
}

function getFileBand(coord: Coord): FileBand {
  const { column } = parseCoord(coord);

  if (column === 'A' || column === 'B') {
    return 'left';
  }

  if (column === 'E' || column === 'F') {
    return 'right';
  }

  return 'center';
}

function getRankBand(coord: Coord, player: Player): RankBand {
  const { row } = parseCoord(coord);
  const relativeRow = player === 'white' ? row : 7 - row;

  if (relativeRow <= 2) {
    return 'rear';
  }

  if (relativeRow <= 4) {
    return 'mid';
  }

  return 'front';
}

function getSourceRegion(coord: Coord | null, player: Player): SourceRegion {
  if (!coord) {
    return 'none';
  }

  return `${getFileBand(coord)}-${getRankBand(coord, player)}`;
}

function buildSourceFamily(
  movedCheckerIds: string[],
  action: TurnAction,
  source: Coord | null,
  region: SourceRegion,
): string {
  if (movedCheckerIds.length) {
    return movedCheckerIds.slice().sort().join('+');
  }

  return `${action.type}:${source ?? 'none'}:${region}`;
}

function createParticipationEntry(
  beforeState: Pick<StateSnapshot | EngineState, 'board'>,
  action: TurnAction,
  actor: Player,
): ParticipationEntry {
  const source = getActionSource(action);
  const movedCheckerIds = getMovedCheckerIds(beforeState.board, action);
  const sourceRegion = getSourceRegion(source, actor);

  return {
    movedCheckerIds,
    movedMass: movedCheckerIds.length,
    source,
    sourceFamily: buildSourceFamily(movedCheckerIds, action, source, sourceRegion),
    sourceRegion,
  };
}

function rebuildPlayerParticipationState(
  recent: ParticipationEntry[],
): PlayerParticipationState {
  const hotSourceCounts: Record<string, number> = {};
  const hotRegionCounts: Record<string, number> = {};
  const checkerCounts: Record<string, number> = {};
  const distinctFamilies = new Set<string>();

  for (const entry of recent) {
    if (entry.source) {
      hotSourceCounts[entry.source] = (hotSourceCounts[entry.source] ?? 0) + 1;
    }

    hotRegionCounts[entry.sourceRegion] = (hotRegionCounts[entry.sourceRegion] ?? 0) + 1;
    distinctFamilies.add(entry.sourceFamily);

    for (const checkerId of entry.movedCheckerIds) {
      checkerCounts[checkerId] = (checkerCounts[checkerId] ?? 0) + 1;
    }
  }

  let sameFamilyReuseStreak = 0;
  let sameRegionReuseStreak = 0;
  const lastSourceFamily = recent.at(-1)?.sourceFamily ?? null;
  const lastSourceRegion = recent.at(-1)?.sourceRegion ?? null;

  if (lastSourceFamily) {
    for (let index = recent.length - 1; index >= 0; index -= 1) {
      if (recent[index].sourceFamily !== lastSourceFamily) {
        break;
      }

      sameFamilyReuseStreak += 1;
    }
  }

  if (lastSourceRegion) {
    for (let index = recent.length - 1; index >= 0; index -= 1) {
      if (recent[index].sourceRegion !== lastSourceRegion) {
        break;
      }

      sameRegionReuseStreak += 1;
    }
  }

  return {
    activeCheckerIds: Object.keys(checkerCounts).sort(),
    checkerCounts,
    distinctFamilies: distinctFamilies.size,
    hotRegionCounts,
    hotSourceCounts,
    lastSourceFamily,
    lastSourceRegion,
    recent,
    sameFamilyReuseStreak,
    sameRegionReuseStreak,
  };
}

function withPlayerEntry(
  state: ParticipationState,
  actor: Player,
  entry: ParticipationEntry,
): ParticipationState {
  const recent = [...state.players[actor].recent, entry].slice(-state.window);

  return {
    ...state,
    players: {
      ...state.players,
      [actor]: rebuildPlayerParticipationState(recent),
    },
  };
}

function getFrontierWidth(state: EngineState, player: Player): number {
  const files = new Set<string>();

  for (const coord of allCoords()) {
    if (isMovableSingle(state.board, coord, player) || isControlledStack(state.board, coord, player)) {
      files.add(parseCoord(coord).column);
    }
  }

  return files.size;
}

function isReserveCoord(coord: Coord, player: Player): boolean {
  const { row } = parseCoord(coord);

  return player === 'white' ? row <= 2 : row >= 5;
}

function getIdleReserveMass(state: EngineState, player: Player, activeCheckerIds: Set<string>): number {
  let idleReserveMass = 0;

  for (const coord of allCoords()) {
    if (!isReserveCoord(coord, player)) {
      continue;
    }

    for (const checker of getCell(state.board, coord).checkers) {
      if (checker.owner === player && !activeCheckerIds.has(checker.id)) {
        idleReserveMass += 1;
      }
    }
  }

  return idleReserveMass;
}

function getConcentration(counts: Record<string, number>): number {
  return Object.values(counts).reduce((sum, count) => sum + Math.max(0, count - 1), 0);
}

function getPhaseScale(state: EngineState): number {
  switch (analyzePosition(state).phase) {
    case 'opening':
      return 1.25;
    case 'transport':
      return 1;
    case 'conversion':
      return 0.45;
  }
}

function getParticipationProfile(
  state: EngineState,
  player: Player,
  playerState: PlayerParticipationState,
): ParticipationProfile {
  const activeCheckerIds = new Set(playerState.activeCheckerIds);

  return {
    activeCheckerCount: activeCheckerIds.size,
    distinctFamilyCount: playerState.distinctFamilies,
    frontierWidth: getFrontierWidth(state, player),
    hotRegionConcentration: getConcentration(playerState.hotRegionCounts),
    hotSourceConcentration: getConcentration(playerState.hotSourceCounts),
    idleReserveMass: getIdleReserveMass(state, player, activeCheckerIds),
    sameFamilyReuseStreak: playerState.sameFamilyReuseStreak,
    sameRegionReuseStreak: playerState.sameRegionReuseStreak,
  };
}

function getPlayerParticipationScore(
  state: EngineState,
  player: Player,
  playerState: PlayerParticipationState,
  preset: AiDifficultyPreset,
): number {
  const phaseScale = getPhaseScale(state);
  const profile = getParticipationProfile(state, player, playerState);

  return (
    profile.frontierWidth * preset.frontierWidthWeight * phaseScale +
    profile.activeCheckerCount * preset.participationBias * 0.45 * phaseScale +
    profile.distinctFamilyCount * preset.familyVarietyWeight * phaseScale -
    profile.idleReserveMass * preset.participationBias * 0.65 * phaseScale -
    profile.hotSourceConcentration * preset.sourceReusePenalty * phaseScale -
    profile.hotRegionConcentration * preset.familyVarietyWeight * 0.75 * phaseScale -
    Math.max(0, profile.sameFamilyReuseStreak - 1) * preset.sourceReusePenalty * phaseScale -
    Math.max(0, profile.sameRegionReuseStreak - 1) * preset.familyVarietyWeight * phaseScale
  );
}

export function buildParticipationState(
  state: EngineState,
  window: number,
): ParticipationState {
  const participationState = createParticipationState(window);

  if (!('history' in state) || !Array.isArray(state.history)) {
    return participationState;
  }

  return state.history.reduce<ParticipationState>((current, record) => {
    return withPlayerEntry(
      current,
      record.actor,
      createParticipationEntry(record.beforeState, record.action, record.actor),
    );
  }, participationState);
}

export function getParticipationScore(
  state: EngineState,
  perspectivePlayer: Player,
  preset: AiDifficultyPreset,
  participationState: ParticipationState | null | undefined,
): number {
  if (!participationState) {
    return 0;
  }

  const opponent = getOpponent(perspectivePlayer);

  return (
    getPlayerParticipationScore(
      state,
      perspectivePlayer,
      participationState.players[perspectivePlayer],
      preset,
    ) -
    getPlayerParticipationScore(
      state,
      opponent,
      participationState.players[opponent],
      preset,
    )
  );
}

export function getActionParticipationProfile(
  state: EngineState,
  action: TurnAction,
  nextState: EngineState,
  actor: Player,
  participationState: ParticipationState | null | undefined,
  preset: AiDifficultyPreset,
  options: {
    isTactical: boolean;
    winsImmediately: boolean;
  },
): ActionParticipationProfile {
  const currentParticipationState =
    participationState ?? createParticipationState(preset.participationWindow);
  const playerState = currentParticipationState.players[actor];
  const entry = createParticipationEntry(state, action, actor);
  const nextParticipationState = withPlayerEntry(currentParticipationState, actor, entry);
  const beforeProfile = getParticipationProfile(state, actor, playerState);
  const afterProfile = getParticipationProfile(
    nextState,
    actor,
    nextParticipationState.players[actor],
  );
  const beforeScore = getPlayerParticipationScore(state, actor, playerState, preset);
  const afterScore = getPlayerParticipationScore(
    nextState,
    actor,
    nextParticipationState.players[actor],
    preset,
  );
  const phaseScale = getPhaseScale(nextState);
  const activeBefore = new Set(playerState.activeCheckerIds);
  const freshCheckerCount = entry.movedCheckerIds.filter((checkerId) => !activeBefore.has(checkerId)).length;
  const reusedCheckerCount = entry.movedCheckerIds.length - freshCheckerCount;
  const repeatsSourceFamily = Boolean(
    playerState.lastSourceFamily && playerState.lastSourceFamily === entry.sourceFamily,
  );
  const repeatsSourceRegion = Boolean(
    playerState.lastSourceRegion && playerState.lastSourceRegion === entry.sourceRegion,
  );
  let participationDelta = afterScore - beforeScore;

  participationDelta += freshCheckerCount * preset.participationBias * 1.2 * phaseScale;
  participationDelta += Math.max(0, afterProfile.frontierWidth - beforeProfile.frontierWidth) *
    preset.frontierWidthWeight * 1.1 * phaseScale;
  participationDelta += Math.max(0, beforeProfile.idleReserveMass - afterProfile.idleReserveMass) *
    preset.participationBias * 0.85 * phaseScale;

  if (!freshCheckerCount && reusedCheckerCount > 0) {
    participationDelta -= reusedCheckerCount * preset.sourceReusePenalty * 0.75 * phaseScale;
  }

  if (repeatsSourceFamily) {
    participationDelta -= preset.sourceReusePenalty * 0.8 * phaseScale;
  }

  if (repeatsSourceRegion) {
    participationDelta -= preset.familyVarietyWeight * 0.6 * phaseScale;
  }

  if (options.winsImmediately) {
    participationDelta = Math.max(participationDelta, 0);
  } else if (options.isTactical) {
    participationDelta = Math.max(
      participationDelta,
      -Math.round(preset.sourceReusePenalty * 0.5 * phaseScale),
    );
  }

  return {
    movedMass: entry.movedMass,
    nextParticipationState,
    participationDelta: Math.round(participationDelta),
    repeatsSourceFamily,
    repeatsSourceRegion,
    sourceFamily: entry.sourceFamily,
    sourceRegion: entry.sourceRegion,
  };
}
