import { describe, expect, it } from 'vitest';

import type { PolicyMatchPair } from '@/ai/test/policyMatch';
import {
  enumeratePolicyStrengthBlockJobs,
  mergePolicyStrengthBlockPairs,
  parsePolicyStrengthCheckpoint,
  POLICY_STRENGTH_CHECKPOINT_SCHEMA_VERSION,
  selectPolicyStrengthWorkerCount,
} from '@/ai/test/policyStrengthCampaign';

function fakePair(pairId: string, fixtureId: string): PolicyMatchPair {
  return {
    adjudicatedPairScore: 0.5,
    fixtureId,
    games: [] as never,
    pairId,
    pairScore: null,
    policyAId: 'current',
    policyASeed: 1,
    policyBId: 'legacy-v0',
    policyBSeed: 2,
  };
}

describe('policy strength campaign execution', () => {
  it('enumerates each balanced block in stable fixture and repeat order', () => {
    const jobs = enumeratePolicyStrengthBlockJobs(
      [{ id: 'a' }, { id: 'b' }],
      { a: 2, b: 1 },
      3,
    );

    expect(jobs.map(({ pairId }) => pairId)).toEqual([
      'a/block-3/repeat-0',
      'a/block-3/repeat-1',
      'b/block-3/repeat-0',
    ]);
    expect(jobs.map(({ seedBase }) => seedBase)).toEqual([
      4_000_012, 4_000_113, 4_010_019,
    ]);
  });

  it('restores only checkpoints from the exact campaign and job', () => {
    const [job] = enumeratePolicyStrengthBlockJobs(
      [{ id: 'fixture' }],
      { fixture: 1 },
      0,
    );
    const checkpoint = {
      campaignId: 'campaign',
      job,
      pair: fakePair(job.pairId, job.fixtureId),
      schemaVersion: POLICY_STRENGTH_CHECKPOINT_SCHEMA_VERSION,
    };

    expect(
      parsePolicyStrengthCheckpoint(JSON.stringify(checkpoint), 'campaign', job)
        .pair,
    ).toEqual(checkpoint.pair);
    expect(() =>
      parsePolicyStrengthCheckpoint(JSON.stringify(checkpoint), 'other', job),
    ).toThrow('Checkpoint identity mismatch');
  });

  it('merges out-of-order worker results into canonical campaign order', () => {
    const jobs = enumeratePolicyStrengthBlockJobs(
      [{ id: 'a' }, { id: 'b' }],
      { a: 1, b: 1 },
      0,
    );
    const reversed = jobs
      .map((job) => fakePair(job.pairId, job.fixtureId))
      .reverse();

    expect(
      mergePolicyStrengthBlockPairs(jobs, reversed).map(({ pairId }) => pairId),
    ).toEqual(jobs.map(({ pairId }) => pairId));
    expect(() => mergePolicyStrengthBlockPairs(jobs, [reversed[0]])).toThrow(
      'Missing policy-strength pair',
    );
  });

  it('uses bounded headroom-aware automatic concurrency', () => {
    expect(
      selectPolicyStrengthWorkerCount({
        availableParallelism: 10,
        jobCount: 12,
      }),
    ).toBe(8);
    expect(
      selectPolicyStrengthWorkerCount({
        availableParallelism: 2,
        jobCount: 12,
      }),
    ).toBe(1);
    expect(
      selectPolicyStrengthWorkerCount({
        availableParallelism: 10,
        jobCount: 3,
        requestedWorkers: 9,
      }),
    ).toBe(3);
  });
});
