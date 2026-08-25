import { describe, expect, it } from 'vitest';

import { runReferenceStrengthOracleV1 } from '@/ai/referenceOracle';
import {
  createReferenceCoverageAuditV1,
  validateReferenceCoverageResultV1,
} from '@/ai/test/referenceCoverage.node';
import {
  boardWithPieces,
  checker,
  gameStateWithBoard,
  withConfig,
} from '@/test/factories';

describe('ReferenceCoverageAuditV1', () => {
  it('records complete per-root action coverage under a content hash', () => {
    const state = gameStateWithBoard(
      boardWithPieces({ B2: [checker('white')], E5: [checker('black')] }),
    );
    const result = runReferenceStrengthOracleV1(state, withConfig());
    const audit = createReferenceCoverageAuditV1('a'.repeat(64), [
      { lineageId: 'lineage-1', result },
    ]);

    expect(audit.referenceOnlyRootCount).toBe(1);
    expect(audit.exactActionCount).toBe(audit.totalActionCount);
    expect(audit.artifactHash).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('surfaces count mismatches instead of treating them as exact coverage', () => {
    const state = gameStateWithBoard(
      boardWithPieces({ B2: [checker('white')], E5: [checker('black')] }),
    );
    const result = runReferenceStrengthOracleV1(state, withConfig());
    const malformed = {
      ...result,
      coverage: { ...result.coverage, exactReferenceCount: 0 },
    };

    expect(validateReferenceCoverageResultV1(malformed)).toContain(
      'exactCountMismatch',
    );
    expect(
      createReferenceCoverageAuditV1('b'.repeat(64), [
        { lineageId: 'lineage-1', result: malformed },
      ]).ineligibleRootCount,
    ).toBe(1);
  });
});
