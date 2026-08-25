import { actionKey } from '@/ai/search/shared';
import type { AiSearchResult } from '@/ai/types';
import type {
  ReferenceStrengthResultV1,
  RootCoverageEvidenceV1,
} from '@/ai/referenceOracle';
import type { TurnAction } from '@/domain';

export type WdlValueV1 = 'loss' | 'draw' | 'win';

export type WdlBoundsV1 = {
  lower: WdlValueV1;
  upper: WdlValueV1;
};

export type ScoreEvidenceSourceV1 =
  | 'referenceStrengthV1'
  | 'productCompletedDepth'
  | 'productPartialDepth';

export type ScoreEvidenceV1 = {
  bound: 'exact' | 'lowerBound' | 'upperBound' | 'unknown';
  completedRootMoves: number;
  depth: number | null;
  legalRootMoves: number;
  score: number | null;
  source: ScoreEvidenceSourceV1;
};

export type RootActionEvidenceV1 = {
  actionKey: string;
  productScoreEvidence: ScoreEvidenceV1 | null;
  proofCertificateId: string | null;
  referenceScoreEvidence: ScoreEvidenceV1 | null;
  wdlBounds: WdlBoundsV1;
  wdlSource: 'terminal' | 'solver' | 'tablebase' | 'unknown';
};

export type RootScoreEvidenceSetV1 = {
  actions: RootActionEvidenceV1[];
  legalRootMoves: number;
  referenceCoverage: RootCoverageEvidenceV1 | null;
  version: 1;
};

const UNKNOWN_WDL: WdlBoundsV1 = { lower: 'loss', upper: 'win' };

function productEvidenceByAction(
  legalActions: readonly TurnAction[],
  result: AiSearchResult | null,
): Map<string, ScoreEvidenceV1> {
  if (!result) return new Map();
  const usingPartial = result.partialDepth !== null;
  const depth = usingPartial
    ? (result.partialDepth as number)
    : result.completedDepth;
  const completedRootMoves = usingPartial
    ? result.partialRootMoves
    : result.completedRootMoves;
  const source: ScoreEvidenceSourceV1 = usingPartial
    ? 'productPartialDepth'
    : 'productCompletedDepth';
  const scores = new Map(
    result.rootCandidates.map((candidate) => [
      actionKey(candidate.action),
      candidate.score,
    ]),
  );

  return new Map(
    legalActions.map((action) => {
      const key = actionKey(action);
      const score = scores.get(key);
      return [
        key,
        {
          bound: score === undefined || depth <= 0 ? 'unknown' : 'exact',
          completedRootMoves,
          depth: depth > 0 ? depth : null,
          legalRootMoves: legalActions.length,
          score: score ?? null,
          source,
        } satisfies ScoreEvidenceV1,
      ];
    }),
  );
}

/** Joins separately-owned product and reference scores without interchanging them. */
export function buildRootScoreEvidenceV1({
  legalActions,
  productResult,
  referenceResult,
}: {
  legalActions: readonly TurnAction[];
  productResult: AiSearchResult | null;
  referenceResult: ReferenceStrengthResultV1 | null;
}): RootScoreEvidenceSetV1 {
  const product = productEvidenceByAction(legalActions, productResult);
  const reference = new Map(
    (referenceResult?.scores ?? []).map((entry) => [
      entry.actionKey,
      {
        bound: 'exact',
        completedRootMoves: referenceResult?.coverage.exactReferenceCount ?? 0,
        depth: referenceResult?.depth ?? null,
        legalRootMoves: legalActions.length,
        score: entry.score,
        source: 'referenceStrengthV1',
      } satisfies ScoreEvidenceV1,
    ]),
  );

  return {
    actions: legalActions
      .map((action) => actionKey(action))
      .sort()
      .map((key) => ({
        actionKey: key,
        productScoreEvidence: product.get(key) ?? null,
        proofCertificateId: null,
        referenceScoreEvidence: reference.get(key) ?? null,
        wdlBounds: { ...UNKNOWN_WDL },
        wdlSource: 'unknown' as const,
      })),
    legalRootMoves: legalActions.length,
    referenceCoverage: referenceResult?.coverage ?? null,
    version: 1,
  };
}
