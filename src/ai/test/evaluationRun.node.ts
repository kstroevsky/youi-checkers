import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { finished } from 'node:stream/promises';

export const AI_EVALUATION_RUN_SCHEMA_VERSION = 1;

export type EvaluationArtifactRecordV1 = {
  bytes: number;
  kind: 'json' | 'jsonl' | 'markdown' | 'html' | 'other';
  relativePath: string;
  sha256: string;
};

export type EvaluationPipelineCheckpointV1 = {
  artifacts: EvaluationArtifactRecordV1[];
  completedAt: string;
  exitCode: number;
  pipelineId: string;
  schemaVersion: 1;
  status: 'complete';
};

export type EvaluationRunProgressV1 = {
  completedPipelineCount: number;
  failedPipelineCount: number;
  plannedPipelineCount: number;
  schemaVersion: 1;
  state: 'incomplete' | 'failed' | 'complete';
  updatedAt: string;
};

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  const input = createReadStream(filePath);
  input.on('data', (chunk) => hash.update(chunk));
  await finished(input);
  return hash.digest('hex');
}

export function createEvaluationRunId(
  now = new Date(),
  nonce: string = randomUUID(),
): string {
  const timestamp = now.toISOString().replaceAll(/[:.]/gu, '-');
  return `${timestamp}-${sha256(nonce).slice(0, 12)}`;
}

export async function atomicWriteText(
  filePath: string,
  value: string,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, value, 'utf8');
  await rename(temporaryPath, filePath);
}

export async function atomicWriteJson(
  filePath: string,
  value: unknown,
): Promise<void> {
  await atomicWriteText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function artifactKind(
  filePath: string,
): EvaluationArtifactRecordV1['kind'] {
  if (filePath.endsWith('.samples.jsonl') || filePath.endsWith('.jsonl')) {
    return 'jsonl';
  }
  if (filePath.endsWith('.json')) return 'json';
  if (filePath.endsWith('.md')) return 'markdown';
  if (filePath.endsWith('.html')) return 'html';
  return 'other';
}

export async function recordArtifact(
  runDirectory: string,
  filePath: string,
): Promise<EvaluationArtifactRecordV1> {
  const fileStat = await stat(filePath);
  if (!fileStat.isFile())
    throw new Error(`Artifact is not a file: ${filePath}`);
  return {
    bytes: fileStat.size,
    kind: artifactKind(filePath),
    relativePath: path.relative(runDirectory, filePath),
    sha256: await sha256File(filePath),
  };
}

export async function verifyCheckpointArtifacts(
  runDirectory: string,
  checkpoint: EvaluationPipelineCheckpointV1,
): Promise<void> {
  if (
    checkpoint.schemaVersion !== AI_EVALUATION_RUN_SCHEMA_VERSION ||
    checkpoint.status !== 'complete'
  ) {
    throw new Error(
      `Unsupported or incomplete checkpoint for ${checkpoint.pipelineId}.`,
    );
  }
  for (const artifact of checkpoint.artifacts) {
    const absolutePath = path.resolve(runDirectory, artifact.relativePath);
    const relative = path.relative(runDirectory, absolutePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(
        `Checkpoint artifact escapes the run directory: ${artifact.relativePath}`,
      );
    }
    const fileStat = await stat(absolutePath);
    if (fileStat.size !== artifact.bytes) {
      throw new Error(`Artifact size mismatch for ${artifact.relativePath}.`);
    }
    if ((await sha256File(absolutePath)) !== artifact.sha256) {
      throw new Error(`Artifact hash mismatch for ${artifact.relativePath}.`);
    }
  }
}

export async function readCheckpoint(
  checkpointPath: string,
): Promise<EvaluationPipelineCheckpointV1> {
  return JSON.parse(
    await readFile(checkpointPath, 'utf8'),
  ) as EvaluationPipelineCheckpointV1;
}

export async function mergeJsonlArtifacts({
  artifacts,
  outputPath,
  runDirectory,
}: {
  artifacts: Array<{ pipelineId: string; record: EvaluationArtifactRecordV1 }>;
  outputPath: string;
  runDirectory: string;
}): Promise<{ lineCount: number; sha256: string }> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.${randomUUID()}.tmp`;
  const output = createWriteStream(temporaryPath, { encoding: 'utf8' });
  let lineCount = 0;

  for (const { pipelineId, record } of artifacts) {
    const inputPath = path.resolve(runDirectory, record.relativePath);
    const lines = readline.createInterface({
      crlfDelay: Infinity,
      input: createReadStream(inputPath, { encoding: 'utf8' }),
    });
    let sourceLine = 0;
    for await (const line of lines) {
      if (!line) continue;
      sourceLine += 1;
      lineCount += 1;
      output.write(
        `${JSON.stringify({
          pipelineId,
          sample: JSON.parse(line) as unknown,
          sourceLine,
        })}\n`,
      );
    }
  }

  output.end();
  await finished(output);
  await rename(temporaryPath, outputPath);
  return { lineCount, sha256: await sha256File(outputPath) };
}

export function boundedFailureSummary(
  value: string,
  maximumCharacters = 16_000,
): string {
  return value.length <= maximumCharacters
    ? value
    : value.slice(value.length - maximumCharacters);
}
