// @vitest-environment node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { AI_DIFFICULTY_PRESETS, chooseComputerAction } from '@/ai';
import {
  advanceEngineState,
  applyAction,
  createInitialState,
  getLegalActions,
  getLegalActionsForCell,
  hashPosition,
} from '@/domain';
import { createEmptyBoard } from '@/domain/model/board';
import { createCoord } from '@/domain/model/coordinates';
import type { Coord, GameState, TurnAction } from '@/domain/model/types';
import { checker, gameStateWithBoard, resetFactoryIds, withConfig } from '@/test/factories';

const shouldRun = process.env.WMBL_PERF_REPORT === '1';
const outputPath = process.env.WMBL_DOMAIN_PERF_OUTPUT;

type PerfMetric = {
  avgMs: number;
  iterations: number;
  totalMs: number;
};

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

function createJumpContinuationState() {
  const config = withConfig();
  const jumpState = gameStateWithBoard(createEmptyBoard());

  jumpState.board.A1.checkers = [checker('white')];
  jumpState.board.B2.checkers = [checker('black')];
  jumpState.board.D4.checkers = [checker('black')];

  return applyAction(
    jumpState,
    {
      type: 'jumpSequence',
      source: 'A1',
      path: ['C3'],
    },
    config,
  );
}

function buildSelectableBaseline(state: GameState): Coord[] {
  return Object.keys(state.board).filter((coord) =>
    getLegalActionsForCell(state, coord as Coord, withConfig()).length > 0,
  ) as Coord[];
}

function hasLegalAction(state: GameState, config = withConfig()): boolean {
  return getLegalActions(state, config).length > 0;
}

const describePerf = shouldRun ? describe : describe.skip;

describePerf('domain performance report', () => {
  it('writes repeatable domain/AI benchmark output', async () => {
    expect(outputPath).toBeTruthy();

    resetFactoryIds();
    const config = withConfig();
    const initialState = createInitialState(config);
    const afterOpening = applyAction(
      initialState,
      { type: 'climbOne', source: 'A1', target: 'B2' },
      config,
    );
    const jumpContinuation = createJumpContinuationState();
    const threatState = createOpponentThreatState();
    const sampleStates = {
      afterOpening,
      initialState,
      jumpContinuation,
      threatState,
    } as const;
    const sampleAction =
      getLegalActions(afterOpening, config)[0] ??
      getLegalActions(initialState, config)[0];

    expect(sampleAction).toBeDefined();
    if (!sampleAction) {
      return;
    }

    const domain = {
      hashPosition: measureAverage(6_000, () => {
        hashPosition(afterOpening);
      }),
      getLegalActions: measureAverage(750, () => {
        getLegalActions(afterOpening, config);
      }),
      getLegalActionsForCell: measureAverage(1_500, () => {
        getLegalActionsForCell(afterOpening, 'A1', config);
      }),
      selectableCoordsScan: measureAverage(280, () => {
        buildSelectableBaseline(afterOpening);
      }),
      hasLegalActionCheck: measureAverage(420, () => {
        hasLegalAction(jumpContinuation, config);
      }),
      advanceEngineState: measureAverage(700, () => {
        advanceEngineState(afterOpening, sampleAction, config);
      }),
    };

    const ai = Object.fromEntries(
      (['easy', 'medium', 'hard'] as const).map((difficulty) => {
        const states = Object.entries(sampleStates).map(([label, state]) => {
          const startedAt = performance.now();
          const result = chooseComputerAction({
            difficulty,
            random: () => 0,
            ruleConfig: config,
            state,
          });
          const wallTimeMs = round(performance.now() - startedAt);

          return {
            action: actionKey(result.action),
            completedDepth: result.completedDepth,
            evaluatedNodes: result.evaluatedNodes,
            label,
            reportedElapsedMs: round(result.elapsedMs),
            timeBudgetMs: AI_DIFFICULTY_PRESETS[difficulty].timeBudgetMs,
            wallTimeMs,
          };
        });

        return [
          difficulty,
          {
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
    };

    await mkdir(path.dirname(outputPath ?? ''), { recursive: true });
    await writeFile(outputPath ?? '', `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    expect(report.domain.getLegalActions.avgMs).toBeGreaterThan(0);
  }, 30_000);
});
