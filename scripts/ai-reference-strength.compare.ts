import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { AI_REFERENCE_STRENGTH_SCHEMA_VERSION, type ReferenceStrengthPair } from '@/ai/test/referenceStrength';
import { summarizePairedStrengthNonInferiority } from '@/ai/test/referenceStrengthStats';

type StrengthReport = {
  provenance: {
    fixtureSha256: string;
    gitRevision: string;
    referencePoolSha256: string;
  };
  schemaVersion: number;
  settings: unknown;
};

function parseArgs(argv: string[]): Record<string, string> {
  return Object.fromEntries(
    argv.filter((entry) => entry.startsWith('--')).map((entry) => {
      const [key, value = ''] = entry.slice(2).split('=');
      return [key, value];
    }),
  );
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
}

async function readPairs(filePath: string): Promise<Map<string, ReferenceStrengthPair>> {
  const lines = (await readFile(filePath, 'utf8')).split('\n').filter(Boolean);
  const pairs = new Map<string, ReferenceStrengthPair>();
  for (const line of lines) {
    const pair = JSON.parse(line) as ReferenceStrengthPair;
    if (pair.kind !== 'strengthPair') continue;
    pairs.set(pair.pairId, pair);
  }
  return pairs;
}

function assertComparable(
  baselineReport: StrengthReport,
  candidateReport: StrengthReport,
  baselinePairs: Map<string, ReferenceStrengthPair>,
  candidatePairs: Map<string, ReferenceStrengthPair>,
): void {
  if (
    baselineReport.schemaVersion !== AI_REFERENCE_STRENGTH_SCHEMA_VERSION ||
    candidateReport.schemaVersion !== AI_REFERENCE_STRENGTH_SCHEMA_VERSION
  ) throw new Error('Both reports must use the current reference-strength schema.');
  if (baselineReport.provenance.fixtureSha256 !== candidateReport.provenance.fixtureSha256) {
    throw new Error('Fixture hashes differ; the strength workloads are not paired.');
  }
  if (baselineReport.provenance.referencePoolSha256 !== candidateReport.provenance.referencePoolSha256) {
    throw new Error('Frozen reference-pool hashes differ.');
  }
  if (JSON.stringify(baselineReport.settings) !== JSON.stringify(candidateReport.settings)) {
    throw new Error('Strength settings differ; rerun both revisions identically.');
  }
  const baselineIds = [...baselinePairs.keys()].sort();
  const candidateIds = [...candidatePairs.keys()].sort();
  if (!baselineIds.length || JSON.stringify(baselineIds) !== JSON.stringify(candidateIds)) {
    throw new Error('Raw strength pair identities differ or are empty.');
  }
}

function markdown(report: {
  baselineRevision: string;
  candidateRevision: string;
  comparison: ReturnType<typeof summarizePairedStrengthNonInferiority>;
}) {
  const { comparison } = report;
  return [
    '# AI Strength Paired Non-Inferiority',
    '',
    `Baseline: \`${report.baselineRevision}\``,
    '',
    `Candidate: \`${report.candidateRevision}\``,
    '',
    `Release verdict: **${comparison.overallVerdict}**`,
    '',
    '| Gate | Estimate | Fixed-portfolio 95% CI | Hierarchical 95% CI | Margin | Verdict |',
    '| --- | ---: | ---: | ---: | ---: | --- |',
    `| Paired score delta | ${comparison.score.estimate} | [${comparison.score.ci95.low}, ${comparison.score.ci95.high}] | [${comparison.score.generalizationCi95.low}, ${comparison.score.generalizationCi95.high}] | ${comparison.score.margin} | ${comparison.score.verdict} |`,
    `| Resolved-pair share delta | ${comparison.resolution.estimate} | [${comparison.resolution.ci95.low}, ${comparison.resolution.ci95.high}] | [${comparison.resolution.generalizationCi95.low}, ${comparison.resolution.generalizationCi95.high}] | ${comparison.resolution.margin} | ${comparison.resolution.verdict} |`,
    '',
    `Jointly resolved pairs: ${comparison.censoring.jointlyResolvedPairs}/${comparison.censoring.pairCount}.`,
    '',
    `Variance components: between-stratum ${comparison.variance.betweenStratumVariance}; within-stratum ${comparison.variance.withinStratumVariance}; fixture share ${comparison.variance.fixtureSeedVarianceShare}.`,
    '',
    'The gate passes only when both lower confidence bounds stay above their predeclared negative margins. Score effects use only jointly resolved color-swapped pairs; resolution is a separate guardrail against favorable censoring.',
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  for (const required of ['baseline-report', 'baseline-raw', 'candidate-report', 'candidate-raw']) {
    if (!args[required]) throw new Error(`Missing --${required}=<path>.`);
  }
  const [baselineReport, candidateReport, baselinePairs, candidatePairs] = await Promise.all([
    readJson<StrengthReport>(args['baseline-report']),
    readJson<StrengthReport>(args['candidate-report']),
    readPairs(args['baseline-raw']),
    readPairs(args['candidate-raw']),
  ]);
  assertComparable(baselineReport, candidateReport, baselinePairs, candidatePairs);
  const observations = [...baselinePairs.entries()].map(([pairId, baseline]) => {
    const candidate = candidatePairs.get(pairId) as ReferenceStrengthPair;
    if (candidate.stratumId !== baseline.stratumId) {
      throw new Error(`Stratum mismatch for ${pairId}.`);
    }
    return {
      baseline: baseline.pairScore,
      candidate: candidate.pairScore,
      pairId,
      stratumId: baseline.stratumId,
    };
  });
  const scoreMargin = Number.parseFloat(args['score-margin'] ?? '0.03');
  const resolutionMargin = Number.parseFloat(args['resolution-margin'] ?? '0.03');
  if (!Number.isFinite(scoreMargin) || scoreMargin < 0 || !Number.isFinite(resolutionMargin) || resolutionMargin < 0) {
    throw new Error('Non-inferiority margins must be finite non-negative numbers.');
  }
  const comparison = summarizePairedStrengthNonInferiority(observations, {
    resolutionMargin,
    scoreMargin,
  });
  const report = {
    baselineRevision: baselineReport.provenance.gitRevision,
    candidateRevision: candidateReport.provenance.gitRevision,
    comparison,
    generatedAt: new Date().toISOString(),
    schemaVersion: AI_REFERENCE_STRENGTH_SCHEMA_VERSION,
  };
  const out = args.out ?? path.join(process.cwd(), 'output', 'ai', 'ai-reference-strength-paired');
  await mkdir(path.dirname(out), { recursive: true });
  await Promise.all([
    writeFile(`${out}.json`, `${JSON.stringify(report, null, 2)}\n`, 'utf8'),
    writeFile(`${out}.md`, markdown(report), 'utf8'),
  ]);
  process.stdout.write(markdown(report));
  if (args['enforce-gate'] === 'true' && comparison.overallVerdict !== 'nonInferior') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
