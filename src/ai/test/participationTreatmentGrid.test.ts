import { describe, expect, it } from 'vitest';

import {
  screenStageAConfigV1,
  stageAConfigGridV1,
} from '@/ai/test/participationTreatmentGrid';

describe('Stage A participation grid', () => {
  it('enumerates the frozen 4x2 factorial exactly', () => {
    expect(stageAConfigGridV1()).toHaveLength(8);
  });

  it('fails any safety or performance gate independently', () => {
    const config = stageAConfigGridV1()[0];
    const result = screenStageAConfigV1({
      config,
      disagreementIncreaseSd: 0,
      fallbackIncrease: 0,
      forcedTacticalCorrect: true,
      meanReferenceRegretIncreaseSd: 0,
      npsPointLoss: 0.16,
      productCatastrophicRateIncrease: 0,
      regretOscillationIncreaseSd: 0,
      reversalShare: 0,
      reversalShareIncrease: 0,
      systematicSignReversal: false,
      wdlDowngrades: 0,
    });
    expect(result).toEqual({ eligible: false, failures: ['npsLoss'] });
  });
});
