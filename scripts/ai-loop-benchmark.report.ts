import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { summarizeAdvancedTraceMetrics } from '@/ai/test/advancedMetrics';
import {
  getStableCallsForDifficulty,
  runAiVarietySuite,
  summarizeAiVariety,
  type AiVarietySummary,
} from '@/ai/test/metrics';
import { withRuleDefaults } from '@/domain/model/ruleConfig';
import type { AiDifficulty } from '@/shared/types/session';

import { POSITION_BUCKET_SCENARIOS, buildScenarioState } from './aiScenarioCatalog';

const OUTPUT_DIR = path.join(process.cwd(), 'output', 'ai');
const JSON_OUTPUT = path.join(OUTPUT_DIR, 'ai-loop-benchmark-report.json');
const MARKDOWN_OUTPUT = path.join(OUTPUT_DIR, 'ai-loop-benchmark-report.md');
const DEFAULT_PAIR_COUNT = 8;
const DEFAULT_MAX_TURNS = 40;

type LoopBenchmarkRow = {
  difficulty: AiDifficulty;
  label: string;
  summary: AiVarietySummary;
  advanced: ReturnType<typeof summarizeAdvancedTraceMetrics>;
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

function buildMarkdown(rows: LoopBenchmarkRow[], pairCount: number, maxTurns: number): string {
  const lines = [
    '# AI Loop Benchmark Report',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    'This file is a generated report artifact from `npm run ai:loop-benchmark`.',
    '',
    'Methodology:',
    '- Scenarios use the deterministic imported benchmark states from `scripts/aiScenarioCatalog.ts`.',
    '- Late states are normalized into playable continuation states before playout.',
    '- Core loop metrics come from `src/ai/test/metrics.ts`; advanced recurrence and escape metrics come from `src/ai/test/advancedMetrics.ts`.',
    `- Report settings: ${pairCount} mirrored seed pairs per row, ${maxTurns} continuation plies per trace.`,
    '',
    '| Scenario | Difficulty | Repetition | Undo | Stagnation | Recurrence RR | DET | LAM | Trap Time | Escape<=8 | Escape<=16 | Mean Escape Ply | Pos LZC | Score SampEn | Score PermEn |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];

  for (const row of rows) {
    lines.push(
      `| ${row.label} | ${row.difficulty} | ${row.summary.metrics.repetitionPlyShare} | ${row.summary.metrics.twoPlyUndoRate} | ${row.summary.metrics.stagnationWindowRate} | ${row.advanced.recurrenceRate} | ${row.advanced.recurrenceDeterminism} | ${row.advanced.recurrenceLaminarity} | ${row.advanced.trappingTime} | ${row.advanced.loopEscapeRate8} | ${row.advanced.loopEscapeRate16} | ${row.advanced.meanLoopEscapePly} | ${row.advanced.positionLempelZiv} | ${row.advanced.scoreSampleEntropy} | ${row.advanced.scorePermutationEntropy} |`,
    );
  }

  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const pairCount = parseArg('pairs', DEFAULT_PAIR_COUNT);
  const maxTurns = parseArg('max-turns', DEFAULT_MAX_TURNS);
  const ruleConfig = withRuleDefaults({
    drawRule: 'none',
    scoringMode: 'off',
  });
  const rows: LoopBenchmarkRow[] = [];

  // Include loop-pressure positions (turnCount >= 50) AND realistic mid-game positions
  // (randomPlay) so the loop metrics have a non-looping baseline to compare against.
  for (const scenario of POSITION_BUCKET_SCENARIOS.filter(
    (entry) => entry.turnCount >= 50 || entry.randomPlay,
  )) {
    const initialState = buildScenarioState(scenario, ruleConfig);

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

      rows.push({
        advanced: summarizeAdvancedTraceMetrics(traces),
        difficulty,
        label: scenario.label,
        summary: summarizeAiVariety(traces, {
          difficulty,
          maxTurns,
          pairCount,
          stableCalls,
        }),
      });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    rows,
    settings: {
      maxTurns,
      pairCount,
      scenarios: POSITION_BUCKET_SCENARIOS.filter((entry) => entry.turnCount >= 50 || entry.randomPlay),
    },
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(JSON_OUTPUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(MARKDOWN_OUTPUT, buildMarkdown(rows, pairCount, maxTurns), 'utf8');
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
