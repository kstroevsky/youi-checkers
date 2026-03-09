export const BOARD_COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export const BOARD_ROWS = [1, 2, 3, 4, 5, 6] as const;

export const DIRECTION_VECTORS = [
  { fileDelta: -1, rankDelta: -1 },
  { fileDelta: 0, rankDelta: -1 },
  { fileDelta: 1, rankDelta: -1 },
  { fileDelta: -1, rankDelta: 0 },
  { fileDelta: 1, rankDelta: 0 },
  { fileDelta: -1, rankDelta: 1 },
  { fileDelta: 0, rankDelta: 1 },
  { fileDelta: 1, rankDelta: 1 },
] as const;

export const INITIAL_RULE_CONFIG = {
  allowNonAdjacentFriendlyStackTransfer: true,
  drawRule: 'threefold',
  scoringMode: 'basic',
} as const;

export const HOME_ROWS = {
  white: new Set([4, 5, 6]),
  black: new Set([1, 2, 3]),
} as const;

export const FRONT_HOME_ROW = {
  white: 6,
  black: 1,
} as const;
