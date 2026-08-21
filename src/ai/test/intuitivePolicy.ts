import { createProgressSnapshot } from '@/ai/risk';
import { actionKey } from '@/ai/search/shared';
import { namedUniform, type NamedRngKeyV1 } from '@/ai/test/namedRng.node';
import {
  advanceGeneratedEngineState,
  getLegalActions,
  withRuleDefaults,
  type EngineState,
  type Player,
  type RuleConfig,
  type TurnAction,
} from '@/domain';

export const YOUI_INTUITIVE_POLICY_VERSION = 1 as const;

export type IntuitiveCalibrationV1 = {
  opponentDelta: { iqr: number; median: number };
  ownDelta: { iqr: number; median: number };
  sourceCatalogHash: string;
  version: 1;
};

export type IntuitiveCandidateV1 = {
  action: TurnAction;
  actionKey: string;
  opponentReadinessDelta: number;
  ownReadinessDelta: number;
  probability: number;
  terminalTerm: -10 | 0 | 10;
  utility: number;
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

function z(
  value: number,
  calibration: { iqr: number; median: number },
): number {
  const standardized =
    (value - calibration.median) / Math.max(calibration.iqr, 1e-6);
  return Math.max(-3, Math.min(3, standardized));
}

function terminalTerm(state: EngineState, actor: Player): -10 | 0 | 10 {
  if (state.status !== 'gameOver' || !('winner' in state.victory)) return 0;
  return state.victory.winner === actor ? 10 : -10;
}

export function scoreIntuitiveCandidatesV1({
  calibration,
  config: configInput,
  state,
}: {
  calibration: IntuitiveCalibrationV1;
  config: Partial<RuleConfig>;
  state: EngineState;
}): IntuitiveCandidateV1[] {
  const config = withRuleDefaults(configInput);
  const actor = state.currentPlayer;
  const other = opponent(actor);
  const ownBefore = readiness(state, actor);
  const opponentBefore = readiness(state, other);
  const raw = getLegalActions(state, config)
    .slice()
    .sort((left, right) => actionKey(left).localeCompare(actionKey(right)))
    .map((action) => {
      const next = advanceGeneratedEngineState(state, action, config);
      const ownReadinessDelta = readiness(next, actor) - ownBefore;
      const opponentReadinessDelta = readiness(next, other) - opponentBefore;
      const terminal = terminalTerm(next, actor);
      const utility =
        z(ownReadinessDelta, calibration.ownDelta) -
        0.75 * z(opponentReadinessDelta, calibration.opponentDelta) +
        terminal;
      return {
        action,
        actionKey: actionKey(action),
        opponentReadinessDelta,
        ownReadinessDelta,
        terminalTerm: terminal,
        utility,
      };
    });
  const maximum = Math.max(...raw.map((entry) => entry.utility));
  const weights = raw.map((entry) => Math.exp(entry.utility - maximum));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return raw.map((entry, index) => ({
    ...entry,
    probability: weights[index] / total,
  }));
}

/** Canonical-action softmax at tau=1 with a named exogenous uniform. */
export function chooseIntuitiveActionV1({
  calibration,
  config,
  rngKey,
  state,
}: {
  calibration: IntuitiveCalibrationV1;
  config: Partial<RuleConfig>;
  rngKey: NamedRngKeyV1;
  state: EngineState;
}): { action: TurnAction | null; candidates: IntuitiveCandidateV1[] } {
  const candidates = scoreIntuitiveCandidatesV1({ calibration, config, state });
  if (!candidates.length) return { action: null, candidates };
  const uniform = namedUniform(rngKey);
  let cumulative = 0;
  for (const candidate of candidates) {
    cumulative += candidate.probability;
    if (uniform < cumulative) return { action: candidate.action, candidates };
  }
  return { action: candidates.at(-1)?.action ?? null, candidates };
}

function quantile(values: number[], probability: number): number {
  const sorted = values.slice().sort((left, right) => left - right);
  if (!sorted.length) throw new Error('Cannot calibrate an empty delta set.');
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const fraction = index - lower;
  return sorted[lower] * (1 - fraction) + sorted[upper] * fraction;
}

export function calibrateIntuitivePolicyV1({
  opponentDeltas,
  ownDeltas,
  sourceCatalogHash,
}: {
  opponentDeltas: number[];
  ownDeltas: number[];
  sourceCatalogHash: string;
}): IntuitiveCalibrationV1 {
  if (!/^[a-f0-9]{64}$/u.test(sourceCatalogHash))
    throw new Error('sourceCatalogHash must be SHA-256.');
  const summarize = (values: number[]) => ({
    iqr: quantile(values, 0.75) - quantile(values, 0.25),
    median: quantile(values, 0.5),
  });
  return {
    opponentDelta: summarize(opponentDeltas),
    ownDelta: summarize(ownDeltas),
    sourceCatalogHash,
    version: 1,
  };
}
