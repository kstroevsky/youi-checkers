import { describe, expect, it } from 'vitest';

import { createSearchPerfCache, getStatePerfBundle } from '@/ai/perf';
import { getTiebreakPressureProfile } from '@/ai/risk';
import { createInitialState, hashPosition } from '@/domain';
import { withConfig } from '@/test/factories';

describe('search performance cache semantics', () => {
  it('does not reuse history-sensitive tiebreak pressure across structural states', () => {
    const ruleConfig = withConfig({ drawRule: 'threefold' });
    const initial = createInitialState(ruleConfig);
    const positionKey = hashPosition(initial);
    const earlyState = {
      ...initial,
      moveNumber: 1,
      positionCounts: { [positionKey]: 1 },
    };
    const lateRepeatedState = {
      ...initial,
      moveNumber: 70,
      positionCounts: { [positionKey]: 3 },
    };
    const cache = createSearchPerfCache();
    const earlyBundle = getStatePerfBundle(earlyState, ruleConfig, cache);
    const earlyProfile = getTiebreakPressureProfile(
      earlyState,
      'white',
      'normal',
      null,
      earlyBundle,
    );
    const lateBundle = getStatePerfBundle(lateRepeatedState, ruleConfig, cache);
    const lateProfile = getTiebreakPressureProfile(
      lateRepeatedState,
      'white',
      'normal',
      null,
      lateBundle,
    );

    // Structural work should still be shared; only the history-sensitive value differs.
    expect(lateBundle).toBe(earlyBundle);
    expect(lateProfile.drawPressure).toBeGreaterThan(earlyProfile.drawPressure);
  });
});
