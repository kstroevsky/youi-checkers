import { describe, expect, it } from 'vitest';

import {
  namedInteger,
  namedRngFingerprint,
  namedShuffle,
  namedUniform,
  type NamedRngKeyV1,
} from '@/ai/test/namedRng.node';

const key: NamedRngKeyV1 = {
  lineageId: 'lineage-001',
  purpose: 'fixtureGeneration',
  replicate: 0,
  runSeed: 'run-seed',
};

describe('NamedRngV1', () => {
  it('is deterministic, counter-based, and purpose-separated', () => {
    expect(namedUniform(key, 0)).toBe(namedUniform(key, 0));
    expect(namedUniform(key, 0)).not.toBe(namedUniform(key, 1));
    expect(namedUniform(key, 0)).not.toBe(
      namedUniform({ ...key, purpose: 'semanticRollout' }, 0),
    );
  });

  it('does not depend on unrelated draw order', () => {
    const second = namedUniform(key, 2);
    namedUniform(key, 0);
    namedUniform(key, 1);
    expect(namedUniform(key, 2)).toBe(second);
  });

  it('creates bounded integers and deterministic shuffles', () => {
    expect(namedInteger(key, 3)).toBeGreaterThanOrEqual(0);
    expect(namedInteger(key, 3)).toBeLessThan(3);
    expect(namedShuffle([1, 2, 3, 4], key)).toEqual(
      namedShuffle([1, 2, 3, 4], key),
    );
    expect(namedRngFingerprint()).toMatch(/^[a-f0-9]{64}$/u);
  });
});
