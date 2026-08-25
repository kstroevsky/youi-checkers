import { writeFile } from 'node:fs/promises';

import { createAiBehaviorProfile } from '@/ai/behavior';
import { precomputeOrderedActions } from '@/ai/moveOrdering';
import { createSearchPerfCache } from '@/ai/perf';
import { buildParticipationState } from '@/ai/participation';
import { AI_DIFFICULTY_PRESETS } from '@/ai/presets';
import { chooseComputerAction } from '@/ai/search/rootSearch';
import { getLegalActions, withRuleDefaults } from '@/domain';

import {
  POSITION_BUCKET_SCENARIOS,
  buildScenarioState,
} from './aiScenarioCatalog';

function argument(name: string) {
  return process.argv
    .find((entry) => entry.startsWith(`--${name}=`))
    ?.split('=')[1];
}

const output = argument('out');
if (!output) throw new Error('--out is required.');
const sampleIndex = Number.parseInt(argument('sample-index') ?? '0', 10);
const scenarioLimit = Number.parseInt(argument('scenario-limit') ?? '6', 10);
const rootRepetitions = Number.parseInt(
  argument('root-repetitions') ?? '5',
  10,
);
const config = withRuleDefaults({ drawRule: 'threefold' });
const preset = AI_DIFFICULTY_PRESETS.medium;
const fixtures = POSITION_BUCKET_SCENARIOS.slice(0, scenarioLimit).map(
  (scenario) => ({
    id: scenario.label,
    state: buildScenarioState(scenario, config),
  }),
);
const rootPreparationMs: number[] = [];
const decisionSamples: Array<{
  elapsedMs: number;
  evaluatedNodes: number;
  fixtureId: string;
  nodesPerSecond: number;
}> = [];

for (const fixture of fixtures) {
  const actions = getLegalActions(fixture.state, config);
  precomputeOrderedActions(
    fixture.state,
    fixture.state.currentPlayer,
    config,
    preset,
    {
      actions,
      participationState: buildParticipationState(
        fixture.state,
        preset.participationWindow,
      ),
      perfCache: createSearchPerfCache(),
    },
  );
  for (let repetition = 0; repetition < rootRepetitions; repetition += 1) {
    const started = performance.now();
    precomputeOrderedActions(
      fixture.state,
      fixture.state.currentPlayer,
      config,
      preset,
      {
        actions,
        participationState: buildParticipationState(
          fixture.state,
          preset.participationWindow,
        ),
        perfCache: createSearchPerfCache(),
      },
    );
    rootPreparationMs.push(performance.now() - started);
  }
  const decision = chooseComputerAction({
    behaviorProfile: createAiBehaviorProfile(
      `isolated-medium-${sampleIndex}-${fixture.id}`,
    ),
    difficulty: 'medium',
    random: () => 0.5,
    ruleConfig: config,
    state: fixture.state,
  });
  decisionSamples.push({
    elapsedMs: decision.elapsedMs,
    evaluatedNodes: decision.evaluatedNodes,
    fixtureId: fixture.id,
    nodesPerSecond:
      decision.elapsedMs > 0
        ? (decision.evaluatedNodes / decision.elapsedMs) * 1_000
        : 0,
  });
}

await writeFile(
  output,
  `${JSON.stringify({ decisionSamples, rootPreparationMs, sampleIndex, version: 1 })}\n`,
);
