import { describe, expect, it } from 'vitest';

import {
  createFixtureScheduleV2,
  generateFixtureCatalogV2,
} from '@/ai/test/fixtureGeneratorV2.node';

function counts(values: string[]): number[] {
  return [...new Map(values.map((value) => [value, 0])).keys()]
    .map((value) => values.filter((entry) => entry === value).length)
    .sort((left, right) => left - right);
}

describe('FixtureGeneratorV2', () => {
  it('creates treatment-independent schedules with balanced marginal quotas', () => {
    const schedule = createFixtureScheduleV2({
      originSchedule: { mode: 'noPreexistingPilot', pilotCorpusHash: null },
      runSeed: 'development-seed',
      sealed: false,
    });

    expect(schedule).toHaveLength(96);
    expect(counts(schedule.map((slot) => slot.strata.phase))).toEqual([
      24, 24, 24, 24,
    ]);
    expect(counts(schedule.map((slot) => slot.strata.advantage))).toEqual([
      32, 32, 32,
    ]);
    expect(counts(schedule.map((slot) => slot.strata.origin))).toEqual([
      19, 19, 19, 19, 20,
    ]);
    expect(
      schedule.some((slot) => slot.strata.origin === 'consentedPilot'),
    ).toBe(false);
  });

  it('uses sixteen slots per origin only with a pre-existing pilot hash', () => {
    const schedule = createFixtureScheduleV2({
      originSchedule: {
        mode: 'preexistingPilotAvailable',
        pilotCorpusHash: 'a'.repeat(64),
      },
      runSeed: 'development-seed',
      sealed: false,
    });

    expect(counts(schedule.map((slot) => slot.strata.origin))).toEqual([
      16, 16, 16, 16, 16, 16,
    ]);
  });

  it('repairs declared impossible intersections without changing marginals', () => {
    const schedule = createFixtureScheduleV2({
      impossible: [
        {
          reason: 'opening jump chains are not constructible',
          strata: { phase: 'opening', tactics: 'jumpChain' },
        },
      ],
      originSchedule: { mode: 'noPreexistingPilot', pilotCorpusHash: null },
      runSeed: 'repair-seed',
      sealed: false,
    });

    expect(
      schedule.some(
        (slot) =>
          slot.strata.phase === 'opening' &&
          slot.strata.tactics === 'jumpChain',
      ),
    ).toBe(false);
    expect(counts(schedule.map((slot) => slot.strata.phase))).toEqual([
      24, 24, 24, 24,
    ]);
  });

  it('reports catalog inadequacy instead of inventing missing sources', () => {
    const result = generateFixtureCatalogV2({
      candidates: [],
      originSchedule: { mode: 'noPreexistingPilot', pilotCorpusHash: null },
      runSeed: 'development-seed',
      sealed: false,
    });

    expect(result.status).toBe('inadequate');
    expect(result.catalog).toBeNull();
    expect(result.deficits).toHaveLength(96);
  });
});
