import { getBehaviorActionBias, getBehaviorGeometryBias } from '@/ai/behavior';
import {
  rerankRootStyleV1,
  type RootStyleCalibrationV1,
  type RootStyleRawFeaturesV1,
} from '@/ai/rootStyleReranker';
import { getRootPreviousStrategicTags } from '@/ai/search/heuristics';
import { getActionStrategicProfile } from '@/ai/strategy';
import type { AiRootCandidate, AiSearchResult } from '@/ai/types';
import { AI_DIFFICULTY_PRESETS } from '@/ai/presets';
import { buildParticipationState } from '@/ai/participation';
import {
  advanceGeneratedEngineState,
  type EngineState,
  type RuleConfig,
  type TurnAction,
} from '@/domain';
import { parseCoord } from '@/domain/model/coordinates';
import type { AiBehaviorProfile, AiDifficulty } from '@/shared/types/session';

function sourceRegion(
  action: TurnAction,
  player: EngineState['currentPlayer'],
) {
  const coord = action.type === 'manualUnfreeze' ? action.coord : action.source;
  const { column, row } = parseCoord(coord);
  const file =
    column === 'A' || column === 'B'
      ? 'left'
      : column === 'E' || column === 'F'
        ? 'right'
        : 'center';
  const relativeRow = player === 'white' ? row : 7 - row;
  const rank = relativeRow <= 2 ? 'rear' : relativeRow <= 4 ? 'mid' : 'front';
  return `${file}-${rank}`;
}

function jaccardDistance(
  left: AiRootCandidate['tags'],
  right: AiRootCandidate['tags'] | null,
) {
  if (!right) return 0;
  const union = new Set([...left, ...right]);
  if (!union.size) return 0;
  return 1 - left.filter((value) => right.includes(value)).length / union.size;
}

function terminalSafe(candidates: AiRootCandidate[]) {
  const wins = candidates.filter(
    (candidate) => candidate.terminalUtility === 'win',
  );
  if (wins.length) return wins;
  const nonLosses = candidates.filter(
    (candidate) => candidate.terminalUtility !== 'loss',
  );
  const lossSafe = nonLosses.length ? nonLosses : candidates;
  const nonAdverseDraws = lossSafe.filter(
    (candidate) => candidate.terminalUtility !== 'unfavorableDraw',
  );
  return nonAdverseDraws.length ? nonAdverseDraws : lossSafe;
}

export function buildRootStyleTreatmentRowsV1({
  behaviorProfile,
  difficulty,
  result,
  ruleConfig,
  state,
}: {
  behaviorProfile: AiBehaviorProfile | null;
  difficulty: AiDifficulty;
  result: AiSearchResult;
  ruleConfig: RuleConfig;
  state: EngineState;
}): RootStyleRawFeaturesV1[] {
  const candidates = terminalSafe(result.rootCandidates);
  const bestScore = Math.max(...candidates.map((candidate) => candidate.score));
  const eligible = candidates.filter(
    (candidate) =>
      bestScore - candidate.score <=
        AI_DIFFICULTY_PRESETS[difficulty].maxSelectionRegret &&
      !candidate.isForced &&
      !candidate.isSelfUndo &&
      !candidate.isRepetition &&
      candidate.drawTrapRisk < 0.95,
  );
  const participation = buildParticipationState(
    state,
    AI_DIFFICULTY_PRESETS[difficulty].participationWindow,
  ).players[state.currentPlayer];
  const previousTags = getRootPreviousStrategicTags(state);
  return eligible.map((candidate) => {
    const next = advanceGeneratedEngineState(
      state,
      candidate.action,
      ruleConfig,
    );
    const profile = getActionStrategicProfile(
      state,
      candidate.action,
      next,
      state.currentPlayer,
    );
    const region = sourceRegion(candidate.action, state.currentPlayer);
    const plan: RootStyleRawFeaturesV1['plan'] =
      result.strategicIntent === 'hybrid'
        ? 0.25
        : profile.intent === result.strategicIntent
          ? 1
          : profile.intent === 'hybrid'
            ? 0.25
            : -1;
    return {
      action: candidate.action,
      actionKind: candidate.action.type,
      drawTrapRisk: candidate.drawTrapRisk,
      history:
        previousTags === null &&
        participation.lastSourceFamily === null &&
        participation.lastSourceRegion === null
          ? null
          : 0.5 * jaccardDistance(candidate.tags, previousTags) +
            0.25 *
              (participation.lastSourceFamily !== null &&
              candidate.sourceFamily !== participation.lastSourceFamily
                ? 1
                : 0) +
            0.25 *
              (participation.lastSourceRegion !== null &&
              region !== participation.lastSourceRegion
                ? 1
                : 0),
      participation: candidate.participationDelta,
      persona:
        getBehaviorActionBias(behaviorProfile?.id ?? null, candidate.tags) +
        6 *
          getBehaviorGeometryBias(
            behaviorProfile?.id ?? null,
            candidate.action,
            behaviorProfile?.seed ?? null,
          ),
      plan,
      productRegret: bestScore - candidate.score,
      progress: Math.max(candidate.homeFieldDelta, candidate.sixStackDelta),
      sourceFamily: candidate.sourceFamily,
      strategicIntent: profile.intent,
      tactical: candidate.isTactical,
      tags: candidate.tags,
      terminalClass: candidate.terminalUtility ?? 'nonterminal',
    };
  });
}

export function selectRootStyleTreatmentV1({
  behaviorProfile,
  calibration,
  difficulty,
  random,
  result,
  ruleConfig,
  state,
  temperature,
}: {
  behaviorProfile: AiBehaviorProfile | null;
  calibration: RootStyleCalibrationV1;
  difficulty: AiDifficulty;
  random: () => number;
  result: AiSearchResult;
  ruleConfig: RuleConfig;
  state: EngineState;
  temperature: 0.25 | 0.5 | 1 | 2;
}) {
  if (
    result.completedDepth <= 0 ||
    result.completedRootMoves !== result.rootCandidates.length ||
    !result.action
  )
    return result.action;
  const rows = buildRootStyleTreatmentRowsV1({
    behaviorProfile,
    difficulty,
    result,
    ruleConfig,
    state,
  });
  if (rows.length < 2) return result.action;
  const probabilities = rerankRootStyleV1({
    calibration,
    rows,
    temperature,
  }).sort((left, right) => left.actionKey.localeCompare(right.actionKey));
  let threshold = random();
  for (const candidate of probabilities) {
    threshold -= candidate.probability;
    if (threshold <= 0) return candidate.action;
  }
  return result.action;
}
