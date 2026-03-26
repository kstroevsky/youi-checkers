import { applyAction, createInitialState } from '@/domain';
import type { Coord, GameState, RuleConfig, TurnAction } from '@/domain/model/types';

export const LATE_GAME_PERF_SCENARIOS = [
  { label: 'opening', turnCount: 0 },
  { label: 'turn50', turnCount: 50 },
  { label: 'turn100', turnCount: 100 },
  { label: 'turn200', turnCount: 200 },
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
