import { describe, expect, it } from 'vitest';

import { summarizeParticipationDiagnosticsV1 } from '@/ai/test/participationDiagnosticsV1';

describe('ParticipationDiagnosticsV1', () => {
  it('separates safe exposure diversity from selected contribution diversity', () => {
    const result = summarizeParticipationDiagnosticsV1([
      {
        contributionAt4: 1,
        contributionAt8: 0.5,
        eligible: true,
        movedMass: 2,
        previousSamePlayerFamily: 'left',
        previousSamePlayerRegion: 'home',
        retainedTurn: false,
        safeFamilies: ['left', 'right'],
        safeRegions: ['home', 'front'],
        selectedFamily: 'left',
        selectedRegion: 'home',
      },
      {
        contributionAt4: 1,
        contributionAt8: 1,
        eligible: true,
        movedMass: 1,
        previousSamePlayerFamily: 'left',
        previousSamePlayerRegion: 'home',
        retainedTurn: true,
        safeFamilies: ['left', 'right'],
        safeRegions: ['home', 'front'],
        selectedFamily: 'left',
        selectedRegion: 'front',
      },
    ]);
    expect(result.familyExposureD1).toBeCloseTo(2);
    expect(result.familyContributionD1).toBeCloseTo(1);
    expect(result.avoidableFamilyRepetitionRate).toBe(1);
    expect(result.avoidableRegionRepetitionRate).toBe(0.5);
  });
});
