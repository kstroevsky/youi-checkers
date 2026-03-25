export { createInitialBoard, createInitialState } from '@/domain/generators/createInitialState';
export { hashPosition } from '@/domain/model/hash';
export { RULE_DEFAULTS, RULE_TOGGLE_DESCRIPTORS, withRuleDefaults } from '@/domain/model/ruleConfig';
export { advanceEngineState, applyAction } from '@/domain/reducers/gameReducer';
export {
  runEngineCommand,
  runGameCommand,
} from '@/domain/reducers/engineTransition';
export { getScoreSummary } from '@/domain/rules/scoring';
export {
  createUndoFrame,
  deserializeSession,
  restoreGameState,
  serializeSession,
} from '@/domain/serialization/session';
export {
  applyValidatedAction,
  applyActionToBoard,
  buildTargetMap,
  createJumpStateKey,
  createEmptyTargetMap,
  getJumpContinuationTargets,
  getLegalActions,
  getLegalActionsForCell,
  getLegalTargetsForCell,
  validateAction,
} from '@/domain/rules/moveGeneration';
export type { TargetMap } from '@/domain/rules/moveGeneration';
export { checkVictory } from '@/domain/rules/victory';
export type {
  ActionKind,
  Board,
  Cell,
  Checker,
  Coord,
  EngineState,
  FriendlyStackTransferAction,
  GameState,
  MoveSingleToEmptyAction,
  PendingJump,
  Player,
  RuleConfig,
  ScoreSummary,
  StateSnapshot,
  TurnAction,
  TurnRecord,
  ValidationResult,
  Victory,
} from '@/domain/model/types';
export type {
  DomainEvent,
  EngineCommand,
  EngineTransitionResult,
  GameTransitionResult,
} from '@/domain/reducers/engineTransition';
