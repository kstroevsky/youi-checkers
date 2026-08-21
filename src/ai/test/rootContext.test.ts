import { describe, expect, it } from 'vitest';

import {
  assertCompleteParticipationHistory,
  capRepetitionCounts,
  createCompleteAiRootContext,
  createUnavailableAiRootContext,
  replayAiRootContext,
} from '@/ai/test/rootContext';
import {
  applyAction,
  createInitialState,
  getLegalActions,
  hashPosition,
} from '@/domain';
import { withConfig } from '@/test/factories';

function playFirstLegal(plies: number) {
  const config = withConfig({ drawRule: 'threefold' });
  let state = createInitialState(config);
  for (
    let index = 0;
    index < plies && state.status !== 'gameOver';
    index += 1
  ) {
    const action = getLegalActions(state, config)[0];
    if (!action) break;
    state = applyAction(state, action, config);
  }
  return { config, state };
}

describe('AiRootContextV1', () => {
  it('retains all short-game history and replays the visible state', () => {
    const { config, state } = playFirstLegal(8);
    const context = createCompleteAiRootContext(state);

    expect(context.historyPrelude).toHaveLength(state.history.length);
    expect(hashPosition(replayAiRootContext(context, config))).toBe(
      hashPosition(state),
    );
    expect(() => assertCompleteParticipationHistory(context)).not.toThrow();
  });

  it('retains at least ten same-player actions and intervening chronology', () => {
    const { config, state } = playFirstLegal(30);
    const context = createCompleteAiRootContext(state);
    const prelude = context.historyPrelude ?? [];

    expect(
      prelude.filter((record) => record.actor === 'white').length,
    ).toBeGreaterThanOrEqual(10);
    expect(
      prelude.filter((record) => record.actor === 'black').length,
    ).toBeGreaterThanOrEqual(10);
    expect(hashPosition(replayAiRootContext(context, config))).toBe(
      hashPosition(state),
    );
  });

  it('caps repetition identity at two and distinguishes different contexts', () => {
    expect(capRepetitionCounts({ a: 1, b: 2, c: 9, ignored: 0 })).toEqual({
      a: 1,
      b: 2,
      c: 2,
    });
  });

  it('marks an engine-only root as unavailable instead of inventing history', () => {
    const config = withConfig();
    const state = createInitialState(config);
    const engineOnly = {
      board: state.board,
      currentPlayer: state.currentPlayer,
      moveNumber: state.moveNumber,
      pendingJump: state.pendingJump,
      positionCounts: state.positionCounts,
      status: state.status,
      victory: state.victory,
    };
    const context = createUnavailableAiRootContext(engineOnly);

    expect(context).toMatchObject({
      historyPrelude: null,
      historyStatus: 'unavailable',
      positionCountsBeforePrelude: null,
      repetitionStatus: 'unavailable',
    });
    expect(() => replayAiRootContext(context, config)).toThrow(
      'not fully replayable',
    );
  });
});
