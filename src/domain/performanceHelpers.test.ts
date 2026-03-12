import { describe, expect, it } from 'vitest';

import { DIRECTION_VECTORS } from '@/domain/model/constants';
import {
  coordToIndices,
  getAdjacentCoord,
  getDirectionBetween,
  getJumpDirection,
  getJumpLandingCoord,
} from '@/domain/model/coordinates';
import { hashBoard, hashPosition } from '@/domain/model/hash';
import {
  applyAction,
  createJumpStateKey,
  createInitialState,
  getLegalActions,
  getLegalActionsForCell,
} from '@/domain';
import { boardWithPieces, checker, gameStateWithBoard, resetFactoryIds, withConfig } from '@/test/factories';

describe('performance-oriented helpers', () => {
  it('keeps coordinate lookups aligned with movement semantics', () => {
    expect(coordToIndices('C4')).toEqual({ fileIndex: 2, rankIndex: 3 });
    expect(getAdjacentCoord('C3', DIRECTION_VECTORS[4])).toBe('D3');
    expect(getJumpLandingCoord('C3', DIRECTION_VECTORS[7])).toBe('E5');
    expect(getDirectionBetween('C3', 'D4')).toEqual(DIRECTION_VECTORS[7]);
    expect(getJumpDirection('A1', 'C3')).toEqual(DIRECTION_VECTORS[7]);
  });

  it('returns stable board and position hashes across repeated calls', () => {
    resetFactoryIds();
    const board = boardWithPieces({
      A1: [checker('white')],
      B2: [checker('black')],
    });
    const state = gameStateWithBoard(board);

    expect(hashBoard(board)).toBe(hashBoard(board));
    expect(hashPosition(state)).toBe(hashPosition(state));
  });

  it('keeps jump-state hashes sensitive to mutable board changes', () => {
    resetFactoryIds();
    const board = boardWithPieces({
      A1: [checker('white')],
      B2: [checker('black')],
    });
    const firstKey = createJumpStateKey('A1', board);

    board.C3.checkers = [checker('white')];

    expect(createJumpStateKey('A1', board)).not.toBe(firstKey);
  });

  it('keeps selectable-coordinate scans aligned with per-cell legal action generation', () => {
    const config = withConfig();
    const initialState = createInitialState(config);
    const selectableFromActions = Object.keys(initialState.board).filter((coord) =>
      getLegalActionsForCell(initialState, coord as keyof typeof initialState.board, config).length > 0,
    );

    expect(selectableFromActions).toHaveLength(18);
    expect(selectableFromActions.every((coord) => /[123]$/.test(coord))).toBe(true);
  });

  it('keeps jump-continuation scans focused on the forced source cell', () => {
    resetFactoryIds();
    const config = withConfig();
    const jumpState = gameStateWithBoard(
      boardWithPieces({
        A1: [checker('white')],
        B2: [checker('black')],
        D4: [checker('black')],
      }),
    );
    const afterFirstJump = applyAction(
      jumpState,
      {
        type: 'jumpSequence',
        source: 'A1',
        path: ['C3'],
      },
      config,
    );
    const selectableFromActions = Object.keys(afterFirstJump.board).filter((coord) =>
      getLegalActionsForCell(afterFirstJump, coord as keyof typeof afterFirstJump.board, config).length > 0,
    );

    expect(getLegalActions(createInitialState(config), config).length).toBeGreaterThan(0);
    expect(getLegalActions(afterFirstJump, config).length).toBeGreaterThan(0);
    expect(selectableFromActions).toEqual(['C3']);
  });
});
