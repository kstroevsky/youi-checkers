import { describe, expect, it } from 'vitest';

import {
  advanceEngineState,
  advanceGeneratedEngineState,
  advanceGeneratedEngineTransition,
  createInitialState,
  getLegalActions,
  hashPosition,
  hasLegalAction,
} from '@/domain';
import { withConfig } from '@/test/factories';
import type { EngineState } from '@/domain';
import {
  checkRepetitionVictoryByKey,
  checkVictory,
  checkVictoryWithPositionHash,
} from '@/domain/rules/victory';
import { createRandomPlayPerfState } from '../../../scripts/lateGamePerfFixtures';

function getPositionCountKeys(
  positionCounts: EngineState['positionCounts'],
): string[] {
  const keys = new Set<string>();
  let layer: object | null = positionCounts;

  while (layer !== null && layer !== Object.prototype) {
    for (const key of Object.keys(layer)) {
      keys.add(key);
    }

    layer = Object.getPrototypeOf(layer) as object | null;
  }

  return [...keys].sort();
}

function expectPositionCountsToMatch(
  actual: EngineState['positionCounts'],
  expected: EngineState['positionCounts'],
): void {
  const expectedKeys = Object.keys(expected).sort();

  expect(getPositionCountKeys(actual)).toEqual(expectedKeys);

  for (const key of expectedKeys) {
    expect(actual[key], key).toBe(expected[key]);
  }
}

describe('generated-action engine transition', () => {
  it('matches the validated transition across a deterministic game prefix', () => {
    const config = withConfig({ drawRule: 'threefold' });
    let state: EngineState = createInitialState(config);

    for (let ply = 0; ply < 10 && state.status === 'active'; ply += 1) {
      const actions = getLegalActions(state, config);

      expect(hasLegalAction(state, config)).toBe(actions.length > 0);

      for (const action of actions.slice(0, 16)) {
        const transition = advanceGeneratedEngineTransition(
          state,
          action,
          config,
        );
        const expectedState = advanceEngineState(state, action, config);

        expect(transition.state).toEqual(expectedState);
        expect(advanceGeneratedEngineState(state, action, config)).toEqual(
          expectedState,
        );
        expect(transition.events).toEqual([]);

        if (transition.state.status === 'active') {
          expect(transition.positionHash).toBe(hashPosition(transition.state));
        }
      }

      if (!actions.length) {
        break;
      }

      state = advanceEngineState(
        state,
        actions[Math.floor(actions.length / 2)],
        config,
      );
    }
  });

  it('keeps validation on the public transition boundary', () => {
    const config = withConfig();
    const state = createInitialState(config);

    expect(() =>
      advanceEngineState(
        state,
        { type: 'climbOne', source: 'F6', target: 'E5' },
        config,
      ),
    ).toThrow();
  });

  it('preserves exact transition semantics with search-only position-count overlays', () => {
    const config = withConfig({ drawRule: 'threefold' });
    let copiedState: EngineState = createInitialState(config);
    let overlayState: EngineState = createInitialState(config);

    for (let ply = 0; ply < 12 && copiedState.status === 'active'; ply += 1) {
      const actions = getLegalActions(copiedState, config);

      if (!actions.length) {
        break;
      }

      const action = actions[Math.floor(actions.length / 2)];
      const copied = advanceGeneratedEngineTransition(
        copiedState,
        action,
        config,
      );
      const overlaid = advanceGeneratedEngineTransition(
        overlayState,
        action,
        config,
        { positionCountStorage: 'overlay' },
      );
      const { positionCounts: copiedCounts, ...copiedRest } = copied.state;
      const { positionCounts: overlayCounts, ...overlayRest } = overlaid.state;

      expect(overlaid.positionHash).toBe(copied.positionHash);
      expect(overlayRest).toEqual(copiedRest);
      expectPositionCountsToMatch(overlayCounts, copiedCounts);
      expect(Object.getPrototypeOf(overlayCounts)).toBe(
        overlayState.positionCounts,
      );

      copiedState = copied.state;
      overlayState = overlaid.state;
    }
  });

  it('resolves an overlaid third occurrence exactly like copied counts', () => {
    const config = withConfig({ drawRule: 'threefold' });
    const initialState = createInitialState(config);
    const action = getLegalActions(initialState, config)[0];
    const probe = advanceGeneratedEngineTransition(
      initialState,
      action,
      config,
    );
    const nearRepetition = {
      ...initialState,
      positionCounts: {
        ...initialState.positionCounts,
        [probe.positionHash]: 2,
      },
    };
    const copied = advanceGeneratedEngineTransition(
      nearRepetition,
      action,
      config,
    );
    const overlaid = advanceGeneratedEngineTransition(
      nearRepetition,
      action,
      config,
      { positionCountStorage: 'overlay' },
    );

    expect(overlaid.state.victory).toEqual({ type: 'threefoldDraw' });
    expect(overlaid.state.victory).toEqual(copied.state.victory);
    expect(overlaid.state.status).toBe(copied.state.status);
    expectPositionCountsToMatch(
      overlaid.state.positionCounts,
      copied.state.positionCounts,
    );
  });

  it('reuses the exact repetition key without changing the draw outcome', () => {
    const config = withConfig({ drawRule: 'threefold' });
    const initialState = createInitialState(config);
    const positionHash = hashPosition(initialState);
    const state = {
      ...initialState,
      positionCounts: {
        ...initialState.positionCounts,
        [positionHash]: 3,
      },
    };
    const checked = checkVictoryWithPositionHash(state, config);

    expect(checked.positionHash).toBe(positionHash);
    expect(checked.victory).toEqual({ type: 'threefoldDraw' });
    expect(checked.victory).toEqual(checkVictory(state, config));
    expect(checkRepetitionVictoryByKey(state, config, positionHash)).toEqual(
      checked.victory,
    );
    expect(
      checkVictoryWithPositionHash(state, withConfig({ drawRule: 'none' })),
    ).toEqual({
      positionHash: null,
      victory: { type: 'none' },
    });
  });

  it('returns false for terminal states without generating actions', () => {
    const config = withConfig();
    const state = {
      ...createInitialState(config),
      status: 'gameOver' as const,
      victory: { type: 'threefoldDraw' as const },
    };

    expect(hasLegalAction(state, config)).toBe(false);
  });

  it('matches action availability across seeded positions and players', () => {
    const config = withConfig();
    const seeds = [1, 21, 0x1a2b3c, 0x4d5e6f];
    const turnCounts = [0, 1, 2, 5, 10, 20, 40, 80];

    for (const seed of seeds) {
      for (const turnCount of turnCounts) {
        const state = createRandomPlayPerfState(turnCount, config, seed);

        for (const currentPlayer of ['white', 'black'] as const) {
          const candidateState = {
            board: state.board,
            currentPlayer,
            pendingJump: null,
            status: state.status,
          };

          expect(
            hasLegalAction(candidateState, config),
            `seed=${seed}, turn=${turnCount}, player=${currentPlayer}`,
          ).toBe(getLegalActions(candidateState, config).length > 0);
        }
      }
    }
  });
});
