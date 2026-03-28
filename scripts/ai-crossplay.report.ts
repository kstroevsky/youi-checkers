import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { summarizeAdvancedTraceMetrics } from '@/ai/test/advancedMetrics';
import {
  runAiGameTrace,
  summarizeAiVariety,
  type AiGameTrace,
} from '@/ai/test/metrics';
import { withRuleDefaults } from '@/domain/model/ruleConfig';
import type { Player } from '@/domain/model/types';
import type { AiBehaviorProfileId, AiDifficulty } from '@/shared/types/session';

const OUTPUT_DIR = path.join(process.cwd(), 'output', 'ai');
const JSON_OUTPUT = path.join(OUTPUT_DIR, 'ai-crossplay-report.json');
const MARKDOWN_OUTPUT = path.join(OUTPUT_DIR, 'ai-crossplay-report.md');
const DEFAULT_PAIR_COUNT = 3;
const DEFAULT_MAX_TURNS = 80;

type CellSummary = {
  compositeInterestingness: number;
  decisiveResultShare: number;
  drawShare: number;
  loopEscapeRate8: number;
  pointShare: number;
  pressureEventRate: number;
  recurrenceLaminarity: number;
};

type MatrixReport<TKey extends string> = {
  cells: Record<TKey, Record<TKey, CellSummary>>;
  labels: TKey[];
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

function createForcedProfile(id: AiBehaviorProfileId, seed: string) {
  return { id, seed };
}

function getPointsForSide(trace: AiGameTrace, side: Player): number {
  if ('winner' in trace.finalVictory) {
    return trace.finalVictory.winner === side ? 1 : 0;
  }

  return 0.5;
}

function summarizeCell(
  traces: AiGameTrace[],
  rowSideSelector: (trace: AiGameTrace) => Player,
): CellSummary {
  const advanced = summarizeAdvancedTraceMetrics(traces);
  const variety = summarizeAiVariety(traces, {
    difficulty: traces[0]?.difficulty ?? 'hard',
    maxTurns: traces[0]?.maxTurns ?? DEFAULT_MAX_TURNS,
    pairCount: Math.max(1, traces.length / 2),
    stableCalls: 0,
  });
  const pointShare = roundMetric(
    traces.reduce((sum, trace) => sum + getPointsForSide(trace, rowSideSelector(trace)), 0) /
      Math.max(1, traces.length),
  );

  return {
    compositeInterestingness: variety.metrics.compositeInterestingness,
    decisiveResultShare: variety.metrics.decisiveResultShare,
    drawShare: roundMetric(
      (variety.games.terminalCounts.threefoldDraw +
        variety.games.terminalCounts.stalemateDraw +
        variety.games.terminalCounts.unfinished) /
        Math.max(1, traces.length),
    ),
    loopEscapeRate8: advanced.loopEscapeRate8,
    pointShare,
    pressureEventRate: advanced.pressureEventRate,
    recurrenceLaminarity: advanced.recurrenceLaminarity,
  };
}

function runDifficultySeries(
  rowDifficulty: AiDifficulty,
  columnDifficulty: AiDifficulty,
  pairCount: number,
  maxTurns: number,
): AiGameTrace[] {
  const ruleConfig = withRuleDefaults({
    drawRule: 'threefold',
    scoringMode: 'off',
  });
  const traces: AiGameTrace[] = [];

  for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
    const baseWhiteSeed = pairIndex * 2 + 1;
    const baseBlackSeed = pairIndex * 2 + 2;

    traces.push(
      runAiGameTrace({
        blackDifficulty: columnDifficulty,
        blackSeed: baseBlackSeed,
        difficulty: rowDifficulty,
        gameIndex: traces.length,
        maxTurns,
        mirrorIndex: 0,
        pairIndex,
        ruleConfig,
        whiteDifficulty: rowDifficulty,
        whiteSeed: baseWhiteSeed,
      }),
    );
    traces.push(
      runAiGameTrace({
        blackDifficulty: rowDifficulty,
        blackSeed: baseWhiteSeed,
        difficulty: rowDifficulty,
        gameIndex: traces.length,
        maxTurns,
        mirrorIndex: 1,
        pairIndex,
        ruleConfig,
        whiteDifficulty: columnDifficulty,
        whiteSeed: baseBlackSeed,
      }),
    );
  }

  return traces;
}

function runPersonaSeries(
  rowPersona: AiBehaviorProfileId,
  columnPersona: AiBehaviorProfileId,
  pairCount: number,
  maxTurns: number,
): AiGameTrace[] {
  const ruleConfig = withRuleDefaults({
    drawRule: 'threefold',
    scoringMode: 'off',
  });
  const traces: AiGameTrace[] = [];

  for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
    const baseWhiteSeed = pairIndex * 2 + 101;
    const baseBlackSeed = pairIndex * 2 + 102;

    traces.push(
      runAiGameTrace({
        blackBehaviorProfile: createForcedProfile(columnPersona, `black-${columnPersona}-${pairIndex}`),
        blackDifficulty: 'hard',
        blackSeed: baseBlackSeed,
        difficulty: 'hard',
        gameIndex: traces.length,
        maxTurns,
        mirrorIndex: 0,
        pairIndex,
        ruleConfig,
        whiteBehaviorProfile: createForcedProfile(rowPersona, `white-${rowPersona}-${pairIndex}`),
        whiteDifficulty: 'hard',
        whiteSeed: baseWhiteSeed,
      }),
    );
    traces.push(
      runAiGameTrace({
        blackBehaviorProfile: createForcedProfile(rowPersona, `black-${rowPersona}-${pairIndex}`),
        blackDifficulty: 'hard',
        blackSeed: baseWhiteSeed,
        difficulty: 'hard',
        gameIndex: traces.length,
        maxTurns,
        mirrorIndex: 1,
        pairIndex,
        ruleConfig,
        whiteBehaviorProfile: createForcedProfile(columnPersona, `white-${columnPersona}-${pairIndex}`),
        whiteDifficulty: 'hard',
        whiteSeed: baseBlackSeed,
      }),
    );
  }

  return traces;
}

function buildMatrixReport<TKey extends string>(
  labels: TKey[],
  traceFactory: (row: TKey, column: TKey) => AiGameTrace[],
  rowSideSelector: (row: TKey, trace: AiGameTrace) => Player,
): MatrixReport<TKey> {
  const cells = {} as Record<TKey, Record<TKey, CellSummary>>;

  for (const row of labels) {
    cells[row] = {} as Record<TKey, CellSummary>;

    for (const column of labels) {
      const traces = traceFactory(row, column);
      cells[row][column] =
        row === column
          ? summarizeCell(traces, (trace) => rowSideSelector(row, trace))
          : summarizeCell(traces, (trace) => rowSideSelector(row, trace));
    }
  }

  return { cells, labels };
}

function buildMatrixTable<TKey extends string>(
  title: string,
  matrix: MatrixReport<TKey>,
  selector: (cell: CellSummary) => number,
): string[] {
  const lines = [title, '', `| row \\ col | ${matrix.labels.join(' | ')} |`, `| --- | ${matrix.labels.map(() => '---:').join(' | ')} |`];

  for (const row of matrix.labels) {
    lines.push(
      `| ${row} | ${matrix.labels.map((column) => selector(matrix.cells[row][column])).join(' | ')} |`,
    );
  }

  lines.push('');
  return lines;
}

function buildMarkdown(
  difficultyMatrix: MatrixReport<AiDifficulty>,
  personaMatrix: MatrixReport<AiBehaviorProfileId>,
  pairCount: number,
  maxTurns: number,
): string {
  const lines = [
    '# AI Cross-Play Report',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    'This file is a generated report artifact from `npm run ai:crossplay`.',
    '',
    'Methodology:',
    '- Each off-diagonal cell runs mirrored color pairings so the row side appears as both white and black.',
    '- Difficulty cross-play uses the standard hidden-persona system.',
    '- Persona cross-play fixes both sides to `hard` and pins the hidden persona ids explicitly.',
    `- Report settings: ${pairCount} mirrored seed pairs per cell, ${maxTurns} plies per trace.`,
    '',
    '## Difficulty Matrix',
    '',
  ];

  lines.push(...buildMatrixTable('### Point Share', difficultyMatrix, (cell) => cell.pointShare));
  lines.push(...buildMatrixTable('### Composite Interestingness', difficultyMatrix, (cell) => cell.compositeInterestingness));
  lines.push(...buildMatrixTable('### Loop Escape <= 8 Plies', difficultyMatrix, (cell) => cell.loopEscapeRate8));
  lines.push(...buildMatrixTable('### Pressure Event Rate', difficultyMatrix, (cell) => cell.pressureEventRate));
  lines.push('## Persona Matrix (`hard` only)');
  lines.push('');
  lines.push(...buildMatrixTable('### Point Share', personaMatrix, (cell) => cell.pointShare));
  lines.push(...buildMatrixTable('### Composite Interestingness', personaMatrix, (cell) => cell.compositeInterestingness));
  lines.push(...buildMatrixTable('### Recurrence Laminarity', personaMatrix, (cell) => cell.recurrenceLaminarity));
  lines.push(...buildMatrixTable('### Decisive Result Share', personaMatrix, (cell) => cell.decisiveResultShare));

  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const pairCount = parseArg('pairs', DEFAULT_PAIR_COUNT);
  const maxTurns = parseArg('max-turns', DEFAULT_MAX_TURNS);
  const difficulties: AiDifficulty[] = ['easy', 'medium', 'hard'];
  const personas: AiBehaviorProfileId[] = ['expander', 'hunter', 'builder'];
  const difficultyMatrix = buildMatrixReport(
    difficulties,
    (row, column) => runDifficultySeries(row, column, pairCount, maxTurns),
    (row, trace) => (trace.sideDifficulties.white === row ? 'white' : 'black'),
  );
  const personaMatrix = buildMatrixReport(
    personas,
    (row, column) => runPersonaSeries(row, column, pairCount, maxTurns),
    (row, trace) => (trace.sideProfiles.white === row ? 'white' : 'black'),
  );
  const report = {
    difficultyMatrix,
    generatedAt: new Date().toISOString(),
    personaMatrix,
    settings: {
      maxTurns,
      pairCount,
    },
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(JSON_OUTPUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(MARKDOWN_OUTPUT, buildMarkdown(difficultyMatrix, personaMatrix, pairCount, maxTurns), 'utf8');
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
