import type { PolicyMatchPair } from '@/ai/test/policyMatch';
import type { StrengthFixture } from '@/ai/test/referenceStrength';
import type { RuleConfig } from '@/domain';
import type { AiDifficulty } from '@/shared/types/session';

export const POLICY_STRENGTH_CHECKPOINT_SCHEMA_VERSION = 1 as const;

export type PolicyStrengthJob = {
  blockIndex: number;
  fixtureId: string;
  fixtureIndex: number;
  jobIndex: number;
  pairId: string;
  repeatIndex: number;
  seedBase: number;
};

export type PolicyStrengthCheckpoint = {
  campaignId: string;
  job: PolicyStrengthJob;
  pair: PolicyMatchPair;
  schemaVersion: typeof POLICY_STRENGTH_CHECKPOINT_SCHEMA_VERSION;
};

export type PolicyStrengthWorkerJob = {
  fixture: StrengthFixture;
  job: PolicyStrengthJob;
  ruleConfig: RuleConfig;
  settings: {
    difficulty: AiDifficulty;
    maxPlies: number;
    nodeBudget: number;
  };
};

export type PolicyStrengthWorkerRequest =
  | { job: PolicyStrengthWorkerJob; type: 'run' }
  | { type: 'shutdown' };

export type PolicyStrengthWorkerResponse =
  | {
      currentPolicyHash: string;
      legacyPolicyHash: string;
      type: 'ready';
    }
  | { jobIndex: number; pair: PolicyMatchPair; type: 'result' }
  | { error: string; jobIndex: number | null; type: 'error' };

export function enumeratePolicyStrengthBlockJobs(
  fixtures: Pick<StrengthFixture, 'id'>[],
  allocation: Record<string, number>,
  blockIndex: number,
): PolicyStrengthJob[] {
  if (!Number.isSafeInteger(blockIndex) || blockIndex < 0) {
    throw new RangeError('blockIndex must be a non-negative safe integer.');
  }

  const jobs: PolicyStrengthJob[] = [];

  fixtures.forEach((fixture, fixtureIndex) => {
    const weight = allocation[fixture.id];
    if (!Number.isSafeInteger(weight) || weight <= 0) {
      throw new RangeError(
        `Allocation for ${fixture.id} must be a positive safe integer.`,
      );
    }

    for (let repeatIndex = 0; repeatIndex < weight; repeatIndex += 1) {
      jobs.push({
        blockIndex,
        fixtureId: fixture.id,
        fixtureIndex,
        jobIndex: jobs.length,
        pairId: `${fixture.id}/block-${blockIndex}/repeat-${repeatIndex}`,
        repeatIndex,
        seedBase:
          (blockIndex + 1) * 1_000_003 +
          fixtureIndex * 10_007 +
          repeatIndex * 101,
      });
    }
  });

  return jobs;
}

export function parsePolicyStrengthCheckpoint(
  payload: string,
  expectedCampaignId: string,
  expectedJob: PolicyStrengthJob,
): PolicyStrengthCheckpoint {
  let checkpoint: PolicyStrengthCheckpoint;
  try {
    checkpoint = JSON.parse(payload) as PolicyStrengthCheckpoint;
  } catch (error) {
    throw new Error(`Invalid checkpoint JSON for ${expectedJob.pairId}.`, {
      cause: error,
    });
  }

  if (
    checkpoint.schemaVersion !== POLICY_STRENGTH_CHECKPOINT_SCHEMA_VERSION ||
    checkpoint.campaignId !== expectedCampaignId ||
    checkpoint.job.pairId !== expectedJob.pairId ||
    checkpoint.job.blockIndex !== expectedJob.blockIndex ||
    checkpoint.job.fixtureId !== expectedJob.fixtureId ||
    checkpoint.job.fixtureIndex !== expectedJob.fixtureIndex ||
    checkpoint.job.repeatIndex !== expectedJob.repeatIndex ||
    checkpoint.job.seedBase !== expectedJob.seedBase ||
    checkpoint.pair.pairId !== expectedJob.pairId ||
    checkpoint.pair.fixtureId !== expectedJob.fixtureId
  ) {
    throw new Error(`Checkpoint identity mismatch for ${expectedJob.pairId}.`);
  }

  return checkpoint;
}

export function mergePolicyStrengthBlockPairs(
  jobs: PolicyStrengthJob[],
  pairs: PolicyMatchPair[],
): PolicyMatchPair[] {
  const expectedIds = new Set(jobs.map(({ pairId }) => pairId));
  const byId = new Map<string, PolicyMatchPair>();

  for (const pair of pairs) {
    if (!expectedIds.has(pair.pairId)) {
      throw new Error(`Unexpected policy-strength pair ${pair.pairId}.`);
    }
    if (byId.has(pair.pairId)) {
      throw new Error(`Duplicate policy-strength pair ${pair.pairId}.`);
    }
    byId.set(pair.pairId, pair);
  }

  const missing = jobs.find(({ pairId }) => !byId.has(pairId));
  if (missing) {
    throw new Error(`Missing policy-strength pair ${missing.pairId}.`);
  }

  return jobs.map(({ pairId }) => byId.get(pairId) as PolicyMatchPair);
}

export function selectPolicyStrengthWorkerCount({
  availableParallelism,
  jobCount,
  requestedWorkers,
}: {
  availableParallelism: number;
  jobCount: number;
  requestedWorkers?: number;
}): number {
  if (
    !Number.isSafeInteger(availableParallelism) ||
    availableParallelism <= 0
  ) {
    throw new RangeError(
      'availableParallelism must be a positive safe integer.',
    );
  }
  if (!Number.isSafeInteger(jobCount) || jobCount <= 0) {
    throw new RangeError('jobCount must be a positive safe integer.');
  }
  if (
    requestedWorkers !== undefined &&
    (!Number.isSafeInteger(requestedWorkers) || requestedWorkers <= 0)
  ) {
    throw new RangeError('requestedWorkers must be a positive safe integer.');
  }

  const automaticWorkers = Math.max(1, Math.min(8, availableParallelism - 2));
  return Math.min(
    jobCount,
    availableParallelism,
    requestedWorkers ?? automaticWorkers,
  );
}
