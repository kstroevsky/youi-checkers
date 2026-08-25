import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  createCurrentAiPolicy,
  CURRENT_AI_POLICY_ADAPTER_VERSION,
  type AiPolicy,
} from '@/ai/test/policy';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function listProductionAiFilesAtRevision(revision: string): string[] {
  return execFileSync(
    'git',
    ['ls-tree', '-r', '--name-only', revision, 'src/ai'],
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter(
      (filePath) =>
        filePath.endsWith('.ts') &&
        !filePath.startsWith('src/ai/test/') &&
        !filePath.startsWith('src/ai/worker/'),
    )
    .sort();
}

export function readRevisionFile(revision: string, filePath: string): string {
  return execFileSync('git', ['show', `${revision}:${filePath}`], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
}

export function fingerprintRevisionAiSource(revision: string): string {
  const files = listProductionAiFilesAtRevision(revision);
  return sha256(
    files
      .map((filePath) => `${filePath}\0${readRevisionFile(revision, filePath)}`)
      .join('\0'),
  );
}

export async function fingerprintCurrentAiSource(
  workspace = process.cwd(),
): Promise<string> {
  const files = execFileSync('git', ['ls-files', 'src/ai'], {
    cwd: workspace,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(
      (filePath) =>
        filePath.endsWith('.ts') &&
        !filePath.startsWith('src/ai/test/') &&
        !filePath.startsWith('src/ai/worker/'),
    )
    .sort();
  const contents = await Promise.all(
    files.map(async (filePath) => ({
      content: await readFile(path.join(workspace, filePath), 'utf8'),
      filePath,
    })),
  );

  return sha256(
    contents
      .map(({ content, filePath }) => `${filePath}\0${content}`)
      .join('\0'),
  );
}

export async function loadCurrentAiPolicy(
  workspace = process.cwd(),
): Promise<AiPolicy> {
  const productionSourceHash = await fingerprintCurrentAiSource(workspace);
  const adapterSource = await readFile(
    path.join(workspace, 'src/ai/test/policy.ts'),
    'utf8',
  );
  const sourceHash = sha256(
    JSON.stringify({
      adapterSourceHash: sha256(adapterSource),
      adapterVersion: CURRENT_AI_POLICY_ADAPTER_VERSION,
      productionSourceHash,
    }),
  );

  return createCurrentAiPolicy(sourceHash);
}
