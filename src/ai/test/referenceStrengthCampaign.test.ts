import { describe, expect, it } from 'vitest';

import {
  enumerateReferenceStrengthJobs,
  mergeReferenceStrengthPairs,
  parseReferenceStrengthPairsJsonl,
  selectReferenceStrengthShard,
} from '@/ai/test/referenceStrengthCampaign';
import type {
  ReferenceStrengthPair,
  StrengthFixture,
} from '@/ai/test/referenceStrength';

function fakeFixture(id: string): StrengthFixture {
  return { bucket: 'test', id, split: 'development', state: {} as never };
}

function fakePair(pairId: string): ReferenceStrengthPair {
  return { kind: 'strengthPair', pairId } as ReferenceStrengthPair;
}

describe('reference strength campaigns', () => {
  it('partitions every stable job exactly once across shards', () => {
    const jobs = enumerateReferenceStrengthJobs(
      [fakeFixture('a'), fakeFixture('b')],
      ['canonical-legal-v1', 'seeded-legal-v1'],
      3,
    );
    const shards = [0, 1, 2].flatMap((index) =>
      selectReferenceStrengthShard(jobs, index, 3),
    );

    expect(jobs).toHaveLength(12);
    expect(shards.map(({ pairId }) => pairId).sort()).toEqual(
      jobs.map(({ pairId }) => pairId).sort(),
    );
    expect(new Set(shards.map(({ pairId }) => pairId)).size).toBe(12);
  });

  it('merges shards in canonical campaign order', () => {
    const expected = ['a', 'b', 'c'];
    expect(
      mergeReferenceStrengthPairs(
        [[fakePair('c')], [fakePair('a'), fakePair('b')]],
        expected,
      ).map(({ pairId }) => pairId),
    ).toEqual(expected);
  });

  it('rejects corrupt, duplicate, unexpected, and incomplete artifacts', () => {
    expect(() => parseReferenceStrengthPairsJsonl('{bad')).toThrow(
      'Invalid strength JSONL',
    );
    expect(() =>
      parseReferenceStrengthPairsJsonl(
        `${JSON.stringify(fakePair('a'))}\n${JSON.stringify(fakePair('a'))}\n`,
      ),
    ).toThrow('Duplicate strength pair a');
    expect(() => mergeReferenceStrengthPairs([[fakePair('x')]], ['a'])).toThrow(
      'Unexpected strength pair x',
    );
    expect(() =>
      mergeReferenceStrengthPairs([[fakePair('a')]], ['a', 'b']),
    ).toThrow('Missing 1 strength pairs');
  });
});
