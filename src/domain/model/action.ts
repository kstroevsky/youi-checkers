import type { Coord, TurnAction } from '@/domain/model/types';

export type TurnActionEndpoints = {
  source: Coord;
  target: Coord;
};

/** Projects every action onto the two cells used by last-move presentation. */
export function getTurnActionEndpoints(
  action: TurnAction,
): TurnActionEndpoints {
  switch (action.type) {
    case 'manualUnfreeze':
      return { source: action.coord, target: action.coord };
    case 'jumpSequence':
      return {
        source: action.source,
        target: action.path.at(-1) ?? action.source,
      };
    default:
      return { source: action.source, target: action.target };
  }
}
