import { createHash } from 'node:crypto';

export type SealedEvidenceIndexV1 = {
  catalogHash: string;
  completedAt: string;
  completionCount: number;
  proofSnapshotHash: string;
  sealedPayloadPath: string;
  shippingManifestHash: null;
  unknownCount: number;
  version: 1;
};

function assertHash(value: string, name: string) {
  if (!/^[a-f0-9]{64}$/u.test(value))
    throw new Error(`${name} must be SHA-256.`);
}

export function createSealedEvidenceIndexV1(
  input: Omit<SealedEvidenceIndexV1, 'shippingManifestHash' | 'version'>,
): SealedEvidenceIndexV1 {
  assertHash(input.catalogHash, 'catalogHash');
  assertHash(input.proofSnapshotHash, 'proofSnapshotHash');
  if (input.completionCount < 0 || input.unknownCount < 0)
    throw new Error('Counts must be non-negative.');
  return { ...input, shippingManifestHash: null, version: 1 };
}

/** Analysis must present the already-frozen shipping manifest hash. */
export function unlockSealedEvidenceV1(
  index: SealedEvidenceIndexV1,
  shippingManifest: {
    hash: string;
    sealedCatalogHash: string;
    sealedProofSnapshotHash: string;
  },
) {
  assertHash(shippingManifest.hash, 'shippingManifestHash');
  if (shippingManifest.sealedCatalogHash !== index.catalogHash)
    throw new Error('Shipping manifest catalog mismatch.');
  if (shippingManifest.sealedProofSnapshotHash !== index.proofSnapshotHash)
    throw new Error('Shipping manifest proof mismatch.');
  return {
    payloadPath: index.sealedPayloadPath,
    unlockReceipt: createHash('sha256')
      .update(
        `${shippingManifest.hash}\0${index.catalogHash}\0${index.proofSnapshotHash}`,
      )
      .digest('hex'),
  };
}
