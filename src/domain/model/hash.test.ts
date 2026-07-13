import { describe, expect, it } from 'vitest';

import { createEmptyBoard } from '@/domain/model/board';
import { hashPosition } from '@/domain/model/hash';
import type { EngineState } from '@/domain/model/types';
import { getLegalActions } from '@/domain/rules/moveGeneration/targetDiscovery';

function pendingJumpState(swapped: boolean): EngineState {
  const board = createEmptyBoard();
  board.C3 = {
    checkers: [{ id: 'white-01', owner: 'white', frozen: false }],
  };
  board.D3 = {
    checkers: [
      { id: swapped ? 'black-02' : 'black-01', owner: 'black', frozen: false },
    ],
  };
  board.C4 = {
    checkers: [
      { id: swapped ? 'black-01' : 'black-02', owner: 'black', frozen: false },
    ],
  };

  return {
    board,
    currentPlayer: 'white',
    moveNumber: 1,
    pendingJump: {
      source: 'C3',
      jumpedCheckerIds: ['black-01'],
      firstJumpedOwner: 'black',
    },
    positionCounts: {},
    status: 'active',
    victory: { type: 'none' },
  };
}

describe('hashPosition — pending-jump semantic identity', () => {
  it('distinguishes states with different legal continuations', () => {
    const stateA = pendingJumpState(false);
    const stateB = pendingJumpState(true);

    const jumpsA = getLegalActions(stateA)
      .filter((action) => action.type === 'jumpSequence')
      .map((action) => `${action.source}:${action.path.join('>')}`);
    const jumpsB = getLegalActions(stateB)
      .filter((action) => action.type === 'jumpSequence')
      .map((action) => `${action.source}:${action.path.join('>')}`);

    expect(jumpsA).toEqual(['C3:C5']);
    expect(jumpsB).toEqual(['C3:E3']);
    expect(hashPosition(stateA)).not.toBe(hashPosition(stateB));
  });

  it('keeps checker ids interchangeable when no jump is pending', () => {
    const stateA = { ...pendingJumpState(false), pendingJump: null };
    const stateB = { ...pendingJumpState(true), pendingJump: null };

    expect(hashPosition(stateA)).toBe(hashPosition(stateB));
  });
});
