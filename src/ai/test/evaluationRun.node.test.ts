import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  AI_EVALUATION_RUN_SCHEMA_VERSION,
  atomicWriteJson,
  boundedFailureSummary,
  createEvaluationRunId,
  mergeJsonlArtifacts,
  recordArtifact,
  verifyCheckpointArtifacts,
  type EvaluationPipelineCheckpointV1,
} from '@/ai/test/evaluationRun.node';

describe('evaluation run persistence', () => {
  it('creates sortable unique run ids', () => {
    const now = new Date('2026-08-21T10:20:30.456Z');
    expect(createEvaluationRunId(now, 'alpha')).toMatch(
      /^2026-08-21T10-20-30-456Z-[a-f0-9]{12}$/u,
    );
    expect(createEvaluationRunId(now, 'alpha')).not.toBe(
      createEvaluationRunId(now, 'beta'),
    );
  });

  it('verifies complete checkpoint artifacts and rejects tampering', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'youi-eval-run-'));
    const artifactPath = path.join(root, 'shards', 'one', 'report.json');
    await atomicWriteJson(artifactPath, { ok: true });
    const record = await recordArtifact(root, artifactPath);
    const checkpoint: EvaluationPipelineCheckpointV1 = {
      artifacts: [record],
      completedAt: new Date().toISOString(),
      exitCode: 0,
      pipelineId: 'one',
      schemaVersion: AI_EVALUATION_RUN_SCHEMA_VERSION,
      status: 'complete' as const,
    };

    await expect(
      verifyCheckpointArtifacts(root, checkpoint),
    ).resolves.toBeUndefined();
    await writeFile(artifactPath, '{"ok":false}\n');
    await expect(verifyCheckpointArtifacts(root, checkpoint)).rejects.toThrow(
      /mismatch/u,
    );
  });

  it('merges raw samples in declared pipeline and source-line order', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'youi-eval-merge-'));
    const first = path.join(root, 'first.jsonl');
    const second = path.join(root, 'second.jsonl');
    await writeFile(first, '{"id":1}\n{"id":2}\n');
    await writeFile(second, '{"id":3}\n');
    const result = await mergeJsonlArtifacts({
      artifacts: [
        { pipelineId: 'first', record: await recordArtifact(root, first) },
        { pipelineId: 'second', record: await recordArtifact(root, second) },
      ],
      outputPath: path.join(root, 'merged', 'samples.jsonl'),
      runDirectory: root,
    });
    const rows = (
      await readFile(path.join(root, 'merged', 'samples.jsonl'), 'utf8')
    )
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));

    expect(result.lineCount).toBe(3);
    expect(
      rows.map((row) => [row.pipelineId, row.sourceLine, row.sample.id]),
    ).toEqual([
      ['first', 1, 1],
      ['first', 2, 2],
      ['second', 1, 3],
    ]);
  });

  it('bounds worker failure summaries from the tail', () => {
    expect(boundedFailureSummary('abcdefgh', 4)).toBe('efgh');
  });
});
