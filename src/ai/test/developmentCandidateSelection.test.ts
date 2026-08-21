import { describe, expect, it } from 'vitest';
import {
  evaluateDevelopmentCandidateV1,
  holmAdjustOneSidedV1,
  selectDevelopmentCandidateV1,
} from '@/ai/test/developmentCandidateSelection';

describe('development candidate selection', () => {
  it('applies monotone Holm adjustment', () => {
    expect(holmAdjustOneSidedV1([0.01, 0.04, 0.03, 0.2])).toEqual([
      0.04, 0.09, 0.09, 0.2,
    ]);
  });
  it('retains baseline when no candidate has adjusted material benefit', () => {
    const candidate = {
      configurationId: 'config',
      correctnessPassed: true,
      evidenceHashes: ['a'],
      opportunityPassed: true,
      paretoDominated: false,
      performancePassed: true,
      strengthPassed: true,
      treatmentId: 'S0',
      endpoints: [
        {
          adjustedOneSidedP: 0.2,
          effect: 0.03,
          lower95: -0.01,
          materialUnit: 0.03,
          primary: 'avoidableFamilyRepeat' as const,
        },
      ],
    };
    expect(evaluateDevelopmentCandidateV1(candidate).eligible).toBe(false);
    expect(selectDevelopmentCandidateV1([candidate]).baselineRetained).toBe(
      true,
    );
  });
});
