import { createHash } from 'node:crypto';

import type { AiRootContextV1 } from '@/ai/test/rootContext';

export const FIXTURE_CATALOG_SCHEMA_VERSION = 1 as const;

export type FixtureStrataV1 = {
  advantage: 'winning' | 'approximatelyEqual' | 'losing';
  historyPressure:
    | 'clean'
    | 'familyRepetition'
    | 'regionRepetition'
    | 'selfUndo';
  origin:
    | 'handAuthored'
    | 'random'
    | 'selfPlay'
    | 'adversarial'
    | 'historicalIncident'
    | 'consentedPilot';
  phase: 'opening' | 'transport' | 'conversion' | 'finishing';
  plan: 'home' | 'hybrid' | 'sixStack' | 'credibleSwitch';
  tactics: 'quiet' | 'threat' | 'forcedDefence' | 'jumpChain' | 'rescue';
  topology:
    | 'congested'
    | 'open'
    | 'asymmetric'
    | 'frozen'
    | 'lowActiveMobility';
};

export type FixtureLineageV1 = {
  lineageId: string;
  rootContext: AiRootContextV1;
  strata: FixtureStrataV1;
};

export type FixtureCatalogV1 = {
  catalogHash: string;
  generatedAt: string;
  generatorHash: string;
  generatorVersion: 1;
  lineages: FixtureLineageV1[];
  namedRngHash: string;
  schemaVersion: 1;
  sealed: boolean;
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function fixtureCatalogHash(
  input: Omit<FixtureCatalogV1, 'catalogHash' | 'generatedAt'>,
): string {
  return createHash('sha256').update(canonicalJson(input)).digest('hex');
}

export function createFixtureCatalog({
  generatorHash,
  lineages,
  namedRngHash,
  sealed,
}: {
  generatorHash: string;
  lineages: FixtureLineageV1[];
  namedRngHash: string;
  sealed: boolean;
}): FixtureCatalogV1 {
  const sorted = [...lineages].sort((left, right) =>
    left.lineageId.localeCompare(right.lineageId),
  );
  if (
    new Set(sorted.map((lineage) => lineage.lineageId)).size !== sorted.length
  ) {
    throw new Error('Fixture lineage IDs must be unique.');
  }
  const identity = {
    generatorHash,
    generatorVersion: 1 as const,
    lineages: sorted,
    namedRngHash,
    schemaVersion: FIXTURE_CATALOG_SCHEMA_VERSION,
    sealed,
  };
  return {
    ...identity,
    catalogHash: fixtureCatalogHash(identity),
    generatedAt: new Date().toISOString(),
  };
}
