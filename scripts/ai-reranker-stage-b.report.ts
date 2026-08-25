import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createAiBehaviorProfile } from '@/ai/behavior';
import {
  calibrateRootStyleV1,
  type RootStyleCalibrationV1,
  type RootStyleRawFeaturesV1,
} from '@/ai/rootStyleReranker';
import { chooseComputerAction } from '@/ai/search/rootSearch';
import { actionKey } from '@/ai/search/shared';
import { createSeededRandom } from '@/ai/test/searchTestUtils';
import {
  buildRootStyleTreatmentRowsV1,
  selectRootStyleTreatmentV1,
} from '@/ai/test/rootStyleTreatment';
import { getLegalActions, withRuleDefaults } from '@/domain';
import type { AiDifficulty } from '@/shared/types/session';

import {
  POSITION_BUCKET_SCENARIOS,
  buildScenarioState,
} from './aiScenarioCatalog';

const DIFFICULTIES: AiDifficulty[] = ['easy', 'medium', 'hard'];
const TEMPERATURES = [0.25, 0.5, 1, 2] as const;

function integerArg(name: string, fallback: number) {
  const raw = process.argv.find((entry) => entry.startsWith(`--${name}=`));
  const value = raw ? Number.parseInt(raw.split('=')[1], 10) : fallback;
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error(`--${name} must be a positive integer.`);
  return value;
}

function stringArg(name: string, fallback: string) {
  return (
    process.argv
      .find((entry) => entry.startsWith(`--${name}=`))
      ?.split('=')[1] ?? fallback
  );
}

function hillOne(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Math.exp(
    [...counts.values()].reduce((entropy, count) => {
      const probability = count / values.length;
      return entropy - probability * Math.log(probability);
    }, 0),
  );
}

function selectedCandidate(result: ReturnType<typeof chooseComputerAction>) {
  const selected = result.action ? actionKey(result.action) : null;
  return result.rootCandidates.find(
    (candidate) => actionKey(candidate.action) === selected,
  );
}

async function main() {
  const depth = integerArg('depth', 1);
  const scenarioLimit = integerArg('scenario-limit', 2);
  const seedCount = integerArg('seeds', 2);
  const out = stringArg(
    'out',
    path.join('output', 'ai', 'ai-reranker-stage-b'),
  );
  const ruleConfig = withRuleDefaults({ drawRule: 'threefold' });
  const fixtures = POSITION_BUCKET_SCENARIOS.slice(0, scenarioLimit).map(
    (scenario) => ({
      id: scenario.label,
      state: buildScenarioState(scenario, ruleConfig),
    }),
  );
  const calibrationRows = Object.fromEntries(
    DIFFICULTIES.map((difficulty) => [
      difficulty,
      [] as RootStyleRawFeaturesV1[],
    ]),
  ) as Record<AiDifficulty, RootStyleRawFeaturesV1[]>;
  for (const difficulty of DIFFICULTIES) {
    for (const fixture of fixtures) {
      for (let seed = 0; seed < seedCount; seed += 1) {
        const behaviorProfile = createAiBehaviorProfile(
          `reranker-calibration-${difficulty}-${fixture.id}-${seed}`,
        );
        const result = chooseComputerAction({
          behaviorProfile,
          diagnosticRootCandidateLimit: getLegalActions(
            fixture.state,
            ruleConfig,
          ).length,
          difficulty,
          random: createSeededRandom(seed + 1),
          ruleConfig,
          searchBudget: { depth, type: 'fixedDepth' },
          state: fixture.state,
        });
        const rows = buildRootStyleTreatmentRowsV1({
          behaviorProfile,
          difficulty,
          result,
          ruleConfig,
          state: fixture.state,
        });
        if (
          result.completedDepth <= 0 ||
          result.completedRootMoves !== result.rootCandidates.length
        )
          throw new Error(
            `Incomplete calibration root ${difficulty}/${fixture.id}.`,
          );
        calibrationRows[difficulty].push(...rows);
      }
    }
  }
  const calibration = Object.fromEntries(
    DIFFICULTIES.map((difficulty) => [
      difficulty,
      calibrateRootStyleV1(calibrationRows[difficulty]),
    ]),
  ) as Record<AiDifficulty, RootStyleCalibrationV1>;
  const samples: Array<Record<string, unknown>> = [];
  for (const difficulty of DIFFICULTIES) {
    for (const temperature of TEMPERATURES) {
      for (const fixture of fixtures) {
        for (let seed = 0; seed < seedCount; seed += 1) {
          const behaviorProfile = createAiBehaviorProfile(
            `reranker-evaluation-${difficulty}-${fixture.id}-${seed}`,
          );
          const request = {
            behaviorProfile,
            diagnosticRootCandidateLimit: getLegalActions(
              fixture.state,
              ruleConfig,
            ).length,
            difficulty,
            ruleConfig,
            searchBudget: { depth, type: 'fixedDepth' as const },
            state: fixture.state,
          };
          const baseline = chooseComputerAction({
            ...request,
            random: createSeededRandom(seed + 10_000),
          });
          const candidateAction = selectRootStyleTreatmentV1({
            behaviorProfile,
            calibration: calibration[difficulty],
            difficulty,
            random: createSeededRandom(seed + 10_000),
            result: baseline,
            ruleConfig,
            state: fixture.state,
            temperature,
          });
          const baselineSelected = selectedCandidate(baseline);
          const candidateSelected = baseline.rootCandidates.find(
            (candidate) =>
              candidateAction &&
              actionKey(candidate.action) === actionKey(candidateAction),
          );
          samples.push({
            baselineAction: baseline.action ? actionKey(baseline.action) : null,
            baselineParticipation: baselineSelected?.participationDelta ?? null,
            baselineRegret: baseline.selectionRegret,
            candidateAction: candidateAction
              ? actionKey(candidateAction)
              : null,
            candidateParticipation:
              candidateSelected?.participationDelta ?? null,
            candidateRegret: candidateSelected
              ? Math.max(0, baseline.bestSearchScore - candidateSelected.score)
              : baseline.selectionRegret,
            difficulty,
            fixtureId: fixture.id,
            seed,
            temperature,
          });
        }
      }
    }
  }
  const results = DIFFICULTIES.flatMap((difficulty) =>
    TEMPERATURES.map((temperature) => {
      const rows = samples.filter(
        (sample) =>
          sample.difficulty === difficulty &&
          sample.temperature === temperature,
      );
      const numeric = (key: string) => rows.map((row) => row[key] as number);
      return {
        actionChangeRate:
          rows.filter((row) => row.baselineAction !== row.candidateAction)
            .length / rows.length,
        candidateActionD1: hillOne(
          rows.map((row) => String(row.candidateAction)),
        ),
        difficulty,
        meanParticipationDelta:
          numeric('candidateParticipation').reduce(
            (sum, value, index) =>
              sum + (value - numeric('baselineParticipation')[index]),
            0,
          ) / rows.length,
        meanSelectionRegretDelta:
          numeric('candidateRegret').reduce(
            (sum, value, index) =>
              sum + (value - numeric('baselineRegret')[index]),
            0,
          ) / rows.length,
        temperature,
      };
    }),
  );
  const calibrationHash = createHash('sha256')
    .update(JSON.stringify(calibration))
    .digest('hex');
  const report = {
    calibration,
    calibrationHash,
    results,
    settings: { depth, scenarioLimit, seedCount, temperatures: TEMPERATURES },
    version: 1,
  };
  await mkdir(path.dirname(out), { recursive: true });
  await Promise.all([
    writeFile(`${out}.json`, `${JSON.stringify(report, null, 2)}\n`),
    writeFile(
      `${out}.samples.jsonl`,
      `${samples.map((sample) => JSON.stringify(sample)).join('\n')}\n`,
    ),
  ]);
  process.stdout.write(
    `${JSON.stringify({ calibrationHash, results }, null, 2)}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.exitCode = 1;
});
