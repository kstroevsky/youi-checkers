import { AI_DIFFICULTY_PRESETS } from '@/ai/presets';
import { createEmptyResult } from '@/ai/search/result';
import type {
  AiSearchResult,
  AiStrategicIntent,
  ChooseComputerActionRequest,
} from '@/ai/types';
import {
  advanceFinishingEngineState,
  getLegalActions,
  getScoreSummary,
  hashPosition,
  type EngineState,
  type Player,
  type TurnAction,
} from '@/domain';

const FINISH_SCORE = 1_000_000;

type SearchCandidate = {
  action: TurnAction;
  nextState: EngineState;
  score: number;
};

type FinishingLine = {
  path: TurnAction[];
  score: number;
  terminal: boolean;
};

class FinishingSearchTimeout extends Error {}

function isPlayerVictory(state: EngineState, player: Player): boolean {
  return (
    state.status === 'gameOver' &&
    'winner' in state.victory &&
    state.victory.winner === player
  );
}

function getFinishingProgress(state: EngineState, player: Player): number {
  const summary = getScoreSummary(state);
  const homeProgress = summary.homeFieldSingles[player] / 18;
  const stackProgress = summary.controlledHomeRowHeightThreeStacks[player] / 6;

  return (
    Math.max(homeProgress, stackProgress) * 100_000 +
    Math.min(homeProgress, stackProgress) * 10_000 +
    summary.controlledStacks[player] * 100 -
    summary.frozenEnemySingles[player] * 10
  );
}

function getStrategicIntent(
  state: EngineState,
  player: Player,
): AiStrategicIntent {
  const summary = getScoreSummary(state);
  const homeProgress = summary.homeFieldSingles[player] / 18;
  const stackProgress = summary.controlledHomeRowHeightThreeStacks[player] / 6;

  if (homeProgress === stackProgress) {
    return 'hybrid';
  }

  return homeProgress > stackProgress ? 'home' : 'sixStack';
}

function buildCandidates(
  state: EngineState,
  player: Player,
  ruleConfig: ChooseComputerActionRequest['ruleConfig'],
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

      candidates.push({
        action,
        nextState,
        score: isPlayerVictory(nextState, player)
          ? FINISH_SCORE
          : getFinishingProgress(nextState, player),
      });
    } catch {
      // A dead-end finishing action cannot contribute to a valid completion line.
    }
  }

  return candidates.sort((left, right) => right.score - left.score);
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
  const rootCandidates = buildCandidates(state, player, ruleConfig);
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
        score: getFinishingProgress(state, player),
        terminal: false,
      };
  let timedOut = false;

  const checkDeadline = (): void => {
    if (now() >= deadline) {
      throw new FinishingSearchTimeout();
    }
  };

  const search = (
    currentState: EngineState,
    depth: number,
    visited: Set<string>,
  ): FinishingLine => {
    checkDeadline();

    if (isPlayerVictory(currentState, player)) {
      return { path: [], score: FINISH_SCORE, terminal: true };
    }

    if (depth === 0) {
      return {
        path: [],
        score: getFinishingProgress(currentState, player),
        terminal: false,
      };
    }

    const candidates = buildCandidates(currentState, player, ruleConfig).slice(
      0,
      preset.quietMoveLimit,
    );
    evaluatedNodes += candidates.length;
    let best: FinishingLine = {
      path: [],
      score: getFinishingProgress(currentState, player),
      terminal: false,
    };

    for (const candidate of candidates) {
      checkDeadline();

      const positionKey = hashPosition(candidate.nextState);

      if (visited.has(positionKey)) {
        continue;
      }

      if (isPlayerVictory(candidate.nextState, player)) {
        return {
          path: [candidate.action],
          score: FINISH_SCORE - 1,
          terminal: true,
        };
      }

      visited.add(positionKey);
      const continuation = search(candidate.nextState, depth - 1, visited);
      visited.delete(positionKey);
      const line = {
        path: [candidate.action, ...continuation.path],
        score: continuation.terminal
          ? continuation.score - 1
          : continuation.score,
        terminal: continuation.terminal,
      };

      if (line.score > best.score) {
        best = line;
      }
    }

    return best;
  };

  for (let depth = 1; depth <= preset.maxDepth; depth += 1) {
    try {
      const visited = new Set([hashPosition(state)]);
      const line = search(state, depth, visited);

      completedDepth = depth;
      if (line.path.length > 0) {
        bestLine = line;
      }

      if (line.terminal) {
        break;
      }
    } catch (error) {
      if (!(error instanceof FinishingSearchTimeout)) {
        throw error;
      }

      timedOut = true;
      break;
    }
  }

  const action = bestLine.path[0] ?? fallback?.action ?? null;
  const previewState =
    rootCandidates.find((candidate) => candidate.action === action)
      ?.nextState ?? state;
  const baseResult = createEmptyResult(action, bestLine.score);

  return {
    ...baseResult,
    behaviorProfileId: behaviorProfile?.id ?? null,
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
    score: bestLine.score,
    strategicIntent: getStrategicIntent(previewState, player),
    timedOut,
  };
}
