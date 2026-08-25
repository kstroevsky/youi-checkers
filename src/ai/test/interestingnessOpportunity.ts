export type OpportunityClassV1 =
  | 'choiceOpportunity'
  | 'forced'
  | 'meaningfulChoiceOpportunity'
  | 'unknownOpportunity';

export function classifyOpportunityV1(
  safeSemanticClasses: string[] | null,
): OpportunityClassV1 {
  if (safeSemanticClasses === null) return 'unknownOpportunity';
  if (safeSemanticClasses.length < 2) return 'forced';
  return new Set(safeSemanticClasses).size >= 2
    ? 'meaningfulChoiceOpportunity'
    : 'choiceOpportunity';
}

export function hillOneDiversityV1(classes: string[]): number | null {
  if (!classes.length) return null;
  const counts = new Map<string, number>();
  for (const value of classes) counts.set(value, (counts.get(value) ?? 0) + 1);
  const entropy = [...counts.values()].reduce((sum, count) => {
    const probability = count / classes.length;
    return sum - probability * Math.log(probability);
  }, 0);
  return Math.exp(entropy);
}

export type ParticipationEligibilityV1 = {
  eligible: boolean;
  reasons: string[];
};

export function participationEligibilityV1(input: {
  hasAvoidingSafeAction: boolean;
  hasPreviousSamePlayerFamily: boolean;
  historyComplete: boolean;
  safeActionCount: number;
  usableReferenceSafety: boolean;
}): ParticipationEligibilityV1 {
  const reasons: string[] = [];
  if (!input.usableReferenceSafety) reasons.push('unusableReferenceSafety');
  if (!input.historyComplete) reasons.push('incompleteParticipationHistory');
  if (!input.hasPreviousSamePlayerFamily)
    reasons.push('noPreviousSamePlayerFamily');
  if (input.safeActionCount < 2) reasons.push('fewerThanTwoSafeActions');
  if (!input.hasAvoidingSafeAction) reasons.push('noSafeAvoidingAction');
  return { eligible: reasons.length === 0, reasons };
}

export type OpportunityCoverageRecordV1 = {
  arm: 'baseline' | 'candidate';
  eligible: boolean;
  fullyEnumeratedClassCount: number;
  lineageId: string;
  value: number | null;
};

export type OpportunityCoverageReportV1 = {
  baselineOnlyZeroOpportunityRate: number;
  candidateMinusBaselineDifferentialZeroOpportunityRate: number;
  candidateOnlyZeroOpportunityRate: number;
  changedPassStatus: boolean;
  pairedAdequate: boolean;
  pairedLineageCount: number;
  requiredPairedLineages: number;
  worstCaseCandidateMinusBaseline: { lower: number; upper: number };
  version: 1;
};

function rate(numerator: number, denominator: number): number {
  return denominator ? numerator / denominator : Number.NaN;
}

/** Missing is never coerced to zero; one-arm lineages receive adverse bounds. */
export function validateOpportunityCoverageV1(
  records: OpportunityCoverageRecordV1[],
): OpportunityCoverageReportV1 {
  const lineageIds = [...new Set(records.map((record) => record.lineageId))];
  const byLineage = new Map(
    lineageIds.map((lineageId) => [
      lineageId,
      {
        baseline: records.find(
          (record) =>
            record.lineageId === lineageId && record.arm === 'baseline',
        ),
        candidate: records.find(
          (record) =>
            record.lineageId === lineageId && record.arm === 'candidate',
        ),
      },
    ]),
  );
  const paired = [...byLineage.values()].filter(
    (pair) => pair.baseline?.eligible && pair.candidate?.eligible,
  );
  const baselineOnly = [...byLineage.values()].filter(
    (pair) => pair.baseline?.eligible && !pair.candidate?.eligible,
  );
  const candidateOnly = [...byLineage.values()].filter(
    (pair) => pair.candidate?.eligible && !pair.baseline?.eligible,
  );
  const requiredPairedLineages = Math.max(
    32,
    Math.ceil(0.8 * lineageIds.length),
  );
  const pairedDifferences = paired.map(
    (pair) => (pair.candidate?.value ?? 0) - (pair.baseline?.value ?? 0),
  );
  const pairedSum = pairedDifferences.reduce((sum, value) => sum + value, 0);
  const lower =
    (pairedSum -
      baselineOnly.reduce(
        (sum, pair) =>
          sum + Math.max(1, pair.baseline?.fullyEnumeratedClassCount ?? 1),
        0,
      )) /
    lineageIds.length;
  const upper =
    (pairedSum +
      candidateOnly.reduce(
        (sum, pair) =>
          sum + Math.max(1, pair.candidate?.fullyEnumeratedClassCount ?? 1),
        0,
      )) /
    lineageIds.length;
  const baselineOnlyZeroOpportunityRate = rate(
    baselineOnly.length,
    lineageIds.length,
  );
  const candidateOnlyZeroOpportunityRate = rate(
    candidateOnly.length,
    lineageIds.length,
  );
  return {
    baselineOnlyZeroOpportunityRate,
    candidateMinusBaselineDifferentialZeroOpportunityRate:
      candidateOnlyZeroOpportunityRate - baselineOnlyZeroOpportunityRate,
    candidateOnlyZeroOpportunityRate,
    changedPassStatus: baselineOnly.length > 0 || candidateOnly.length > 0,
    pairedAdequate: paired.length >= requiredPairedLineages,
    pairedLineageCount: paired.length,
    requiredPairedLineages,
    worstCaseCandidateMinusBaseline: { lower, upper },
    version: 1,
  };
}
