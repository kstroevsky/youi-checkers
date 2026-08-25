import { describe, expect, it } from 'vitest';

import type { AiPolicy } from '@/ai/test/policy';
import { measurePolicyMirrorEquivariance } from '@/ai/test/policyAttribution';
import type { StrengthFixture } from '@/ai/test/referenceStrength';
import {
  boardWithPieces,
  checker,
  gameStateWithBoard,
  withConfig,
} from '@/test/factories';

function policy(equivariant: boolean): AiPolicy {
  return {
    id: equivariant ? 'equivariant' : 'fixed',
    sourceHash: equivariant ? 'equivariant-hash' : 'fixed-hash',
    async createSession() {
      return {
        async decide({ state }) {
          const source =
            equivariant && state.board.A1.checkers.length === 0 ? 'F1' : 'A1';
          const target = source === 'A1' ? 'A2' : 'F2';
          return {
            action: { source, target, type: 'moveSingleToEmpty' },
          };
        },
        async dispose() {},
      };
    },
    async dispose() {},
  };
}

function fixture(): StrengthFixture {
  return {
    bucket: 'test',
    id: 'mirror-test',
    mirror: 'original',
    origin: 'initial',
    split: 'development',
    state: gameStateWithBoard(boardWithPieces({ A1: [checker('white')] })),
  };
}

describe('measurePolicyMirrorEquivariance', () => {
  it('uses identical seeds and compares the mirrored action', async () => {
    const summary = await measurePolicyMirrorEquivariance({
      difficulty: 'hard',
      fixtures: [fixture()],
      nodeBudget: 32,
      policy: policy(true),
      ruleConfig: withConfig(),
      seeds: [11, 29],
    });

    expect(summary).toMatchObject({
      equivalentCount: 2,
      equivalentShare: 1,
      sampleCount: 2,
    });
    expect(summary.samples.map((sample) => sample.seed)).toEqual([11, 29]);
  });

  it('reports orientation-sensitive decisions', async () => {
    const summary = await measurePolicyMirrorEquivariance({
      difficulty: 'hard',
      fixtures: [fixture()],
      nodeBudget: 32,
      policy: policy(false),
      ruleConfig: withConfig(),
      seeds: [7],
    });

    expect(summary.equivalentShare).toBe(0);
    expect(summary.samples[0]).toMatchObject({
      mirroredActionKey: 'moveSingleToEmpty:A1:A2',
      mirroredExpectedActionKey: 'moveSingleToEmpty:F1:F2',
    });
  });
});
