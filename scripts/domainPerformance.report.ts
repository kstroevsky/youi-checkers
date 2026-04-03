// @vitest-environment node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { AI_DIFFICULTY_PRESETS, chooseComputerAction } from '@/ai';
import { orderMoves, orderPrecomputedMoves, precomputeOrderedActions } from '@/ai/moveOrdering';
import { buildParticipationState } from '@/ai/participation';
import {
  getRootPreviousOwnAction,
  getRootPreviousStrategicTags,
  getRootSelfUndoPositionKey,
} from '@/ai/search/heuristics';
import {
  advanceEngineState,
  applyAction,
  createInitialState,
  getLegalActions,
  getLegalActionsForCell,
  hashPosition,
  serializeSession,
} from '@/domain';
import { createEmptyBoard } from '@/domain/model/board';
import { createCoord } from '@/domain/model/coordinates';
import type { Coord, GameState, TurnAction } from '@/domain/model/types';
import { actionLabel } from '@/shared/i18n/catalog';
import { checker, gameStateWithBoard, resetFactoryIds, withConfig } from '@/test/factories';
import { createSession } from '@/test/factories';
import {
  createPerfStateForScenario,
  createRandomPlayPerfState,
  LATE_GAME_PERF_SCENARIOS,
} from './lateGamePerfFixtures';

const shouldRun = process.env.WMBL_PERF_REPORT === '1';
const outputPath = process.env.WMBL_DOMAIN_PERF_OUTPUT;

type PerfMetric = {
  avgMs: number;
  iterations: number;
  totalMs: number;
};

type RootCacheBenchmarkEntry = {
  baselineMs: number;
  gainMs: number;
  gainPercent: number;
  label: string;
  optimizedMs: number;
  turnCount: number;
};

type LateGameAiFixture = {
  actionButtonLabel: string;
  label: string;
  minimumTurnNumberAfterAi: number;
  moveNumber: number;
  sessionJson: string;
  sourceCellLabel: string;
  targetCellLabels: string[];
  turnCount: number;
};

const defaultRootOrderingBenchmarkIterations = 24;

function resolveRootOrderingBenchmarkIterations(): number {
  const rawValue = process.env.WMBL_ROOT_ORDER_BENCH_ITERS;
  const parsedValue = Number.parseInt(rawValue ?? '', 10);

  if (Number.isFinite(parsedValue) && parsedValue > 0) {
    return parsedValue;
  }

  return defaultRootOrderingBenchmarkIterations;
}

function round(value: number, digits = 2): number {
  return Math.round(value * 10 ** digits) / 10 ** digits;
}

function measureAverage(iterations: number, fn: () => void): PerfMetric {
  fn();

  const startedAt = performance.now();

  for (let index = 0; index < iterations; index += 1) {
    fn();
  }

  const totalMs = performance.now() - startedAt;

  return {
    avgMs: round(totalMs / iterations, 4),
    iterations,
    totalMs: round(totalMs),
  };
}

function actionKey(action: TurnAction | null): string {
  if (!action) {
    return 'none';
  }

  switch (action.type) {
    case 'manualUnfreeze':
      return `${action.type}:${action.coord}`;
    case 'jumpSequence':
      return `${action.type}:${action.source}:${action.path.join('>')}`;
    default:
      return `${action.type}:${action.source}:${action.target}`;
  }
}

function cellButtonLabel(coord: Coord): string {
  return `Клетка ${coord}`;
}

function createOpponentThreatState(): GameState {
  const board = createEmptyBoard();

  (['B1', 'C1', 'D1', 'E1', 'F1'] as const).forEach((coord) => {
    board[coord].checkers = [checker('black'), checker('black'), checker('black')];
  });
  board.A1.checkers = [checker('black'), checker('black')];
  board.A2.checkers = [checker('black')];
  board.B2.checkers = [checker('white')];

  let whiteCount = 1;

  for (const row of [4, 5, 6] as const) {
    for (const column of ['A', 'B', 'C', 'D', 'E', 'F'] as const) {
      const coord = createCoord(column, row);

      if (coord === 'B4') {
        continue;
      }

      board[coord].checkers = [checker('white', true)];
      whiteCount += 1;

      if (whiteCount === 18) {
        break;
      }
    }

    if (whiteCount === 18) {
      break;
    }
  }

  return gameStateWithBoard(board);
}


function buildSelectableBaseline(state: GameState): Coord[] {
  return Object.keys(state.board).filter((coord) =>
    getLegalActionsForCell(state, coord as Coord, withConfig()).length > 0,
  ) as Coord[];
}

function hasLegalAction(state: GameState, config = withConfig()): boolean {
  return getLegalActions(state, config).length > 0;
}

function pickTurnEndingAction(
  state: GameState,
  config: ReturnType<typeof withConfig>,
): { action: TurnAction; nextState: GameState } {
  for (const action of getLegalActions(state, config)) {
    const nextState = applyAction(state, action, config);

    if (
      nextState.status === 'active' &&
      nextState.currentPlayer !== state.currentPlayer &&
      getLegalActions(nextState, config).length > 0
    ) {
      return { action, nextState };
    }
  }

  throw new Error(`No turn-ending late-game fixture action found at move ${state.moveNumber}.`);
}

function targetCellLabels(action: TurnAction): string[] {
  if (action.type === 'manualUnfreeze') {
    return [];
  }

  if (action.type === 'jumpSequence') {
    return action.path.map((coord) => cellButtonLabel(coord));
  }

  return [cellButtonLabel(action.target)];
}

function buildLateGameAiFixtures(
  config: ReturnType<typeof withConfig>,
): LateGameAiFixture[] {
  return LATE_GAME_PERF_SCENARIOS.map((scenario) => {
    const { label } = scenario;
    const state = createPerfStateForScenario(scenario, config);
    const { action, nextState } = pickTurnEndingAction(state, config);
    const session = createSession(state, {
      matchSettings: {
        aiDifficulty: 'hard',
        humanPlayer: state.currentPlayer,
        opponentMode: 'computer',
      },
    });

    return {
      actionButtonLabel: actionLabel('russian', action.type),
      label,
      minimumTurnNumberAfterAi: nextState.moveNumber + 1,
      moveNumber: state.moveNumber,
      sessionJson: serializeSession(session),
      sourceCellLabel:
        action.type === 'manualUnfreeze'
          ? cellButtonLabel(action.coord)
          : cellButtonLabel(action.source),
      targetCellLabels: targetCellLabels(action),
      turnCount: scenario.turnCount,
    };
  });
}

function measureRootOrderingLoop(
  state: GameState,
  config: ReturnType<typeof withConfig>,
  mode: 'baseline' | 'optimized',
): number {
  const preset = AI_DIFFICULTY_PRESETS.hard;
  const legalActions = getLegalActions(state, config);

  if (!legalActions.length) {
    return 0;
  }

  const sharedOptions = {
    actions: legalActions,
    continuationScores: new Map<string, number>(),
    grandparentPositionKey: getRootSelfUndoPositionKey(state),
    historyScores: new Map<string, number>(),
    includeAllQuietMoves: true,
    killerMoves: [] as TurnAction[],
    participationState: buildParticipationState(state, preset.participationWindow),
    policyPriors: null,
    policyPriorWeight: preset.policyPriorWeight,
    previousActionKey: null,
    previousStrategicTags: getRootPreviousStrategicTags(state),
    pvMove: null as TurnAction | null,
    repetitionPenalty: preset.repetitionPenalty,
    samePlayerPreviousAction: getRootPreviousOwnAction(state),
    selfUndoPenalty: preset.selfUndoPenalty,
    ttMove: null as TurnAction | null,
  };
  const iterations = resolveRootOrderingBenchmarkIterations();
  const startedAt = performance.now();

  for (let index = 0; index < iterations; index += 1) {
    let pvMove: TurnAction | null = null;

    if (mode === 'baseline') {
      for (let depth = 1; depth <= preset.maxDepth; depth += 1) {
        const ranked = orderMoves(
          state,
          state.currentPlayer,
          config,
          preset,
          {
            ...sharedOptions,
            pvMove,
          },
        );

        pvMove = ranked[0]?.action ?? null;
      }
      continue;
    }

    const precomputed = precomputeOrderedActions(
      state,
      state.currentPlayer,
      config,
      preset,
      sharedOptions,
    );

    for (let depth = 1; depth <= preset.maxDepth; depth += 1) {
      const ranked = orderPrecomputedMoves(precomputed, preset, {
        continuationScores: sharedOptions.continuationScores,
        historyScores: sharedOptions.historyScores,
        includeAllQuietMoves: true,
        killerMoves: sharedOptions.killerMoves,
        previousActionKey: null,
        pvMove,
        ttMove: null,
      });

      pvMove = ranked[0]?.action ?? null;
    }
  }

  return (performance.now() - startedAt) / iterations;
}

function buildRootCacheBenchmark(
  config: ReturnType<typeof withConfig>,
): RootCacheBenchmarkEntry[] {
  return LATE_GAME_PERF_SCENARIOS.map((scenario) => {
    const { label } = scenario;
    const state = createPerfStateForScenario(scenario, config);
    const baselineMs = measureRootOrderingLoop(state, config, 'baseline');
    const optimizedMs = measureRootOrderingLoop(state, config, 'optimized');
    const gainMs = baselineMs - optimizedMs;
    const gainPercent = baselineMs > 0 ? (gainMs / baselineMs) * 100 : 0;

    return {
      baselineMs: round(baselineMs, 4),
      gainMs: round(gainMs, 4),
      gainPercent: round(gainPercent, 2),
      label,
      optimizedMs: round(optimizedMs, 4),
      turnCount: scenario.turnCount,
    };
  });
}

const describePerf = shouldRun ? describe : describe.skip;

describePerf('domain performance report', () => {
  it('writes repeatable domain/AI benchmark output', async () => {
    expect(outputPath).toBeTruthy();

    resetFactoryIds();
    const config = withConfig();
    const initialState = createInitialState(config);
    // Realistic mid-game positions: all pieces still active, typical branching factor.
    // These replace afterOpening (trivially similar to initial) and jumpContinuation
    // (3-piece artificial board) which were poor proxies for real player game complexity.
    const midGame20 = createRandomPlayPerfState(20, config, 0x1a2b3c);
    const midGame40 = createRandomPlayPerfState(40, config, 0x4d5e6f);
    const threatState = createOpponentThreatState();
    const sampleStates = {
      initialState,
      midGame20,
      midGame40,
      threatState,
    } as const;
    const sampleAction =
      getLegalActions(midGame20, config)[0] ??
      getLegalActions(initialState, config)[0];

    expect(sampleAction).toBeDefined();
    if (!sampleAction) {
      return;
    }

    const domain = {
      hashPosition: measureAverage(6_000, () => {
        hashPosition(midGame20);
      }),
      getLegalActions: measureAverage(750, () => {
        getLegalActions(midGame20, config);
      }),
      getLegalActionsForCell: measureAverage(1_500, () => {
        // Use initialState so 'A1' is guaranteed to have a piece.
        getLegalActionsForCell(initialState, 'A1', config);
      }),
      selectableCoordsScan: measureAverage(280, () => {
        buildSelectableBaseline(midGame20);
      }),
      hasLegalActionCheck: measureAverage(420, () => {
        hasLegalAction(midGame40, config);
      }),
      advanceEngineState: measureAverage(700, () => {
        advanceEngineState(midGame20, sampleAction, config);
      }),
    };

    const ai = Object.fromEntries(
      (['easy', 'medium', 'hard'] as const).map((difficulty) => {
        const preset = AI_DIFFICULTY_PRESETS[difficulty];
        const states = Object.entries(sampleStates).map(([label, state]) => {
          const legalActionCount = getLegalActions(state, config).length;
          const startedAt = performance.now();
          const result = chooseComputerAction({
            difficulty,
            random: () => 0,
            ruleConfig: config,
            state,
          });
          const wallTimeMs = round(performance.now() - startedAt);
          const nodesPerSecond = wallTimeMs > 0
            ? round(result.evaluatedNodes / wallTimeMs * 1000)
            : 0;
          const depthEfficiency = round(result.completedDepth / preset.maxDepth, 4);
          // Geometric-mean branching factor estimated from node count and completed depth.
          // Only meaningful when completedDepth > 1 and nodes > 0.
          const effectiveBranchingFactor =
            result.completedDepth > 1 && result.evaluatedNodes > 0
              ? round(Math.pow(result.evaluatedNodes, 1 / result.completedDepth), 2)
              : null;

          return {
            action: actionKey(result.action),
            completedDepth: result.completedDepth,
            cutoffRate:
              result.evaluatedNodes > 0
                ? round(result.diagnostics.betaCutoffs / result.evaluatedNodes, 4)
                : 0,
            depthEfficiency,
            diagnostics: result.diagnostics,
            effectiveBranchingFactor,
            evaluatedNodes: result.evaluatedNodes,
            label,
            legalActionCount,
            nodesPerSecond,
            principalVariationLength: result.principalVariation.length,
            reportedElapsedMs: round(result.elapsedMs),
            rootCandidates: result.rootCandidates.length,
            timeBudgetMs: preset.timeBudgetMs,
            transpositionHitRate:
              result.evaluatedNodes > 0
                ? round(result.diagnostics.transpositionHits / result.evaluatedNodes, 4)
                : 0,
            wallTimeMs,
          };
        });

        return [
          difficulty,
          {
            avgDepthEfficiency: round(
              states.reduce((sum, entry) => sum + entry.depthEfficiency, 0) / states.length,
              4,
            ),
            avgNodesPerSecond: round(
              states.reduce((sum, entry) => sum + entry.nodesPerSecond, 0) / states.length,
            ),
            avgWallTimeMs: round(
              states.reduce((sum, entry) => sum + entry.wallTimeMs, 0) / states.length,
            ),
            states,
          },
        ];
      }),
    );

    const report = {
      generatedAt: new Date().toISOString(),
      domain,
      comparisons: {
        cellActionVsFullActionSpeedup: round(
          domain.getLegalActions.avgMs / domain.getLegalActionsForCell.avgMs,
        ),
        hashVsFullActionSpeedup: round(
          domain.getLegalActions.avgMs / domain.hashPosition.avgMs,
        ),
      },
      ai,
      lateGameAiFixtures: buildLateGameAiFixtures(config),
      rootOrderingCacheBenchmark: buildRootCacheBenchmark(config),
    };

    await mkdir(path.dirname(outputPath ?? ''), { recursive: true });
    await writeFile(outputPath ?? '', `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    expect(report.domain.getLegalActions.avgMs).toBeGreaterThan(0);
  }, 90_000);
});
