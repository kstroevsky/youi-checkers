import { createProgressSnapshot } from '@/ai/risk';
import { actionKey } from '@/ai/search/shared';
import { getStrategicIntent } from '@/ai/strategy';
import {
  chooseIntuitiveActionV1,
  type IntuitiveCalibrationV1,
} from '@/ai/test/intuitivePolicy';
import type { WdlProofResultV1 } from '@/ai/test/wdlProof.node';
import { wdlProofStateKeyV1 } from '@/ai/test/wdlProof.node';
import {
  advanceGeneratedEngineState,
  getLegalActions,
  getScoreSummary,
  withRuleDefaults,
  type EngineState,
  type Player,
  type RuleConfig,
  type TurnAction,
} from '@/domain';

export type SemanticHorizonV1 = 1 | 4 | 8;
export type SemanticRolloutSnapshotV1 = {
  horizon: SemanticHorizonV1;
  opponentReadinessDelta: number;
  outcome: { draw: number; loss: number; unknown: number; win: number };
  ownReadinessDelta: number;
  replyClassCountNormalized: number;
  state: EngineState;
  terminalCarriedForward: boolean;
};
export type SemanticActionRolloutV1 = {
  actionKey: string;
  horizons: Record<SemanticHorizonV1, SemanticRolloutSnapshotV1[]>;
  overflowCount: number;
  rolloutCount: number;
};

function opponent(player: Player): Player {
  return player === 'white' ? 'black' : 'white';
}
function readiness(state: EngineState, player: Player): number {
  const progress = createProgressSnapshot(state);
  return Math.max(
    progress.homeFieldProgress[player],
    progress.sixStackProgress[player],
  );
}
function outcomeVector(
  state: EngineState,
  rootPlayer: Player,
  config: RuleConfig,
  snapshot: ReadonlyMap<string, WdlProofResultV1>,
) {
  if (state.status === 'gameOver') {
    if (!('winner' in state.victory))
      return { draw: 1, loss: 0, unknown: 0, win: 0 };
    return state.victory.winner === rootPlayer
      ? { draw: 0, loss: 0, unknown: 0, win: 1 }
      : { draw: 0, loss: 1, unknown: 0, win: 0 };
  }
  const proof = snapshot.get(wdlProofStateKeyV1(state, config));
  if (!proof || proof.bounds.lower !== proof.bounds.upper)
    return { draw: 0, loss: 0, unknown: 1, win: 0 };
  let value = proof.bounds.lower;
  if (state.currentPlayer !== rootPlayer)
    value = value === 'win' ? 'loss' : value === 'loss' ? 'win' : 'draw';
  return {
    draw: value === 'draw' ? 1 : 0,
    loss: value === 'loss' ? 1 : 0,
    unknown: 0,
    win: value === 'win' ? 1 : 0,
  };
}

/** Forces every root action and shares exogenous uniforms across its rollouts. */
export function measureSemanticFutureChoicesV1({
  calibration,
  config: configInput,
  lineageId,
  proofSnapshot,
  root,
  rolloutCount,
  runSeed,
}: {
  calibration: IntuitiveCalibrationV1;
  config: Partial<RuleConfig>;
  lineageId: string;
  proofSnapshot: ReadonlyMap<string, WdlProofResultV1>;
  root: EngineState;
  rolloutCount: number;
  runSeed: string;
}): SemanticActionRolloutV1[] {
  const config = withRuleDefaults(configInput);
  const rootPlayer = root.currentPlayer;
  const rootOwn = readiness(root, rootPlayer);
  const rootOpponent = readiness(root, opponent(rootPlayer));
  return getLegalActions(root, config)
    .slice()
    .sort((left, right) => actionKey(left).localeCompare(actionKey(right)))
    .map((forcedAction: TurnAction) => {
      const horizons: SemanticActionRolloutV1['horizons'] = {
        1: [],
        4: [],
        8: [],
      };
      let overflowCount = 0;
      for (let replicate = 0; replicate < rolloutCount; replicate += 1) {
        let state = advanceGeneratedEngineState(root, forcedAction, config);
        let terminalAt: number | null = state.status === 'gameOver' ? 1 : null;
        for (let committed = 1; committed <= 8; committed += 1) {
          if ([1, 4, 8].includes(committed)) {
            const legalCount = getLegalActions(state, config).length;
            horizons[committed as SemanticHorizonV1].push({
              horizon: committed as SemanticHorizonV1,
              opponentReadinessDelta:
                readiness(state, opponent(rootPlayer)) - rootOpponent,
              outcome: outcomeVector(state, rootPlayer, config, proofSnapshot),
              ownReadinessDelta: readiness(state, rootPlayer) - rootOwn,
              replyClassCountNormalized: Math.min(1, legalCount / 16),
              state: structuredClone(state),
              terminalCarriedForward:
                terminalAt !== null && terminalAt < committed,
            });
          }
          if (committed === 8 || state.status === 'gameOver') continue;
          const decision = chooseIntuitiveActionV1({
            calibration,
            config,
            rngKey: {
              lineageId,
              purpose: 'semanticRollout',
              replicate,
              runSeed,
              step: committed,
              variant: 'orbit-shared',
            },
            state,
          });
          if (!decision.action) {
            overflowCount += 1;
            break;
          }
          state = advanceGeneratedEngineState(state, decision.action, config);
          if (state.status === 'gameOver' && terminalAt === null)
            terminalAt = committed + 1;
        }
      }
      return {
        actionKey: actionKey(forcedAction),
        horizons,
        overflowCount,
        rolloutCount,
      };
    });
}

export type SemanticFutureSignatureV1 = {
  constrainedOutcomeClass: 'draw' | 'loss' | 'uncertain' | 'unknown' | 'win';
  opponentEffectClass: 'block' | 'enable' | 'neutral';
  ownProgressClass: 'advance' | 'neutral' | 'regress';
  phase: 'conversion' | 'opening' | 'transport';
  repetitionRiskBitset: string[];
  strategicIntent: 'home' | 'hybrid' | 'sixStack' | 'unknown';
  structuralCounterplayClass: '0' | '1' | '2' | '3+';
  terminalConversionClass:
    | 'mixedTerminal'
    | 'nearConversion'
    | 'nonterminal'
    | 'terminal';
};

export function classifySemanticFutureV1(
  snapshots: SemanticRolloutSnapshotV1[],
): SemanticFutureSignatureV1 {
  if (!snapshots.length)
    throw new Error('Semantic classification requires rollouts.');
  const mean = (select: (snapshot: SemanticRolloutSnapshotV1) => number) =>
    snapshots.reduce((sum, snapshot) => sum + select(snapshot), 0) /
    snapshots.length;
  const own = mean((snapshot) => snapshot.ownReadinessDelta);
  const opp = mean((snapshot) => snapshot.opponentReadinessDelta);
  const state = snapshots[0].state;
  const summary = getScoreSummary(state);
  const conversion =
    summary.homeFieldSingles.white >= 8 ||
    summary.homeFieldSingles.black >= 8 ||
    summary.controlledHomeRowHeightThreeStacks.white >= 2 ||
    summary.controlledHomeRowHeightThreeStacks.black >= 2;
  const emptyCells = Object.values(state.board).filter(
    (cell) => cell.checkers.length === 0,
  ).length;
  const outcome = {
    draw: mean((snapshot) => snapshot.outcome.draw),
    loss: mean((snapshot) => snapshot.outcome.loss),
    unknown: mean((snapshot) => snapshot.outcome.unknown),
    win: mean((snapshot) => snapshot.outcome.win),
  };
  const terminalMass =
    snapshots.filter((snapshot) => snapshot.state.status === 'gameOver')
      .length / snapshots.length;
  const replies = Math.floor(
    snapshots
      .map((snapshot) => snapshot.replyClassCountNormalized * 16)
      .sort((left, right) => left - right)[
      Math.floor((snapshots.length - 1) / 2)
    ],
  );
  const intent = getStrategicIntent(state, state.currentPlayer).intent;
  return {
    constrainedOutcomeClass:
      outcome.unknown > 0.25
        ? 'unknown'
        : outcome.win >= 0.6 &&
            outcome.win - Math.max(outcome.draw, outcome.loss) >= 0.15
          ? 'win'
          : outcome.loss >= 0.6 &&
              outcome.loss - Math.max(outcome.draw, outcome.win) >= 0.15
            ? 'loss'
            : outcome.draw >= 0.5 &&
                outcome.draw - Math.max(outcome.win, outcome.loss) >= 0.1
              ? 'draw'
              : 'uncertain',
    opponentEffectClass:
      opp < -0.02 ? 'enable' : opp > 0.02 ? 'block' : 'neutral',
    ownProgressClass:
      own < -0.02 ? 'regress' : own > 0.02 ? 'advance' : 'neutral',
    phase: conversion
      ? 'conversion'
      : emptyCells <= 4
        ? 'opening'
        : 'transport',
    repetitionRiskBitset: [],
    strategicIntent: intent,
    structuralCounterplayClass:
      replies <= 0 ? '0' : replies === 1 ? '1' : replies === 2 ? '2' : '3+',
    terminalConversionClass:
      terminalMass > 0.5
        ? 'terminal'
        : terminalMass > 0
          ? 'mixedTerminal'
          : readiness(state, state.currentPlayer) >= 0.85
            ? 'nearConversion'
            : 'nonterminal',
  };
}
