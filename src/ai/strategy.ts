import { getCell, getCellHeight, getController, getTopChecker, isStack } from '@/domain/model/board';
import { DIRECTION_VECTORS, FRONT_HOME_ROW, HOME_ROWS } from '@/domain/model/constants';
import {
  allCoords,
  getAdjacentCoord,
  getJumpLandingCoord,
  parseCoord,
  type DirectionVector,
} from '@/domain/model/coordinates';
import { hashPosition } from '@/domain/model/hash';
import type { Coord, EngineState, Player, TurnAction } from '@/domain/model/types';
import {
  canJumpOverCell,
  isControlledStack,
  isFrozenSingle,
  isMovableSingle,
} from '@/domain/validators/stateValidators';
import type { AiStrategicIntent, AiStrategicTag } from '@/ai/types';

type StrategicPhase = 'conversion' | 'opening' | 'transport';

type PlayerAnalysis = {
  buriedDebt: number;
  controlledEnemyStacks: number;
  controlledStacks: number;
  emptyAdjacency: number;
  frontRowControlledHeight: number;
  frontRowFullStacks: number;
  frontRowOwnedTwoStacks: number;
  frozenCriticalSingles: number;
  frozenSingles: number;
  homeSingles: number;
  jumpLanes: number;
  laneOpenness: number;
  movableUnits: number;
  totalDistanceToHome: number;
  transportValue: number;
};

type IntentProfile = {
  homePlanPotential: number;
  hybridPlanPotential: number;
  intent: AiStrategicIntent;
  intentDelta: number;
  sixStackPlanPotential: number;
};

export type PositionAnalysis = {
  emptyCells: number;
  phase: StrategicPhase;
  players: Record<Player, PlayerAnalysis>;
};

export type ActionStrategicProfile = {
  intent: AiStrategicIntent;
  intentDelta: number;
  policyBias: number;
  tags: AiStrategicTag[];
};

const ANALYSIS_CACHE_LIMIT = 50_000;
const analysisCache = new Map<string, PositionAnalysis>();

function getOpponent(player: Player): Player {
  return player === 'white' ? 'black' : 'white';
}

function createPlayerAnalysis(): PlayerAnalysis {
  return {
    buriedDebt: 0,
    controlledEnemyStacks: 0,
    controlledStacks: 0,
    emptyAdjacency: 0,
    frontRowControlledHeight: 0,
    frontRowFullStacks: 0,
    frontRowOwnedTwoStacks: 0,
    frozenCriticalSingles: 0,
    frozenSingles: 0,
    homeSingles: 0,
    jumpLanes: 0,
    laneOpenness: 0,
    movableUnits: 0,
    totalDistanceToHome: 0,
    transportValue: 0,
  };
}

function distanceToHomeRows(player: Player, row: number): number {
  if (HOME_ROWS[player].has(row as never)) {
    return 0;
  }

  return player === 'white' ? Math.max(0, 4 - row) : Math.max(0, row - 3);
}

function isActiveMover(state: EngineState, coord: Coord, player: Player): boolean {
  return isMovableSingle(state.board, coord, player) || isControlledStack(state.board, coord, player);
}

function isCriticalRow(coord: Coord, player: Player): boolean {
  const { row } = parseCoord(coord);

  return HOME_ROWS[player].has(row as never) || row === FRONT_HOME_ROW[player];
}

function countDirectionalOpenness(
  state: EngineState,
  coord: Coord,
  player: Player,
): { emptyAdjacency: number; jumpLanes: number } {
  let emptyAdjacency = 0;
  let jumpLanes = 0;

  for (const direction of DIRECTION_VECTORS) {
    const adjacent = getAdjacentCoord(coord, direction);

    if (!adjacent) {
      continue;
    }

    if (getCellHeight(state.board, adjacent) === 0) {
      emptyAdjacency += 1;
      continue;
    }

    const landing = getJumpLandingCoord(coord, direction);

    if (
      landing &&
      getCellHeight(state.board, landing) === 0 &&
      canJumpOverCell(state.board, player, adjacent)
    ) {
      jumpLanes += 1;
    }
  }

  return {
    emptyAdjacency,
    jumpLanes,
  };
}

function addStackStructure(
  state: EngineState,
  coord: Coord,
  player: Player,
  analysis: PlayerAnalysis,
): void {
  if (!isStack(state.board, coord) || getController(state.board, coord) !== player) {
    return;
  }

  const { row } = parseCoord(coord);
  const cell = getCell(state.board, coord);
  const height = cell.checkers.length;
  const ownCheckers = cell.checkers.filter((checker) => checker.owner === player).length;

  analysis.controlledStacks += 1;
  analysis.transportValue += ownCheckers * (row === FRONT_HOME_ROW[player] ? 10 : 45);

  if (ownCheckers !== height) {
    analysis.controlledEnemyStacks += 1;
  }

  if (row !== FRONT_HOME_ROW[player]) {
    return;
  }

  analysis.frontRowControlledHeight += height;

  if (height === 2 && ownCheckers === 2) {
    analysis.frontRowOwnedTwoStacks += 1;
  }

  if (height === 3 && ownCheckers === 3) {
    analysis.frontRowFullStacks += 1;
  }
}

function addCellAnalysis(
  state: EngineState,
  coord: Coord,
  analysis: PositionAnalysis,
): void {
  const cell = getCell(state.board, coord);

  if (!cell.checkers.length) {
    analysis.emptyCells += 1;
    return;
  }

  const { row } = parseCoord(coord);

  for (let depth = 0; depth < cell.checkers.length; depth += 1) {
    const checker = cell.checkers[depth];
    const playerAnalysis = analysis.players[checker.owner];
    const controller = getController(state.board, coord);
    const distance = distanceToHomeRows(checker.owner, row);

    playerAnalysis.totalDistanceToHome += distance;

    if (cell.checkers.length > 1 && depth < cell.checkers.length - 1) {
      const debtWeight = controller === checker.owner ? 0.75 : 1.5;

      playerAnalysis.buriedDebt += debtWeight * (distance + depth + 1);
    }
  }

  for (const player of ['white', 'black'] as const) {
    addStackStructure(state, coord, player, analysis.players[player]);
  }

  const topChecker = getTopChecker(state.board, coord);

  if (!topChecker) {
    return;
  }

  const topAnalysis = analysis.players[topChecker.owner];

  if (cell.checkers.length === 1) {
    if (HOME_ROWS[topChecker.owner].has(row as never)) {
      topAnalysis.homeSingles += 1;
    }

    if (topChecker.frozen) {
      topAnalysis.frozenSingles += 1;

      if (isCriticalRow(coord, topChecker.owner)) {
        topAnalysis.frozenCriticalSingles += 1;
      }
    }
  }

  if (!isActiveMover(state, coord, topChecker.owner)) {
    return;
  }

  const openness = countDirectionalOpenness(state, coord, topChecker.owner);

  topAnalysis.movableUnits += 1;
  topAnalysis.emptyAdjacency += openness.emptyAdjacency;
  topAnalysis.jumpLanes += openness.jumpLanes;
  topAnalysis.laneOpenness += openness.emptyAdjacency * 2 + openness.jumpLanes * 3;

  if (cell.checkers.length > 1) {
    topAnalysis.transportValue += cell.checkers.length * (openness.emptyAdjacency + openness.jumpLanes * 2);
  }
}

function derivePhase(analysis: PositionAnalysis): StrategicPhase {
  const white = analysis.players.white;
  const black = analysis.players.black;

  if (
    white.homeSingles >= 8 ||
    black.homeSingles >= 8 ||
    white.frontRowControlledHeight >= 7 ||
    black.frontRowControlledHeight >= 7 ||
    white.frontRowFullStacks >= 2 ||
    black.frontRowFullStacks >= 2
  ) {
    return 'conversion';
  }

  if (analysis.emptyCells <= 4) {
    return 'opening';
  }

  return 'transport';
}

function buildAnalysis(state: EngineState): PositionAnalysis {
  const analysis: PositionAnalysis = {
    emptyCells: 0,
    phase: 'opening',
    players: {
      white: createPlayerAnalysis(),
      black: createPlayerAnalysis(),
    },
  };

  for (const coord of allCoords()) {
    addCellAnalysis(state, coord, analysis);
  }

  analysis.phase = derivePhase(analysis);

  return analysis;
}

function rememberAnalysis(key: string, analysis: PositionAnalysis): PositionAnalysis {
  if (analysisCache.size >= ANALYSIS_CACHE_LIMIT) {
    const oldestKey = analysisCache.keys().next().value;

    if (oldestKey) {
      analysisCache.delete(oldestKey);
    }
  }

  analysisCache.set(key, analysis);
  return analysis;
}

function getPhaseWeights(phase: StrategicPhase): {
  home: number;
  lane: number;
  stack: number;
  transport: number;
} {
  switch (phase) {
    case 'conversion':
      return {
        home: 1.35,
        lane: 0.8,
        stack: 1.3,
        transport: 0.95,
      };
    case 'transport':
      return {
        home: 1,
        lane: 1.05,
        stack: 1.05,
        transport: 1.2,
      };
    default:
      return {
        home: 0.85,
        lane: 1.3,
        stack: 0.9,
        transport: 1.1,
      };
  }
}

function buildIntentProfile(
  analysis: PositionAnalysis,
  player: Player,
): IntentProfile {
  const opponent = getOpponent(player);
  const own = analysis.players[player];
  const other = analysis.players[opponent];
  const weights = getPhaseWeights(analysis.phase);
  const homePlanPotential =
    own.homeSingles * 420 * weights.home +
    own.laneOpenness * 38 * weights.lane +
    own.jumpLanes * 70 +
    own.emptyAdjacency * 10 +
    own.transportValue * 8 * weights.transport -
    own.totalDistanceToHome * 28 -
    own.buriedDebt * 70 -
    own.frozenSingles * 110 -
    own.frozenCriticalSingles * 90 -
    own.controlledStacks * 42;
  const sixStackPlanPotential =
    own.frontRowControlledHeight * 210 * weights.stack +
    own.frontRowOwnedTwoStacks * 950 +
    own.frontRowFullStacks * 2_700 +
    own.controlledStacks * 120 +
    own.controlledEnemyStacks * 180 +
    own.transportValue * 16 * weights.transport +
    own.jumpLanes * 24 -
    own.frozenCriticalSingles * 65 -
    own.totalDistanceToHome * 8 +
    own.buriedDebt * -25;
  const hybridPlanPotential =
    Math.round((homePlanPotential * 0.58 + sixStackPlanPotential * 0.42) / 1.0) +
    Math.round((own.laneOpenness - other.laneOpenness) * 12) +
    Math.round((own.frozenCriticalSingles - other.frozenCriticalSingles) * -65);
  const delta = sixStackPlanPotential - homePlanPotential;

  if (own.frontRowFullStacks >= 2 || own.frontRowControlledHeight >= 9 || delta >= 750) {
    return {
      homePlanPotential,
      hybridPlanPotential,
      intent: 'sixStack',
      intentDelta: delta,
      sixStackPlanPotential,
    };
  }

  if (own.homeSingles >= 9 || homePlanPotential - sixStackPlanPotential >= 750) {
    return {
      homePlanPotential,
      hybridPlanPotential,
      intent: 'home',
      intentDelta: homePlanPotential - sixStackPlanPotential,
      sixStackPlanPotential,
    };
  }

  return {
    homePlanPotential,
    hybridPlanPotential,
    intent: 'hybrid',
    intentDelta: Math.abs(delta),
    sixStackPlanPotential,
  };
}

function getIntentScore(profile: IntentProfile): number {
  switch (profile.intent) {
    case 'home':
      return profile.homePlanPotential;
    case 'sixStack':
      return profile.sixStackPlanPotential;
    default:
      return profile.hybridPlanPotential;
  }
}

function targetCoord(action: TurnAction): Coord | null {
  switch (action.type) {
    case 'manualUnfreeze':
      return action.coord;
    case 'jumpSequence':
      return action.path.at(-1) ?? null;
    default:
      return action.target;
  }
}

function sourceCoord(action: TurnAction): Coord | null {
  switch (action.type) {
    case 'manualUnfreeze':
      return action.coord;
    case 'jumpSequence':
      return action.source;
    default:
      return action.source;
  }
}

function addTag(tags: Set<AiStrategicTag>, condition: boolean, tag: AiStrategicTag): void {
  if (condition) {
    tags.add(tag);
  }
}

export function analyzePosition(state: EngineState): PositionAnalysis {
  const key = hashPosition(state);
  const cached = analysisCache.get(key);

  if (cached) {
    return cached;
  }

  return rememberAnalysis(key, buildAnalysis(state));
}

export function getStrategicIntent(
  state: EngineState,
  player: Player,
): IntentProfile {
  return buildIntentProfile(analyzePosition(state), player);
}

export function getStrategicScore(state: EngineState, player: Player): number {
  const opponent = getOpponent(player);
  const analysis = analyzePosition(state);
  const ownProfile = buildIntentProfile(analysis, player);
  const opponentProfile = buildIntentProfile(analysis, opponent);
  const own = analysis.players[player];
  const other = analysis.players[opponent];

  return (
    getIntentScore(ownProfile) -
    getIntentScore(opponentProfile) +
    (own.laneOpenness - other.laneOpenness) * 22 +
    (own.jumpLanes - other.jumpLanes) * 46 +
    (other.frozenSingles - own.frozenSingles) * 95 +
    (other.frozenCriticalSingles - own.frozenCriticalSingles) * 120
  );
}

export function getActionStrategicProfile(
  state: EngineState,
  action: TurnAction,
  nextState: EngineState,
  player: Player,
): ActionStrategicProfile {
  const baseAnalysis = analyzePosition(state);
  const nextAnalysis = analyzePosition(nextState);
  const baseIntent = buildIntentProfile(baseAnalysis, player);
  const nextIntent = buildIntentProfile(nextAnalysis, player);
  const target = targetCoord(action);
  const source = sourceCoord(action);
  const targetControllerBefore = target ? getController(state.board, target) : null;
  const targetControllerAfter = target ? getController(nextState.board, target) : null;
  const tags = new Set<AiStrategicTag>();

  addTag(
    tags,
    nextAnalysis.emptyCells > baseAnalysis.emptyCells ||
      nextAnalysis.players[player].laneOpenness > baseAnalysis.players[player].laneOpenness,
    'openLane',
  );
  addTag(
    tags,
    nextAnalysis.players[player].totalDistanceToHome < baseAnalysis.players[player].totalDistanceToHome ||
      nextAnalysis.players[player].homeSingles > baseAnalysis.players[player].homeSingles,
    'advanceMass',
  );
  addTag(
    tags,
    nextAnalysis.players[getOpponent(player)].frozenSingles >
      baseAnalysis.players[getOpponent(player)].frozenSingles ||
      nextAnalysis.players[getOpponent(player)].frozenCriticalSingles >
        baseAnalysis.players[getOpponent(player)].frozenCriticalSingles,
    'freezeBlock',
  );
  addTag(
    tags,
    nextAnalysis.players[player].frozenSingles < baseAnalysis.players[player].frozenSingles ||
      nextAnalysis.players[player].buriedDebt < baseAnalysis.players[player].buriedDebt,
    'rescue',
  );
  addTag(
    tags,
    nextAnalysis.players[player].frontRowControlledHeight >
      baseAnalysis.players[player].frontRowControlledHeight ||
      nextAnalysis.players[player].frontRowOwnedTwoStacks >
        baseAnalysis.players[player].frontRowOwnedTwoStacks ||
      nextAnalysis.players[player].frontRowFullStacks >
        baseAnalysis.players[player].frontRowFullStacks,
    'frontBuild',
  );
  addTag(
    tags,
    target !== null &&
      targetControllerBefore !== null &&
      targetControllerBefore !== player &&
      targetControllerAfter === player,
    'captureControl',
  );
  addTag(
    tags,
    nextAnalysis.players[player].controlledStacks < baseAnalysis.players[player].controlledStacks ||
      nextAnalysis.players[player].buriedDebt < baseAnalysis.players[player].buriedDebt ||
      (source !== null &&
        action.type !== 'manualUnfreeze' &&
        getCellHeight(state.board, source) >= 2 &&
        target !== null &&
        getCellHeight(nextState.board, target) <= getCellHeight(state.board, source)),
    'decompress',
  );

  const tagList = [...tags].sort();
  let policyBias = 0;

  for (const tag of tagList) {
    switch (tag) {
      case 'frontBuild':
        policyBias += 260;
        break;
      case 'advanceMass':
        policyBias += 180;
        break;
      case 'freezeBlock':
        policyBias += 150;
        break;
      case 'openLane':
        policyBias += 120;
        break;
      case 'captureControl':
        policyBias += 90;
        break;
      case 'rescue':
        policyBias += 80;
        break;
      case 'decompress':
        policyBias += 60;
        break;
    }
  }

  return {
    intent: nextIntent.intent,
    intentDelta: getIntentScore(nextIntent) - getIntentScore(baseIntent),
    policyBias,
    tags: tagList,
  };
}

export function getNoveltyPenalty(
  currentTags: AiStrategicTag[],
  previousTags: AiStrategicTag[] | null | undefined,
): number {
  if (!previousTags?.length || !currentTags.length) {
    return 0;
  }

  return currentTags.every((tag) => previousTags.includes(tag)) ? 90 : 0;
}

export function inferPreviousStrategicTags(
  state: EngineState,
  player: Player,
): AiStrategicTag[] | null {
  if (!('history' in state) || !Array.isArray(state.history)) {
    return null;
  }

  for (let index = state.history.length - 1; index >= 0; index -= 1) {
    const record = state.history[index];

    if (record.actor !== player) {
      continue;
    }

    const beforeState: EngineState = {
      ...record.beforeState,
      positionCounts: state.positionCounts,
    };
    const afterState: EngineState = {
      ...record.afterState,
      positionCounts: state.positionCounts,
    };

    return getActionStrategicProfile(beforeState, record.action, afterState, player).tags;
  }

  return null;
}
