import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  AI_MEASUREMENT_SCHEMA_VERSION,
  summarizePairedDifference,
  type PairedDifferenceSummary,
} from '@/ai/test/measurement';

type DecisionSample = {
  kind: 'decision';
  observedWallMs: number;
  result: {
    completedDepth: number;
    completedRootMoves: number;
    evaluatedNodes: number;
    fallbackKind: string;
  };
  sampleId: string;
};

type MeasurementReport = {
  provenance: { fixtureSha256: string; gitRevision: string };
  schemaVersion: number;
  settings: unknown;
};

type ComparisonMetric = {
  meaning: string;
  summary: PairedDifferenceSummary;
};

function parseArgs(argv: string[]): Record<string, string> {
  const values: Record<string, string> = {};

  for (const entry of argv) {
    if (!entry.startsWith('--')) continue;
    const [key, value = ''] = entry.slice(2).split('=');
    values[key] = value;
  }

  return values;
}

async function readReport(filePath: string): Promise<MeasurementReport> {
  return JSON.parse(await readFile(filePath, 'utf8')) as MeasurementReport;
}

async function readDecisionSamples(
  filePath: string,
): Promise<Map<string, DecisionSample>> {
  const payload = await readFile(filePath, 'utf8');
  const samples = new Map<string, DecisionSample>();

  for (const line of payload.split('\n')) {
    if (!line.trim()) continue;
    const parsed = JSON.parse(line) as { kind?: string };
    if (parsed.kind !== 'decision') continue;
    const sample = parsed as DecisionSample;
    samples.set(sample.sampleId, sample);
  }

  return samples;
}

function assertComparable(
  baselineReport: MeasurementReport,
  candidateReport: MeasurementReport,
  baselineSamples: Map<string, DecisionSample>,
  candidateSamples: Map<string, DecisionSample>,
): void {
  if (
    baselineReport.schemaVersion !== AI_MEASUREMENT_SCHEMA_VERSION ||
    candidateReport.schemaVersion !== AI_MEASUREMENT_SCHEMA_VERSION
  ) {
    throw new Error('Both reports must use the current measurement schema.');
  }
  if (
    baselineReport.provenance.fixtureSha256 !==
    candidateReport.provenance.fixtureSha256
  ) {
    throw new Error('Fixture hashes differ; the workloads are not paired.');
  }
  if (
    JSON.stringify(baselineReport.settings) !==
    JSON.stringify(candidateReport.settings)
  ) {
    throw new Error(
      'Measurement settings differ; rerun both sides identically.',
    );
  }

  const baselineIds = [...baselineSamples.keys()].sort();
  const candidateIds = [...candidateSamples.keys()].sort();
  if (JSON.stringify(baselineIds) !== JSON.stringify(candidateIds)) {
    throw new Error(
      'Raw decision sample identities differ; pairing is invalid.',
    );
  }
  if (!baselineIds.length) throw new Error('No decision samples were found.');
}

function pairedValues(
  baseline: Map<string, DecisionSample>,
  candidate: Map<string, DecisionSample>,
  select: (sample: DecisionSample) => number,
): Array<{ baseline: number; candidate: number }> {
  return [...baseline.entries()].map(([sampleId, baselineSample]) => ({
    baseline: select(baselineSample),
    candidate: select(candidate.get(sampleId) as DecisionSample),
  }));
}

function markdown(report: {
  baselineRevision: string;
  candidateRevision: string;
  metrics: Record<string, ComparisonMetric>;
  overallVerdict: string;
}): string {
  const lines = [
    '# AI Measurement Paired Comparison',
    '',
    `Baseline: \`${report.baselineRevision}\``,
    '',
    `Candidate: \`${report.candidateRevision}\``,
    '',
    `Overall infrastructure verdict: **${report.overallVerdict}**`,
    '',
    '| Metric | Direction | Baseline mean | Candidate mean | Oriented delta | 95% CI | Verdict |',
    '| --- | --- | ---: | ---: | ---: | ---: | --- |',
  ];

  for (const [name, metric] of Object.entries(report.metrics)) {
    const summary = metric.summary;
    lines.push(
      `| ${name} | ${summary.direction} | ${summary.baseline.mean} | ${summary.candidate.mean} | ${summary.orientedMeanDifference} | [${summary.orientedMeanDifferenceCi95.low}, ${summary.orientedMeanDifferenceCi95.high}] | ${summary.verdict} |`,
    );
  }

  lines.push(
    '',
    'Positive oriented deltas always mean improvement. Verdicts require the entire paired-bootstrap interval to clear the configured practical threshold.',
    '',
    'This comparison validates search execution, not player enjoyment. Behavioral adoption still requires the outcome and behavior families in the source reports plus human playtests.',
  );
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const required = [
    'baseline-report',
    'baseline-raw',
    'candidate-report',
    'candidate-raw',
  ];
  for (const name of required) {
    if (!args[name]) throw new Error(`Missing --${name}=<path>.`);
  }

  const [baselineReport, candidateReport, baselineSamples, candidateSamples] =
    await Promise.all([
      readReport(args['baseline-report']),
      readReport(args['candidate-report']),
      readDecisionSamples(args['baseline-raw']),
      readDecisionSamples(args['candidate-raw']),
    ]);
  assertComparable(
    baselineReport,
    candidateReport,
    baselineSamples,
    candidateSamples,
  );

  const metrics: Record<string, ComparisonMetric> = {
    completedDepth: {
      meaning:
        'Higher completed depth is evidence that more intended search ran.',
      summary: summarizePairedDifference(
        pairedValues(
          baselineSamples,
          candidateSamples,
          (sample) => sample.result.completedDepth,
        ),
        { direction: 'higherIsBetter', materialDifference: 0.1 },
      ),
    },
    completedRootMoves: {
      meaning: 'Higher root coverage reduces partial-depth selection risk.',
      summary: summarizePairedDifference(
        pairedValues(
          baselineSamples,
          candidateSamples,
          (sample) => sample.result.completedRootMoves,
        ),
        { direction: 'higherIsBetter', materialDifference: 0.5 },
      ),
    },
    fallbackShare: {
      meaning:
        'Lower fallback frequency means the requested search path completed.',
      summary: summarizePairedDifference(
        pairedValues(baselineSamples, candidateSamples, (sample) =>
          sample.result.fallbackKind === 'none' ? 0 : 1,
        ),
        { direction: 'lowerIsBetter', materialDifference: 0.01 },
      ),
    },
    observedWallMs: {
      meaning:
        'Lower paired wall time is a latency guardrail, not an enjoyment metric.',
      summary: summarizePairedDifference(
        pairedValues(
          baselineSamples,
          candidateSamples,
          (sample) => sample.observedWallMs,
        ),
        { direction: 'lowerIsBetter', materialDifference: 2 },
      ),
    },
  };
  const guardrailNames = [
    'completedDepth',
    'completedRootMoves',
    'fallbackShare',
  ];
  const hasRegression = guardrailNames.some(
    (name) => metrics[name].summary.verdict === 'regressed',
  );
  const hasImprovement = Object.values(metrics).some(
    (metric) => metric.summary.verdict === 'improved',
  );
  const overallVerdict = hasRegression
    ? 'regressed'
    : hasImprovement
      ? 'improved-search-execution'
      : 'inconclusive';
  const report = {
    baselineRevision: baselineReport.provenance.gitRevision,
    candidateRevision: candidateReport.provenance.gitRevision,
    generatedAt: new Date().toISOString(),
    metrics,
    overallVerdict,
    pairCount: baselineSamples.size,
    schemaVersion: AI_MEASUREMENT_SCHEMA_VERSION,
  };
  const outputPrefix =
    args.out ?? path.join('output', 'ai', 'ai-measurement-paired');
  const jsonPath = `${outputPrefix}.json`;
  const markdownPath = `${outputPrefix}.md`;

  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(markdownPath, markdown(report), 'utf8');
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
