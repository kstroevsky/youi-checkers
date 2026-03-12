/** Public AI surface shared by the worker, store, and tests. */
export { evaluateState } from '@/ai/evaluation';
export { orderMoves } from '@/ai/moveOrdering';
export { AI_DIFFICULTY_PRESETS } from '@/ai/presets';
export { chooseComputerAction } from '@/ai/search';
export type {
  AiFallbackKind,
  AiDifficultyPreset,
  AiModelGuidance,
  AiRootCandidate,
  AiSearchDiagnostics,
  AiSearchResult,
  AiStrategicIntent,
  AiStrategicTag,
  AiWorkerRequest,
  AiWorkerResponse,
  ChooseComputerActionRequest,
} from '@/ai/types';
