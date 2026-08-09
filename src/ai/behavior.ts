import type { AiStrategicTag } from '@/ai/types';
import { parseCoord } from '@/domain/model/coordinates';
import type { Coord, TurnAction } from '@/domain/model/types';
import type {
  AiBehaviorProfile,
  AiBehaviorProfileId,
} from '@/shared/types/session';

const PROFILE_IDS: AiBehaviorProfileId[] = ['expander', 'hunter', 'builder'];

function hashSeed(seed: string): number {
  let hash = 2_166_136_261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
}

/**
 * Generates one hidden opponent persona deterministically from a seed.
 *
 * The seed is persisted with the match so reloads keep the same behavioral
 * flavor, while a new match can still receive a different profile.
 */
export function createAiBehaviorProfile(seed: string): AiBehaviorProfile {
  return {
    id: PROFILE_IDS[hashSeed(seed) % PROFILE_IDS.length],
    seed,
  };
}

/** Translates strategic tags into profile-specific ordering pressure. */
export function getBehaviorActionBias(
  profileId: AiBehaviorProfileId | null,
  tags: AiStrategicTag[],
): number {
  if (!profileId || !tags.length) {
    return 0;
  }

  const tagWeights: Record<
    AiBehaviorProfileId,
    Partial<Record<AiStrategicTag, number>>
  > = {
    expander: {
      advanceMass: 80,
      decompress: 180,
      openLane: 220,
    },
    hunter: {
      captureControl: 180,
      freezeBlock: 240,
      rescue: 90,
    },
    builder: {
      advanceMass: 120,
      frontBuild: 260,
      rescue: 110,
    },
  };

  return tags.reduce((sum, tag) => sum + (tagWeights[profileId][tag] ?? 0), 0);
}

function getActionAnchor(action: TurnAction): Coord | null {
  switch (action.type) {
    case 'manualUnfreeze':
      return action.coord;
    case 'jumpSequence':
      return action.source;
    default:
      return action.source;
  }
}

function getGeometryBand(
  coord: Coord | null,
): 'center' | 'edge' | 'inner' | 'none' {
  if (!coord) {
    return 'none';
  }

  const { column } = parseCoord(coord);

  if (column === 'C' || column === 'D') {
    return 'center';
  }

  if (column === 'B' || column === 'E') {
    return 'inner';
  }

  return 'edge';
}

/**
 * Adds a small source-geometry preference so personas can still diversify
 * openings and symmetric equal-score positions where the strategic tags match.
 */
export function getBehaviorGeometryBias(
  profileId: AiBehaviorProfileId | null,
  action: TurnAction,
  seed: string | null = null,
): number {
  if (!profileId) {
    return 0;
  }

  const geometryBand = getGeometryBand(getActionAnchor(action));
  const geometryOrders: Record<
    AiBehaviorProfileId,
    Array<Array<'center' | 'edge' | 'inner'>>
  > = {
    expander: [
      ['center', 'inner', 'edge'],
      ['center', 'edge', 'inner'],
      ['inner', 'center', 'edge'],
    ],
    hunter: [
      ['inner', 'edge', 'center'],
      ['edge', 'inner', 'center'],
      ['inner', 'center', 'edge'],
    ],
    builder: [
      ['edge', 'inner', 'center'],
      ['edge', 'center', 'inner'],
      ['inner', 'edge', 'center'],
    ],
  };
  const orderedBands =
    geometryOrders[profileId][
      seed ? hashSeed(seed) % geometryOrders[profileId].length : 0
    ];
  const geometryWeights: Record<'center' | 'edge' | 'inner' | 'none', number> =
    {
      center: 20,
      edge: 20,
      inner: 20,
      none: 0,
    };

  geometryWeights[orderedBands[0]] = 220;
  geometryWeights[orderedBands[1]] = 120;
  geometryWeights[orderedBands[2]] = 40;

  return geometryWeights[geometryBand];
}
