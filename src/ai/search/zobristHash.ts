/**
 * 64-bit Zobrist hash for the AI transposition table.
 *
 * Two independent 32-bit Zobrist tables (H1, H2) are XOR-composed per state
 * component and returned as a fixed-length 16-char hex string.  The key is
 * O(36) bitwise XOR operations — a significant improvement over the
 * O(36 × string-allocation) cost of the string-based hashPosition used for
 * game-rule purposes.
 *
 * This hash is intentionally separate from hashPosition / TurnRecord.positionHash:
 * those carry cross-session identity for threefold-repetition detection and
 * persistence; this one lives only within a single search pass and has no
 * persistence obligations.
 *
 * Jump trail set semantics:
 *   jumpedCheckerIds are XOR'd in order-independently, which is correct:
 *   getJumpTargetsForContext only checks set membership (jumpedCheckerIds.has),
 *   so two states that reached the same jumped-checker set via different jump
 *   orderings have identical legal continuations and should share a TT entry.
 *
 *   XOR degeneracy: two disjoint checker sets {A, B} can produce the same
 *   combined hash if CHECKER_H1[A] == CHECKER_H1[B] (probability 1/2^32 per
 *   pair).  With 36 checkers and 630 pairs the joint probability is ~630/2^32
 *   ≈ 1.5×10⁻⁷ per half; because H1 and H2 are independent, the 64-bit
 *   degeneracy probability is ~630²/2^64 ≈ 2×10⁻¹⁴ — acceptable for a
 *   bounded 50 000-entry TT but worth acknowledging here.
 *
 * firstJumpedOwner encodes one bit (black vs white), not a specific checker.
 *   Two pending-jump states that differ only in which exact checker was jumped
 *   first (same owner, different checker) produce the same contribution from
 *   this field.  The trail (jumpedCheckerIds) provides the differentiation.
 */

import { getCell } from '@/domain/model/board';
import { allCoords } from '@/domain/model/coordinates';
import type { EngineState, PendingJump } from '@/domain/model/types';

// ---------------------------------------------------------------------------
// Splitmix32 PRNG — fast, excellent avalanche, deterministic from a fixed seed
// ---------------------------------------------------------------------------

function makeSplitmix32(seed: number): () => number {
  let s = seed | 0;
  return (): number => {
    s = (s + 0x9e3779b9) | 0;
    let z = s;

    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b | 0);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35 | 0);

    return (z ^ (z >>> 16)) >>> 0;
  };
}

// ---------------------------------------------------------------------------
// Precomputed Zobrist tables (built once at module load)
//
// TABLE_H1 / TABLE_H2 layout (same for both — generated with independent seeds):
//
//   [0 .. 431]   board[cellIndex][stackPos][checkerState]
//                  index = cellIndex * 12 + stackPos * 4 + checkerState
//                  cellIndex   0..35  (allCoords() order: A1, B1 … F6)
//                  stackPos    0..2   (0 = bottom, 1 = middle, 2 = top)
//                  checkerState       (owner==='black' ? 2 : 0) | (frozen ? 1 : 0)
//   [432]        player-to-move is 'black'
//   [433 .. 468] pendingJump source coord (36 entries, indexed by coord index)
//   [469 .. 470] pendingJump firstJumpedOwner (469 = white, 470 = black)
//   [471 .. 578] pendingJump already-jumped placement by board stack slot
//
// CHECKER_H1 / CHECKER_H2 (separate 36-entry tables, generated with same streams):
//   [0 .. 17]    white checker ids  (white-01 → 0, white-18 → 17)
//   [18 .. 35]   black checker ids  (black-01 → 18, black-18 → 35)
//
// LEGACY_COORD_H1 / LEGACY_COORD_H2 (separate 36-entry tables):
//   Indexed by COORD_TO_IDX — used only for the visitedCoords legacy trail path.
//
// rng1 / rng2 are consumed during initialization and not reused afterwards.
// ---------------------------------------------------------------------------

const TABLE_SIZE = 579;
const PLAYER_OFFSET = 432;
const PENDING_SOURCE_OFFSET = 433;
const PENDING_OWNER_OFFSET = 469;
const PENDING_JUMPED_SLOT_OFFSET = 471;

/** Number of distinct checker ids in one game: 18 white (01–18) + 18 black (01–18). */
const MAX_CHECKER_ID = 36;

const rng1 = makeSplitmix32(0x1a2b3c4d);
const rng2 = makeSplitmix32(0xdeadbeef);

const TABLE_H1 = new Uint32Array(TABLE_SIZE);
const TABLE_H2 = new Uint32Array(TABLE_SIZE);

for (let i = 0; i < TABLE_SIZE; i++) {
  TABLE_H1[i] = rng1();
  TABLE_H2[i] = rng2();
}

/** Per-checker-id random values — indexed by checkerIdToIndex(). Replaces FNV-1a. */
const CHECKER_H1 = new Uint32Array(MAX_CHECKER_ID);
const CHECKER_H2 = new Uint32Array(MAX_CHECKER_ID);

for (let i = 0; i < MAX_CHECKER_ID; i++) {
  CHECKER_H1[i] = rng1();
  CHECKER_H2[i] = rng2();
}

/** Per-coord random values for the legacy visitedCoords trail path. */
const LEGACY_COORD_H1 = new Uint32Array(36);
const LEGACY_COORD_H2 = new Uint32Array(36);

for (let i = 0; i < 36; i++) {
  LEGACY_COORD_H1[i] = rng1();
  LEGACY_COORD_H2[i] = rng2();
}

// ---------------------------------------------------------------------------
// Static coord → index map (matches allCoords() order, built once)
// ---------------------------------------------------------------------------

const COORDS = allCoords();

/** coord string → 0-based cell index */
const COORD_TO_IDX: Record<string, number> = Object.create(null);
for (let i = 0; i < COORDS.length; i++) {
  COORD_TO_IDX[COORDS[i] as string] = i;
}

// ---------------------------------------------------------------------------
// Checker ID hashing
//
// Real game IDs are exactly 8 chars: "white-NN" or "black-NN", NN = 01..18
//   white-01 → table index 0,  white-18 → 17
//   black-01 → table index 18, black-18 → 35
//
// Fast path: length-8 IDs whose computed index falls in [0, MAX_CHECKER_ID)
//   are resolved by charCode arithmetic and CHECKER_H1/H2 table lookup.
//
// Fallback: any other ID (e.g. 3-digit test-factory IDs like "black-089")
//   is hashed deterministically with FNV-1a + Splitmix32 finalization.
//   This removes the lower-bit weakness of raw FNV-1a while staying
//   allocation-free and deterministic across invocations.
// ---------------------------------------------------------------------------

/** FNV-1a seed mixed through two independent Splitmix32 finalization rounds. */
function hashCheckerIdFallback(id: string): readonly [number, number] {
  let seed = 0x811c9dc5 >>> 0;
  for (let i = 0; i < id.length; i++) {
    seed = Math.imul(seed ^ id.charCodeAt(i), 0x01000193) >>> 0;
  }

  let z1 = (seed + 0x9e3779b9) | 0;
  z1 = Math.imul(z1 ^ (z1 >>> 16), 0x85ebca6b | 0);
  z1 = Math.imul(z1 ^ (z1 >>> 13), 0xc2b2ae35 | 0);
  const h1 = (z1 ^ (z1 >>> 16)) >>> 0;

  let z2 = ((seed ^ 0xdeadbeef) + 0x6c62272e) | 0; // different constant
  z2 = Math.imul(z2 ^ (z2 >>> 16), 0x85ebca6b | 0);
  z2 = Math.imul(z2 ^ (z2 >>> 13), 0xc2b2ae35 | 0);
  const h2 = (z2 ^ (z2 >>> 16)) >>> 0;

  return [h1, h2];
}

/** Returns the [h1, h2] Zobrist pair for a checker id string. */
function getCheckerHashPair(id: string): readonly [number, number] {
  if (id.length === 8) {
    // Fast path: real game ID format "white-NN" / "black-NN"
    const isBlack = id.charCodeAt(0) === 98; // ord('b')
    const hi = id.charCodeAt(6) - 48;
    const lo = id.charCodeAt(7) - 48;
    const idx = (isBlack ? 18 : 0) + hi * 10 + lo - 1;

    // Non-digit chars → idx is NaN → bounds check fails → fallback handles it
    if (idx >= 0 && idx < MAX_CHECKER_ID) {
      return [CHECKER_H1[idx] as number, CHECKER_H2[idx] as number];
    }
  }
  return hashCheckerIdFallback(id);
}

// ---------------------------------------------------------------------------
// FNV-1a fallback for visitedStateKeys (oldest legacy trail format only).
//
// visitedStateKeys are arbitrary strings from very old session payloads that
// predate jumpedCheckerIds.  This path is unreachable in newly generated game
// states; it exists only for hash stability when loading ancient sessions.
// ---------------------------------------------------------------------------

function hashLegacyStateKey(s: string): [number, number] {
  let h1 = 0x811c9dc5 >>> 0;
  let h2 = 0xc4e3d872 >>> 0;

  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);

    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x1000045d) >>> 0;
  }

  return [h1, h2];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type ZobristHashInput = Pick<EngineState, 'board' | 'currentPlayer'> & {
  pendingJump?: PendingJump | null;
};

/**
 * Returns a 16-char hex string (64-bit Zobrist hash) of the given position.
 *
 * Drop-in replacement for hashPosition in contexts that only need
 * intra-search identity (transposition table, PV reconstruction).
 */
export function zobristHash(state: ZobristHashInput): string {
  let h1 = 0;
  let h2 = 0;
  const pendingJump = state.pendingJump;
  const jumpedCheckerIdSet = pendingJump?.jumpedCheckerIds.length
    ? new Set(pendingJump.jumpedCheckerIds)
    : null;

  // --- Board: iterate every cell, every checker in the stack ---
  for (let ci = 0; ci < 36; ci++) {
    const { checkers } = getCell(state.board, COORDS[ci]);

    if (checkers.length > 3) {
      throw new Error(
        `zobristHash: stack height ${checkers.length} at ${COORDS[ci]} exceeds the maximum of 3`,
      );
    }
    for (let sp = 0; sp < checkers.length; sp++) {
      const ck = checkers[sp];
      const cs = (ck.owner === 'black' ? 2 : 0) | (ck.frozen ? 1 : 0);
      const idx = ci * 12 + sp * 4 + cs;

      h1 ^= TABLE_H1[idx] as number;
      h2 ^= TABLE_H2[idx] as number;

      if (jumpedCheckerIdSet?.has(ck.id)) {
        const jumpedSlotIndex = PENDING_JUMPED_SLOT_OFFSET + ci * 3 + sp;
        h1 ^= TABLE_H1[jumpedSlotIndex] as number;
        h2 ^= TABLE_H2[jumpedSlotIndex] as number;
      }
    }
  }

  // --- Side to move ---
  if (state.currentPlayer === 'black') {
    h1 ^= TABLE_H1[PLAYER_OFFSET] as number;
    h2 ^= TABLE_H2[PLAYER_OFFSET] as number;
  }

  // --- Pending jump ---
  const pj = pendingJump;
  if (pj) {
    // Source coordinate
    const si = COORD_TO_IDX[pj.source as string];

    if (si === undefined) {
      throw new Error(
        `zobristHash: unknown pending-jump source coord "${pj.source}"`,
      );
    }

    h1 ^= TABLE_H1[PENDING_SOURCE_OFFSET + si] as number;
    h2 ^= TABLE_H2[PENDING_SOURCE_OFFSET + si] as number;

    // firstJumpedOwner (one-bit owner distinction — see module comment)
    if (pj.firstJumpedOwner !== undefined) {
      const oi = pj.firstJumpedOwner === 'black' ? 1 : 0;

      h1 ^= TABLE_H1[PENDING_OWNER_OFFSET + oi] as number;
      h2 ^= TABLE_H2[PENDING_OWNER_OFFSET + oi] as number;
    }

    // Jumped-checker trail: XOR each item's hash order-independently.
    // Priority order intentionally mirrors getPendingJumpTrail()
    // in src/domain/model/pendingJump.ts — keep the two in sync.
    if (pj.jumpedCheckerIds.length) {
      // Current format: checker ids (e.g. "white-03") → Zobrist table lookup,
      // or deterministic fallback hash for non-standard ids (e.g. test-factory ids).
      for (const id of pj.jumpedCheckerIds) {
        const [ch1, ch2] = getCheckerHashPair(id);
        h1 ^= ch1;
        h2 ^= ch2;
      }
    } else if (pj.visitedCoords?.length) {
      // Legacy format: landing coordinates → Zobrist table lookup.
      for (const coord of pj.visitedCoords) {
        const vi = COORD_TO_IDX[coord as string];

        if (vi === undefined) {
          throw new Error(`zobristHash: unknown visitedCoord "${coord}"`);
        }

        h1 ^= LEGACY_COORD_H1[vi] as number;
        h2 ^= LEGACY_COORD_H2[vi] as number;
      }
    } else if (pj.visitedStateKeys?.length) {
      // Oldest legacy format: arbitrary strings → FNV-1a (unreachable in new games).
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          'zobristHash: falling back to FNV-1a for legacy visitedStateKeys trail',
        );
      }

      for (const key of pj.visitedStateKeys) {
        const [ih1, ih2] = hashLegacyStateKey(key);
        h1 ^= ih1;
        h2 ^= ih2;
      }
    }
  }

  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}
