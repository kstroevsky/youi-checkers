import { describe, expect, it } from 'vitest';

import {
  solveWdlProofQueryV1,
  verifyWdlProofCertificateV1,
  wdlProofStateKeyV1,
} from '@/ai/test/wdlProof.node';
import { createHomeFieldWinState } from '@/ai/test/tacticalFixtures';
import {
  boardWithPieces,
  checker,
  gameStateWithBoard,
  withConfig,
} from '@/test/factories';

describe('WdlProofProtocolV1', () => {
  it('resolves terminal outcomes relative to the state player', () => {
    const state = gameStateWithBoard(boardWithPieces({}), {
      currentPlayer: 'black',
      status: 'gameOver',
      victory: { type: 'homeField', winner: 'white' },
    });
    const result = solveWdlProofQueryV1({
      config: withConfig(),
      queryId: 'terminal-loss',
      state,
    });
    expect(result.bounds).toEqual({ lower: 'loss', upper: 'loss' });
    expect(verifyWdlProofCertificateV1(result).valid).toBe(true);
    expect(() => wdlProofStateKeyV1(state, withConfig())).toThrow(
      /active nonterminal/u,
    );
  });

  it('returns unknown rather than heuristic WDL when its state cap is exhausted', () => {
    const state = gameStateWithBoard(
      boardWithPieces({ B2: [checker('white')], E5: [checker('black')] }),
    );
    const result = solveWdlProofQueryV1({
      config: withConfig(),
      limits: {
        maxMemoryBytes: 1_000_000,
        maxMilliseconds: 1_000,
        maxStates: 1,
      },
      queryId: 'bounded',
      state,
    });
    expect(result.exhaustion).toBe('states');
    expect(result.source).toBe('unknown');
    expect(result.bounds).toEqual({ lower: 'loss', upper: 'win' });
    expect(result.certificate).toBeNull();
  });

  it('produces a replay-valid certificate for a proved immediate win', () => {
    const config = withConfig();
    const result = solveWdlProofQueryV1({
      config,
      limits: {
        maxMemoryBytes: 10_000_000,
        maxMilliseconds: 1_000,
        maxStates: 10_000,
      },
      queryId: 'immediate-win',
      state: createHomeFieldWinState(),
    });
    expect(result.bounds).toEqual({ lower: 'win', upper: 'win' });
    expect(
      result.certificate?.stateOutcomes.every(
        (record) => record.state.status === 'active',
      ),
    ).toBe(true);
    expect(
      result.certificate?.stateOutcomes.some((record) =>
        record.edges.some(
          (edge) => edge.childKey === null && edge.terminalOutcome === 'win',
        ),
      ),
    ).toBe(true);
    expect(verifyWdlProofCertificateV1(result, config)).toEqual({
      errors: [],
      valid: true,
    });
  });
});
