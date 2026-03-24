import type { BOARD_COLUMNS, BOARD_ROWS } from "@/domain/model/constants";

export type Column = (typeof BOARD_COLUMNS)[number];
export type Row = (typeof BOARD_ROWS)[number];
export type Coord = `${Column}${Row}`;

export type Player = 'white' | 'black';

export type Checker = {
  id: string;
  owner: Player;
  frozen: boolean;
};

export type Cell = {
  checkers: Checker[];
};

export type Board = Record<Coord, Cell>;

export type RuleConfig = {
  allowNonAdjacentFriendlyStackTransfer: boolean;
  drawRule: 'none' | 'threefold';
  scoringMode: 'off' | 'basic';
};

export type PendingJump = {
  source: Coord;
  jumpedCheckerIds: string[];
  visitedCoords?: Coord[];
  visitedStateKeys?: string[];
};

export type JumpSequenceAction = {
  type: 'jumpSequence';
  source: Coord;
  path: Coord[];
};

export type ManualUnfreezeAction = {
  type: 'manualUnfreeze';
  coord: Coord;
};

export type ClimbOneAction = {
  type: 'climbOne';
  source: Coord;
  target: Coord;
};

export type MoveSingleToEmptyAction = {
  type: 'moveSingleToEmpty';
  source: Coord;
  target: Coord;
};

export type SplitOneFromStackAction = {
  type: 'splitOneFromStack';
  source: Coord;
  target: Coord;
};

export type SplitTwoFromStackAction = {
  type: 'splitTwoFromStack';
  source: Coord;
  target: Coord;
};

export type FriendlyStackTransferAction = {
  type: 'friendlyStackTransfer';
  source: Coord;
  target: Coord;
};

export type TurnAction =
  | JumpSequenceAction
  | ManualUnfreezeAction
  | ClimbOneAction
  | MoveSingleToEmptyAction
  | SplitOneFromStackAction
  | SplitTwoFromStackAction
  | FriendlyStackTransferAction;

export type ActionKind = TurnAction['type'];

export type Victory =
  | { type: 'none' }
  | { type: 'homeField'; winner: Player }
  | { type: 'sixStacks'; winner: Player }
  | {
      type: 'threefoldTiebreakWin';
      winner: Player;
      ownFieldCheckers: Record<Player, number>;
      completedHomeStacks: Record<Player, number>;
      decidedBy: 'checkers' | 'stacks';
    }
  | {
      type: 'stalemateTiebreakWin';
      winner: Player;
      ownFieldCheckers: Record<Player, number>;
      completedHomeStacks: Record<Player, number>;
      decidedBy: 'checkers' | 'stacks';
    }
  | { type: 'threefoldDraw' }
  | { type: 'stalemateDraw' };

export type StateSnapshot = {
  board: Board;
  currentPlayer: Player;
  moveNumber: number;
  status: 'active' | 'gameOver';
  victory: Victory;
  pendingJump: PendingJump | null;
};

export type EngineState = StateSnapshot & {
  positionCounts: Record<string, number>;
};

export type TurnRecord = {
  actor: Player;
  action: TurnAction;
  beforeState: StateSnapshot;
  afterState: StateSnapshot;
  autoPasses: Player[];
  victoryAfter: Victory;
  positionHash: string;
};

export type GameState = EngineState & {
  history: TurnRecord[];
};

export type ValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

export type ScoreSummary = {
  homeFieldSingles: Record<Player, number>;
  controlledStacks: Record<Player, number>;
  controlledHomeRowHeightThreeStacks: Record<Player, number>;
  frozenEnemySingles: Record<Player, number>;
};
