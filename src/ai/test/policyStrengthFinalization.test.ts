import { describe, expect, it } from 'vitest';

import type { PolicyMatchPair } from '@/ai/test/policyMatch';
import {
  POLICY_STRENGTH_CHECKPOINT_SCHEMA_VERSION,
  type PolicyStrengthCheckpoint,
} from '@/ai/test/policyStrengthCampaign';
import { collectCompletePolicyStrengthBlocks } from '@/ai/test/policyStrengthFinalization';

function checkpoint(
  campaignId: string,
  blockIndex: number,
  jobIndex: number,
): PolicyStrengthCheckpoint {
  const fixtureId = `fixture-${jobIndex}`;
  const pairId = `${fixtureId}/block-${blockIndex}/repeat-0`;
  return {
    campaignId,
    job: {
      blockIndex,
      fixtureId,
      fixtureIndex: jobIndex,
      jobIndex,
      pairId,
      repeatIndex: 0,
      seedBase: blockIndex * 100 + jobIndex,
    },
    pair: {
      adjudicatedPairScore: 0.5,
      fixtureId,
      games: [],
      pairId,
      pairScore: null,
      policyAId: 'current',
      policyASeed: 1,
      policyBId: 'legacy-v0',
      policyBSeed: 2,
    } as unknown as PolicyMatchPair,
    schemaVersion: POLICY_STRENGTH_CHECKPOINT_SCHEMA_VERSION,
  };
}

describe('collectCompletePolicyStrengthBlocks', () => {
  it('keeps consecutive complete blocks in canonical order and excludes a partial block', () => {
    const campaignId = 'campaign';
    const checkpoints = [
      checkpoint(campaignId, 1, 1),
      checkpoint(campaignId, 0, 0),
      checkpoint(campaignId, 2, 0),
      checkpoint(campaignId, 1, 0),
      checkpoint(campaignId, 0, 1),
    ];

    const snapshot = collectCompletePolicyStrengthBlocks(
      checkpoints,
      campaignId,
      2,
    );

    expect(snapshot.completeBlockCount).toBe(2);
    expect(snapshot.excludedCheckpointCount).toBe(1);
    expect(snapshot.firstIncompleteBlock).toBe(2);
    expect(snapshot.pairs.map(({ pairId }) => pairId)).toEqual([
      'fixture-0/block-0/repeat-0',
      'fixture-1/block-0/repeat-0',
      'fixture-0/block-1/repeat-0',
      'fixture-1/block-1/repeat-0',
    ]);
  });

  it('rejects a checkpoint from another campaign', () => {
    expect(() =>
      collectCompletePolicyStrengthBlocks(
        [checkpoint('other', 0, 0)],
        'campaign',
        1,
      ),
    ).toThrow('Invalid policy-strength checkpoint');
  });

  it('rejects a later block after an incomplete block', () => {
    const campaignId = 'campaign';
    expect(() =>
      collectCompletePolicyStrengthBlocks(
        [
          checkpoint(campaignId, 0, 0),
          checkpoint(campaignId, 0, 1),
          checkpoint(campaignId, 2, 0),
        ],
        campaignId,
        2,
      ),
    ).toThrow('after the first incomplete block');
  });
});
