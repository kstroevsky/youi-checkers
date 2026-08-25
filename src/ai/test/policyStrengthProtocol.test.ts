import { describe, expect, it } from 'vitest';

import type { PolicyMatchPair } from '@/ai/test/policyMatch';
import {
  collectPentanomialCounts,
  evaluateSequentialStrength,
  getBalancedBlock,
  meanPentanomialPointShare,
  type SequentialStrengthConfig,
} from '@/ai/test/policyStrengthProtocol';

function pair(
  score: number,
  fixtureId = 'fixture-a',
  index = 0,
): PolicyMatchPair {
  return {
    adjudicatedPairScore: score,
    fixtureId,
    games: [] as never,
    pairId: `${fixtureId}-${index}`,
    pairScore: null,
    policyAId: 'candidate',
    policyASeed: index,
    policyBId: 'baseline',
    policyBSeed: index + 1,
  };
}

function config(
  overrides: Partial<SequentialStrengthConfig> = {},
): SequentialStrengthConfig {
  return {
    allocation: { 'fixture-a': 1, 'fixture-b': 1 },
    alpha: 0.05,
    beta: 0.2,
    margin: 0.03,
    maxPairs: 2_000,
    minPairs: 20,
    question: 'nonInferiority',
    ...overrides,
  };
}

function balancedPairs(scores: number[]): PolicyMatchPair[] {
  return scores.flatMap((score, index) => [
    pair(score, 'fixture-a', index),
    pair(score, 'fixture-b', index),
  ]);
}

describe('pentanomial sequential strength protocol', () => {
  it('retains all five color-swapped pair outcomes', () => {
    const counts = collectPentanomialCounts(
      [0, 0.25, 0.5, 0.75, 1].map((score, index) =>
        pair(score, 'fixture-a', index),
      ),
    );

    expect(counts).toEqual([1, 1, 1, 1, 1]);
    expect(meanPentanomialPointShare(counts)).toBe(0.5);
  });

  it('checks stopping only after a complete frozen-allocation block', () => {
    expect(
      getBalancedBlock(
        { 'fixture-a': 4, 'fixture-b': 3 },
        { 'fixture-a': 1, 'fixture-b': 1 },
      ),
    ).toBeNull();
    expect(
      getBalancedBlock(
        { 'fixture-a': 4, 'fixture-b': 2 },
        { 'fixture-a': 2, 'fixture-b': 1 },
      ),
    ).toBe(2);
  });

  it('accepts non-inferiority for sustained centered-or-better pair scores', () => {
    const result = evaluateSequentialStrength(
      balancedPairs(
        Array.from({ length: 100 }, (_, index) =>
          index % 2 === 0 ? 0.5 : 0.75,
        ),
      ),
      config(),
    );

    expect(result.eligible).toBe(true);
    expect(result.llr).toBeGreaterThan(result.bounds.upper);
    expect(result.verdict).toBe('acceptNonInferiority');
  });

  it('rejects non-inferiority for a materially harmful policy', () => {
    const result = evaluateSequentialStrength(
      balancedPairs(
        Array.from({ length: 100 }, (_, index) =>
          index % 2 === 0 ? 0.25 : 0.5,
        ),
      ),
      config(),
    );

    expect(result.llr).toBeLessThan(result.bounds.lower);
    expect(result.verdict).toBe('rejectNonInferiority');
  });

  it('supports superiority and two-sided equivalence questions explicitly', () => {
    const superior = evaluateSequentialStrength(
      balancedPairs(Array.from({ length: 160 }, () => 0.75)),
      config({ question: 'superiority' }),
    );
    const equivalent = evaluateSequentialStrength(
      balancedPairs(Array.from({ length: 220 }, () => 0.5)),
      config({ margin: 0.05, question: 'equivalence' }),
    );

    expect(superior.verdict).toBe('acceptSuperiority');
    expect(equivalent.verdict).toBe('acceptEquivalence');
    expect(equivalent.secondaryLlr).not.toBeNull();
  });

  it('keeps simulated non-inferiority false accepts near the declared alpha', () => {
    let randomState = 0x9e3779b9;
    const random = () => {
      randomState = (randomState * 1_664_525 + 1_013_904_223) >>> 0;
      return randomState / 0x1_0000_0000;
    };
    let falseAccepts = 0;
    const campaignCount = 200;

    for (let campaign = 0; campaign < campaignCount; campaign += 1) {
      const pairs: PolicyMatchPair[] = [];
      for (let block = 0; block < 100; block += 1) {
        for (const fixtureId of ['fixture-a', 'fixture-b']) {
          const draw = random();
          // Mean = 0.20*0.25 + 0.72*0.50 + 0.08*0.75 = 0.47,
          // exactly the non-inferiority null boundary for margin 0.03.
          const score = draw < 0.2 ? 0.25 : draw < 0.92 ? 0.5 : 0.75;
          pairs.push(pair(score, fixtureId, block));
        }
        const result = evaluateSequentialStrength(
          pairs,
          config({ maxPairs: 200 }),
        );
        if (result.verdict === 'acceptNonInferiority') {
          falseAccepts += 1;
          break;
        }
        if (result.verdict === 'rejectNonInferiority') break;
      }
    }

    expect(falseAccepts / campaignCount).toBeLessThanOrEqual(0.075);
  });
});
