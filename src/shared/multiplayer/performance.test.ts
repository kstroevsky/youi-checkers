import { describe, expect, it } from 'vitest';

import { createInitialState, getLegalActions, runGameCommand } from '@/domain';
import { RULE_DEFAULTS } from '@/domain/model/ruleConfig';

import {
  applyMatchCommand,
  createAuthoritativeMatchState,
  participantToMove,
  type CommittedMatchCommand,
} from './index';

describe('multiplayer payload efficiency', () => {
  it('does not amplify authoritative state with per-turn snapshots', () => {
    let online = createAuthoritativeMatchState({
      format: 'single',
      rules: RULE_DEFAULTS,
      targetPoints: 100,
    });
    let local = createInitialState(RULE_DEFAULTS);

    for (let index = 0; index < 30 && local.status === 'active'; index += 1) {
      const action = getLegalActions(local, RULE_DEFAULTS)[0];
      const actor = participantToMove(online);
      if (!action || !actor) break;

      online = applyMatchCommand(online, actor, {
        action,
        type: 'submitAction',
      }).state;
      local = runGameCommand(
        local,
        { action, type: 'submitAction' },
        RULE_DEFAULTS,
      ).state;
    }

    const authoritativeBytes = JSON.stringify(online).length;
    const historyBytes = JSON.stringify(local).length;

    expect(authoritativeBytes).toBeLessThan(historyBytes * 0.2);
    expect(JSON.stringify(online)).not.toContain('beforeState');
    expect(JSON.stringify(online)).not.toContain('afterState');
  });

  it('keeps normal commit broadcasts board-free and sub-kilobyte', () => {
    const state = createAuthoritativeMatchState({
      format: 'single',
      rules: RULE_DEFAULTS,
      targetPoints: 100,
    });
    const action = getLegalActions(state.engine, state.rules)[0];
    const commit: CommittedMatchCommand = {
      actor: 'first',
      command: { action, type: 'submitAction' },
      commandId: 'command-12345678',
      revision: 1,
      stateHash: 'a'.repeat(43),
    };
    const payload = JSON.stringify({ commit, type: 'committed' });

    expect(payload.length).toBeLessThan(1024);
    expect(payload).not.toContain('board');
    expect(payload).not.toContain('positionCounts');
  });
});
