import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import type { AiRiskMode } from '@/ai';
import {
  getStableCallsForDifficulty,
  runAiVarietySuite,
  summarizeAiVariety,
  type AiVarietyMetricKey,
  type AiVarietySummary,
  type AiVarietyTargetBand,
} from '@/ai/test/metrics';
import targetBands from '@/ai/test/fixtures/ai-variety-target-bands.json';
import { createInitialState, hashPosition } from '@/domain';
import { withRuleDefaults } from '@/domain/model/ruleConfig';
import type { GameState } from '@/domain/model/types';
import type { AiBehaviorProfileId, AiDifficulty } from '@/shared/types/session';

import { LATE_GAME_PERF_SCENARIOS, createLateGamePerfState } from './lateGamePerfFixtures';

const OUTPUT_DIR = path.join(process.cwd(), 'output', 'ai');
const JSON_OUTPUT = path.join(OUTPUT_DIR, 'ai-stage-variety-report.json');
const MARKDOWN_OUTPUT = path.join(OUTPUT_DIR, 'ai-stage-variety-report.md');
const DEFAULT_PAIR_COUNT = 8;
const DEFAULT_MAX_TURNS = 40;
const RETAINED_HISTORY_WINDOW = 6;

type StageLabel = (typeof LATE_GAME_PERF_SCENARIOS)[number]['label'];

type TargetBandFile = {
  metrics: Partial<Record<AiVarietyMetricKey, AiVarietyTargetBand>>;
  version: number;
};

type StageBehaviorStats = {
  behaviorProfileCoverage: number;
  behaviorProfilePlyShares: Record<AiBehaviorProfileId, number>;
  gamesWithRiskActivationShare: number;
  riskModePlyShares: Record<AiRiskMode, number>;
};

type StageDifficultyReport = {
  behavior: StageBehaviorStats;
  summary: AiVarietySummary;
};

type StageReport = {
  difficulties: Record<AiDifficulty, StageDifficultyReport>;
  initialMoveNumber: number;
  label: StageLabel;
  turnCount: number;
};

function parseArg(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const value = process.argv.find((entry) => entry.startsWith(prefix));

  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value.slice(prefix.length), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundMetric(value: number, digits = 6): number {
  return Number(value.toFixed(digits));
}

function classifyMetric(value: number, band?: AiVarietyTargetBand): 'good' | 'warn' | 'bad' | 'n/a' {
  if (!band) {
    return 'n/a';
  }

  if (band.direction === 'higher') {
    if (value >= band.good) {
      return 'good';
    }

    if (value >= band.warn) {
      return 'warn';
    }

    return 'bad';
  }

  if (value <= band.good) {
    return 'good';
  }

  if (value <= band.warn) {
    return 'warn';
  }

  return 'bad';
}

function createEmptyProfileCounts(): Record<AiBehaviorProfileId, number> {
  return {
    builder: 0,
    expander: 0,
    hunter: 0,
  };
}

function computeBehaviorStats(
  traces: ReturnType<typeof runAiVarietySuite>,
): StageBehaviorStats {
  const riskModeCounts: Record<AiRiskMode, number> = {
    late: 0,
    normal: 0,
    stagnation: 0,
  };
  const behaviorProfileCounts = createEmptyProfileCounts();
  let totalPlies = 0;
  let gamesWithRiskActivation = 0;

  for (const trace of traces) {
    if (trace.plies.some((ply) => ply.riskMode !== 'normal')) {
      gamesWithRiskActivation += 1;
    }

    for (const ply of trace.plies) {
      totalPlies += 1;
      riskModeCounts[ply.riskMode] += 1;

      if (ply.behaviorProfileId) {
        behaviorProfileCounts[ply.behaviorProfileId] += 1;
      }
    }
  }

  return {
    behaviorProfileCoverage: roundMetric(
      Object.values(behaviorProfileCounts).filter((count) => count > 0).length / 3,
    ),
    behaviorProfilePlyShares: {
      builder: roundMetric(behaviorProfileCounts.builder / Math.max(1, totalPlies)),
      expander: roundMetric(behaviorProfileCounts.expander / Math.max(1, totalPlies)),
      hunter: roundMetric(behaviorProfileCounts.hunter / Math.max(1, totalPlies)),
    },
    gamesWithRiskActivationShare: roundMetric(gamesWithRiskActivation / Math.max(1, traces.length)),
    riskModePlyShares: {
      late: roundMetric(riskModeCounts.late / Math.max(1, totalPlies)),
      normal: roundMetric(riskModeCounts.normal / Math.max(1, totalPlies)),
      stagnation: roundMetric(riskModeCounts.stagnation / Math.max(1, totalPlies)),
    },
  };
}

/**
 * The late perf fixtures are replayed with `drawRule: 'none'` so they stay reachable.
 * For stage variety we still want product-like continuation behavior, so we keep only
 * the recent history window that feeds stagnation detection and rebuild repetition
 * counts from that window instead of importing a terminal threefold state wholesale.
 */
function createContinuationStageState(state: GameState): GameState {
  const retainedHistory = state.history.slice(-RETAINED_HISTORY_WINDOW);
  const rebuiltPositionCounts: Record<string, number> = {};

  if (retainedHistory.length) {
    const firstBeforeHash = hashPosition(retainedHistory[0].beforeState);
    rebuiltPositionCounts[firstBeforeHash] = 1;

    for (const record of retainedHistory) {
      const afterHash = hashPosition(record.afterState);
      rebuiltPositionCounts[afterHash] = (rebuiltPositionCounts[afterHash] ?? 0) + 1;
    }
  } else {
    rebuiltPositionCounts[hashPosition(state)] = 1;
  }

  return {
    ...state,
    history: retainedHistory,
    positionCounts: rebuiltPositionCounts,
    status: 'active',
    victory: { type: 'none' },
  };
}

function buildMarkdown(
  stageReports: StageReport[],
  targets: TargetBandFile,
  pairCount: number,
  maxTurns: number,
): string {
  const keyMetrics: AiVarietyMetricKey[] = [
    'decisiveResultShare',
    'threefoldDrawShare',
    'repetitionPlyShare',
    'twoPlyUndoRate',
    'stagnationWindowRate',
    'openingEntropy',
    'uniqueOpeningLineShare',
    'decompressionSlope',
    'mobilityReleaseSlope',
    'meanBoardDisplacement',
    'drama',
    'tension',
  ];
  const lines = [
    '# AI Stage Variety Report',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    'This file is a generated report artifact from `npm run ai:stage-variety`.',
    '',
    'Methodology:',
    '- Each scenario reuses the deterministic imported positions from `scripts/lateGamePerfFixtures.ts`.',
    '- `opening` starts from the standard initial position; `turn50`, `turn100`, and `turn200` start from replayed benchmark states.',
    '- The late-stage fixtures are replayed with draws disabled, then normalized into playable continuation states by retaining only the recent history window and rebuilding repetition counts for that window.',
    '- Metrics whose names contain `opening` still measure the first reply distribution from that stage position, not only literal game openings.',
    '- `riskMode` shares show how often the new stagnation and late-game escalation logic actually activates during the continuation playouts.',
    `- Report settings: ${pairCount} mirrored seed pairs per difficulty, ${maxTurns} continuation plies per trace.`,
    '',
  ];

  for (const stageReport of stageReports) {
    lines.push(`## ${stageReport.label}`);
    lines.push('');
    lines.push(
      `Imported position move number: ${stageReport.initialMoveNumber}, replay turn count: ${stageReport.turnCount}.`,
    );
    lines.push('');
    lines.push(
      '| Difficulty | Avg plies | Decisive | 3fold draws | Repetition | Undo | Stagnation | Displacement | Drama | Tension | Risk active | Late risk | Stagnation risk |',
    );
    lines.push(
      '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    );

    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      const report = stageReport.difficulties[difficulty];
      const { metrics } = report.summary;
      const riskActiveShare = roundMetric(
        report.behavior.riskModePlyShares.late + report.behavior.riskModePlyShares.stagnation,
      );

      lines.push(
        `| ${difficulty} | ${report.summary.games.averagePlies} | ${metrics.decisiveResultShare} | ${metrics.threefoldDrawShare} | ${metrics.repetitionPlyShare} | ${metrics.twoPlyUndoRate} | ${metrics.stagnationWindowRate} | ${metrics.meanBoardDisplacement} | ${metrics.drama} | ${metrics.tension} | ${riskActiveShare} | ${report.behavior.riskModePlyShares.late} | ${report.behavior.riskModePlyShares.stagnation} |`,
      );
    }

    lines.push('');

    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      const report = stageReport.difficulties[difficulty];
      const { metrics } = report.summary;

      lines.push(`### ${difficulty}`);
      lines.push('');
      lines.push(
        `Terminals: ${JSON.stringify(report.summary.games.terminalCounts)}. Risk-active games: ${report.behavior.gamesWithRiskActivationShare}. Persona coverage: ${report.behavior.behaviorProfileCoverage}.`,
      );
      lines.push('');
      lines.push(
        `RiskMode ply shares: ${JSON.stringify(report.behavior.riskModePlyShares)}. Persona ply shares: ${JSON.stringify(report.behavior.behaviorProfilePlyShares)}.`,
      );
      lines.push('');
      lines.push('| Metric | Value | Target | Status |');
      lines.push('| --- | ---: | --- | --- |');

      for (const metric of keyMetrics) {
        const band = targets.metrics[metric];
        const targetLabel = band
          ? band.direction === 'higher'
            ? `>= ${band.good} (warn ${band.warn})`
            : `<= ${band.good} (warn ${band.warn})`
          : 'n/a';

        lines.push(
          `| ${metric} | ${metrics[metric]} | ${targetLabel} | ${classifyMetric(metrics[metric], band)} |`,
        );
      }

      lines.push('');
    }
  }

  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const pairCount = parseArg('pairs', DEFAULT_PAIR_COUNT);
  const maxTurns = parseArg('max-turns', DEFAULT_MAX_TURNS);
  const ruleConfig = withRuleDefaults({
    drawRule: 'threefold',
    scoringMode: 'off',
  });
  const replayRuleConfig = withRuleDefaults({
    drawRule: 'none',
    scoringMode: 'off',
  });
  const targetBandFile = targetBands as TargetBandFile;
  const stageReports: StageReport[] = [];

  for (const scenario of LATE_GAME_PERF_SCENARIOS) {
    const initialState =
      scenario.turnCount === 0
        ? createInitialState(ruleConfig)
        : createContinuationStageState(createLateGamePerfState(scenario.turnCount, replayRuleConfig));
    const difficulties = {} as Record<AiDifficulty, StageDifficultyReport>;

    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      const stableCalls = getStableCallsForDifficulty(difficulty);
      const traces = runAiVarietySuite({
        difficulty,
        initialState,
        maxTurns,
        pairCount,
        ruleConfig,
        stableCalls,
      });

      difficulties[difficulty] = {
        behavior: computeBehaviorStats(traces),
        summary: summarizeAiVariety(traces, {
          difficulty,
          maxTurns,
          pairCount,
          stableCalls,
          targetBands: targetBandFile,
        }),
      };
    }

    stageReports.push({
      difficulties,
      initialMoveNumber: initialState.moveNumber,
      label: scenario.label,
      turnCount: scenario.turnCount,
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    scenarios: stageReports,
    settings: {
      maxTurns,
      pairCount,
      ruleConfig,
    },
    targetBandVersion: targetBandFile.version,
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(JSON_OUTPUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(MARKDOWN_OUTPUT, buildMarkdown(stageReports, targetBandFile, pairCount, maxTurns), 'utf8');
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
