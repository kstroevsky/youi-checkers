import { applyAction, getLegalActions } from '@/domain';
import { createEmptyBoard } from '@/domain/model/board';
import { createCoord } from '@/domain/model/coordinates';
import type {
  Coord,
  GameState,
  RuleConfig,
  TurnAction,
} from '@/domain/model/types';
import { mirrorGameStateHorizontally } from '@/ai/test/symmetry';
import { checker, gameStateWithBoard } from '@/test/factories';

export type TacticalObjective = 'uniqueDefense' | 'uniqueWin';
export type TacticalSpatialVariant = 'horizontalMirror' | 'original';

export type TacticalOracleFixture = {
  expectedActionKeys: string[];
  id: string;
  label: string;
  objective: TacticalObjective;
  origin: 'curatedRegression';
  spatialVariant: TacticalSpatialVariant;
  state: GameState;
};

export function tacticalActionKey(action: TurnAction | null): string {
  if (!action) return 'none';
  if (action.type === 'manualUnfreeze') return `${action.type}:${action.coord}`;
  if (action.type === 'jumpSequence') {
    return `${action.type}:${action.source}:${action.path.join('>')}`;
  }
  return `${action.type}:${action.source}:${action.target}`;
}

function fillBlackReserve(
  board: ReturnType<typeof createEmptyBoard>,
  excluded: Set<Coord>,
  frozenSingles = true,
): void {
  const reserveCoords: Coord[] = [
    'A1',
    'B1',
    'C1',
    'D1',
    'E1',
    'F1',
    'A2',
    'B2',
    'C2',
    'D2',
    'E2',
    'F2',
    'A3',
    'B3',
    'C3',
    'D3',
    'E3',
    'F3',
  ];
  const missingReserveSlots = reserveCoords.filter((coord) =>
    excluded.has(coord),
  ).length;
  const stackCoord =
    frozenSingles && missingReserveSlots > 0
      ? (reserveCoords.find((coord) => !excluded.has(coord)) ?? null)
      : null;
  let blackCount = 0;

  for (const coord of reserveCoords) {
    if (excluded.has(coord)) continue;

    board[coord].checkers.push(
      checker('black', coord === stackCoord ? false : frozenSingles),
    );
    blackCount += 1;
  }

  while (blackCount < 18) {
    if (!stackCoord) {
      throw new Error('Black reserve could not place a valid overflow stack.');
    }
    board[stackCoord].checkers.push(checker('black'));
    blackCount += 1;
  }
}

/** Builds a position with a one-move home-field win for white. */
export function createHomeFieldWinState(): GameState {
  const board = createEmptyBoard();
  const excluded = new Set<Coord>(['C3']);

  for (const row of [4, 5, 6] as const) {
    for (const column of ['A', 'B', 'C', 'D', 'E', 'F'] as const) {
      const coord = createCoord(column, row);
      if (coord === 'C4') continue;

      board[coord].checkers = [checker('white')];
      excluded.add(coord);
    }
  }

  board.C3.checkers = [checker('white')];
  fillBlackReserve(board, excluded);
  return gameStateWithBoard(board);
}

/** Builds a position with a one-move six-stack win for white. */
export function createSixStackWinState(): GameState {
  const board = createEmptyBoard();
  const excluded = new Set<Coord>(['A5', 'A6']);

  (['B6', 'C6', 'D6', 'E6', 'F6'] as const).forEach((coord) => {
    board[coord].checkers = [
      checker('white'),
      checker('white'),
      checker('white'),
    ];
    excluded.add(coord);
  });
  board.A6.checkers = [checker('white'), checker('white')];
  board.A5.checkers = [checker('white')];
  fillBlackReserve(board, excluded);
  return gameStateWithBoard(board);
}

/** Builds a position where white must stop black from winning immediately. */
export function createOpponentThreatState(): GameState {
  const board = createEmptyBoard();

  (['B1', 'C1', 'D1', 'E1', 'F1'] as const).forEach((coord) => {
    board[coord].checkers = [
      checker('black'),
      checker('black'),
      checker('black'),
    ];
  });
  board.A1.checkers = [checker('black'), checker('black')];
  board.A2.checkers = [checker('black')];
  board.B2.checkers = [checker('white')];

  let whiteCount = 1;
  for (const row of [4, 5, 6] as const) {
    for (const column of ['A', 'B', 'C', 'D', 'E', 'F'] as const) {
      const coord = createCoord(column, row);
      if (coord === 'B4') continue;

      board[coord].checkers = [checker('white', true)];
      whiteCount += 1;
      if (whiteCount === 18) break;
    }
    if (whiteCount === 18) break;
  }

  return gameStateWithBoard(board);
}

function isImmediateWin(
  state: GameState,
  action: TurnAction,
  ruleConfig: RuleConfig,
): boolean {
  const actor = state.currentPlayer;
  const nextState = applyAction(state, action, ruleConfig);
  return (
    nextState.status === 'gameOver' &&
    'winner' in nextState.victory &&
    nextState.victory.winner === actor
  );
}

function deriveExpectedActionKeys(
  state: GameState,
  objective: TacticalObjective,
  ruleConfig: RuleConfig,
): string[] {
  const legalActions = getLegalActions(state, ruleConfig);
  if (objective === 'uniqueWin') {
    return legalActions
      .filter((action) => isImmediateWin(state, action, ruleConfig))
      .map(tacticalActionKey);
  }

  return legalActions
    .filter((action) => {
      const nextState = applyAction(state, action, ruleConfig);
      if (
        nextState.status === 'gameOver' ||
        nextState.currentPlayer === state.currentPlayer
      ) {
        return false;
      }

      return !getLegalActions(nextState, ruleConfig).some((reply) =>
        isImmediateWin(nextState, reply, ruleConfig),
      );
    })
    .map(tacticalActionKey);
}

/** Curated tactical labels are derived from rules and validated as genuinely unique. */
export function buildTacticalOracleFixtures(
  ruleConfig: RuleConfig,
): TacticalOracleFixture[] {
  const definitions = [
    {
      label: 'home-field-win',
      objective: 'uniqueWin' as const,
      state: createHomeFieldWinState(),
    },
    {
      label: 'six-stack-win',
      objective: 'uniqueWin' as const,
      state: createSixStackWinState(),
    },
    {
      label: 'immediate-defense',
      objective: 'uniqueDefense' as const,
      state: createOpponentThreatState(),
    },
  ];

  return definitions.flatMap((definition) =>
    (
      [
        ['original', definition.state],
        ['horizontalMirror', mirrorGameStateHorizontally(definition.state)],
      ] as const
    ).map(([spatialVariant, state]) => {
      const expectedActionKeys = deriveExpectedActionKeys(
        state,
        definition.objective,
        ruleConfig,
      );
      if (expectedActionKeys.length !== 1) {
        throw new Error(
          `Tactical fixture ${definition.label}/${spatialVariant} expected one ` +
            `${definition.objective} action, found ${expectedActionKeys.length}.`,
        );
      }

      return {
        expectedActionKeys,
        id: `${definition.label}/${spatialVariant}`,
        label: definition.label,
        objective: definition.objective,
        origin: 'curatedRegression' as const,
        spatialVariant,
        state,
      };
    }),
  );
}
