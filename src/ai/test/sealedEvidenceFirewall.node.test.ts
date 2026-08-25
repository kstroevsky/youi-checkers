import { describe, expect, it } from 'vitest';
import {
  createSealedEvidenceIndexV1,
  unlockSealedEvidenceV1,
} from '@/ai/test/sealedEvidenceFirewall.node';

describe('sealed evidence firewall', () => {
  it('exposes only hashes/counts until a matching shipping manifest exists', () => {
    const index = createSealedEvidenceIndexV1({
      catalogHash: 'a'.repeat(64),
      completedAt: '2026-01-01T00:00:00Z',
      completionCount: 10,
      proofSnapshotHash: 'b'.repeat(64),
      sealedPayloadPath: 'output/sealed/payload.json',
      unknownCount: 2,
    });
    expect(index.shippingManifestHash).toBeNull();
    expect(() =>
      unlockSealedEvidenceV1(index, {
        hash: 'c'.repeat(64),
        sealedCatalogHash: 'd'.repeat(64),
        sealedProofSnapshotHash: 'b'.repeat(64),
      }),
    ).toThrow(/catalog mismatch/u);
    expect(
      unlockSealedEvidenceV1(index, {
        hash: 'c'.repeat(64),
        sealedCatalogHash: 'a'.repeat(64),
        sealedProofSnapshotHash: 'b'.repeat(64),
      }).unlockReceipt,
    ).toMatch(/^[a-f0-9]{64}$/u);
  });
});
