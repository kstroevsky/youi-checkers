import { hillOneDiversityV1 } from '@/ai/test/interestingnessOpportunity';

export type ParticipationDecisionV1 = {
  contributionAt4: number;
  contributionAt8: number;
  eligible: boolean;
  movedMass: number;
  previousSamePlayerFamily: string | null;
  previousSamePlayerRegion: string | null;
  retainedTurn: boolean;
  safeFamilies: string[];
  safeRegions: string[];
  selectedFamily: string;
  selectedRegion: string;
};

export type ParticipationDiagnosticsV1 = {
  avoidableFamilyRepetitionRate: number | null;
  avoidableRegionRepetitionRate: number | null;
  familyContributionD1: number | null;
  familyExposureD1: number | null;
  meanMovedMass: number | null;
  persistentContributionAt4: number | null;
  persistentContributionAt8: number | null;
  regionContributionD1: number | null;
  regionExposureD1: number | null;
  retainedTurnShare: number | null;
  version: 1;
};

function mean(values: number[]): number | null {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

/** Keeps opportunity (safe exposure) separate from realized contribution. */
export function summarizeParticipationDiagnosticsV1(
  decisions: ParticipationDecisionV1[],
): ParticipationDiagnosticsV1 {
  const eligible = decisions.filter((decision) => decision.eligible);
  const familyRepeat = eligible.filter(
    (decision) =>
      decision.previousSamePlayerFamily !== null &&
      decision.safeFamilies.some(
        (family) => family !== decision.previousSamePlayerFamily,
      ),
  );
  const regionRepeat = eligible.filter(
    (decision) =>
      decision.previousSamePlayerRegion !== null &&
      decision.safeRegions.some(
        (region) => region !== decision.previousSamePlayerRegion,
      ),
  );
  return {
    avoidableFamilyRepetitionRate: mean(
      familyRepeat.map((decision) =>
        decision.selectedFamily === decision.previousSamePlayerFamily ? 1 : 0,
      ),
    ),
    avoidableRegionRepetitionRate: mean(
      regionRepeat.map((decision) =>
        decision.selectedRegion === decision.previousSamePlayerRegion ? 1 : 0,
      ),
    ),
    familyContributionD1: hillOneDiversityV1(
      eligible.map((decision) => decision.selectedFamily),
    ),
    familyExposureD1: hillOneDiversityV1(
      eligible.flatMap((decision) => decision.safeFamilies),
    ),
    meanMovedMass: mean(eligible.map((decision) => decision.movedMass)),
    persistentContributionAt4: mean(
      eligible.map((decision) => decision.contributionAt4),
    ),
    persistentContributionAt8: mean(
      eligible.map((decision) => decision.contributionAt8),
    ),
    regionContributionD1: hillOneDiversityV1(
      eligible.map((decision) => decision.selectedRegion),
    ),
    regionExposureD1: hillOneDiversityV1(
      eligible.flatMap((decision) => decision.safeRegions),
    ),
    retainedTurnShare: mean(
      eligible.map((decision) => (decision.retainedTurn ? 1 : 0)),
    ),
    version: 1,
  };
}
