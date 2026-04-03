import { applyAction, createInitialState, getLegalActions } from '@/domain';
import type { Coord, GameState, RuleConfig, TurnAction } from '@/domain/model/types';

export type LateGamePerfScenario = {
  /** How to generate the position. 'loop' uses the fixed PREFIX_17 + LOOP_CYCLE trace;
   *  'randomPlay' uses seeded-random legal moves for a realistic mid-game position. */
  fixture: 'loop' | 'randomPlay';
  label: string;
  /** Only used when fixture === 'randomPlay'. */
  seed?: number;
  turnCount: number;
};

export const LATE_GAME_PERF_SCENARIOS: readonly LateGamePerfScenario[] = [
  { fixture: 'loop', label: 'opening', turnCount: 0 },
  // Realistic mid-game positions generated from seeded random legal-move play.
  // These have all (or most) pieces still active with a typical branching factor,
  // unlike the loop-based traces which collapse to 2-3 active pieces after turn 17.
  { fixture: 'randomPlay', label: 'midgame20', seed: 0x1a2b3c, turnCount: 20 },
  { fixture: 'randomPlay', label: 'midgame40', seed: 0x4d5e6f, turnCount: 40 },
  // Loop-pressure traces — still useful for testing draw-aversion and loop-escape heuristics.
  { fixture: 'loop', label: 'loopPressure50', turnCount: 50 },
  { fixture: 'loop', label: 'loopPressure100', turnCount: 100 },
  { fixture: 'loop', label: 'lateSparse200', turnCount: 200 },
] as const;

const PREFIX_17 = [
  'climbOne:A1:B1',
  'climbOne:A4:A3',
  'climbOne:B1:C1',
  'jumpSequence:A3:A1',
  'climbOne:B1:A1',
  'climbOne:B4:B3',
  'jumpSequence:A1:A3',
  'jumpSequence:B3:B1',
  'climbOne:C1:B1',
  'climbOne:C4:C3',
  'jumpSequence:B1:B3',
  'jumpSequence:C3:A1',
  'jumpSequence:C1:C3',
  'climbOne:A1:A2',
  'climbOne:A1:A2',
  'climbOne:D4:C3',
  'climbOne:D1:E1',
] as const;

const LOOP_CYCLE = [
  'jumpSequence:C3:A1',
  'jumpSequence:E1:C3',
  'jumpSequence:C3:C1',
  'jumpSequence:A1:C3',
  'jumpSequence:C3:E1',
  'jumpSequence:C1:C3',
] as const;

function parseReplayAction(serialized: string): TurnAction {
  const [type, sourceOrCoord, destination = ''] = serialized.split(':');

  switch (type) {
    case 'manualUnfreeze':
      return {
        type,
        coord: sourceOrCoord as Coord,
      };
    case 'jumpSequence':
      return {
        type,
        path: destination.split('>') as Coord[],
        source: sourceOrCoord as Coord,
      };
    default:
      return {
        type: type as Exclude<TurnAction['type'], 'jumpSequence' | 'manualUnfreeze'>,
        source: sourceOrCoord as Coord,
        target: destination as Coord,
      };
  }
}

function buildReplayTrace(turnCount: number): string[] {
  if (turnCount <= PREFIX_17.length) {
    return PREFIX_17.slice(0, turnCount);
  }

  const repeatedTurnCount = turnCount - PREFIX_17.length;
  const fullCycles = Math.floor(repeatedTurnCount / LOOP_CYCLE.length);
  const remainder = repeatedTurnCount % LOOP_CYCLE.length;

  return [
    ...PREFIX_17,
    ...Array.from({ length: fullCycles }, () => LOOP_CYCLE).flat(),
    ...LOOP_CYCLE.slice(0, remainder),
  ];
}

/** Replays the fixed late-game benchmark traces used by the perf harness. */
export function createLateGamePerfState(
  turnCount: number,
  config: RuleConfig,
): GameState {
  let state = createInitialState(config);

  for (const serializedAction of buildReplayTrace(turnCount)) {
    state = applyAction(state, parseReplayAction(serializedAction), config);
  }

  return state;
}

/**
 * Minimal LCG — same algorithm used in searchTestUtils so seeds are portable.
 * Returns values in [0, 1).
 */
function seededLcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * Generates a realistic mid-game position by replaying `turnCount` random legal
 * moves from the initial state using a seeded RNG.  Unlike the LOOP_CYCLE traces,
 * this keeps all pieces on the board and produces a typical branching factor
 * (~15–30 legal actions), making it a much better proxy for real player games.
 */
export function createRandomPlayPerfState(
  turnCount: number,
  config: RuleConfig,
  seed = 0x1a2b3c,
): GameState {
  let state = createInitialState(config);
  const rand = seededLcg(seed);

  for (let i = 0; i < turnCount; i++) {
    if (state.status === 'gameOver') break;
    const actions = getLegalActions(state, config);
    if (!actions.length) break;
    state = applyAction(state, actions[Math.floor(rand() * actions.length)]!, config);
  }

  return state;
}

/** Unified factory used by both the domain perf report and the root cache benchmark. */
export function createPerfStateForScenario(
  scenario: LateGamePerfScenario,
  config: RuleConfig,
): GameState {
  if (scenario.fixture === 'randomPlay') {
    return createRandomPlayPerfState(scenario.turnCount, config, scenario.seed);
  }
  return scenario.turnCount === 0
    ? createInitialState(config)
    : createLateGamePerfState(scenario.turnCount, config);
}
