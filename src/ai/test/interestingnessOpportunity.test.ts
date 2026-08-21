import { describe, expect, it } from 'vitest';

import {
  classifyOpportunityV1,
  hillOneDiversityV1,
  participationEligibilityV1,
  validateOpportunityCoverageV1,
} from '@/ai/test/interestingnessOpportunity';

describe('interestingness opportunity coverage', () => {
  it('distinguishes forced, choice, meaningful, and unknown opportunities', () => {
    expect(classifyOpportunityV1(null)).toBe('unknownOpportunity');
    expect(classifyOpportunityV1(['a'])).toBe('forced');
    expect(classifyOpportunityV1(['a', 'a'])).toBe('choiceOpportunity');
    expect(classifyOpportunityV1(['a', 'b'])).toBe(
      'meaningfulChoiceOpportunity',
    );
    expect(hillOneDiversityV1(['a', 'b'])).toBeCloseTo(2);
  });

  it('requires every participation eligibility condition', () => {
    expect(
      participationEligibilityV1({
        hasAvoidingSafeAction: true,
        hasPreviousSamePlayerFamily: true,
        historyComplete: true,
        safeActionCount: 2,
        usableReferenceSafety: true,
      }).eligible,
    ).toBe(true);
  });

  it('keeps one-arm missingness visible and marks inadequate pairing', () => {
    const report = validateOpportunityCoverageV1([
      {
        arm: 'baseline',
        eligible: true,
        fullyEnumeratedClassCount: 2,
        lineageId: 'a',
        value: 1,
      },
      {
        arm: 'candidate',
        eligible: false,
        fullyEnumeratedClassCount: 0,
        lineageId: 'a',
        value: null,
      },
    ]);
    expect(report.changedPassStatus).toBe(true);
    expect(report.pairedAdequate).toBe(false);
    expect(report.baselineOnlyZeroOpportunityRate).toBe(1);
  });
});
