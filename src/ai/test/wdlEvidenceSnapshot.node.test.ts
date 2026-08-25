import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildWdlProofQuerySetV1,
  createWdlEvidenceSnapshotV1,
  freezeWdlEvidenceSnapshotV1,
} from '@/ai/test/wdlEvidenceSnapshot.node';
import { createHomeFieldWinState } from '@/ai/test/tacticalFixtures';
import { withConfig } from '@/test/factories';

describe('WdlEvidenceSnapshotV1', () => {
  it('includes each catalog root and every legal root-action successor', () => {
    const config = withConfig();
    const querySet = buildWdlProofQuerySetV1({
      catalogHash: 'a'.repeat(64),
      config,
      roots: [{ lineageId: 'lineage-1', state: createHomeFieldWinState() }],
    });
    expect(
      querySet.queries.filter((query) => query.kind === 'catalogRoot'),
    ).toHaveLength(1);
    expect(
      querySet.queries.filter((query) => query.kind === 'rootActionSuccessor')
        .length,
    ).toBeGreaterThan(0);
    expect(querySet.querySetHash).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('freezes a verified development snapshot once', async () => {
    const config = withConfig();
    const querySet = buildWdlProofQuerySetV1({
      catalogHash: 'b'.repeat(64),
      config,
      roots: [
        {
          lineageId: 'terminal',
          state: {
            ...createHomeFieldWinState(),
            status: 'gameOver',
            victory: { type: 'homeField', winner: 'white' },
          },
        },
      ],
    });
    const snapshot = createWdlEvidenceSnapshotV1({
      config,
      querySet,
      scope: 'development',
    });
    const directory = await mkdtemp(join(tmpdir(), 'youi-wdl-'));
    const outputPath = join(directory, 'development.json');
    await freezeWdlEvidenceSnapshotV1(outputPath, snapshot);
    expect(JSON.parse(await readFile(outputPath, 'utf8')).artifactHash).toBe(
      snapshot.artifactHash,
    );
    await expect(
      freezeWdlEvidenceSnapshotV1(outputPath, snapshot),
    ).rejects.toThrow();
  });
});
