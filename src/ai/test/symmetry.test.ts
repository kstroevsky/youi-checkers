import { describe, expect, it } from 'vitest';

import {
  mirrorActionHorizontally,
  mirrorGameStateHorizontally,
} from '@/ai/test/symmetry';
import { createInitialState, getLegalActions } from '@/domain';
import { withConfig } from '@/test/factories';

function serialize(
  action: Parameters<typeof mirrorActionHorizontally>[0],
): string {
  if (action.type === 'manualUnfreeze') return `${action.type}:${action.coord}`;
  if (action.type === 'jumpSequence') {
    return `${action.type}:${action.source}:${action.path.join('>')}`;
  }
  return `${action.type}:${action.source}:${action.target}`;
}

describe('AI measurement symmetry fixtures', () => {
  it('maps legal actions exactly onto a horizontal mirror', () => {
    const ruleConfig = withConfig();
    const state = createInitialState(ruleConfig);
    const mirrored = mirrorGameStateHorizontally(state);
    const expected = getLegalActions(state, ruleConfig)
      .map(mirrorActionHorizontally)
      .map(serialize)
      .sort();
    const actual = getLegalActions(mirrored, ruleConfig).map(serialize).sort();

    expect(actual).toEqual(expected);
  });

  it('is an involution for current board and legal-action semantics', () => {
    const ruleConfig = withConfig();
    const state = createInitialState(ruleConfig);
    const twice = mirrorGameStateHorizontally(
      mirrorGameStateHorizontally(state),
    );

    expect(twice.board).toEqual(state.board);
    expect(getLegalActions(twice, ruleConfig).map(serialize).sort()).toEqual(
      getLegalActions(state, ruleConfig).map(serialize).sort(),
    );
  });
});
