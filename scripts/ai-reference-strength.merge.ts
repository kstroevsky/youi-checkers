import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import type { FrozenReferenceId } from '@/ai/test/frozenReferencePool';
import { AI_REFERENCE_STRENGTH_SCHEMA_VERSION } from '@/ai/test/referenceStrength';
import {
  mergeReferenceStrengthPairs,
  parseReferenceStrengthPairsJsonl,
} from '@/ai/test/referenceStrengthCampaign';
import { summarizeReferenceStrengthPairs } from '@/ai/test/referenceStrengthReport';

type StrengthSettings = {
  maxPlies: number;
  pairCount: number;
  referenceIds: FrozenReferenceId[];
};

type ShardReport = {
  execution: {
    campaignId: string;
    completedPairCount: number;
    plannedPairCount: number;
    shardCount: number;
    shardIndex: number;
  };
  provenance: {
    candidateSha256: string;
    domainSha256: string;
    fixtureSha256: string;
    gitRevision: string;
    rawSha256: string;
    referencePoolSha256: string;
  };
  referencePool: unknown;
  schemaVersion: number;
  settings: StrengthSettings;
  workload: Array<{ id: string }>;
};

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function parseArgs(argv: string[]): { inputs: string[]; out: string } {
  const args = new Map<string, string>();
  for (const entry of argv) {
    if (!entry.startsWith('--')) continue;
    const [key, value = ''] = entry.slice(2).split('=');
    args.set(key, value);
  }
  const inputs = (args.get('inputs') ?? '').split(',').filter(Boolean);
  if (!inputs.length)
    throw new Error('--inputs requires comma-separated prefixes.');
  return {
    inputs,
    out:
      args.get('out') ??
      path.join(process.cwd(), 'output', 'ai', 'ai-reference-strength-merged'),
  };
}

function comparableIdentity(report: ShardReport): string {
  return JSON.stringify({
    campaignId: report.execution.campaignId,
    candidateSha256: report.provenance.candidateSha256,
    domainSha256: report.provenance.domainSha256,
    fixtureSha256: report.provenance.fixtureSha256,
    gitRevision: report.provenance.gitRevision,
    plannedPairCount: report.execution.plannedPairCount,
    referencePool: report.referencePool,
    referencePoolSha256: report.provenance.referencePoolSha256,
    schemaVersion: report.schemaVersion,
    settings: report.settings,
    shardCount: report.execution.shardCount,
    workload: report.workload,
  });
}

function expectedPairIds(report: ShardReport): string[] {
  return report.workload.flatMap((fixture) =>
    report.settings.referenceIds.flatMap((referenceId) =>
      Array.from(
        { length: report.settings.pairCount },
        (_, pairIndex) => `${fixture.id}/${referenceId}/seed-${pairIndex}`,
      ),
    ),
  );
}

function markdown(report: {
  execution: { completedPairCount: number; shardCount: number };
  provenance: ShardReport['provenance'];
  summary: ReturnType<typeof summarizeReferenceStrengthPairs>;
}): string {
  return [
    '# AI Frozen-Reference Strength — Merged Campaign',
    '',
    `Revision: \`${report.provenance.gitRevision}\``,
    '',
    `Merged shards: ${report.execution.shardCount}; pairs: ${report.execution.completedPairCount}.`,
    '',
    `Resolved pairs: ${report.summary.resolvedPairs.count}/${report.summary.resolvedPairs.total} (${report.summary.resolvedPairs.share}).`,
    '',
    `Candidate point share: ${report.summary.candidatePointShareByPair.mean} (95% CI ${report.summary.candidatePointShareByPair.meanCi95.low}–${report.summary.candidatePointShareByPair.meanCi95.high}).`,
    '',
    `Fixed-horizon adjudicated point share: ${report.summary.candidatePointShareByAdjudicatedPair.mean} (95% CI ${report.summary.candidatePointShareByAdjudicatedPair.meanCi95.low}–${report.summary.candidatePointShareByAdjudicatedPair.meanCi95.high}).`,
    '',
    'Shard identity, raw checksums, pair uniqueness, and complete campaign coverage were validated before merge.',
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  const { inputs, out } = parseArgs(process.argv.slice(2));
  const reports = await Promise.all(
    inputs.map(
      async (prefix) =>
        JSON.parse(await readFile(`${prefix}.json`, 'utf8')) as ShardReport,
    ),
  );
  const first = reports[0];
  if (first.schemaVersion !== AI_REFERENCE_STRENGTH_SCHEMA_VERSION) {
    throw new Error('Shard uses an unsupported strength schema.');
  }
  const identity = comparableIdentity(first);
  if (reports.some((report) => comparableIdentity(report) !== identity)) {
    throw new Error('Strength shard identities differ.');
  }
  const shardIndices = reports
    .map((report) => report.execution.shardIndex)
    .sort((a, b) => a - b);
  const expectedShardIndices = Array.from(
    { length: first.execution.shardCount },
    (_, index) => index,
  );
  if (JSON.stringify(shardIndices) !== JSON.stringify(expectedShardIndices)) {
    throw new Error('Inputs do not contain every campaign shard exactly once.');
  }
  const rawPayloads = await Promise.all(
    inputs.map((prefix) => readFile(`${prefix}.samples.jsonl`, 'utf8')),
  );
  rawPayloads.forEach((payload, index) => {
    if (sha256(payload) !== reports[index].provenance.rawSha256) {
      throw new Error(
        `Raw checksum mismatch for shard ${reports[index].execution.shardIndex}.`,
      );
    }
  });
  const pairs = mergeReferenceStrengthPairs(
    rawPayloads.map(parseReferenceStrengthPairsJsonl),
    expectedPairIds(first),
  );
  const rawText = `${pairs.map((pair) => JSON.stringify(pair)).join('\n')}\n`;
  const report = {
    execution: {
      campaignId: first.execution.campaignId,
      completedPairCount: pairs.length,
      merged: true,
      plannedPairCount: first.execution.plannedPairCount,
      shardCount: first.execution.shardCount,
    },
    generatedAt: new Date().toISOString(),
    provenance: {
      ...first.provenance,
      rawSha256: sha256(rawText),
    },
    referencePool: first.referencePool,
    schemaVersion: AI_REFERENCE_STRENGTH_SCHEMA_VERSION,
    settings: first.settings,
    summary: summarizeReferenceStrengthPairs(pairs, first.settings.maxPlies),
    workload: first.workload,
  };
  await mkdir(path.dirname(out), { recursive: true });
  await Promise.all([
    writeFile(`${out}.json`, `${JSON.stringify(report, null, 2)}\n`, 'utf8'),
    writeFile(`${out}.md`, markdown(report), 'utf8'),
    writeFile(`${out}.samples.jsonl`, rawText, 'utf8'),
  ]);
  process.stdout.write(markdown(report));
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
