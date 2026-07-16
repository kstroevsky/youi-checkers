export type {
  AppliedActionState,
  TargetMap,
} from '@/domain/rules/moveGeneration/types';
export {
  applyActionToBoard,
  applyValidatedAction,
  applyValidatedActionToBoard,
} from '@/domain/rules/moveGeneration/application';
export {
  createJumpStateKey,
  getJumpContinuationTargets,
} from '@/domain/rules/moveGeneration/jump';
export {
  buildTargetMap,
  createEmptyTargetMap,
} from '@/domain/rules/moveGeneration/targetMap';
export {
  getLegalActions,
  getLegalActionsForCell,
  getLegalTargetsForCell,
  hasLegalAction,
} from '@/domain/rules/moveGeneration/targetDiscovery';
export { validateAction } from '@/domain/rules/moveGeneration/validation';
