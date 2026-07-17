import { describe, expect, it } from 'vitest';

import { getTurnActionEndpoints } from '@/domain/model/action';

describe('turn action endpoints', () => {
  it('uses the final landing of a jump sequence', () => {
    expect(
      getTurnActionEndpoints({
        type: 'jumpSequence',
        source: 'A1',
        path: ['C3', 'E5'],
      }),
    ).toEqual({ source: 'A1', target: 'E5' });
  });

  it('uses the same cell for a manual unfreeze', () => {
    expect(
      getTurnActionEndpoints({ type: 'manualUnfreeze', coord: 'B2' }),
    ).toEqual({ source: 'B2', target: 'B2' });
  });
});
