import { createProgressSnapshot } from '@/ai/risk';
import { actionKey } from '@/ai/search/shared';
import { analyzePosition, getStrategicIntent } from '@/ai/strategy';
import {
  chooseIntuitiveActionV1,
  type IntuitiveCalibrationV1,
} from '@/ai/test/intuitivePolicy';
import type { WdlProofResultV1 } from '@/ai/test/wdlProof.node';
import { wdlProofStateKeyV1 } from '@/ai/test/wdlProof.node';
import {
  constrainCalibratedOutcomeV1,
  isHighDrawTrapV1,
  predictOutcomeProbabilitiesV1,
  type OutcomeCalibrationV1,
  type OutcomeClassV1,
} from '@/ai/test/outcomeCalibration';
import {
  advanceGeneratedEngineState,
  getLegalActions,
  hashPosition,
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
  repetitionRiskBitset: Array<'highDrawTrap' | 'repetition' | 'selfUndo'>;
  rootPlayer: Player;
  state: EngineState;
  strategicIntent: 'home' | 'hybrid' | 'sixStack' | 'unknown';
  structuralReplyClasses: string[] | null;
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
  calibration: OutcomeCalibrationV1 | null,
  referenceScores: ReadonlyMap<string, number>,
) {
  if (state.status === 'gameOver') {
    if (!('winner' in state.victory))
      return { draw: 1, loss: 0, unknown: 0, win: 0 };
    return state.victory.winner === rootPlayer
      ? { draw: 0, loss: 0, unknown: 0, win: 1 }
      : { draw: 0, loss: 1, unknown: 0, win: 0 };
  }
  if (!calibration?.accepted) return { draw: 0, loss: 0, unknown: 1, win: 0 };
  const stateKey = wdlProofStateKeyV1(state, config);
  const referenceScore = referenceScores.get(stateKey);
  if (referenceScore === undefined)
    return { draw: 0, loss: 0, unknown: 1, win: 0 };
  let probabilities = predictOutcomeProbabilitiesV1(calibration.model, {
    phase: analyzePosition(state).phase,
    referenceScore,
    sideToMove: state.currentPlayer,
  });
  const proof = snapshot.get(stateKey);
  const bounds = proof?.bounds ?? {
    lower: 'loss' as const,
    upper: 'win' as const,
  };
  const constrained = constrainCalibratedOutcomeV1(probabilities, bounds);
  if (constrained.class === 'unknown')
    return { draw: 0, loss: 0, unknown: 1, win: 0 };
  probabilities = constrained.probabilities;
  if (state.currentPlayer !== rootPlayer) {
    probabilities = {
      draw: probabilities.draw,
      loss: probabilities.win,
      win: probabilities.loss,
    };
  }
  return {
    draw: probabilities.draw,
    loss: probabilities.loss,
    unknown: 0,
    win: probabilities.win,
  };
}

function progressClass(value: number): 'advance' | 'neutral' | 'regress' {
  return value < -0.02 ? 'regress' : value > 0.02 ? 'advance' : 'neutral';
}

function opponentEffectClass(value: number): 'block' | 'enable' | 'neutral' {
  return value < -0.02 ? 'enable' : value > 0.02 ? 'block' : 'neutral';
}

function outcomeClass(
  vector: SemanticRolloutSnapshotV1['outcome'],
): OutcomeClassV1 | 'uncertain' | 'unknown' {
  if (vector.unknown > 0.25) return 'unknown';
  return vector.win >= 0.6 &&
    vector.win - Math.max(vector.draw, vector.loss) >= 0.15
    ? 'win'
    : vector.loss >= 0.6 &&
        vector.loss - Math.max(vector.draw, vector.win) >= 0.15
      ? 'loss'
      : vector.draw >= 0.5 &&
          vector.draw - Math.max(vector.win, vector.loss) >= 0.1
        ? 'draw'
        : 'uncertain';
}

export type PlayerReplySemanticClassV1 = Omit<
  SemanticFutureSignatureV1,
  'structuralCounterplayClass'
>;

function riskBitsForState(
  state: EngineState,
  outcome: SemanticRolloutSnapshotV1['outcome'],
  selfUndo: boolean,
) {
  const bits: SemanticRolloutSnapshotV1['repetitionRiskBitset'] = [];
  if ((state.positionCounts[hashPosition(state)] ?? 0) > 1)
    bits.push('repetition');
  if (selfUndo) bits.push('selfUndo');
  if (
    outcome.unknown === 0 &&
    isHighDrawTrapV1(0, {
      draw: outcome.draw,
      loss: outcome.loss,
      win: outcome.win,
    })
  )
    bits.push('highDrawTrap');
  return bits;
}

function terminalConversionClass(state: EngineState, player: Player) {
  if (state.status === 'gameOver') return 'terminal' as const;
  return readiness(state, player) >= 0.85
    ? ('nearConversion' as const)
    : ('nonterminal' as const);
}

function classifyReplyActionsV1({
  calibration,
  config,
  proofSnapshot,
  referenceScores,
  state,
}: {
  calibration: OutcomeCalibrationV1 | null;
  config: RuleConfig;
  proofSnapshot: ReadonlyMap<string, WdlProofResultV1>;
  referenceScores: ReadonlyMap<string, number>;
  state: EngineState;
}): { classes: string[]; maximum: number } {
  if (state.status === 'gameOver') return { classes: [], maximum: 0 };
  const actor = state.currentPlayer;
  const other = opponent(actor);
  const ownBefore = readiness(state, actor);
  const otherBefore = readiness(state, other);
  const actions = getLegalActions(state, config);
  const classes = actions.map((action) => {
    const next = advanceGeneratedEngineState(state, action, config);
    const outcome = outcomeVector(
      next,
      actor,
      config,
      proofSnapshot,
      calibration,
      referenceScores,
    );
    const analysis = analyzePosition(next);
    const signature: PlayerReplySemanticClassV1 = {
      constrainedOutcomeClass: outcomeClass(outcome),
      opponentEffectClass: opponentEffectClass(
        readiness(next, other) - otherBefore,
      ),
      ownProgressClass: progressClass(readiness(next, actor) - ownBefore),
      phase: analysis.phase,
      repetitionRiskBitset: riskBitsForState(next, outcome, false),
      strategicIntent:
        next.status === 'gameOver'
          ? 'unknown'
          : getStrategicIntent(next, actor).intent,
      terminalConversionClass: terminalConversionClass(next, actor),
    };
    return JSON.stringify(signature);
  });
  return { classes: [...new Set(classes)].sort(), maximum: actions.length };
}

/** Forces every root action and shares exogenous uniforms across its rollouts. */
export function measureSemanticFutureChoicesV1({
  calibration,
  config: configInput,
  lineageId,
  outcomeCalibration = null,
  proofSnapshot,
  referenceScores = new Map(),
  root,
  rolloutCount,
  runSeed,
}: {
  calibration: IntuitiveCalibrationV1;
  config: Partial<RuleConfig>;
  lineageId: string;
  outcomeCalibration?: OutcomeCalibrationV1 | null;
  proofSnapshot: ReadonlyMap<string, WdlProofResultV1>;
  referenceScores?: ReadonlyMap<string, number>;
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
        let boundary: { classes: string[]; maximum: number } | null =
          state.status === 'gameOver' ? { classes: [], maximum: 0 } : null;
        const positionTrail = [hashPosition(root), hashPosition(state)];
        const replicateSnapshots: SemanticRolloutSnapshotV1[] = [];
        for (let committed = 1; committed <= 8; committed += 1) {
          if (
            boundary === null &&
            state.status === 'active' &&
            state.currentPlayer !== rootPlayer
          ) {
            boundary = classifyReplyActionsV1({
              calibration: outcomeCalibration,
              config,
              proofSnapshot,
              referenceScores,
              state,
            });
          }
          if ([1, 4, 8].includes(committed)) {
            const outcome = outcomeVector(
              state,
              rootPlayer,
              config,
              proofSnapshot,
              outcomeCalibration,
              referenceScores,
            );
            const selfUndo =
              positionTrail.length >= 3 &&
              positionTrail.at(-1) === positionTrail.at(-3);
            replicateSnapshots.push({
              horizon: committed as SemanticHorizonV1,
              opponentReadinessDelta:
                readiness(state, opponent(rootPlayer)) - rootOpponent,
              outcome,
              ownReadinessDelta: readiness(state, rootPlayer) - rootOwn,
              replyClassCountNormalized: 0,
              repetitionRiskBitset: riskBitsForState(state, outcome, selfUndo),
              rootPlayer,
              state: structuredClone(state),
              strategicIntent:
                state.status === 'gameOver'
                  ? 'unknown'
                  : getStrategicIntent(state, state.currentPlayer).intent,
              structuralReplyClasses: null,
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
            break;
          }
          state = advanceGeneratedEngineState(state, decision.action, config);
          positionTrail.push(hashPosition(state));
          if (state.status === 'gameOver' && terminalAt === null)
            terminalAt = committed + 1;
        }
        if (boundary === null) overflowCount += 1;
        for (const snapshot of replicateSnapshots) {
          snapshot.structuralReplyClasses = boundary?.classes ?? null;
          snapshot.replyClassCountNormalized =
            boundary && boundary.maximum > 0
              ? boundary.classes.length / boundary.maximum
              : 0;
          horizons[snapshot.horizon].push(snapshot);
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
  repetitionRiskBitset: Array<'highDrawTrap' | 'repetition' | 'selfUndo'>;
  strategicIntent: 'home' | 'hybrid' | 'sixStack' | 'unknown';
  structuralCounterplayClass: '0' | '1' | '2' | '3+' | 'unknown';
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
  const outcome = {
    draw: mean((snapshot) => snapshot.outcome.draw),
    loss: mean((snapshot) => snapshot.outcome.loss),
    unknown: mean((snapshot) => snapshot.outcome.unknown),
    win: mean((snapshot) => snapshot.outcome.win),
  };
  const terminalMass =
    snapshots.filter((snapshot) => snapshot.state.status === 'gameOver')
      .length / snapshots.length;
  const replyCounts = snapshots.flatMap((snapshot) =>
    snapshot.structuralReplyClasses === null
      ? []
      : [snapshot.structuralReplyClasses.length],
  );
  const replies = replyCounts.sort((left, right) => left - right)[
    Math.floor((replyCounts.length - 1) / 2)
  ];
  const canonicalMode = <T extends string>(values: T[], order: readonly T[]) =>
    order
      .map((value) => ({
        count: values.filter((entry) => entry === value).length,
        value,
      }))
      .sort((left, right) => right.count - left.count)[0].value;
  const intent = canonicalMode(
    snapshots.map((snapshot) => snapshot.strategicIntent),
    ['home', 'hybrid', 'sixStack', 'unknown'] as const,
  );
  const phase = canonicalMode(
    snapshots.map((snapshot) => analyzePosition(snapshot.state).phase),
    ['opening', 'transport', 'conversion'] as const,
  );
  const riskOrder = ['repetition', 'selfUndo', 'highDrawTrap'] as const;
  const repetitionRiskBitset = riskOrder.filter(
    (risk) =>
      snapshots.filter((snapshot) =>
        snapshot.repetitionRiskBitset.includes(risk),
      ).length /
        snapshots.length >=
      0.25,
  );
  const meanReadiness = mean((snapshot) =>
    readiness(snapshot.state, snapshot.rootPlayer),
  );
  return {
    constrainedOutcomeClass: outcomeClass(outcome),
    opponentEffectClass: opponentEffectClass(opp),
    ownProgressClass: progressClass(own),
    phase,
    repetitionRiskBitset,
    strategicIntent: intent,
    structuralCounterplayClass:
      replyCounts.length !== snapshots.length
        ? 'unknown'
        : replies <= 0
          ? '0'
          : replies === 1
            ? '1'
            : replies === 2
              ? '2'
              : '3+',
    terminalConversionClass:
      terminalMass > 0.5
        ? 'terminal'
        : terminalMass > 0
          ? 'mixedTerminal'
          : meanReadiness >= 0.85
            ? 'nearConversion'
            : 'nonterminal',
  };
}
