import { hillOneDiversityV1 } from '@/ai/test/interestingnessOpportunity';

export type CounterplayActionEvidenceV1 = {
  actionKey: string;
  boundary: 'opponentDecision' | 'terminal' | 'unknown';
  completeComparableEvidence: boolean;
  projectedReplyClasses: string[];
  safe: boolean;
  selected: boolean;
};

export type CounterplayMeasurementV1 = {
  effectiveCounterplayD1: number | null;
  eligible: boolean;
  maximumProjectedD1: number | null;
  reasons: string[];
  selectedProjectedD1: number | null;
  suppression: boolean | null;
  suppressionRegret: number | null;
  version: 1;
};

/** Equal reply-action mass; raw reply counts are not substituted for diversity. */
export function measureCounterplayAndSuppressionV1(
  actions: CounterplayActionEvidenceV1[],
): CounterplayMeasurementV1 {
  const reasons: string[] = [];
  const safe = actions.filter((action) => action.safe);
  const selected = actions.find((action) => action.selected) ?? null;
  if (safe.length < 2) reasons.push('fewerThanTwoSafeAiActions');
  if (!selected?.safe) reasons.push('selectedActionNotSafe');
  if (safe.some((action) => !action.completeComparableEvidence))
    reasons.push('incompleteComparableEvidence');
  if (selected?.boundary === 'terminal') reasons.push('terminalConversion');
  if (selected?.boundary === 'unknown') reasons.push('unknownBoundary');
  const selectedD1 = selected
    ? hillOneDiversityV1(selected.projectedReplyClasses)
    : null;
  if (selectedD1 !== null && selected!.projectedReplyClasses.length < 2)
    reasons.push('fewerThanTwoAdmissibleReplies');
  const diversities = safe.flatMap((action) => {
    const diversity = hillOneDiversityV1(action.projectedReplyClasses);
    return diversity === null ? [] : [diversity];
  });
  const maximum = diversities.length ? Math.max(...diversities) : null;
  const eligible =
    reasons.length === 0 && selectedD1 !== null && maximum !== null;
  const suppressionRegret = eligible ? maximum! - selectedD1! : null;
  return {
    effectiveCounterplayD1: eligible ? selectedD1 : null,
    eligible,
    maximumProjectedD1: maximum,
    reasons,
    selectedProjectedD1: selectedD1,
    suppression: suppressionRegret === null ? null : suppressionRegret >= 0.5,
    suppressionRegret,
    version: 1,
  };
}

export type RewardForThinkingPairV1 = {
  baselineIntuitivePointShare: number;
  baselineRandomPointShare: number;
  candidateIntuitivePointShare: number;
  candidateRandomPointShare: number;
  pairingKey: string;
};

export function rewardForThinkingEffectV1(pairs: RewardForThinkingPairV1[]) {
  if (!pairs.length) return null;
  const lineageEffects = pairs.map((pair) => ({
    effect:
      pair.candidateIntuitivePointShare -
      pair.candidateRandomPointShare -
      (pair.baselineIntuitivePointShare - pair.baselineRandomPointShare),
    pairingKey: pair.pairingKey,
  }));
  return {
    effect:
      lineageEffects.reduce((sum, pair) => sum + pair.effect, 0) /
      lineageEffects.length,
    lineageEffects,
    version: 1 as const,
  };
}
