import type { AiFallbackKind } from '@/ai/types';
import {
  summarizeNumericDistribution,
  summarizeProportion,
  type NumericDistributionSummary,
  type ProportionSummary,
} from '@/ai/test/measurement';
import type {
  TacticalObjective,
  TacticalSpatialVariant,
} from '@/ai/test/tacticalFixtures';
import type { AiDifficulty } from '@/shared/types/session';

export type OracleCandidateScore = {
  actionKey: string;
  score: number;
};

export type TacticalDecisionScore = {
  catastrophicRegret: boolean | null;
  exactTacticalSuccess: boolean;
  oracleBestActionKey: string;
  oracleBestScore: number;
  oracleCovered: boolean;
  oracleRegret: number | null;
  oracleSelectedActionScore: number | null;
};

export type TacticalDecisionSample = TacticalDecisionScore & {
  completedDepth: number;
  completedRootMoves: number;
  difficulty: AiDifficulty;
  evaluatedNodes: number;
  fallbackKind: AiFallbackKind;
  fixtureId: string;
  legalActionCount: number;
  nodeBudget: number;
  objective: TacticalObjective;
  seed: number;
  selectedActionKey: string;
  spatialVariant: TacticalSpatialVariant;
  timedOut: boolean;
};

export type CompetenceCurvePoint = {
  catastrophicRegretShare: ProportionSummary;
  difficulty: AiDifficulty;
  fallbackShare: ProportionSummary;
  fullRootCoverageShare: ProportionSummary;
  nodeBudget: number;
  oracleAgreement: ProportionSummary;
  oracleCoverage: ProportionSummary;
  oracleCoveredCount: number;
  oracleMissingCount: number;
  oracleRegret: NumericDistributionSummary | null;
  sampleCount: number;
  uniqueDefenseAccuracy: ProportionSummary | null;
  uniqueWinAccuracy: ProportionSummary | null;
  zeroDepthShare: ProportionSummary;
};

export type CompetenceGateFailure = {
  difficulty: AiDifficulty;
  metric: string;
  observed: number | null;
  required: string;
};

export type CompetenceGateResult = {
  evaluatedPoints: Array<{ difficulty: AiDifficulty; nodeBudget: number }>;
  failures: CompetenceGateFailure[];
  verdict: 'pass' | 'fail';
};

export function scoreTacticalDecision(options: {
  catastrophicRegretThreshold: number;
  expectedActionKeys: string[];
  oracleCandidates: OracleCandidateScore[];
  selectedActionKey: string;
}): TacticalDecisionScore {
  const oracleBest = options.oracleCandidates[0];
  if (!oracleBest) {
    throw new Error('The tactical oracle returned no root candidates.');
  }

  const selected = options.oracleCandidates.find(
    (candidate) => candidate.actionKey === options.selectedActionKey,
  );
  const oracleRegret = selected
    ? Math.max(0, oracleBest.score - selected.score)
    : null;

  return {
    catastrophicRegret:
      oracleRegret === null
        ? null
        : oracleRegret >= options.catastrophicRegretThreshold,
    exactTacticalSuccess: options.expectedActionKeys.includes(
      options.selectedActionKey,
    ),
    oracleBestActionKey: oracleBest.actionKey,
    oracleBestScore: oracleBest.score,
    oracleCovered: selected !== undefined,
    oracleRegret,
    oracleSelectedActionScore: selected?.score ?? null,
  };
}

function objectiveAccuracy(
  samples: TacticalDecisionSample[],
  objective: TacticalObjective,
): ProportionSummary | null {
  const eligible = samples.filter((sample) => sample.objective === objective);
  if (!eligible.length) return null;
  return summarizeProportion(
    eligible.filter((sample) => sample.exactTacticalSuccess).length,
    eligible.length,
  );
}

export function summarizeCompetenceSamples(
  samples: TacticalDecisionSample[],
): CompetenceCurvePoint[] {
  const groups = new Map<string, TacticalDecisionSample[]>();
  for (const sample of samples) {
    const key = `${sample.difficulty}/${sample.nodeBudget}`;
    const group = groups.get(key) ?? [];
    group.push(sample);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group): CompetenceCurvePoint => {
      const covered = group.filter((sample) => sample.oracleCovered);
      const regrets = covered.flatMap((sample) =>
        sample.oracleRegret === null ? [] : [sample.oracleRegret],
      );
      const catastrophic = covered.filter(
        (sample) => sample.catastrophicRegret === true,
      ).length;

      return {
        catastrophicRegretShare: summarizeProportion(
          catastrophic,
          covered.length,
        ),
        difficulty: group[0].difficulty,
        fallbackShare: summarizeProportion(
          group.filter((sample) => sample.fallbackKind !== 'none').length,
          group.length,
        ),
        fullRootCoverageShare: summarizeProportion(
          group.filter(
            (sample) => sample.completedRootMoves >= sample.legalActionCount,
          ).length,
          group.length,
        ),
        nodeBudget: group[0].nodeBudget,
        oracleAgreement: summarizeProportion(
          covered.filter(
            (sample) => sample.selectedActionKey === sample.oracleBestActionKey,
          ).length,
          covered.length,
        ),
        oracleCoverage: summarizeProportion(covered.length, group.length),
        oracleCoveredCount: covered.length,
        oracleMissingCount: group.length - covered.length,
        oracleRegret: regrets.length
          ? summarizeNumericDistribution(regrets)
          : null,
        sampleCount: group.length,
        uniqueDefenseAccuracy: objectiveAccuracy(group, 'uniqueDefense'),
        uniqueWinAccuracy: objectiveAccuracy(group, 'uniqueWin'),
        zeroDepthShare: summarizeProportion(
          group.filter((sample) => sample.completedDepth === 0).length,
          group.length,
        ),
      };
    })
    .sort(
      (left, right) =>
        left.difficulty.localeCompare(right.difficulty) ||
        left.nodeBudget - right.nodeBudget,
    );
}

/** Applies confirmatory gates only to the largest measured budget per difficulty. */
export function evaluateCompetenceGates(
  curve: CompetenceCurvePoint[],
  options: {
    maxCatastrophicRegretShare: Record<AiDifficulty, number>;
    maxP95OracleRegret: Record<AiDifficulty, number>;
    minTacticalAccuracy: Record<AiDifficulty, number>;
  },
): CompetenceGateResult {
  const finalPoints = [...curve]
    .sort((left, right) => right.nodeBudget - left.nodeBudget)
    .filter(
      (point, index, sorted) =>
        sorted.findIndex(
          (candidate) => candidate.difficulty === point.difficulty,
        ) === index,
    )
    .sort((left, right) => left.difficulty.localeCompare(right.difficulty));
  const failures: CompetenceGateFailure[] = [];

  const requireAtLeast = (
    point: CompetenceCurvePoint,
    metric: string,
    observed: number | null,
    minimum: number,
  ): void => {
    if (observed === null || observed < minimum) {
      failures.push({
        difficulty: point.difficulty,
        metric,
        observed,
        required: `>= ${minimum}`,
      });
    }
  };
  const requireAtMost = (
    point: CompetenceCurvePoint,
    metric: string,
    observed: number | null,
    maximum: number,
  ): void => {
    if (observed === null || observed > maximum) {
      failures.push({
        difficulty: point.difficulty,
        metric,
        observed,
        required: `<= ${maximum}`,
      });
    }
  };

  for (const point of finalPoints) {
    requireAtLeast(point, 'oracleCoverage', point.oracleCoverage.share, 1);
    requireAtLeast(
      point,
      'uniqueWinAccuracy',
      point.uniqueWinAccuracy?.share ?? null,
      options.minTacticalAccuracy[point.difficulty],
    );
    requireAtLeast(
      point,
      'uniqueDefenseAccuracy',
      point.uniqueDefenseAccuracy?.share ?? null,
      options.minTacticalAccuracy[point.difficulty],
    );
    requireAtMost(
      point,
      'catastrophicRegretShare',
      point.catastrophicRegretShare.total
        ? point.catastrophicRegretShare.share
        : null,
      options.maxCatastrophicRegretShare[point.difficulty],
    );
    requireAtMost(
      point,
      'p95OracleRegret',
      point.oracleRegret?.p95 ?? null,
      options.maxP95OracleRegret[point.difficulty],
    );
  }

  return {
    evaluatedPoints: finalPoints.map((point) => ({
      difficulty: point.difficulty,
      nodeBudget: point.nodeBudget,
    })),
    failures,
    verdict: failures.length ? 'fail' : 'pass',
  };
}
