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
const JSON_OUTPUT = path.join(OUTPUT_DIR, 'ai-threat-report.json');
const MARKDOWN_OUTPUT = path.join(OUTPUT_DIR, 'ai-threat-report.md');
const DEFAULT_PAIR_COUNT = 6;
const DEFAULT_MAX_TURNS = 40;

type ThreatRow = {
  advanced: ReturnType<typeof summarizeAdvancedTraceMetrics>;
  difficulty: AiDifficulty;
  label: string;
  summary: AiVarietySummary;
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

function buildMarkdown(rows: ThreatRow[], pairCount: number, maxTurns: number): string {
  const lines = [
    '# AI Threat And Pressure Report',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    'This file is a generated report artifact from `npm run ai:threat`.',
    '',
    'Methodology:',
    '- Pressure diagnostics are computed from the selected move traces rather than from static board snapshots.',
    '- `pressureEventRate` counts plies that create freeze pressure, capture-control pressure, frontier compression, or direct win-condition progress.',
    '- `frontierCompressionRate` measures how often moves shrink the reply frontier instead of just shuffling pieces.',
    `- Report settings: ${pairCount} mirrored seed pairs per row, ${maxTurns} continuation plies per trace.`,
    '',
    '| Scenario | Difficulty | Pressure Rate | Frontier Compression | Risk Progress Share | Mobility Slope | Decompression Slope | Drama | Tension | Decisive |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];

  for (const row of rows) {
    lines.push(
      `| ${row.label} | ${row.difficulty} | ${row.advanced.pressureEventRate} | ${row.advanced.frontierCompressionRate} | ${row.advanced.riskProgressShare} | ${row.summary.metrics.mobilityReleaseSlope} | ${row.summary.metrics.decompressionSlope} | ${row.summary.metrics.drama} | ${row.summary.metrics.tension} | ${row.summary.metrics.decisiveResultShare} |`,
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
  const rows: ThreatRow[] = [];

  for (const scenario of POSITION_BUCKET_SCENARIOS) {
    const initialState = buildScenarioState(scenario.turnCount, ruleConfig);

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
