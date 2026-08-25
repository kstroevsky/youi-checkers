import type { FrozenReferenceId } from '@/ai/test/frozenReferencePool';
import type {
  ReferenceStrengthPair,
  StrengthFixture,
} from '@/ai/test/referenceStrength';

export type ReferenceStrengthJob = {
  fixtureId: string;
  fixtureIndex: number;
  jobIndex: number;
  pairId: string;
  pairIndex: number;
  referenceId: FrozenReferenceId;
  referenceIndex: number;
};

export function enumerateReferenceStrengthJobs(
  fixtures: StrengthFixture[],
  referenceIds: FrozenReferenceId[],
  pairCount: number,
): ReferenceStrengthJob[] {
  const jobs: ReferenceStrengthJob[] = [];

  fixtures.forEach((fixture, fixtureIndex) => {
    referenceIds.forEach((referenceId, referenceIndex) => {
      for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
        jobs.push({
          fixtureId: fixture.id,
          fixtureIndex,
          jobIndex: jobs.length,
          pairId: `${fixture.id}/${referenceId}/seed-${pairIndex}`,
          pairIndex,
          referenceId,
          referenceIndex,
        });
      }
    });
  });

  return jobs;
}

export function selectReferenceStrengthShard(
  jobs: ReferenceStrengthJob[],
  shardIndex: number,
  shardCount: number,
): ReferenceStrengthJob[] {
  if (!Number.isSafeInteger(shardCount) || shardCount <= 0) {
    throw new RangeError('shardCount must be a positive safe integer.');
  }
  if (
    !Number.isSafeInteger(shardIndex) ||
    shardIndex < 0 ||
    shardIndex >= shardCount
  ) {
    throw new RangeError('shardIndex must be between zero and shardCount - 1.');
  }

  return jobs.filter(({ jobIndex }) => jobIndex % shardCount === shardIndex);
}

export function parseReferenceStrengthPairsJsonl(
  payload: string,
): ReferenceStrengthPair[] {
  const pairs: ReferenceStrengthPair[] = [];
  const seen = new Set<string>();

  for (const [lineIndex, line] of payload.split('\n').entries()) {
    if (!line.trim()) continue;
    let pair: ReferenceStrengthPair;
    try {
      pair = JSON.parse(line) as ReferenceStrengthPair;
    } catch (error) {
      throw new Error(`Invalid strength JSONL at line ${lineIndex + 1}.`, {
        cause: error,
      });
    }
    if (pair.kind !== 'strengthPair' || !pair.pairId) {
      throw new Error(`Invalid strength pair at line ${lineIndex + 1}.`);
    }
    if (seen.has(pair.pairId)) {
      throw new Error(`Duplicate strength pair ${pair.pairId}.`);
    }
    seen.add(pair.pairId);
    pairs.push(pair);
  }

  return pairs;
}

export function mergeReferenceStrengthPairs(
  pairSets: ReferenceStrengthPair[][],
  expectedPairIds: string[],
): ReferenceStrengthPair[] {
  const expected = new Set(expectedPairIds);
  const byId = new Map<string, ReferenceStrengthPair>();

  for (const pair of pairSets.flat()) {
    if (!expected.has(pair.pairId)) {
      throw new Error(`Unexpected strength pair ${pair.pairId}.`);
    }
    if (byId.has(pair.pairId)) {
      throw new Error(`Duplicate strength pair ${pair.pairId}.`);
    }
    byId.set(pair.pairId, pair);
  }

  const missing = expectedPairIds.filter((pairId) => !byId.has(pairId));
  if (missing.length) {
    throw new Error(
      `Missing ${missing.length} strength pairs; first missing ${missing[0]}.`,
    );
  }

  return expectedPairIds.map(
    (pairId) => byId.get(pairId) as ReferenceStrengthPair,
  );
}
