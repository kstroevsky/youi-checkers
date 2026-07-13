import { describe, expect, it } from 'vitest';

import { zobristHash } from '@/ai/search/zobristHash';
import { createInitialBoard } from '@/domain/generators/createInitialState';
import { cloneBoardStructure, createEmptyBoard } from '@/domain/model/board';
import { allCoords } from '@/domain/model/coordinates';
import type { ZobristHashInput } from '@/ai/search/zobristHash';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function initialState(
  overrides: Partial<ZobristHashInput> = {},
): ZobristHashInput {
  return {
    board: createInitialBoard(),
    currentPlayer: 'white',
    pendingJump: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Format
// ---------------------------------------------------------------------------

describe('zobristHash — format', () => {
  it('returns a 16-character lowercase hex string', () => {
    const hash = zobristHash(initialState());
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is stable across repeated calls on the same state', () => {
    const state = initialState();
    expect(zobristHash(state)).toBe(zobristHash(state));
  });

  it('produces the same hash when state is reconstructed identically', () => {
    expect(zobristHash(initialState())).toBe(zobristHash(initialState()));
  });
});

// ---------------------------------------------------------------------------
// Player sensitivity
// ---------------------------------------------------------------------------

describe('zobristHash — player sensitivity', () => {
  it('differs between white-to-move and black-to-move', () => {
    const white = zobristHash(initialState({ currentPlayer: 'white' }));
    const black = zobristHash(initialState({ currentPlayer: 'black' }));
    expect(white).not.toBe(black);
  });
});

// ---------------------------------------------------------------------------
// Board sensitivity
// ---------------------------------------------------------------------------

describe('zobristHash — board sensitivity', () => {
  it('differs when a checker is frozen vs unfrozen', () => {
    const coord = allCoords()[0]; // A1

    const boardUnfrozen = createInitialBoard();
    const boardFrozen = createInitialBoard();
    // Mutate only the independent copy
    boardFrozen[coord].checkers[0] = {
      ...boardFrozen[coord].checkers[0],
      frozen: true,
    };

    const base = zobristHash(initialState({ board: boardUnfrozen }));
    const modified = zobristHash(initialState({ board: boardFrozen }));
    expect(base).not.toBe(modified);
  });

  it('differs when a checker changes cell (simulated move)', () => {
    const boardA = createInitialBoard();

    // Move checker from first white cell (A1) to its neighbour by manually
    // adjusting the board — this is intentionally low-level to keep the test
    // independent of move-application logic.
    const coords = allCoords();
    const boardB = cloneBoardStructure(boardA);
    const sourceCoord = coords[0]; // A1
    const targetCoord = coords[6]; // A4 (first black cell — empty it first)

    // Clear target, then move top checker of source there
    const checker = boardA[sourceCoord].checkers[0];
    boardB[sourceCoord] = { checkers: [] };
    boardB[targetCoord] = { checkers: [{ ...checker }] };

    const hashA = zobristHash(initialState({ board: boardA }));
    const hashB = zobristHash(initialState({ board: boardB }));
    expect(hashA).not.toBe(hashB);
  });
});

// ---------------------------------------------------------------------------
// PendingJump sensitivity
// ---------------------------------------------------------------------------

describe('zobristHash — pendingJump sensitivity', () => {
  it('differs when pendingJump is present vs absent', () => {
    const withoutJump = zobristHash(initialState());
    const withJump = zobristHash(
      initialState({
        pendingJump: {
          source: 'A1',
          jumpedCheckerIds: [],
          firstJumpedOwner: undefined,
        },
      }),
    );
    expect(withoutJump).not.toBe(withJump);
  });

  it('differs for different pendingJump sources', () => {
    const jumpA = zobristHash(
      initialState({
        pendingJump: {
          source: 'A1',
          jumpedCheckerIds: [],
          firstJumpedOwner: undefined,
        },
      }),
    );
    const jumpB = zobristHash(
      initialState({
        pendingJump: {
          source: 'B1',
          jumpedCheckerIds: [],
          firstJumpedOwner: undefined,
        },
      }),
    );
    expect(jumpA).not.toBe(jumpB);
  });

  it('differs for different firstJumpedOwner values', () => {
    const base = { source: 'C3' as const, jumpedCheckerIds: [] };
    const jumpWhite = zobristHash(
      initialState({ pendingJump: { ...base, firstJumpedOwner: 'white' } }),
    );
    const jumpBlack = zobristHash(
      initialState({ pendingJump: { ...base, firstJumpedOwner: 'black' } }),
    );
    expect(jumpWhite).not.toBe(jumpBlack);
  });

  it('is order-independent for jumpedCheckerIds (set semantics)', () => {
    const ids = ['white-01', 'white-02', 'white-03'];
    const base = { source: 'C3' as const, firstJumpedOwner: 'white' as const };

    const hashABC = zobristHash(
      initialState({
        pendingJump: {
          ...base,
          jumpedCheckerIds: ['white-01', 'white-02', 'white-03'],
        },
      }),
    );
    const hashCAB = zobristHash(
      initialState({
        pendingJump: {
          ...base,
          jumpedCheckerIds: ['white-03', 'white-01', 'white-02'],
        },
      }),
    );
    const hashBCA = zobristHash(
      initialState({
        pendingJump: {
          ...base,
          jumpedCheckerIds: ['white-02', 'white-03', 'white-01'],
        },
      }),
    );

    expect(hashABC).toBe(hashCAB);
    expect(hashABC).toBe(hashBCA);

    // Sanity: different id sets do differ
    const hashAB = zobristHash(
      initialState({
        pendingJump: { ...base, jumpedCheckerIds: ids.slice(0, 2) },
      }),
    );
    expect(hashABC).not.toBe(hashAB);
  });

  it('differs when jumpedCheckerIds differ', () => {
    const base = { source: 'C3' as const, firstJumpedOwner: 'white' as const };
    const hash1 = zobristHash(
      initialState({
        pendingJump: { ...base, jumpedCheckerIds: ['white-01'] },
      }),
    );
    const hash2 = zobristHash(
      initialState({
        pendingJump: { ...base, jumpedCheckerIds: ['white-02'] },
      }),
    );
    expect(hash1).not.toBe(hash2);
  });

  it('tracks where an already-jumped checker is located', () => {
    const boardA = createEmptyBoard();
    boardA.C3 = {
      checkers: [{ id: 'white-01', owner: 'white', frozen: false }],
    };
    boardA.D3 = {
      checkers: [{ id: 'black-01', owner: 'black', frozen: false }],
    };
    boardA.C4 = {
      checkers: [{ id: 'black-02', owner: 'black', frozen: false }],
    };

    const boardB = createEmptyBoard();
    boardB.C3 = {
      checkers: [{ id: 'white-01', owner: 'white', frozen: false }],
    };
    boardB.D3 = {
      checkers: [{ id: 'black-02', owner: 'black', frozen: false }],
    };
    boardB.C4 = {
      checkers: [{ id: 'black-01', owner: 'black', frozen: false }],
    };

    const pendingJump = {
      source: 'C3' as const,
      jumpedCheckerIds: ['black-01'],
      firstJumpedOwner: 'black' as const,
    };

    expect(zobristHash(initialState({ board: boardA, pendingJump }))).not.toBe(
      zobristHash(initialState({ board: boardB, pendingJump })),
    );
  });

  it('keeps checker ids interchangeable outside a pending jump', () => {
    const boardA = createEmptyBoard();
    boardA.D3 = {
      checkers: [{ id: 'black-01', owner: 'black', frozen: false }],
    };
    boardA.C4 = {
      checkers: [{ id: 'black-02', owner: 'black', frozen: false }],
    };

    const boardB = createEmptyBoard();
    boardB.D3 = {
      checkers: [{ id: 'black-02', owner: 'black', frozen: false }],
    };
    boardB.C4 = {
      checkers: [{ id: 'black-01', owner: 'black', frozen: false }],
    };

    expect(zobristHash(initialState({ board: boardA }))).toBe(
      zobristHash(initialState({ board: boardB })),
    );
  });
});

// ---------------------------------------------------------------------------
// Guard / error paths
// ---------------------------------------------------------------------------

describe('zobristHash — guards', () => {
  it('hashes non-standard checker ids (e.g. test-factory 3-digit) consistently', () => {
    const base = { source: 'C3' as const, firstJumpedOwner: 'white' as const };
    const hashA = zobristHash(
      initialState({
        pendingJump: { ...base, jumpedCheckerIds: ['black-089'] },
      }),
    );
    const hashB = zobristHash(
      initialState({
        pendingJump: { ...base, jumpedCheckerIds: ['black-089'] },
      }),
    );
    // Same id → same hash
    expect(hashA).toBe(hashB);
    // Different non-standard id → different hash
    const hashC = zobristHash(
      initialState({
        pendingJump: { ...base, jumpedCheckerIds: ['black-090'] },
      }),
    );
    expect(hashA).not.toBe(hashC);
  });

  it('throws on an unknown pendingJump source coord', () => {
    expect(() =>
      zobristHash(
        initialState({
          pendingJump: {
            source: 'Z9' as never,
            jumpedCheckerIds: [],
            firstJumpedOwner: undefined,
          },
        }),
      ),
    ).toThrow('unknown pending-jump source coord');
  });
});

// ---------------------------------------------------------------------------
// Uniqueness across consecutive positions
// ---------------------------------------------------------------------------

describe('zobristHash — uniqueness', () => {
  it('produces distinct hashes for every cell as pendingJump source', () => {
    const coords = allCoords(); // 36 coords
    const hashes = coords.map((source) =>
      zobristHash(
        initialState({
          pendingJump: {
            source,
            jumpedCheckerIds: [],
            firstJumpedOwner: undefined,
          },
        }),
      ),
    );
    const unique = new Set(hashes);
    expect(unique.size).toBe(coords.length);
  });

  it('produces distinct hashes for each square occupied by one isolated checker', () => {
    // Place a single white checker at each of the 36 cells in turn
    const coords = allCoords();
    const baseChecker = {
      id: 'white-01',
      owner: 'white' as const,
      frozen: false,
    };
    const hashes = coords.map((coord) => {
      const board = Object.fromEntries(
        coords.map((c) => [c, { checkers: [] }]),
      ) as unknown as ReturnType<typeof createInitialBoard>;
      board[coord] = { checkers: [{ ...baseChecker }] };
      return zobristHash(initialState({ board }));
    });
    const unique = new Set(hashes);
    expect(unique.size).toBe(coords.length);
  });
});
