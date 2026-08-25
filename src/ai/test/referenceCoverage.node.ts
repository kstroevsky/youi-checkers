import { createHash } from 'node:crypto';

import {
  isReferenceOnlyCoverageV1,
  REFERENCE_STRENGTH_ORACLE_VERSION,
  type ReferenceStrengthResultV1,
} from '@/ai/referenceOracle';

export type ReferenceCoverageRootV1 = {
  ineligibilityReasons: string[];
  lineageId: string;
  referenceOnly: boolean;
  result: ReferenceStrengthResultV1;
};

export type ReferenceCoverageAuditV1 = {
  artifactHash: string;
  catalogHash: string;
  exactActionCount: number;
  ineligibleRootCount: number;
  oracleVersion: typeof REFERENCE_STRENGTH_ORACLE_VERSION;
  referenceOnlyRootCount: number;
  roots: ReferenceCoverageRootV1[];
  totalActionCount: number;
  version: 1;
};

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(',')}}`;
}

function hash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function validateReferenceCoverageResultV1(
  result: ReferenceStrengthResultV1,
): string[] {
  const reasons: string[] = [];
  const keys = result.scores.map((entry) => entry.actionKey);
  if (new Set(keys).size !== keys.length) reasons.push('duplicateActionKey');
  if (result.coverage.legalCount !== result.scores.length)
    reasons.push('legalCountMismatch');
  if (result.coverage.exactReferenceCount !== result.scores.length)
    reasons.push('exactCountMismatch');
  if (result.depth !== result.coverage.commonDepth)
    reasons.push('commonDepthMismatch');
  if (result.coverage.interrupted) reasons.push('interrupted');
  if (!result.coverage.shortcutBypassed) reasons.push('shortcutNotBypassed');
  if (result.coverage.lowerBoundCount > 0) reasons.push('lowerBoundsPresent');
  if (result.coverage.upperBoundCount > 0) reasons.push('upperBoundsPresent');
  if (result.coverage.unknownCount > 0) reasons.push('unknownsPresent');
  return reasons;
}

/** Creates hash-addressed, root-by-root evidence; no aggregate can hide a gap. */
export function createReferenceCoverageAuditV1(
  catalogHash: string,
  roots: Array<{ lineageId: string; result: ReferenceStrengthResultV1 }>,
): ReferenceCoverageAuditV1 {
  if (!/^[a-f0-9]{64}$/u.test(catalogHash)) {
    throw new Error('catalogHash must be a SHA-256 digest.');
  }
  const lineageIds = roots.map((root) => root.lineageId);
  if (new Set(lineageIds).size !== lineageIds.length) {
    throw new Error('Coverage roots must have unique lineage IDs.');
  }
  const records = roots
    .slice()
    .sort((left, right) => left.lineageId.localeCompare(right.lineageId))
    .map(({ lineageId, result }): ReferenceCoverageRootV1 => {
      const ineligibilityReasons = validateReferenceCoverageResultV1(result);
      return {
        ineligibilityReasons,
        lineageId,
        referenceOnly:
          ineligibilityReasons.length === 0 &&
          isReferenceOnlyCoverageV1(result.coverage),
        result,
      };
    });
  const body = {
    catalogHash,
    exactActionCount: records.reduce(
      (sum, root) => sum + root.result.coverage.exactReferenceCount,
      0,
    ),
    ineligibleRootCount: records.filter((root) => !root.referenceOnly).length,
    oracleVersion: REFERENCE_STRENGTH_ORACLE_VERSION,
    referenceOnlyRootCount: records.filter((root) => root.referenceOnly).length,
    roots: records,
    totalActionCount: records.reduce(
      (sum, root) => sum + root.result.coverage.legalCount,
      0,
    ),
    version: 1 as const,
  };
  return { ...body, artifactHash: hash(body) };
}
