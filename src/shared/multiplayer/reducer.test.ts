import { describe, expect, it } from 'vitest';

import {
  advanceEngineState,
  createInitialState,
  getLegalActions,
  type EngineState,
} from '@/domain';
import { RULE_DEFAULTS } from '@/domain/model/ruleConfig';
import {
  boardWithPieces,
  checker,
  gameStateWithBoard,
  withConfig,
} from '@/test/factories';

import {
  applyMatchCommand,
  canonicalJson,
  createAuthoritativeMatchState,
  hashMatchState,
  participantToMove,
} from './index';
import type { MatchCommandError } from './index';

function stripHistory(
  state: ReturnType<typeof createInitialState>,
): EngineState {
  return {
    board: state.board,
    currentPlayer: state.currentPlayer,
    moveNumber: state.moveNumber,
    pendingJump: state.pendingJump,
    positionCounts: state.positionCounts,
    status: state.status,
    victory: state.victory,
  };
}

describe('authoritative multiplayer reducer', () => {
  it('uses the exact local engine transition without history amplification', () => {
    let online = createAuthoritativeMatchState({
      format: 'single',
      rules: RULE_DEFAULTS,
      targetPoints: 100,
    });
    let local = stripHistory(createInitialState(RULE_DEFAULTS));

    for (let index = 0; index < 80 && local.status === 'active'; index += 1) {
      const action = getLegalActions(local, RULE_DEFAULTS)[0];

      if (!action) {
        break;
      }

      const actor = participantToMove(online);
      expect(actor).not.toBeNull();
      online = applyMatchCommand(online, actor!, {
        type: 'submitAction',
        action,
      }).state;
      local = advanceEngineState(local, action, RULE_DEFAULTS);

      expect(online.engine).toEqual(local);
      expect('history' in online.engine).toBe(false);
    }
  });

  it('rejects a valid move when it is submitted by the wrong participant', () => {
    const state = createAuthoritativeMatchState({
      format: 'single',
      rules: RULE_DEFAULTS,
      targetPoints: 100,
    });
    const action = getLegalActions(state.engine, state.rules)[0];

    expect(() =>
      applyMatchCommand(state, 'second', { type: 'submitAction', action }),
    ).toThrow(
      expect.objectContaining<Partial<MatchCommandError>>({
        reason: 'notYourTurn',
      }),
    );
  });

  it('applies a configured non-adjacent friendly transfer authoritatively', () => {
    const rules = withConfig({
      allowNonAdjacentFriendlyStackTransfer: true,
    });
    const game = gameStateWithBoard(
      boardWithPieces({
        A1: [checker('white'), checker('white')],
        F6: [checker('white'), checker('white')],
      }),
    );
    const state = {
      ...createAuthoritativeMatchState({
        format: 'single',
        rules,
        targetPoints: 1,
      }),
      engine: stripHistory(game),
    };

    const result = applyMatchCommand(state, 'first', {
      type: 'submitAction',
      action: {
        type: 'friendlyStackTransfer',
        source: 'A1',
        target: 'F6',
      },
    });

    expect(result.state.engine.board.A1.checkers).toHaveLength(1);
    expect(result.state.engine.board.F6.checkers).toHaveLength(3);
    expect(result.state.rules.allowNonAdjacentFriendlyStackTransfer).toBe(true);
  });

  it('produces a stable cryptographic hash independent of object key order', async () => {
    const left = { nested: { z: 1, a: true }, value: 'same' };
    const right = { value: 'same', nested: { a: true, z: 1 } };

    expect(canonicalJson(left)).toBe(canonicalJson(right));
    await expect(hashMatchState(left)).resolves.toBe(
      await hashMatchState(right),
    );
  });
});
