import { evaluateState } from '@/ai/evaluation';
import { actionKey } from '@/ai/search/shared';
import {
  chooseIntuitiveActionV1,
  type IntuitiveCalibrationV1,
} from '@/ai/test/intuitivePolicy';
import { namedInteger, type NamedRngKeyV1 } from '@/ai/test/namedRng.node';
import {
  advanceGeneratedEngineState,
  getLegalActions,
  withRuleDefaults,
  type EngineState,
  type RuleConfig,
  type TurnAction,
} from '@/domain';

export type CompetencePolicyIdV1 =
  | 'random'
  | 'intuitive'
  | 'depth2'
  | 'depth4'
  | 'depth6';

const POLICY_ORDER: CompetencePolicyIdV1[] = [
  'random',
  'intuitive',
  'depth2',
  'depth4',
  'depth6',
];

function referenceBestAction(
  state: EngineState,
  config: RuleConfig,
  depth: 2 | 4 | 6,
): TurnAction | null {
  const perspective = state.currentPlayer;
  const search = (node: EngineState, remaining: number): number => {
    if (node.status === 'gameOver' || remaining === 0)
      return evaluateState(node, perspective, config, {
        preset: null,
        riskMode: 'normal',
      });
    const childScores = getLegalActions(node, config).map((action) =>
      search(advanceGeneratedEngineState(node, action, config), remaining - 1),
    );
    if (!childScores.length)
      return evaluateState(node, perspective, config, {
        preset: null,
        riskMode: 'normal',
      });
    return node.currentPlayer === perspective
      ? Math.max(...childScores)
      : Math.min(...childScores);
  };
  return (
    getLegalActions(state, config)
      .map((action) => ({
        action,
        score: search(
          advanceGeneratedEngineState(state, action, config),
          depth - 1,
        ),
      }))
      .sort((left, right) =>
        right.score !== left.score
          ? right.score - left.score
          : actionKey(left.action).localeCompare(actionKey(right.action)),
      )[0]?.action ?? null
  );
}

export function chooseCompetencePolicyActionV1({
  intuitiveCalibration,
  policy,
  rngKey,
  ruleConfig: configInput,
  state,
}: {
  intuitiveCalibration: IntuitiveCalibrationV1;
  policy: CompetencePolicyIdV1;
  rngKey: NamedRngKeyV1;
  ruleConfig: Partial<RuleConfig>;
  state: EngineState;
}): TurnAction | null {
  const config = withRuleDefaults(configInput);
  const legal = getLegalActions(state, config)
    .slice()
    .sort((left, right) => actionKey(left).localeCompare(actionKey(right)));
  if (!legal.length) return null;
  if (policy === 'random') return legal[namedInteger(rngKey, legal.length)];
  if (policy === 'intuitive')
    return chooseIntuitiveActionV1({
      calibration: intuitiveCalibration,
      config,
      rngKey,
      state,
    }).action;
  return referenceBestAction(
    state,
    config,
    policy === 'depth2' ? 2 : policy === 'depth4' ? 4 : 6,
  );
}

export type CompetenceObservationV1 = {
  adjudicatedPointShare: number;
  naturalPointShare: number | null;
  policy: CompetencePolicyIdV1;
  skillResponse: number;
};

export type CompetenceDiagnosticsV1 = {
  adjacentMeasuredCompetenceGains: Array<{
    from: CompetencePolicyIdV1;
    gain: number;
    to: CompetencePolicyIdV1;
  }>;
  intuitiveMinusRandom: number;
  monotonicityViolations: string[];
  normalizedSkillResponseAuc: number | null;
  policies: Array<{
    adjudicatedPointShare: number;
    naturalCompletionPointShare: number | null;
    policy: CompetencePolicyIdV1;
  }>;
  reportOrdinalTierSlope: boolean;
  version: 1;
};

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function summarizeCompetenceDiagnosticsV1(
  observations: CompetenceObservationV1[],
): CompetenceDiagnosticsV1 {
  const policies = POLICY_ORDER.map((policy) => {
    const rows = observations.filter(
      (observation) => observation.policy === policy,
    );
    if (!rows.length) throw new Error(`Missing competence policy ${policy}.`);
    const natural = rows.flatMap((row) =>
      row.naturalPointShare === null ? [] : [row.naturalPointShare],
    );
    return {
      adjudicatedPointShare: mean(rows.map((row) => row.adjudicatedPointShare)),
      naturalCompletionPointShare: natural.length ? mean(natural) : null,
      policy,
    };
  });
  const adjacentMeasuredCompetenceGains = policies
    .slice(1)
    .map((policy, index) => ({
      from: policies[index].policy,
      gain:
        policy.adjudicatedPointShare - policies[index].adjudicatedPointShare,
      to: policy.policy,
    }));
  const monotonicityViolations = adjacentMeasuredCompetenceGains
    .filter((entry) => entry.gain < 0)
    .map((entry) => `${entry.from}->${entry.to}`);
  const responseByPolicy = new Map(
    POLICY_ORDER.map((policy) => [
      policy,
      mean(
        observations
          .filter((observation) => observation.policy === policy)
          .map((observation) => observation.skillResponse),
      ),
    ]),
  );
  const ordered = policies
    .map((policy) => ({
      response: responseByPolicy.get(policy.policy) ?? 0,
      x: policy.adjudicatedPointShare,
    }))
    .sort((left, right) => left.x - right.x);
  const range = ordered.at(-1)!.x - ordered[0].x;
  const normalizedSkillResponseAuc =
    range === 0
      ? null
      : ordered.slice(1).reduce((area, point, index) => {
          const previous = ordered[index];
          return (
            area +
            ((point.x - previous.x) / range) *
              ((point.response + previous.response) / 2)
          );
        }, 0);
  return {
    adjacentMeasuredCompetenceGains,
    intuitiveMinusRandom:
      policies[1].adjudicatedPointShare - policies[0].adjudicatedPointShare,
    monotonicityViolations,
    normalizedSkillResponseAuc,
    policies,
    reportOrdinalTierSlope: monotonicityViolations.length === 0,
    version: 1,
  };
}
