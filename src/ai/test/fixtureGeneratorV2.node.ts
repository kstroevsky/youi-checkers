import { createHash } from 'node:crypto';

import {
  createFixtureCatalog,
  type FixtureCatalogV1,
  type FixtureLineageV1,
  type FixtureStrataV1,
} from '@/ai/test/fixtureCatalog.node';
import {
  namedRngFingerprint,
  namedShuffle,
  type NamedRngKeyV1,
} from '@/ai/test/namedRng.node';

export const FIXTURE_GENERATOR_VERSION = 2 as const;
export const DEVELOPMENT_LINEAGE_COUNT = 96;

export type FixtureOriginScheduleV2 =
  | {
      mode: 'noPreexistingPilot';
      pilotCorpusHash: null;
    }
  | {
      mode: 'preexistingPilotAvailable';
      pilotCorpusHash: string;
    };

export type FixtureCandidateV2 = FixtureLineageV1 & {
  sourceArtifactHash: string;
};

export type ImpossibleIntersectionV2 = {
  reason: string;
  strata: Partial<FixtureStrataV1>;
};

export type FixtureScheduleSlotV2 = {
  slotId: string;
  strata: FixtureStrataV1;
};

export type FixtureGenerationResultV2 = {
  catalog: FixtureCatalogV1 | null;
  deficits: Array<{
    reason: string;
    slotId: string;
    strata: FixtureStrataV1;
  }>;
  generatorHash: string;
  originSchedule: FixtureOriginScheduleV2;
  schedule: FixtureScheduleSlotV2[];
  scheduleHash: string;
  status: 'complete' | 'inadequate';
  version: 2;
};

const PHASES = ['opening', 'transport', 'conversion', 'finishing'] as const;
const TOPOLOGIES = [
  'congested',
  'open',
  'asymmetric',
  'frozen',
  'lowActiveMobility',
] as const;
const TACTICS = [
  'quiet',
  'threat',
  'forcedDefence',
  'jumpChain',
  'rescue',
] as const;
const PLANS = ['home', 'hybrid', 'sixStack', 'credibleSwitch'] as const;
const ADVANTAGES = ['winning', 'approximatelyEqual', 'losing'] as const;
const HISTORY = [
  'clean',
  'familyRepetition',
  'regionRepetition',
  'selfUndo',
] as const;
const NON_PILOT_ORIGINS = [
  'handAuthored',
  'random',
  'selfPlay',
  'adversarial',
  'historicalIncident',
] as const;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value !== 'object' || value === null) return JSON.stringify(value);
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
    .join(',')}}`;
}

function hash(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function balancedDimension<T extends string>(
  values: readonly T[],
  count: number,
  key: NamedRngKeyV1,
): T[] {
  const order = namedShuffle(values, {
    ...key,
    variant: `${key.variant}:quota`,
  });
  const result: T[] = [];
  const minimum = Math.floor(count / values.length);
  const remainder = count % values.length;
  order.forEach((value, index) => {
    result.push(
      ...Array.from(
        { length: minimum + (index < remainder ? 1 : 0) },
        () => value,
      ),
    );
  });
  return namedShuffle(result, { ...key, variant: `${key.variant}:slots` });
}

function originsForSchedule(
  schedule: FixtureOriginScheduleV2,
): readonly FixtureStrataV1['origin'][] {
  return schedule.mode === 'preexistingPilotAvailable'
    ? [...NON_PILOT_ORIGINS, 'consentedPilot']
    : NON_PILOT_ORIGINS;
}

function matchesPartial(
  strata: FixtureStrataV1,
  partial: Partial<FixtureStrataV1>,
): boolean {
  return Object.entries(partial).every(
    ([key, value]) => strata[key as keyof FixtureStrataV1] === value,
  );
}

function impossibleReason(
  strata: FixtureStrataV1,
  impossible: readonly ImpossibleIntersectionV2[],
): string | null {
  return (
    impossible.find((entry) => matchesPartial(strata, entry.strata))?.reason ??
    null
  );
}

function repairImpossibleSlots(
  slots: FixtureScheduleSlotV2[],
  impossible: readonly ImpossibleIntersectionV2[],
): FixtureScheduleSlotV2[] {
  const repaired = structuredClone(slots);
  const dimensions = Object.keys(repaired[0].strata) as Array<
    keyof FixtureStrataV1
  >;
  for (let index = 0; index < repaired.length; index += 1) {
    if (!impossibleReason(repaired[index].strata, impossible)) continue;
    let fixed = false;
    for (const dimension of dimensions) {
      // Search the whole schedule, including earlier slots. A prohibited slot
      // near the end may only have a valid marginal-preserving partner that
      // has already been visited.
      for (let other = 0; other < repaired.length; other += 1) {
        if (other === index) continue;
        const left = structuredClone(repaired[index].strata);
        const right = structuredClone(repaired[other].strata);
        const value = left[dimension];
        (left as Record<string, string>)[dimension] = right[dimension];
        (right as Record<string, string>)[dimension] = value;
        if (
          !impossibleReason(left, impossible) &&
          !impossibleReason(right, impossible)
        ) {
          repaired[index].strata = left;
          repaired[other].strata = right;
          fixed = true;
          break;
        }
      }
      if (fixed) break;
    }
  }
  return repaired;
}

export function createFixtureScheduleV2({
  impossible = [],
  originSchedule,
  runSeed,
  sealed,
}: {
  impossible?: ImpossibleIntersectionV2[];
  originSchedule: FixtureOriginScheduleV2;
  runSeed: string;
  sealed: boolean;
}): FixtureScheduleSlotV2[] {
  if (
    originSchedule.mode === 'preexistingPilotAvailable' &&
    !/^[a-f0-9]{64}$/u.test(originSchedule.pilotCorpusHash)
  ) {
    throw new Error('An available pilot corpus requires its SHA-256 hash.');
  }
  const key = (variant: string): NamedRngKeyV1 => ({
    lineageId: sealed ? 'sealed-catalog' : 'development-catalog',
    purpose: 'fixtureGeneration',
    replicate: 0,
    runSeed,
    variant,
  });
  const phases = balancedDimension(
    PHASES,
    DEVELOPMENT_LINEAGE_COUNT,
    key('phase'),
  );
  const topologies = balancedDimension(
    TOPOLOGIES,
    DEVELOPMENT_LINEAGE_COUNT,
    key('topology'),
  );
  const tactics = balancedDimension(
    TACTICS,
    DEVELOPMENT_LINEAGE_COUNT,
    key('tactics'),
  );
  const plans = balancedDimension(
    PLANS,
    DEVELOPMENT_LINEAGE_COUNT,
    key('plan'),
  );
  const advantages = balancedDimension(
    ADVANTAGES,
    DEVELOPMENT_LINEAGE_COUNT,
    key('advantage'),
  );
  const history = balancedDimension(
    HISTORY,
    DEVELOPMENT_LINEAGE_COUNT,
    key('history'),
  );
  const origins = balancedDimension(
    originsForSchedule(originSchedule),
    DEVELOPMENT_LINEAGE_COUNT,
    key('origin'),
  );
  const prefix = sealed ? 'sealed' : 'development';
  const slots = Array.from(
    { length: DEVELOPMENT_LINEAGE_COUNT },
    (_, index): FixtureScheduleSlotV2 => ({
      slotId: `${prefix}-${String(index + 1).padStart(3, '0')}`,
      strata: {
        advantage: advantages[index],
        historyPressure: history[index],
        origin: origins[index],
        phase: phases[index],
        plan: plans[index],
        tactics: tactics[index],
        topology: topologies[index],
      },
    }),
  );
  return repairImpossibleSlots(slots, impossible);
}

function candidateRootIdentity(candidate: FixtureCandidateV2): string {
  return hash({
    pendingJump: candidate.rootContext.state.pendingJump,
    positionCounts: candidate.rootContext.state.positionCounts,
    positionHash: candidate.rootContext.state,
  });
}

export function generateFixtureCatalogV2({
  candidates,
  impossible = [],
  originSchedule,
  runSeed,
  sealed,
}: {
  candidates: FixtureCandidateV2[];
  impossible?: ImpossibleIntersectionV2[];
  originSchedule: FixtureOriginScheduleV2;
  runSeed: string;
  sealed: boolean;
}): FixtureGenerationResultV2 {
  const schedule = createFixtureScheduleV2({
    impossible,
    originSchedule,
    runSeed,
    sealed,
  });
  const scheduleHash = hash(schedule);
  const generatorHash = hash({
    amendment: '0001',
    impossible,
    namedRngHash: namedRngFingerprint(),
    originSchedule,
    scheduleHash,
    version: FIXTURE_GENERATOR_VERSION,
  });
  const byStrata = new Map<string, FixtureCandidateV2[]>();
  for (const candidate of candidates) {
    if (
      candidate.strata.origin === 'consentedPilot' &&
      originSchedule.mode !== 'preexistingPilotAvailable'
    ) {
      continue;
    }
    if (
      candidate.strata.historyPressure !== 'clean' &&
      candidate.rootContext.historyStatus !== 'completeForParticipationWindow'
    ) {
      continue;
    }
    const key = stableJson(candidate.strata);
    const entries = byStrata.get(key) ?? [];
    entries.push(candidate);
    byStrata.set(key, entries);
  }
  for (const [key, entries] of byStrata) {
    byStrata.set(
      key,
      namedShuffle(
        entries.sort((left, right) =>
          left.lineageId.localeCompare(right.lineageId),
        ),
        {
          lineageId: sealed ? 'sealed-catalog' : 'development-catalog',
          purpose: 'fixtureGeneration',
          replicate: 0,
          runSeed,
          variant: `candidate-order:${key}`,
        },
      ),
    );
  }
  const selected: FixtureLineageV1[] = [];
  const deficits: FixtureGenerationResultV2['deficits'] = [];
  const rootIdentities = new Set<string>();
  for (const slot of schedule) {
    const unresolvedImpossible = impossibleReason(slot.strata, impossible);
    if (unresolvedImpossible) {
      deficits.push({
        reason: `Unresolved impossible intersection: ${unresolvedImpossible}`,
        slotId: slot.slotId,
        strata: slot.strata,
      });
      continue;
    }
    const key = stableJson(slot.strata);
    const pool = byStrata.get(key) ?? [];
    let candidate: FixtureCandidateV2 | undefined;
    while (pool.length && !candidate) {
      const next = pool.shift() as FixtureCandidateV2;
      const identity = candidateRootIdentity(next);
      if (!rootIdentities.has(identity)) {
        candidate = next;
        rootIdentities.add(identity);
      }
    }
    if (!candidate) {
      deficits.push({
        reason: 'No unused treatment-independent candidate matches this slot.',
        slotId: slot.slotId,
        strata: slot.strata,
      });
      continue;
    }
    selected.push({
      lineageId: candidate.lineageId,
      rootContext: candidate.rootContext,
      strata: candidate.strata,
    });
  }
  const catalog =
    deficits.length === 0
      ? createFixtureCatalog({
          generatorHash,
          lineages: selected,
          namedRngHash: namedRngFingerprint(),
          sealed,
        })
      : null;
  return {
    catalog,
    deficits,
    generatorHash,
    originSchedule,
    schedule,
    scheduleHash,
    status: catalog ? 'complete' : 'inadequate',
    version: FIXTURE_GENERATOR_VERSION,
  };
}
