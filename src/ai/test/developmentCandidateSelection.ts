export type PrimaryEndpointIdV1 =
  | 'avoidableFamilyRepeat'
  | 'counterplayD1'
  | 'meaningfulFutureD1'
  | 'rewardForThinking';
export type CandidateEndpointEvidenceV1 = {
  adjustedOneSidedP: number;
  effect: number;
  lower95: number;
  materialUnit: number;
  primary: PrimaryEndpointIdV1;
};
export type DevelopmentCandidateEvidenceV1 = {
  configurationId: string;
  correctnessPassed: boolean;
  evidenceHashes: string[];
  opportunityPassed: boolean;
  paretoDominated: boolean;
  performancePassed: boolean;
  endpoints: CandidateEndpointEvidenceV1[];
  strengthPassed: boolean;
  treatmentId: string;
};

export function holmAdjustOneSidedV1(pValues: number[]): number[] {
  const ordered = pValues
    .map((value, index) => ({ index, value }))
    .sort((a, b) => a.value - b.value);
  const adjusted = Array<number>(pValues.length).fill(1);
  let previous = 0;
  ordered.forEach((entry, rank) => {
    const value = Math.max(
      previous,
      Math.min(1, entry.value * (pValues.length - rank)),
    );
    adjusted[entry.index] = value;
    previous = value;
  });
  return adjusted;
}

export function evaluateDevelopmentCandidateV1(
  evidence: DevelopmentCandidateEvidenceV1,
) {
  const normalized = evidence.endpoints.map((endpoint) => ({
    ...endpoint,
    lowerZ: endpoint.lower95 / endpoint.materialUnit,
    z: endpoint.effect / endpoint.materialUnit,
  }));
  const allNonInferior = normalized.every((endpoint) => endpoint.lowerZ > -1);
  const materialBenefit = normalized.some(
    (endpoint) => endpoint.z >= 1 && endpoint.adjustedOneSidedP <= 0.05,
  );
  const gates =
    evidence.correctnessPassed &&
    evidence.strengthPassed &&
    evidence.performancePassed &&
    evidence.opportunityPassed &&
    allNonInferior &&
    materialBenefit &&
    !evidence.paretoDominated;
  return { allNonInferior, eligible: gates, materialBenefit, normalized };
}

export type DevelopmentCandidateSelectionV1 = {
  baselineRetained: boolean;
  evidenceHashes: string[];
  selectedConfigurationId: string | null;
  selectedTreatmentId: string | null;
  version: 1;
};

/** Frozen tie order ends lexically after structural simplicity/cost fields upstream. */
export function selectDevelopmentCandidateV1(
  candidates: DevelopmentCandidateEvidenceV1[],
): DevelopmentCandidateSelectionV1 {
  const eligible = candidates
    .filter((candidate) => evaluateDevelopmentCandidateV1(candidate).eligible)
    .sort((left, right) => left.treatmentId.localeCompare(right.treatmentId));
  const selected = eligible[0] ?? null;
  return {
    baselineRetained: selected === null,
    evidenceHashes: [
      ...new Set(candidates.flatMap((candidate) => candidate.evidenceHashes)),
    ].sort(),
    selectedConfigurationId: selected?.configurationId ?? null,
    selectedTreatmentId: selected?.treatmentId ?? null,
    version: 1,
  };
}
