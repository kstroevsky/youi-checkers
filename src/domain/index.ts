export { createInitialBoard, createInitialState } from '@/domain/generators/createInitialState';
export { RULE_DEFAULTS, RULE_TOGGLE_DESCRIPTORS, withRuleDefaults } from '@/domain/model/ruleConfig';
export { applyAction } from '@/domain/reducers/gameReducer';
export { getScoreSummary } from '@/domain/rules/scoring';
export { deserializeSession, serializeSession } from '@/domain/serialization/session';
export {
  applyActionToBoard,
  getJumpContinuationTargets,
  getLegalActions,
  getLegalActionsForCell,
  getLegalTargetsForCell,
  validateAction,
} from '@/domain/rules/moveGeneration';
export { checkVictory } from '@/domain/rules/victory';
export type {
  ActionKind,
  Board,
  Cell,
  Checker,
  Coord,
  FriendlyStackTransferAction,
  GameState,
  Player,
  RuleConfig,
  ScoreSummary,
  StateSnapshot,
  TurnAction,
  TurnRecord,
  ValidationResult,
  Victory,
} from '@/domain/model/types';
