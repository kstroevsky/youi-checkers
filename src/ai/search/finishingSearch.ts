import { AI_DIFFICULTY_PRESETS } from '@/ai/presets';
import { createEmptyResult } from '@/ai/search/result';
import type {
  AiSearchResult,
  AiStrategicIntent,
  ChooseComputerActionRequest,
} from '@/ai/types';
import {
  advanceFinishingEngineState,
  getFinishingProgress,
  getLegalActions,
  hashPosition,
  type EngineState,
  type FinishingGoal,
  type Player,
  type TurnAction,
} from '@/domain';

const FINISH_SCORE = 1_000_000;
const MAX_FINISHING_PLAN_LENGTH = 120;

type SearchCandidate = {
  action: TurnAction;
  nextState: EngineState;
  positionKey: string;
  repeatedPositionCount: number;
  score: number;
};

type FinishingLine = {
  path: TurnAction[];
  score: number;
  terminal: boolean;
};

type FinishingPlanNode = FinishingLine & {
  state: EngineState;
};

class FinishingSearchTimeout extends Error {}

function isPlayerVictory(state: EngineState, player: Player): boolean {
  return (
    state.status === 'gameOver' &&
    'winner' in state.victory &&
    state.victory.winner === player
  );
}

function getStrategicIntent(goal: FinishingGoal): AiStrategicIntent {
  return goal;
}

function buildCandidates(
  state: EngineState,
  player: Player,
  ruleConfig: ChooseComputerActionRequest['ruleConfig'],
  goal: FinishingGoal,
): SearchCandidate[] {
  const candidates: SearchCandidate[] = [];

  for (const action of getLegalActions(state, ruleConfig)) {
    try {
      const nextState = advanceFinishingEngineState(
        state,
        action,
        player,
        ruleConfig,
      );
      const positionKey = hashPosition(nextState);

      candidates.push({
        action,
        nextState,
        positionKey,
        repeatedPositionCount: state.positionCounts[positionKey] ?? 0,
        score: isPlayerVictory(nextState, player)
          ? FINISH_SCORE
          : getFinishingProgress(nextState, player, goal).score,
      });
    } catch {
      // A dead-end finishing action cannot contribute to a valid completion line.
    }
  }

  const novelCandidates = candidates.filter(
    (candidate) => candidate.repeatedPositionCount === 0,
  );
  const selectableCandidates = novelCandidates.length
    ? novelCandidates
    : candidates;

  return selectableCandidates.sort(
    (left, right) =>
      left.repeatedPositionCount - right.repeatedPositionCount ||
      right.score - left.score,
  );
}

/** Finds the shortest completion line while only the finishing player acts. */
export function chooseFinishingAction({
  behaviorProfile = null,
  difficulty,
  now = () => performance.now(),
  ruleConfig,
  state,
}: ChooseComputerActionRequest): AiSearchResult {
  const preset = AI_DIFFICULTY_PRESETS[difficulty];
  const startedAt = now();
  const deadline = startedAt + preset.timeBudgetMs;
  const player = state.currentPlayer;
  const initialProgress = getFinishingProgress(state, player);
  const goal = initialProgress.goal;
  const rootCandidates = buildCandidates(state, player, ruleConfig, goal);
  const fallback = rootCandidates[0] ?? null;
  let evaluatedNodes = rootCandidates.length;
  let completedDepth = 0;
  let bestLine: FinishingLine = fallback
    ? {
        path: [fallback.action],
        score: fallback.score,
        terminal: isPlayerVictory(fallback.nextState, player),
      }
    : {
        path: [],
        score: initialProgress.score,
        terminal: false,
      };
  let timedOut = false;

  const checkDeadline = (): void => {
    if (now() >= deadline) {
      throw new FinishingSearchTimeout();
    }
  };

  try {
    const beamWidth = Math.max(8, preset.quietMoveLimit);
    const branchWidth = Math.max(3, Math.ceil(beamWidth / 4));
    const visited = new Set([hashPosition(state)]);
    let frontier: FinishingPlanNode[] = [];

    for (const candidate of rootCandidates.slice(0, beamWidth)) {
      if (visited.has(candidate.positionKey)) {
        continue;
      }

      visited.add(candidate.positionKey);
      const terminal = isPlayerVictory(candidate.nextState, player);
      const line: FinishingPlanNode = {
        path: [candidate.action],
        score: terminal ? FINISH_SCORE - 1 : candidate.score,
        state: candidate.nextState,
        terminal,
      };

      if (terminal) {
        bestLine = line;
        completedDepth = 1;
        break;
      }

      frontier.push(line);
    }

    if (!bestLine.terminal && frontier.length > 0) {
      frontier.sort((left, right) => right.score - left.score);
      bestLine = frontier[0];
      completedDepth = 1;
    }

    for (
      let depth = 2;
      depth <= MAX_FINISHING_PLAN_LENGTH && !bestLine.terminal;
      depth += 1
    ) {
      checkDeadline();
      const nextFrontier: FinishingPlanNode[] = [];

      for (const node of frontier) {
        checkDeadline();
        const candidates = buildCandidates(
          node.state,
          player,
          ruleConfig,
          goal,
        ).slice(0, branchWidth);
        evaluatedNodes += candidates.length;

        for (const candidate of candidates) {
          if (visited.has(candidate.positionKey)) {
            continue;
          }

          visited.add(candidate.positionKey);
          const path = [...node.path, candidate.action];

          if (isPlayerVictory(candidate.nextState, player)) {
            bestLine = {
              path,
              score: FINISH_SCORE - path.length,
              terminal: true,
            };
            completedDepth = depth;
            break;
          }

          nextFrontier.push({
            path,
            score: candidate.score,
            state: candidate.nextState,
            terminal: false,
          });
        }

        if (bestLine.terminal) {
          break;
        }
      }

      if (bestLine.terminal) {
        break;
      }

      if (nextFrontier.length === 0) {
        break;
      }

      nextFrontier.sort((left, right) => right.score - left.score);
      frontier = nextFrontier.slice(0, beamWidth);
      bestLine = frontier[0];
      completedDepth = depth;
    }
  } catch (error) {
    if (!(error instanceof FinishingSearchTimeout)) {
      throw error;
    }

    timedOut = true;
  }

  const action = bestLine.path[0] ?? fallback?.action ?? null;
  const baseResult = createEmptyResult(action, bestLine.score);

  return {
    ...baseResult,
    behaviorProfileId: behaviorProfile?.id ?? null,
    ...(bestLine.terminal ? { completionPlan: bestLine.path } : {}),
    completedDepth,
    completedRootMoves: completedDepth > 0 ? rootCandidates.length : 0,
    elapsedMs: Math.max(0, now() - startedAt),
    evaluatedNodes,
    fallbackKind: timedOut
      ? completedDepth > 0
        ? 'previousDepth'
        : 'legalOrder'
      : 'none',
    principalVariation: bestLine.path,
    searchBudget: {
      exhaustedBy: timedOut ? 'time' : 'none',
      maxDepth: MAX_FINISHING_PLAN_LENGTH,
      maxEvaluatedNodes: null,
      timeBudgetMs: preset.timeBudgetMs,
      type: 'presetTime',
    },
    score: bestLine.score,
    strategicIntent: getStrategicIntent(goal),
    timedOut,
  };
}
