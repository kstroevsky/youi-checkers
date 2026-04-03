import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { summarizeAdvancedTraceMetrics } from '@/ai/test/advancedMetrics';
import {
  getStableCallsForDifficulty,
  runAiVarietySuite,
  summarizeAiVariety,
  type AiGameTrace,
  type AiVarietySummary,
} from '@/ai/test/metrics';
import { withRuleDefaults } from '@/domain/model/ruleConfig';
import type { AiDifficulty } from '@/shared/types/session';

import { POSITION_BUCKET_SCENARIOS, type AiScenarioBucket, buildScenarioState } from './aiScenarioCatalog';

const OUTPUT_DIR = path.join(process.cwd(), 'output', 'ai');
const JSON_OUTPUT = path.join(OUTPUT_DIR, 'ai-position-buckets-report.json');
const MARKDOWN_OUTPUT = path.join(OUTPUT_DIR, 'ai-position-buckets-report.md');
const DEFAULT_PAIR_COUNT = 4;
const DEFAULT_MAX_TURNS = 40;

type BucketRow = {
  advanced: ReturnType<typeof summarizeAdvancedTraceMetrics>;
  bucket: AiScenarioBucket;
  difficulty: AiDifficulty;
  scenarios: string[];
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

function buildMarkdown(rows: BucketRow[], pairCount: number, maxTurns: number): string {
  const lines = [
    '# AI Position Bucket Report',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    'This file is a generated report artifact from `npm run ai:position-buckets`.',
    '',
    'Methodology:',
    '- Deterministic benchmark positions are grouped into structural buckets instead of being judged one-by-one.',
    '- Bucket aggregation answers whether the AI handles a class of positions well, not just one single fixture.',
    '- For non-opening buckets, `openingEntropy` means first-reply entropy from that bucket state, not literal game openings.',
    `- Report settings: ${pairCount} mirrored seed pairs per scenario, ${maxTurns} continuation plies per trace.`,
    '',
    '| Bucket | Difficulty | Scenarios | Opening Entropy | Unique Lines | Repetition | Stagnation | Loop Escape<=8 | Pressure | Pos LZC | SampEn | PermEn | Interestingness |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];

  for (const row of rows) {
    lines.push(
      `| ${row.bucket} | ${row.difficulty} | ${row.scenarios.join(', ')} | ${row.summary.metrics.openingEntropy} | ${row.summary.metrics.uniqueOpeningLineShare} | ${row.summary.metrics.repetitionPlyShare} | ${row.summary.metrics.stagnationWindowRate} | ${row.advanced.loopEscapeRate8} | ${row.advanced.pressureEventRate} | ${row.advanced.positionLempelZiv} | ${row.advanced.scoreSampleEntropy} | ${row.advanced.scorePermutationEntropy} | ${row.summary.metrics.compositeInterestingness} |`,
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
  const rows: BucketRow[] = [];
  const buckets = [...new Set(POSITION_BUCKET_SCENARIOS.map((scenario) => scenario.bucket))];

  for (const bucket of buckets) {
    const bucketScenarios = POSITION_BUCKET_SCENARIOS.filter((scenario) => scenario.bucket === bucket);

    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      const stableCalls = getStableCallsForDifficulty(difficulty);
      const traces: AiGameTrace[] = [];

      for (const scenario of bucketScenarios) {
        traces.push(
          ...runAiVarietySuite({
            difficulty,
            initialState: buildScenarioState(scenario, ruleConfig),
            maxTurns,
            pairCount,
            ruleConfig,
            stableCalls,
          }),
        );
      }

      rows.push({
        advanced: summarizeAdvancedTraceMetrics(traces),
        bucket,
        difficulty,
        scenarios: bucketScenarios.map((scenario) => scenario.label),
        summary: summarizeAiVariety(traces, {
          difficulty,
          maxTurns,
          pairCount: pairCount * bucketScenarios.length,
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
