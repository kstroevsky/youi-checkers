import {
  isFullStackOwnedByPlayer,
  countCheckersForPlayer,
  getTopChecker,
  isSingleChecker,
} from '@/domain/model/board';
import { BOARD_COLUMNS, FRONT_HOME_ROW, HOME_ROWS } from '@/domain/model/constants';
import { allCoords, createCoord, parseCoord } from '@/domain/model/coordinates';
import { hashPosition } from '@/domain/model/hash';
import { withRuleDefaults } from '@/domain/model/ruleConfig';
import type { Column, Coord, EngineState, Player, RuleConfig, Victory } from '@/domain/model/types';

const FRONT_HOME_COORDS: Record<Player, Coord[]> = {
  white: BOARD_COLUMNS.map((column) => createCoord(column as Column, FRONT_HOME_ROW.white)),
  black: BOARD_COLUMNS.map((column) => createCoord(column as Column, FRONT_HOME_ROW.black)),
};
const DRAW_TIEBREAK_CACHE_LIMIT = 20_000;

type DrawTiebreakMetrics = {
  completedHomeStacks: Record<Player, number>;
  ownFieldCheckers: Record<Player, number>;
};

const drawTiebreakMetricsCache = new Map<string, DrawTiebreakMetrics>();

type DrawSource = 'threefold' | 'stalemate';

/** True when all 18 player checkers are singles inside that player's home rows. */
function hasHomeFieldWin(state: EngineState, player: Player): boolean {
  if (countCheckersForPlayer(state.board, player) !== 18) {
    return false;
  }

  return allCoords().every((coord) => {
    const checker = getTopChecker(state.board, coord);

    if (!checker || checker.owner !== player) {
      return true;
    }

    const { row } = parseCoord(coord);
    return HOME_ROWS[player].has(row) && isSingleChecker(state.board, coord);
  });
}

/** True when six front-row stacks are full height and contain only the player's own checkers. */
function hasSixStackWin(state: EngineState, player: Player): boolean {
  return FRONT_HOME_COORDS[player].every((coord) =>
    isFullStackOwnedByPlayer(state.board, coord, player),
  );
}

function countOwnFieldCheckers(state: EngineState, player: Player): number {
  return allCoords().reduce((count, coord) => {
    const { row } = parseCoord(coord);

    if (!HOME_ROWS[player].has(row)) {
      return count;
    }

    return (
      count +
      state.board[coord].checkers.filter((checker) => checker.owner === player).length
    );
  }, 0);
}

function countCompletedHomeStacks(state: EngineState, player: Player): number {
  return allCoords().reduce((count, coord) => {
    const { row } = parseCoord(coord);

    if (!HOME_ROWS[player].has(row)) {
      return count;
    }

    return count + (isFullStackOwnedByPlayer(state.board, coord, player) ? 1 : 0);
  }, 0);
}

function rememberDrawTiebreakMetrics(key: string, metrics: DrawTiebreakMetrics): DrawTiebreakMetrics {
  if (drawTiebreakMetricsCache.size >= DRAW_TIEBREAK_CACHE_LIMIT) {
    const oldestKey = drawTiebreakMetricsCache.keys().next().value;

    if (oldestKey) {
      drawTiebreakMetricsCache.delete(oldestKey);
    }
  }

  drawTiebreakMetricsCache.set(key, metrics);
  return metrics;
}

export function getDrawTiebreakMetrics(state: EngineState): DrawTiebreakMetrics {
  return getDrawTiebreakMetricsByKey(state, hashPosition(state));
}

/** Reuses a known position key when victory and AI layers need the same tiebreak snapshot. */
export function getDrawTiebreakMetricsByKey(
  state: EngineState,
  key: string,
): DrawTiebreakMetrics {
  const cached = drawTiebreakMetricsCache.get(key);

  if (cached) {
    return cached;
  }

  return rememberDrawTiebreakMetrics(key, {
    ownFieldCheckers: {
      white: countOwnFieldCheckers(state, 'white'),
      black: countOwnFieldCheckers(state, 'black'),
    },
    completedHomeStacks: {
      white: countCompletedHomeStacks(state, 'white'),
      black: countCompletedHomeStacks(state, 'black'),
    },
  });
}

function createTiebreakWin(
  source: DrawSource,
  winner: Player,
  metrics: ReturnType<typeof getDrawTiebreakMetrics>,
  decidedBy: 'checkers' | 'stacks',
): Victory {
  return {
    type: source === 'threefold' ? 'threefoldTiebreakWin' : 'stalemateTiebreakWin',
    winner,
    ownFieldCheckers: { ...metrics.ownFieldCheckers },
    completedHomeStacks: { ...metrics.completedHomeStacks },
    decidedBy,
  };
}

export function resolveDrawOutcome(state: EngineState, source: DrawSource): Victory {
  const metrics = getDrawTiebreakMetrics(state);
  const whiteCheckers = metrics.ownFieldCheckers.white;
  const blackCheckers = metrics.ownFieldCheckers.black;

  if (whiteCheckers !== blackCheckers) {
    return createTiebreakWin(
      source,
      whiteCheckers > blackCheckers ? 'white' : 'black',
      metrics,
      'checkers',
    );
  }

  const whiteStacks = metrics.completedHomeStacks.white;
  const blackStacks = metrics.completedHomeStacks.black;

  if (whiteStacks !== blackStacks) {
    return createTiebreakWin(
      source,
      whiteStacks > blackStacks ? 'white' : 'black',
      metrics,
      'stacks',
    );
  }

  return { type: source === 'threefold' ? 'threefoldDraw' : 'stalemateDraw' };
}

/** Evaluates deterministic terminal status for current state under provided rules. */
export function checkVictory(
  state: EngineState,
  config: Partial<RuleConfig> = {},
): Victory {
  const resolvedConfig = withRuleDefaults(config);

  for (const player of ['white', 'black'] as const) {
    if (hasHomeFieldWin(state, player)) {
      return { type: 'homeField', winner: player };
    }

    if (hasSixStackWin(state, player)) {
      return { type: 'sixStacks', winner: player };
    }
  }

  if (resolvedConfig.drawRule === 'threefold') {
    const positionHash = hashPosition(state);

    if ((state.positionCounts[positionHash] ?? 0) >= 3) {
      return resolveDrawOutcome(state, 'threefold');
    }
  }

  return { type: 'none' };
}
