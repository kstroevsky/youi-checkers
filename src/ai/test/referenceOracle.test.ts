import { describe, expect, it } from 'vitest';

import {
  isReferenceOnlyCoverageV1,
  referenceOracleStateKeyV1,
  referenceOracleTranspositionKeyV1,
  runReferenceStrengthOracleV1,
} from '@/ai/referenceOracle';
import { getLegalActions } from '@/domain';
import {
  boardWithPieces,
  checker,
  gameStateWithBoard,
  withConfig,
} from '@/test/factories';

describe('ReferenceStrengthOracleV1', () => {
  const config = withConfig({ drawRule: 'threefold' });

  it('scores every root action at a common depth without mutating the root', () => {
    const state = gameStateWithBoard(
      boardWithPieces({
        B2: [checker('white')],
        E5: [checker('black')],
      }),
    );
    const before = structuredClone(state);
    const result = runReferenceStrengthOracleV1(state, config);

    expect(result.scores).toHaveLength(getLegalActions(state, config).length);
    expect(result.scores.map((entry) => entry.actionKey)).toEqual(
      result.scores
        .map((entry) => entry.actionKey)
        .slice()
        .sort(),
    );
    expect(isReferenceOnlyCoverageV1(result.coverage)).toBe(true);
    expect(state).toEqual(before);
  });

  it('separates otherwise equal states with materially different repetition contexts', () => {
    const state = gameStateWithBoard(
      boardWithPieces({ B2: [checker('white')], E5: [checker('black')] }),
    );
    const repeated = {
      ...state,
      positionCounts: { ...state.positionCounts, unrelated: 2 },
    };

    expect(referenceOracleStateKeyV1(state, config)).not.toBe(
      referenceOracleStateKeyV1(repeated, config),
    );
  });

  it('caps repetition counts at the decision-relevant value of two', () => {
    const state = gameStateWithBoard(
      boardWithPieces({ B2: [checker('white')], E5: [checker('black')] }),
      { positionCounts: { position: 2 } },
    );
    const overCounted = { ...state, positionCounts: { position: 7 } };

    expect(referenceOracleStateKeyV1(state, config)).toBe(
      referenceOracleStateKeyV1(overCounted, config),
    );
  });

  it('canonicalizes ordinary checker IDs but preserves pending-jump identity placement', () => {
    const first = gameStateWithBoard(
      boardWithPieces({
        B2: [checker('white', false, 'white-a')],
        C3: [checker('black', false, 'black-a')],
        D4: [checker('black', false, 'black-b')],
      }),
    );
    const renamed = gameStateWithBoard(
      boardWithPieces({
        B2: [checker('white', false, 'white-z')],
        C3: [checker('black', false, 'black-z')],
        D4: [checker('black', false, 'black-y')],
      }),
    );
    expect(referenceOracleStateKeyV1(first, config)).toBe(
      referenceOracleStateKeyV1(renamed, config),
    );

    const pendingFirst = {
      ...first,
      pendingJump: {
        firstJumpedOwner: 'black' as const,
        jumpedCheckerIds: ['black-a'],
        source: 'B2' as const,
      },
    };
    const pendingOtherPlacement = {
      ...first,
      pendingJump: {
        firstJumpedOwner: 'black' as const,
        jumpedCheckerIds: ['black-b'],
        source: 'B2' as const,
      },
    };
    expect(referenceOracleStateKeyV1(pendingFirst, config)).not.toBe(
      referenceOracleStateKeyV1(pendingOtherPlacement, config),
    );
  });

  it('includes requested depth in the transposition identity', () => {
    const state = gameStateWithBoard(
      boardWithPieces({ B2: [checker('white')], E5: [checker('black')] }),
    );
    expect(referenceOracleTranspositionKeyV1(state, 2, config)).not.toBe(
      referenceOracleTranspositionKeyV1(state, 3, config),
    );
  });

  it('does not define cache identities for terminal positions', () => {
    const terminal = gameStateWithBoard(boardWithPieces({}), {
      status: 'gameOver',
      victory: { type: 'homeField', winner: 'white' },
    });
    expect(() => referenceOracleStateKeyV1(terminal, config)).toThrow(
      /only for active states/u,
    );
  });
});
