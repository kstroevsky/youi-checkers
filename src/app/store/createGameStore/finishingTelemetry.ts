import type { AiSearchResult } from '@/ai';
import { allCoords } from '@/domain/model/coordinates';
import { hashPosition } from '@/domain/model/hash';
import type {
  Board,
  GameState,
  Player,
  TurnAction,
} from '@/domain/model/types';
import { getFinishingProgress as getDomainFinishingProgress } from '@/domain/rules/finishingProgress';
import type { SeriesState } from '@/shared/types/session';
import type { TelemetrySink } from '@/shared/telemetry/contracts';

import { colorForParticipant } from '@/app/store/createGameStore/series';

const NO_PROGRESS_LIMIT = 8;
const TWO_PLY_UNDO_LIMIT = 2;
const POSITION_REPEAT_LIMIT = 3;

type FinishingGoal = 'home' | 'sixStack';

type FinishingProgress = {
  controlledStacks: number;
  frontStacks: number;
  goal: FinishingGoal;
  homeSingles: number;
  score: number;
};

type ActiveFinishingTelemetry = {
  bestProgressScore: number;
  gameNumber: number;
  lastProgressScore: number;
  loopIncidentReported: boolean;
  noProgressStreak: number;
  player: Player;
  recentPositions: string[];
  twoPlyUndoCount: number;
};

export type FinishingMoveTelemetry = {
  action: TurnAction;
  aiDecision: AiSearchResult | null;
  afterState: GameState;
  beforeState: GameState;
  completed: boolean;
  pendingPoints: number;
  series: SeriesState;
};

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function positionFingerprint(state: GameState): string {
  return fnv1a(hashPosition(state));
}

export function encodeTelemetryBoardSnapshot(board: Board): string {
  const cells = allCoords()
    .map((coord) => {
      const encoded = board[coord].checkers
        .slice(0, 3)
        .map((checker) => {
          const owner = checker.owner === 'white' ? 'W' : 'B';
          return checker.frozen ? owner.toLowerCase() : owner;
        })
        .join('');

      return encoded.padEnd(3, '_');
    })
    .join('');

  return `v1:${cells}`;
}

function getFinishingProgress(
  state: GameState,
  player: Player,
): FinishingProgress {
  const progress = getDomainFinishingProgress(state, player);

  return {
    controlledStacks: progress.controlledStacks,
    frontStacks: progress.frontCompletedStacks,
    goal: progress.goal,
    homeSingles: progress.homeSingles,
    score: progress.score,
  };
}

function finishingPlayer(series: SeriesState): Player | null {
  return series.phase === 'finishing' && series.finishingParticipant
    ? colorForParticipant(series, series.finishingParticipant)
    : null;
}

export function createFinishingTelemetryTracker(telemetry?: TelemetrySink) {
  let active: ActiveFinishingTelemetry | null = null;

  function start(state: GameState, series: SeriesState): void {
    const player = finishingPlayer(series);

    if (!player) {
      active = null;
      return;
    }

    if (active?.gameNumber === series.gameNumber && active.player === player) {
      return;
    }

    const progress = getFinishingProgress(state, player);
    active = {
      bestProgressScore: progress.score,
      gameNumber: series.gameNumber,
      lastProgressScore: progress.score,
      loopIncidentReported: false,
      noProgressStreak: 0,
      player,
      recentPositions: [hashPosition(state)],
      twoPlyUndoCount: 0,
    };
    telemetry?.increment('finishing_started');
    telemetry?.context('finishing_started', {
      controlledStacks: progress.controlledStacks,
      frontStacks: progress.frontStacks,
      gameNumber: series.gameNumber,
      goal: progress.goal,
      homeSingles: progress.homeSingles,
      moveNumber: state.moveNumber,
      pendingPoints: series.pendingPoints,
      player,
      positionFingerprint: positionFingerprint(state),
    });
  }

  function recordMove({
    action,
    aiDecision,
    afterState,
    beforeState,
    completed,
    pendingPoints,
    series,
  }: FinishingMoveTelemetry): void {
    start(beforeState, series);

    if (!active) {
      return;
    }

    const positionKey = hashPosition(afterState);
    const twoPlyUndo = active.recentPositions.at(-2) === positionKey;
    active.twoPlyUndoCount = twoPlyUndo ? active.twoPlyUndoCount + 1 : 0;
    active.recentPositions.push(positionKey);
    active.recentPositions = active.recentPositions.slice(-8);

    const progress = getFinishingProgress(afterState, active.player);
    const progressDelta = progress.score - active.lastProgressScore;
    active.lastProgressScore = progress.score;
    if (progress.score > active.bestProgressScore) {
      active.bestProgressScore = progress.score;
      active.noProgressStreak = 0;
      active.loopIncidentReported = false;
    } else {
      active.noProgressStreak += 1;
      telemetry?.increment('finishing_no_progress_moves');
    }

    const positionRepeatCount = afterState.positionCounts[positionKey] ?? 0;
    if (positionRepeatCount > 1) {
      telemetry?.increment('finishing_position_repeats');
    }
    if (twoPlyUndo) {
      telemetry?.increment('finishing_two_ply_undos');
    }

    telemetry?.increment('finishing_moves');
    telemetry?.context('finishing_move', {
      actionKind: action.type,
      controlledStacks: progress.controlledStacks,
      frontStacks: progress.frontStacks,
      gameNumber: series.gameNumber,
      goal: progress.goal,
      homeSingles: progress.homeSingles,
      moveNumber: afterState.moveNumber,
      noProgressStreak: active.noProgressStreak,
      pendingPoints,
      positionFingerprint: positionFingerprint(afterState),
      positionRepeatCount,
      progressDelta,
      searchMode: aiDecision ? 'finishing' : 'manual',
      twoPlyUndo,
    });

    const loopDetected =
      positionRepeatCount >= POSITION_REPEAT_LIMIT ||
      active.twoPlyUndoCount >= TWO_PLY_UNDO_LIMIT ||
      active.noProgressStreak >= NO_PROGRESS_LIMIT;

    if (completed || !loopDetected || active.loopIncidentReported) {
      return;
    }

    active.loopIncidentReported = true;
    telemetry?.increment('finishing_loops_detected');
    telemetry?.incident('finishing_loop_detected', {
      severity: 'error',
      tags: {
        actionKind: action.type,
        boardSnapshot: encodeTelemetryBoardSnapshot(afterState.board),
        controlledStacks: progress.controlledStacks,
        finishingPlayer: active.player,
        frontStacks: progress.frontStacks,
        gameNumber: series.gameNumber,
        goal: progress.goal,
        homeSingles: progress.homeSingles,
        moveNumber: afterState.moveNumber,
        noProgressStreak: active.noProgressStreak,
        pendingPoints,
        positionFingerprint: positionFingerprint(afterState),
        positionRepeatCount,
        progressDelta,
        searchOutcome: aiDecision
          ? `d${aiDecision.completedDepth}|t${aiDecision.timedOut ? 1 : 0}|${aiDecision.fallbackKind}`
          : 'manual',
        twoPlyUndoCount: active.twoPlyUndoCount,
      },
    });
    telemetry?.flushCritical();
  }

  function complete(series: SeriesState, state: GameState): void {
    if (!active) {
      return;
    }

    telemetry?.increment('finishing_completed');
    telemetry?.increment('finishing_moves_completed', series.pendingPoints);
    telemetry?.context('finishing_completed', {
      gameNumber: series.gameNumber,
      moveNumber: state.moveNumber,
      pendingPoints: series.pendingPoints,
      player: active.player,
      victoryType: state.victory.type,
    });
    active = null;
  }

  return {
    complete,
    recordMove,
    reset() {
      active = null;
    },
    start,
  };
}
