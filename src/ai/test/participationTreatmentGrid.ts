export type StageAConfigV1 = {
  id: string;
  leafScale: 0 | 0.125 | 0.25 | 0.5;
  ordering: boolean;
};

export function stageAConfigGridV1(): StageAConfigV1[] {
  return ([0, 0.125, 0.25, 0.5] as const).flatMap((leafScale) =>
    ([false, true] as const).map((ordering) => ({
      id: `leaf-${leafScale}/ordering-${ordering ? 1 : 0}`,
      leafScale,
      ordering,
    })),
  );
}

export type StageAScreenEvidenceV1 = {
  config: StageAConfigV1;
  disagreementIncreaseSd: number;
  fallbackIncrease: number;
  forcedTacticalCorrect: boolean;
  meanReferenceRegretIncreaseSd: number;
  npsPointLoss: number;
  productCatastrophicRateIncrease: number;
  regretOscillationIncreaseSd: number;
  reversalShare: number;
  reversalShareIncrease: number;
  systematicSignReversal: boolean;
  wdlDowngrades: number;
};

export function screenStageAConfigV1(evidence: StageAScreenEvidenceV1) {
  const failures = [
    !evidence.forcedTacticalCorrect && 'forcedTacticalCorrectness',
    evidence.disagreementIncreaseSd > 0.2 && 'disagreementIncrease',
    evidence.regretOscillationIncreaseSd > 0.2 && 'regretOscillationIncrease',
    evidence.reversalShare > 0.25 && 'reversalShare',
    evidence.reversalShareIncrease > 0.1 && 'reversalShareIncrease',
    evidence.systematicSignReversal && 'systematicSignReversal',
    evidence.wdlDowngrades > 0 && 'exactWdlDowngrade',
    evidence.meanReferenceRegretIncreaseSd > 0.2 && 'referenceRegretIncrease',
    evidence.productCatastrophicRateIncrease > 0 && 'catastrophicRateIncrease',
    evidence.npsPointLoss > 0.15 && 'npsLoss',
    evidence.fallbackIncrease > 0.01 && 'fallbackIncrease',
  ].filter((failure): failure is string => typeof failure === 'string');
  return { eligible: failures.length === 0, failures };
}
