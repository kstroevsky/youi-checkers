import {
  advanceEngineState,
  getLegalActions,
  hashPosition,
  type EngineState,
  type RuleConfig,
  type TurnAction,
} from '@/domain';
import { evaluateState } from '@/ai/evaluation';
import { orderMoves, type OrderedAction } from '@/ai/moveOrdering';
import { AI_DIFFICULTY_PRESETS } from '@/ai/presets';
import { FRONT_HOME_ROW, HOME_ROWS } from '@/domain/model/constants';
import { parseCoord } from '@/domain/model/coordinates';
import type {
  AiDifficultyPreset,
  AiRootCandidate,
  AiSearchDiagnostics,
  AiSearchResult,
  ChooseComputerActionRequest,
} from '@/ai/types';

type BoundFlag = 'exact' | 'lower' | 'upper';

type TranspositionEntry = {
  bestAction: TurnAction | null;
  depth: number;
  flag: BoundFlag;
  score: number;
};

type RootRankedAction = Pick<
  OrderedAction,
  'action' | 'isForced' | 'isRepetition' | 'isSelfUndo' | 'isTactical'
> & {
  score: number;
};

type SearchContext = {
  deadline: number;
  diagnostics: AiSearchDiagnostics;
  evaluatedNodes: number;
  historyScores: Map<string, number>;
  killerMovesByDepth: Map<number, TurnAction[]>;
  now: () => number;
  preset: AiDifficultyPreset;
  pvMoveByDepth: Map<number, TurnAction>;
  rootPreviousOwnAction: TurnAction | null;
  quiescenceDepthLimit: number;
  rootSelfUndoPositionKey: string | null;
  ruleConfig: RuleConfig;
  table: Map<string, TranspositionEntry>;
  continuationScores: Map<string, number>;
};

// A hard cap keeps worker memory usage predictable in the browser.
const TRANSPOSITION_LIMIT = 50_000;
const MAX_QUIESCENCE_DEPTH = 6;
const AI_SEARCH_TIMEOUT = 'AI_SEARCH_TIMEOUT';

function actionKey(action: TurnAction): string {
  switch (action.type) {
    case 'manualUnfreeze':
      return `${action.type}:${action.coord}`;
    case 'jumpSequence':
      return `${action.type}:${action.source}:${action.path.join('>')}`;
    default:
      return `${action.type}:${action.source}:${action.target}`;
  }
}

function createSearchTimeoutError(): Error {
  return new Error(AI_SEARCH_TIMEOUT);
}

function createSearchDiagnostics(): AiSearchDiagnostics {
  return {
    betaCutoffs: 0,
    quiescenceNodes: 0,
    repetitionPenalties: 0,
    selfUndoPenalties: 0,
    transpositionHits: 0,
  };
}

function createEmptyResult(action: TurnAction | null, score: number): AiSearchResult {
  return {
    action,
    completedDepth: 0,
    completedRootMoves: action ? 1 : 0,
    diagnostics: createSearchDiagnostics(),
    elapsedMs: 0,
    evaluatedNodes: 0,
    fallbackKind: action ? 'legalOrder' : 'none',
    principalVariation: action ? [action] : [],
    rootCandidates: action
      ? [
          {
            action,
            isForced: false,
            isRepetition: false,
            isSelfUndo: false,
            isTactical: false,
            score,
          },
        ]
      : [],
    score,
    timedOut: false,
  };
}

function isSearchTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === AI_SEARCH_TIMEOUT;
}

function throwIfTimedOut(now: () => number, deadline: number): void {
  if (now() >= deadline) {
    throw createSearchTimeoutError();
  }
}

function sortRankedActions(ranked: RootRankedAction[]): RootRankedAction[] {
  ranked.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return actionKey(left.action).localeCompare(actionKey(right.action));
  });

  return ranked;
}

function makeTableKey(state: EngineState): string {
  return hashPosition(state);
}

function getMovePenalty(entry: OrderedAction, context: SearchContext): number {
  let penalty = 0;

  if (entry.isRepetition) {
    context.diagnostics.repetitionPenalties += 1;
    penalty += context.preset.repetitionPenalty * (entry.repeatedPositionCount - 1);
  }

  if (entry.isSelfUndo && !entry.isTactical) {
    context.diagnostics.selfUndoPenalties += 1;
    penalty += context.preset.selfUndoPenalty;
  }

  return penalty;
}

function rememberCutoffMove(
  entry: OrderedAction,
  depth: number,
  currentDepth: number,
  previousActionKey: string | null,
  context: SearchContext,
): void {
  if (entry.isTactical) {
    return;
  }

  const serialized = actionKey(entry.action);
  const bonus = Math.max(1, depth * depth);
  const historyScore = context.historyScores.get(serialized) ?? 0;

  context.historyScores.set(serialized, Math.min(32_000, historyScore + bonus * 24));

  if (previousActionKey) {
    const continuationKey = `${previousActionKey}->${serialized}`;
    const continuationScore = context.continuationScores.get(continuationKey) ?? 0;

    context.continuationScores.set(
      continuationKey,
      Math.min(24_000, continuationScore + bonus * 16),
    );
  }

  const killers = context.killerMovesByDepth.get(currentDepth) ?? [];

  if (killers.some((killer) => actionKey(killer) === serialized)) {
    return;
  }

  context.killerMovesByDepth.set(currentDepth, [entry.action, ...killers].slice(0, 2));
}

function toRootCandidate(entry: RootRankedAction): AiRootCandidate {
  return {
    action: entry.action,
    isForced: entry.isForced,
    isRepetition: entry.isRepetition,
    isSelfUndo: entry.isSelfUndo,
    isTactical: entry.isTactical,
    score: entry.score,
  };
}

function getRootSelfUndoPositionKey(state: EngineState): string | null {
  if (!('history' in state) || !Array.isArray(state.history)) {
    return null;
  }

  for (let index = state.history.length - 1; index >= 0; index -= 1) {
    const record = state.history[index];

    if (record.actor === state.currentPlayer) {
      return record.positionHash;
    }
  }

  return null;
}

function getRootPreviousOwnAction(state: EngineState): TurnAction | null {
  if (!('history' in state) || !Array.isArray(state.history)) {
    return null;
  }

  for (let index = state.history.length - 1; index >= 0; index -= 1) {
    const record = state.history[index];

    if (record.actor === state.currentPlayer) {
      return record.action;
    }
  }

  return null;
}

function getGrandparentPositionKey(
  currentDepth: number,
  ancestorPositionKeys: string[],
  context: SearchContext,
): string | null {
  if (currentDepth === 0) {
    return context.rootSelfUndoPositionKey;
  }

  return ancestorPositionKeys.at(-2) ?? null;
}

function getQuiescenceMoves(
  state: EngineState,
  currentDepth: number,
  ancestorPositionKeys: string[],
  ancestorActions: TurnAction[],
  previousActionKey: string | null,
  context: SearchContext,
): OrderedAction[] {
  const legalActions = getLegalActions(state, context.ruleConfig);

  if (!legalActions.length) {
    return [];
  }

  const candidateActions =
    legalActions.length === 1
      ? legalActions
      : legalActions.filter((action) => {
          if (action.type === 'jumpSequence' || action.type === 'manualUnfreeze') {
            return true;
          }

          const target = action.target;

          if (!target) {
            return false;
          }

          const { row } = parseCoord(target);

          return HOME_ROWS[state.currentPlayer].has(row as never) || row === FRONT_HOME_ROW[state.currentPlayer];
        });

  if (!candidateActions.length) {
    return [];
  }

  const ordered = orderMoves(
    state,
    state.currentPlayer,
    context.ruleConfig,
    context.preset,
    {
      actions: candidateActions,
      deadline: context.deadline,
      grandparentPositionKey: getGrandparentPositionKey(
        currentDepth,
        ancestorPositionKeys,
        context,
      ),
      historyScores: context.historyScores,
      includeAllQuietMoves: true,
      killerMoves: context.killerMovesByDepth.get(currentDepth) ?? [],
      now: context.now,
      previousActionKey,
      pvMove: context.pvMoveByDepth.get(currentDepth),
      repetitionPenalty: context.preset.repetitionPenalty,
      samePlayerPreviousAction:
        currentDepth === 0
          ? context.rootPreviousOwnAction
          : ancestorActions.at(-2) ?? null,
      selfUndoPenalty: context.preset.selfUndoPenalty,
      continuationScores: context.continuationScores,
      ttMove: context.table.get(makeTableKey(state))?.bestAction,
    },
  );

  if (candidateActions.length === 1) {
    return ordered.slice(0, 1);
  }

  return ordered.filter(
    (entry) =>
      entry.isForced ||
      entry.winsImmediately ||
      entry.action.type === 'jumpSequence' ||
      entry.action.type === 'manualUnfreeze',
  );
}

function quiescence(
  state: EngineState,
  alpha: number,
  beta: number,
  currentDepth: number,
  ancestorPositionKeys: string[],
  ancestorActions: TurnAction[],
  previousActionKey: string | null,
  context: SearchContext,
): number {
  throwIfTimedOut(context.now, context.deadline);
  context.diagnostics.quiescenceNodes += 1;
  context.evaluatedNodes += 1;

  const standPat = evaluateState(state, state.currentPlayer, context.ruleConfig);

  if (currentDepth >= context.quiescenceDepthLimit) {
    return standPat;
  }

  if (standPat >= beta) {
    return standPat;
  }

  alpha = Math.max(alpha, standPat);

  const forcingMoves = getQuiescenceMoves(
    state,
    currentDepth,
    ancestorPositionKeys,
    ancestorActions,
    previousActionKey,
    context,
  );

  if (!forcingMoves.length) {
    return standPat;
  }

  let bestScore = standPat;

  for (const entry of forcingMoves) {
    const nextPositionKey = makeTableKey(entry.nextState);
    let score = -quiescence(
      entry.nextState,
      -beta,
      -alpha,
      currentDepth + 1,
      [...ancestorPositionKeys, nextPositionKey],
      [...ancestorActions, entry.action],
      actionKey(entry.action),
      context,
    );

    score -= getMovePenalty(entry, context);

    if (score > bestScore) {
      bestScore = score;
    }

    alpha = Math.max(alpha, score);

    if (alpha >= beta) {
      context.diagnostics.betaCutoffs += 1;
      break;
    }
  }

  return bestScore;
}

function negamax(
  state: EngineState,
  depth: number,
  alpha: number,
  beta: number,
  currentDepth: number,
  ancestorPositionKeys: string[],
  ancestorActions: TurnAction[],
  previousActionKey: string | null,
  context: SearchContext,
): number {
  throwIfTimedOut(context.now, context.deadline);

  const originalAlpha = alpha;
  const originalBeta = beta;
  const tableKey = makeTableKey(state);
  const cached = context.table.get(tableKey);

  if (cached && cached.depth >= depth) {
    context.diagnostics.transpositionHits += 1;

    if (cached.flag === 'exact') {
      return cached.score;
    }

    if (cached.flag === 'lower') {
      alpha = Math.max(alpha, cached.score);
    } else {
      beta = Math.min(beta, cached.score);
    }

    if (alpha >= beta) {
      return cached.score;
    }
  }

  if (state.status === 'gameOver') {
    context.evaluatedNodes += 1;
    return evaluateState(state, state.currentPlayer, context.ruleConfig);
  }

  if (depth === 0) {
    return quiescence(
      state,
      alpha,
      beta,
      currentDepth,
      ancestorPositionKeys,
      ancestorActions,
      previousActionKey,
      context,
    );
  }

  const orderedMoves = orderMoves(
    state,
    state.currentPlayer,
    context.ruleConfig,
    context.preset,
    {
      deadline: context.deadline,
      grandparentPositionKey: getGrandparentPositionKey(
        currentDepth,
        ancestorPositionKeys,
        context,
      ),
      historyScores: context.historyScores,
      killerMoves: context.killerMovesByDepth.get(currentDepth) ?? [],
      now: context.now,
      previousActionKey,
      pvMove: context.pvMoveByDepth.get(currentDepth),
      repetitionPenalty: context.preset.repetitionPenalty,
      samePlayerPreviousAction:
        currentDepth === 0
          ? context.rootPreviousOwnAction
          : ancestorActions.at(-2) ?? null,
      selfUndoPenalty: context.preset.selfUndoPenalty,
      continuationScores: context.continuationScores,
      ttMove: cached?.bestAction,
    },
  );

  if (!orderedMoves.length) {
    context.evaluatedNodes += 1;
    return evaluateState(state, state.currentPlayer, context.ruleConfig);
  }

  let bestAction: TurnAction | null = cached?.bestAction ?? null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const entry of orderedMoves) {
    const nextPositionKey = makeTableKey(entry.nextState);
    let score = -negamax(
      entry.nextState,
      depth - 1,
      -beta,
      -alpha,
      currentDepth + 1,
      [...ancestorPositionKeys, nextPositionKey],
      [...ancestorActions, entry.action],
      actionKey(entry.action),
      context,
    );

    score -= getMovePenalty(entry, context);

    if (score > bestScore) {
      bestScore = score;
      bestAction = entry.action;
    }

    alpha = Math.max(alpha, score);

    if (alpha >= beta) {
      context.diagnostics.betaCutoffs += 1;
      rememberCutoffMove(entry, depth, currentDepth, previousActionKey, context);
      break;
    }
  }

  const flag: BoundFlag =
    bestScore <= originalAlpha ? 'upper' : bestScore >= originalBeta ? 'lower' : 'exact';

  if (context.table.size >= TRANSPOSITION_LIMIT) {
    const oldestKey = context.table.keys().next().value;

    if (oldestKey) {
      context.table.delete(oldestKey);
    }
  }

  context.table.set(tableKey, {
    bestAction,
    depth,
    flag,
    score: bestScore,
  });

  if (bestAction) {
    context.pvMoveByDepth.set(currentDepth, bestAction);
  }

  return bestScore;
}

function buildPrincipalVariation(
  state: EngineState,
  bestAction: TurnAction | null,
  completedDepth: number,
  context: SearchContext,
): TurnAction[] {
  if (!bestAction || completedDepth <= 0) {
    return [];
  }

  const variation: TurnAction[] = [];
  let currentState = state;
  let currentAction: TurnAction | null = bestAction;

  while (currentAction && variation.length < completedDepth) {
    variation.push(currentAction);
    currentState = advanceEngineState(currentState, currentAction, context.ruleConfig);

    if (currentState.status === 'gameOver') {
      break;
    }

    currentAction = context.table.get(makeTableKey(currentState))?.bestAction ?? null;
  }

  return variation;
}

function selectCandidateAction(
  ranked: RootRankedAction[],
  preset: AiDifficultyPreset,
  random: () => number,
): RootRankedAction {
  const best = ranked[0];

  if (!best || preset.balancedTopCount <= 1 || ranked.length === 1) {
    return best;
  }

  if (best.isForced || best.isTactical) {
    return best;
  }

  const tolerance = Math.max(1, Math.abs(best.score) * preset.balancedThreshold);
  const nearEqual = ranked.filter((entry) => Math.abs(best.score - entry.score) <= tolerance);
  const quietCandidates = nearEqual
    .filter(
      (entry) =>
        !entry.isForced &&
        !entry.isTactical &&
        !entry.isSelfUndo &&
        !entry.isRepetition,
    )
    .slice(0, preset.balancedTopCount);

  if (!quietCandidates.length) {
    return best;
  }

  if (quietCandidates.length === 1) {
    return quietCandidates[0];
  }

  return quietCandidates[Math.floor(random() * quietCandidates.length)] ?? best;
}

function orderRootCandidates(ranked: RootRankedAction[], limit: number): AiRootCandidate[] {
  return sortRankedActions(ranked).slice(0, limit).map(toRootCandidate);
}

/** Chooses one computer move using iterative deepening negamax with alpha-beta pruning. */
export function chooseComputerAction({
  difficulty,
  now = () => performance.now(),
  random = Math.random,
  ruleConfig,
  state,
}: ChooseComputerActionRequest): AiSearchResult {
  const preset = AI_DIFFICULTY_PRESETS[difficulty];
  const startedAt = now();
  const deadline = startedAt + preset.timeBudgetMs;
  const legalActions = getLegalActions(state, ruleConfig);
  let fallbackScore: number | null = null;

  function getFallbackScore(): number {
    fallbackScore ??= evaluateState(state, state.currentPlayer, ruleConfig);
    return fallbackScore;
  }

  if (!legalActions.length) {
    return {
      ...createEmptyResult(null, getFallbackScore()),
      fallbackKind: 'none',
    };
  }

  const context: SearchContext = {
    continuationScores: new Map<string, number>(),
    deadline,
    diagnostics: createSearchDiagnostics(),
    evaluatedNodes: 0,
    historyScores: new Map<string, number>(),
    killerMovesByDepth: new Map<number, TurnAction[]>(),
    now,
    preset,
    pvMoveByDepth: new Map<number, TurnAction>(),
    rootPreviousOwnAction: getRootPreviousOwnAction(state),
    quiescenceDepthLimit: preset.maxDepth + MAX_QUIESCENCE_DEPTH,
    rootSelfUndoPositionKey: getRootSelfUndoPositionKey(state),
    ruleConfig,
    table: new Map<string, TranspositionEntry>(),
  };

  let completedDepth = 0;
  let completedRootMoves = 0;
  let bestAction = legalActions[0];
  let bestScore = getFallbackScore();
  let fallbackKind: AiSearchResult['fallbackKind'] = 'none';
  let timedOut = false;
  let rootCandidates: RootRankedAction[] = [];

  try {
    const rootOrderedMoves = orderMoves(
      state,
      state.currentPlayer,
      ruleConfig,
      preset,
      {
        actions: legalActions,
        deadline,
        grandparentPositionKey: context.rootSelfUndoPositionKey,
        historyScores: context.historyScores,
        includeAllQuietMoves: true,
        killerMoves: [],
        now,
        previousActionKey: null,
        pvMove: null,
        repetitionPenalty: preset.repetitionPenalty,
        samePlayerPreviousAction: context.rootPreviousOwnAction,
        selfUndoPenalty: preset.selfUndoPenalty,
        continuationScores: context.continuationScores,
        ttMove: null,
      },
    );

    for (const entry of rootOrderedMoves) {
      if (
        entry.nextState.status === 'gameOver' &&
        (entry.nextState.victory.type === 'homeField' ||
          entry.nextState.victory.type === 'sixStacks') &&
        entry.nextState.victory.winner === state.currentPlayer
      ) {
        return {
          action: entry.action,
          completedDepth: 1,
          completedRootMoves: 1,
          diagnostics: context.diagnostics,
          elapsedMs: now() - startedAt,
          evaluatedNodes: 1,
          fallbackKind: 'none',
          principalVariation: [entry.action],
          rootCandidates: [
            {
              action: entry.action,
              isForced: entry.isForced,
              isRepetition: entry.isRepetition,
              isSelfUndo: entry.isSelfUndo,
              isTactical: entry.isTactical,
              score: 1_000_000,
            },
          ],
          score: 1_000_000,
          timedOut: false,
        };
      }
    }
  } catch (error) {
    if (!isSearchTimeout(error)) {
      throw error;
    }

    return {
      action: legalActions[0],
      completedDepth: 0,
      completedRootMoves: 0,
      diagnostics: context.diagnostics,
      elapsedMs: now() - startedAt,
      evaluatedNodes: 0,
      fallbackKind: 'legalOrder',
      principalVariation: [legalActions[0]],
      rootCandidates: [
        {
          action: legalActions[0],
          isForced: false,
          isRepetition: false,
          isSelfUndo: false,
          isTactical: false,
          score: getFallbackScore(),
        },
      ],
      score: getFallbackScore(),
      timedOut: true,
    };
  }

  const rootPositionKey = makeTableKey(state);

  for (let depth = 1; depth <= preset.maxDepth; depth += 1) {
    const ranked: RootRankedAction[] = [];

    try {
      throwIfTimedOut(now, deadline);

      const orderedMoves = orderMoves(
        state,
        state.currentPlayer,
        ruleConfig,
        preset,
        {
          actions: legalActions,
          deadline,
          grandparentPositionKey: context.rootSelfUndoPositionKey,
          historyScores: context.historyScores,
          includeAllQuietMoves: true,
          killerMoves: context.killerMovesByDepth.get(0) ?? [],
          now,
          previousActionKey: null,
          pvMove: context.pvMoveByDepth.get(0),
          repetitionPenalty: preset.repetitionPenalty,
          samePlayerPreviousAction: context.rootPreviousOwnAction,
          selfUndoPenalty: preset.selfUndoPenalty,
          continuationScores: context.continuationScores,
          ttMove: context.table.get(rootPositionKey)?.bestAction,
        },
      );

      for (const entry of orderedMoves) {
        throwIfTimedOut(now, deadline);

        let score = -negamax(
          entry.nextState,
          depth - 1,
          Number.NEGATIVE_INFINITY,
          Number.POSITIVE_INFINITY,
          1,
          [rootPositionKey, makeTableKey(entry.nextState)],
          [entry.action],
          actionKey(entry.action),
          context,
        );

        score -= getMovePenalty(entry, context);

        ranked.push({
          action: entry.action,
          isForced: entry.isForced,
          isRepetition: entry.isRepetition,
          isSelfUndo: entry.isSelfUndo,
          isTactical: entry.isTactical,
          score,
        });
      }
    } catch (error) {
      if (isSearchTimeout(error)) {
        timedOut = true;

        if (ranked.length > 0) {
          const partialRanked = sortRankedActions(ranked);
          const partialBest = partialRanked[0];

          bestAction = partialBest.action;
          bestScore = partialBest.score;
          completedRootMoves = partialRanked.length;
          rootCandidates = partialRanked;
          fallbackKind = 'partialCurrentDepth';
        } else if (completedDepth > 0) {
          fallbackKind = 'previousDepth';
        } else {
          fallbackKind = 'legalOrder';
          bestScore = getFallbackScore();
          completedRootMoves = 0;
          rootCandidates = [
            {
              action: legalActions[0],
              isForced: false,
              isRepetition: false,
              isSelfUndo: false,
              isTactical: false,
              score: bestScore,
            },
          ];
        }

        break;
      }

      throw error;
    }

    sortRankedActions(ranked);

    if (!ranked.length) {
      break;
    }

    completedDepth = depth;
    completedRootMoves = ranked.length;
    rootCandidates = ranked;
    bestScore = ranked[0].score;
    bestAction = selectCandidateAction(ranked, preset, random).action;
    fallbackKind = 'none';

    context.pvMoveByDepth.set(0, bestAction);
  }

  return {
    action: bestAction,
    completedDepth,
    completedRootMoves,
    diagnostics: context.diagnostics,
    elapsedMs: now() - startedAt,
    evaluatedNodes: context.evaluatedNodes,
    fallbackKind,
    principalVariation: buildPrincipalVariation(state, bestAction, completedDepth, context),
    rootCandidates: orderRootCandidates(rootCandidates, preset.rootCandidateLimit),
    score: bestScore,
    timedOut,
  };
}
