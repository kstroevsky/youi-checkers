import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import type { AiDifficulty } from '@/shared/types/session';
import { withRuleDefaults } from '@/domain/model/ruleConfig';
import baselines from '@/ai/test/fixtures/ai-variety-baselines.json';
import targetBands from '@/ai/test/fixtures/ai-variety-target-bands.json';
import {
  compareSummaryToBaseline,
  getStableCallsForDifficulty,
  runAiVarietySuite,
  summarizeAiVariety,
  type AiVarietyMetricKey,
  type AiVarietySummary,
  type AiVarietyTargetBand,
} from '@/ai/test/metrics';

const OUTPUT_DIR = path.join(process.cwd(), 'output', 'ai');
const JSON_OUTPUT = path.join(OUTPUT_DIR, 'ai-variety-report.json');
const MARKDOWN_OUTPUT = path.join(OUTPUT_DIR, 'ai-variety-report.md');
const DEFAULT_PAIR_COUNT = 32;
const DEFAULT_MAX_TURNS = 80;

type BaselineFile = {
  difficulties: Record<AiDifficulty, AiVarietySummary>;
  version: number;
};

type TargetBandFile = {
  metrics: Partial<Record<AiVarietyMetricKey, AiVarietyTargetBand>>;
  version: number;
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

function round(value: number, digits = 4): number {
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

function buildMarkdown(
  summaries: Record<AiDifficulty, AiVarietySummary>,
  regressions: Record<AiDifficulty, ReturnType<typeof compareSummaryToBaseline>>,
  targets: TargetBandFile,
): string {
  const keyMetrics: AiVarietyMetricKey[] = [
    'twoPlyUndoRate',
    'sameFamilyQuietRepeatRate',
    'repetitionPlyShare',
    'threefoldDrawShare',
    'stagnationWindowRate',
    'openingEntropy',
    'sourceFamilyOpeningHhi',
    'uniqueOpeningLineShare',
    'decompressionSlope',
    'mobilityReleaseSlope',
    'meanBoardDisplacement',
    'drama',
    'tension',
    'compositeInterestingness',
  ];

  const lines = [
    '# AI Variety Report',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
  ];

  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    const summary = summaries[difficulty];
    lines.push(`## ${difficulty}`);
    lines.push('');
    lines.push(
      `Games: ${summary.gameCount}, average plies: ${summary.games.averagePlies}, terminals: ${JSON.stringify(summary.games.terminalCounts)}`,
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
        `| ${metric} | ${summary.metrics[metric]} | ${targetLabel} | ${classifyMetric(summary.metrics[metric], band)} |`,
      );
    }

    if (regressions[difficulty].length) {
      lines.push('');
      lines.push('Regressions:');
      for (const regression of regressions[difficulty]) {
        lines.push(
          `- ${regression.metric}: ${regression.current} vs threshold ${regression.threshold} (${regression.direction} is better)`,
        );
      }
    }

    lines.push('');
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
  const baselineFile = baselines as BaselineFile;
  const targetBandFile = targetBands as TargetBandFile;
  const summaries = {} as Record<AiDifficulty, AiVarietySummary>;
  const regressions = {} as Record<AiDifficulty, ReturnType<typeof compareSummaryToBaseline>>;

  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    const stableCalls = getStableCallsForDifficulty(difficulty);
    const traces = runAiVarietySuite({
      difficulty,
      maxTurns,
      pairCount,
      ruleConfig,
      stableCalls,
    });
    const summary = summarizeAiVariety(traces, {
      baselineSummary: baselineFile.difficulties[difficulty] ?? null,
      difficulty,
      maxTurns,
      pairCount,
      stableCalls,
      targetBands: targetBandFile,
    });

    summaries[difficulty] = summary;
    regressions[difficulty] = compareSummaryToBaseline(summary, baselineFile.difficulties[difficulty]);
  }

  const report = {
    baselineVersion: baselineFile.version,
    generatedAt: new Date().toISOString(),
    regressions,
    settings: {
      maxTurns,
      pairCount,
      ruleConfig,
    },
    summaries,
    targetBandVersion: targetBandFile.version,
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(JSON_OUTPUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(MARKDOWN_OUTPUT, buildMarkdown(summaries, regressions, targetBandFile), 'utf8');

  const regressionCount = Object.values(regressions).reduce((sum, entries) => sum + entries.length, 0);

  if (regressionCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
