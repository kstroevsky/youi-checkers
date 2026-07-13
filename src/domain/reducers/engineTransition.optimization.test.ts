import { describe, expect, it } from 'vitest';

import {
  advanceEngineState,
  advanceGeneratedEngineState,
  createInitialState,
  getLegalActions,
  hasLegalAction,
} from '@/domain';
import { withConfig } from '@/test/factories';
import type { EngineState } from '@/domain';

describe('generated-action engine transition', () => {
  it('matches the validated transition across a deterministic game prefix', () => {
    const config = withConfig({ drawRule: 'threefold' });
    let state: EngineState = createInitialState(config);

    for (let ply = 0; ply < 10 && state.status === 'active'; ply += 1) {
      const actions = getLegalActions(state, config);

      expect(hasLegalAction(state, config)).toBe(actions.length > 0);

      for (const action of actions.slice(0, 16)) {
        expect(advanceGeneratedEngineState(state, action, config)).toEqual(
          advanceEngineState(state, action, config),
        );
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

  it('returns false for terminal states without generating actions', () => {
    const config = withConfig();
    const state = {
      ...createInitialState(config),
      status: 'gameOver' as const,
      victory: { type: 'threefoldDraw' as const },
    };

    expect(hasLegalAction(state, config)).toBe(false);
  });
});
