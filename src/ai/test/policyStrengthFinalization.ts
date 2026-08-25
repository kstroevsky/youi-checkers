import type { PolicyMatchPair } from '@/ai/test/policyMatch';
import {
  POLICY_STRENGTH_CHECKPOINT_SCHEMA_VERSION,
  type PolicyStrengthCheckpoint,
} from '@/ai/test/policyStrengthCampaign';

export type PolicyStrengthCheckpointSnapshot = {
  completeBlockCount: number;
  excludedCheckpointCount: number;
  firstIncompleteBlock: number | null;
  pairs: PolicyMatchPair[];
};

function assertCheckpointIdentity(
  checkpoint: PolicyStrengthCheckpoint,
  campaignId: string,
): void {
  const { job, pair } = checkpoint;
  if (
    checkpoint.schemaVersion !== POLICY_STRENGTH_CHECKPOINT_SCHEMA_VERSION ||
    checkpoint.campaignId !== campaignId ||
    !Number.isSafeInteger(job.blockIndex) ||
    job.blockIndex < 0 ||
    !Number.isSafeInteger(job.jobIndex) ||
    job.jobIndex < 0 ||
    pair.pairId !== job.pairId ||
    pair.fixtureId !== job.fixtureId
  ) {
    throw new Error(`Invalid policy-strength checkpoint ${job.pairId}.`);
  }
}

/**
 * Selects only consecutive, complete balanced blocks from an interrupted
 * campaign. Later or partial checkpoints are retained on disk but excluded
 * from the statistical snapshot.
 */
export function collectCompletePolicyStrengthBlocks(
  checkpoints: PolicyStrengthCheckpoint[],
  campaignId: string,
  blockPairCount: number,
): PolicyStrengthCheckpointSnapshot {
  if (!Number.isSafeInteger(blockPairCount) || blockPairCount <= 0) {
    throw new RangeError('blockPairCount must be a positive safe integer.');
  }

  const byBlock = new Map<number, PolicyStrengthCheckpoint[]>();
  const pairIds = new Set<string>();
  for (const checkpoint of checkpoints) {
    assertCheckpointIdentity(checkpoint, campaignId);
    if (pairIds.has(checkpoint.job.pairId)) {
      throw new Error(
        `Duplicate policy-strength checkpoint ${checkpoint.job.pairId}.`,
      );
    }
    pairIds.add(checkpoint.job.pairId);
    const block = byBlock.get(checkpoint.job.blockIndex) ?? [];
    block.push(checkpoint);
    byBlock.set(checkpoint.job.blockIndex, block);
  }

  const pairs: PolicyMatchPair[] = [];
  let completeBlockCount = 0;
  let firstIncompleteBlock: number | null = null;

  while (byBlock.has(completeBlockCount)) {
    const block = byBlock.get(completeBlockCount) as PolicyStrengthCheckpoint[];
    if (block.length !== blockPairCount) {
      firstIncompleteBlock = completeBlockCount;
      break;
    }

    block.sort((left, right) => left.job.jobIndex - right.job.jobIndex);
    for (let jobIndex = 0; jobIndex < blockPairCount; jobIndex += 1) {
      if (block[jobIndex]?.job.jobIndex !== jobIndex) {
        throw new Error(
          `Balanced block ${completeBlockCount + 1} has invalid job indexes.`,
        );
      }
      pairs.push(block[jobIndex].pair);
    }
    completeBlockCount += 1;
  }

  const laterBlock = [...byBlock.keys()].find(
    (blockIndex) => blockIndex > completeBlockCount,
  );
  if (laterBlock !== undefined) {
    throw new Error(
      `Checkpoint block ${laterBlock + 1} exists after the first incomplete block.`,
    );
  }

  return {
    completeBlockCount,
    excludedCheckpointCount: checkpoints.length - pairs.length,
    firstIncompleteBlock:
      firstIncompleteBlock ??
      (byBlock.size === completeBlockCount ? null : completeBlockCount),
    pairs,
  };
}
