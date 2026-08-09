import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {
  chooseComputerAction,
  type AiSearchBudget,
  type AiSearchResult,
} from '@/ai';
import { createAiBehaviorProfile } from '@/ai/behavior';
import { AI_DIFFICULTY_PRESETS } from '@/ai/presets';
import {
  AI_MEASUREMENT_SCHEMA_VERSION,
  summarizeMeasuredBehavior,
  summarizeNumericDistribution,
  summarizeOutcomes,
  summarizeProportion,
  summarizeSearchExecutions,
  summarizeSearchPaths,
  type SearchExecutionSample,
} from '@/ai/test/measurement';
import { runAiVarietySuite, type AiGameTrace } from '@/ai/test/metrics';
import {
  mirrorActionHorizontally,
  mirrorGameStateHorizontally,
} from '@/ai/test/symmetry';
import { getLegalActions, hashPosition, type TurnAction } from '@/domain';
import { withRuleDefaults } from '@/domain/model/ruleConfig';
import type { AiDifficulty } from '@/shared/types/session';

import {
  buildScenarioState,
  POSITION_BUCKET_SCENARIOS,
} from './aiScenarioCatalog';

const OUTPUT_DIR = path.join(process.cwd(), 'output', 'ai');
const JSON_OUTPUT = path.join(OUTPUT_DIR, 'ai-measurement-report.json');
const MARKDOWN_OUTPUT = path.join(OUTPUT_DIR, 'ai-measurement-report.md');
const RAW_OUTPUT = path.join(OUTPUT_DIR, 'ai-measurement-samples.jsonl');

type Profile = 'full' | 'smoke';
type BudgetName = 'fixedDepth' | 'fixedNodes' | 'presetTime' | 'wallClock';

type DecisionSample = {
  beforeLegalActionCount: number;
  beforePositionKey: string;
  difficulty: AiDifficulty;
  kind: 'decision';
  observedWallMs: number;
  repetition: number;
  result: AiSearchResult;
  sampleId: string;
  scenario: {
    bucket: string;
    label: string;
    spatialVariant: 'horizontalMirror' | 'original';
  };
  seed: number;
};

type Settings = {
  budgetName: BudgetName;
  decisionRepetitions: number;
  difficulties: AiDifficulty[];
  maxDepth: number;
  maxTurns: number;
  nodeBudget: number;
  pairCount: number;
  profile: Profile;
  scenarioLimit: number;
  timeBudgetMs: number;
};

function summarizeStyleRegret(regrets: number[], difficulty: AiDifficulty) {
  const budget = AI_DIFFICULTY_PRESETS[difficulty].maxSelectionRegret;

  return {
    budget,
    budgetUtilization: summarizeNumericDistribution(
      regrets.map((regret) => regret / budget),
    ),
    budgetViolations: summarizeProportion(
      regrets.filter((regret) => regret > budget).length,
      regrets.length,
    ),
    positiveSelections: summarizeProportion(
      regrets.filter((regret) => regret > 0).length,
      regrets.length,
    ),
    regret: summarizeNumericDistribution(regrets),
  };
}

function parseArgs(argv: string[]): Settings {
  const parsed = new Map<string, string>();

  for (const entry of argv) {
    if (!entry.startsWith('--')) continue;
    const [key, value = ''] = entry.slice(2).split('=');
    parsed.set(key, value);
  }

  const profile = (parsed.get('profile') ?? 'smoke') as Profile;
  if (profile !== 'smoke' && profile !== 'full') {
    throw new Error(`Unknown profile "${profile}".`);
  }

  const defaults =
    profile === 'full'
      ? {
          decisionRepetitions: 8,
          maxTurns: 80,
          nodeBudget: 512,
          pairCount: 16,
        }
      : {
          decisionRepetitions: 1,
          maxTurns: 12,
          nodeBudget: 64,
          pairCount: 1,
        };
  const numberArg = (name: string, fallback: number): number => {
    const value = parsed.get(name);
    if (value === undefined) return fallback;
    const numeric = Number.parseInt(value, 10);
    if (!Number.isSafeInteger(numeric) || numeric <= 0) {
      throw new Error(`--${name} must be a positive integer.`);
    }
    return numeric;
  };
  const difficulties = (parsed.get('difficulties') ?? 'easy,medium,hard')
    .split(',')
    .filter(Boolean) as AiDifficulty[];

  if (
    !difficulties.length ||
    difficulties.some(
      (difficulty) =>
        difficulty !== 'easy' &&
        difficulty !== 'medium' &&
        difficulty !== 'hard',
    )
  ) {
    throw new Error('--difficulties must contain easy, medium, and/or hard.');
  }

  const budgetName = (parsed.get('budget') ?? 'fixedNodes') as BudgetName;
  if (
    budgetName !== 'fixedDepth' &&
    budgetName !== 'fixedNodes' &&
    budgetName !== 'presetTime' &&
    budgetName !== 'wallClock'
  ) {
    throw new Error(`Unknown budget "${budgetName}".`);
  }

  return {
    budgetName,
    decisionRepetitions: numberArg(
      'decision-repetitions',
      defaults.decisionRepetitions,
    ),
    difficulties,
    maxDepth: numberArg('max-depth', budgetName === 'fixedDepth' ? 1 : 6),
    maxTurns: numberArg('max-turns', defaults.maxTurns),
    nodeBudget: numberArg('nodes', defaults.nodeBudget),
    pairCount: numberArg('pairs', defaults.pairCount),
    profile,
    scenarioLimit: numberArg(
      'scenario-limit',
      POSITION_BUCKET_SCENARIOS.length,
    ),
    timeBudgetMs: numberArg('time-ms', 500),
  };
}

function createSearchBudget(settings: Settings): AiSearchBudget | undefined {
  if (settings.budgetName === 'presetTime') return undefined;
  if (settings.budgetName === 'fixedDepth') {
    return { depth: settings.maxDepth, type: 'fixedDepth' };
  }
  if (settings.budgetName === 'fixedNodes') {
    return {
      maxDepth: settings.maxDepth,
      maxEvaluatedNodes: settings.nodeBudget,
      type: 'fixedNodes',
    };
  }
  return {
    maxDepth: settings.maxDepth,
    timeBudgetMs: settings.timeBudgetMs,
    type: 'wallClock',
  };
}

function createSeededRandom(seed: number): () => number {
  let current = seed >>> 0;
  return () => {
    current = (current * 1_664_525 + 1_013_904_223) >>> 0;
    return current / 0x1_0000_0000;
  };
}

function actionKey(action: TurnAction | null): string {
  if (!action) return 'none';
  if (action.type === 'manualUnfreeze') return `${action.type}:${action.coord}`;
  if (action.type === 'jumpSequence') {
    return `${action.type}:${action.source}:${action.path.join('>')}`;
  }
  return `${action.type}:${action.source}:${action.target}`;
}

function toSearchExecutionSample(
  result: AiSearchResult,
): SearchExecutionSample {
  return {
    completedDepth: result.completedDepth,
    completedRootMoves: result.completedRootMoves,
    diagnostics: result.diagnostics,
    elapsedMs: result.elapsedMs,
    evaluatedNodes: result.evaluatedNodes,
    fallbackKind: result.fallbackKind,
    partialDepth: result.partialDepth,
    partialRootMoves: result.partialRootMoves,
    rootScoreRegret: result.selectionRegret,
    searchBudget: result.searchBudget ?? null,
    timedOut: result.timedOut,
  };
}

function summarizeSpatialEquivariance(
  samples: DecisionSample[],
): ReturnType<typeof summarizeProportion> {
  const originals = new Map(
    samples
      .filter((sample) => sample.scenario.spatialVariant === 'original')
      .map((sample) => [
        `${sample.scenario.label}/${sample.repetition}`,
        sample,
      ]),
  );
  let equivalentPairs = 0;
  let pairCount = 0;

  for (const mirrored of samples.filter(
    (sample) => sample.scenario.spatialVariant === 'horizontalMirror',
  )) {
    const original = originals.get(
      `${mirrored.scenario.label}/${mirrored.repetition}`,
    );
    if (!original?.result.action || !mirrored.result.action) continue;

    pairCount += 1;
    if (
      actionKey(mirrorActionHorizontally(original.result.action)) ===
      actionKey(mirrored.result.action)
    ) {
      equivalentPairs += 1;
    }
  }

  return summarizeProportion(equivalentPairs, pairCount);
}

function gitOutput(args: string[]): string {
  try {
    return execFileSync('git', args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

function buildMarkdown(report: Record<string, unknown>): string {
  const summaries = report.summaries as Record<
    AiDifficulty,
    {
      behavior: ReturnType<typeof summarizeMeasuredBehavior>;
      decisionSearch: ReturnType<typeof summarizeSearchExecutions>;
      gameSearch: ReturnType<typeof summarizeSearchPaths>;
      outcomes: ReturnType<typeof summarizeOutcomes>;
      spatialEquivariance: ReturnType<typeof summarizeProportion>;
      styleRegret: {
        decisions: ReturnType<typeof summarizeStyleRegret>;
        games: ReturnType<typeof summarizeStyleRegret>;
      };
    }
  >;
  const lines = [
    '# AI Measurement Report',
    '',
    `Generated: ${String(report.generatedAt)}`,
    '',
    'This report keeps search-path, outcome, and behavioral evidence separate. Raw samples are stored in `ai-measurement-samples.jsonl`.',
    '',
    '| Difficulty | Decision depth median | Decision partial | Decision fallback | Game depth median | Game partial | Game fallback | Spatial equivariance | Normal wins | Draws | Unfinished | Opening effective behaviors | Style budget | Game style-selection share | Max game regret | Budget violations |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];

  for (const difficulty of Object.keys(summaries) as AiDifficulty[]) {
    const summary = summaries[difficulty];
    lines.push(
      `| ${difficulty} | ${summary.decisionSearch.completedDepth.median} | ${summary.decisionSearch.partialDepthShare.share} | ${summary.decisionSearch.fallbackShare.share} | ${summary.gameSearch.completedDepth.median} | ${summary.gameSearch.partialDepthShare.share} | ${summary.gameSearch.fallbackShare.share} | ${summary.spatialEquivariance.share} | ${summary.outcomes.normalGoalWins.share} | ${summary.outcomes.actualDraws.share} | ${summary.outcomes.unfinished.share} | ${summary.behavior.firstMoveDiversity.hill1EffectiveBehaviors} | ${summary.styleRegret.games.budget} | ${summary.styleRegret.games.positiveSelections.share} | ${summary.styleRegret.games.regret.maximum} | ${summary.styleRegret.games.budgetViolations.count} |`,
    );
  }

  lines.push('', '## Path assertions', '');
  for (const difficulty of Object.keys(summaries) as AiDifficulty[]) {
    const decision = summaries[difficulty].decisionSearch.assertions;
    const game = summaries[difficulty].gameSearch.assertions;
    lines.push(
      `- ${difficulty}: missing budget metadata decision=${decision.missingBudgetMetadataCount}, game=${game.missingBudgetMetadataCount}; unexpected budget path decision=${decision.unexpectedBudgetTypeCount}, game=${game.unexpectedBudgetTypeCount}.`,
    );
  }

  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const settings = parseArgs(process.argv.slice(2));
  const searchBudget = createSearchBudget(settings);
  const ruleConfig = withRuleDefaults({
    drawRule: 'threefold',
    scoringMode: 'off',
  });
  const decisionSamples: DecisionSample[] = [];
  const gameTracesByDifficulty = {} as Record<AiDifficulty, AiGameTrace[]>;
  const scenarios = POSITION_BUCKET_SCENARIOS.slice(0, settings.scenarioLimit);

  for (const difficulty of settings.difficulties) {
    for (const scenario of scenarios) {
      const original = buildScenarioState(scenario, ruleConfig);
      const variants = [
        { name: 'original' as const, state: original },
        {
          name: 'horizontalMirror' as const,
          state: mirrorGameStateHorizontally(original),
        },
      ];

      for (const variant of variants) {
        for (
          let repetition = 0;
          repetition < settings.decisionRepetitions;
          repetition += 1
        ) {
          const seed =
            settings.difficulties.indexOf(difficulty) * 100_000 +
            scenarios.indexOf(scenario) * 1_000 +
            repetition +
            1;
          const startedAt = performance.now();
          const result = chooseComputerAction({
            behaviorProfile: createAiBehaviorProfile(
              `measurement-${difficulty}-${scenario.label}-${repetition}`,
            ),
            difficulty,
            random: createSeededRandom(seed),
            ruleConfig,
            ...(searchBudget ? { searchBudget } : {}),
            state: variant.state,
          });

          decisionSamples.push({
            beforeLegalActionCount: getLegalActions(variant.state, ruleConfig)
              .length,
            beforePositionKey: hashPosition(variant.state),
            difficulty,
            kind: 'decision',
            observedWallMs: performance.now() - startedAt,
            repetition,
            result,
            sampleId: `${difficulty}/${scenario.label}/${variant.name}/${repetition}`,
            scenario: {
              bucket: scenario.bucket,
              label: scenario.label,
              spatialVariant: variant.name,
            },
            seed,
          });
        }
      }
    }

    gameTracesByDifficulty[difficulty] = runAiVarietySuite({
      clockMode: 'product',
      difficulty,
      maxTurns: settings.maxTurns,
      pairCount: settings.pairCount,
      ruleConfig,
      ...(searchBudget ? { searchBudget } : {}),
    });
  }

  const summaries = {} as Record<string, unknown>;
  let pathAssertionFailures = 0;

  for (const difficulty of settings.difficulties) {
    const difficultyDecisionSamples = decisionSamples.filter(
      (sample) => sample.difficulty === difficulty,
    );
    const traces = gameTracesByDifficulty[difficulty];
    const decisionSearch = summarizeSearchExecutions(
      difficultyDecisionSamples.map((sample) =>
        toSearchExecutionSample(sample.result),
      ),
      searchBudget ?? { type: 'presetTime' },
    );
    const gameSearch = summarizeSearchPaths(
      traces,
      searchBudget ?? { type: 'presetTime' },
    );

    pathAssertionFailures +=
      decisionSearch.assertions.missingBudgetMetadataCount +
      decisionSearch.assertions.unexpectedBudgetTypeCount +
      gameSearch.assertions.missingBudgetMetadataCount +
      gameSearch.assertions.unexpectedBudgetTypeCount;
    summaries[difficulty] = {
      behavior: summarizeMeasuredBehavior(traces),
      decisionSearch,
      gameSearch,
      outcomes: summarizeOutcomes(traces),
      spatialEquivariance: summarizeSpatialEquivariance(
        difficultyDecisionSamples,
      ),
      styleRegret: {
        decisions: summarizeStyleRegret(
          difficultyDecisionSamples.map(
            (sample) => sample.result.selectionRegret,
          ),
          difficulty,
        ),
        games: summarizeStyleRegret(
          traces.flatMap((trace) =>
            trace.plies.map((ply) => ply.selectionRegret),
          ),
          difficulty,
        ),
      },
    };
  }

  const packageJson = JSON.parse(
    await readFile(path.join(process.cwd(), 'package.json'), 'utf8'),
  ) as { version?: string };
  const rawLines = [
    ...decisionSamples.map((sample) => JSON.stringify(sample)),
    ...settings.difficulties.flatMap((difficulty) =>
      gameTracesByDifficulty[difficulty].map((trace) =>
        JSON.stringify({ kind: 'gameTrace', trace }),
      ),
    ),
  ];
  const rawPayload = `${rawLines.join('\n')}\n`;
  const rawSha256 = createHash('sha256').update(rawPayload).digest('hex');
  const fixtureSha256 = createHash('sha256')
    .update(JSON.stringify(scenarios))
    .digest('hex');
  const status = gitOutput(['status', '--porcelain']);
  const report = {
    contract: {
      adoptionPolicy:
        'Infrastructure-only: product defaults must remain unchanged; future heuristic adoption requires separate evidence.',
      correctnessInvariants: [
        'Every selected action is legal.',
        'Omitted searchBudget uses the shipped difficulty preset.',
        'Fixed-depth ignores wall-clock expiry.',
        'Fixed-node exhaustion uses existing legal fallback semantics.',
      ],
      guardrails: [
        'missing budget metadata = 0',
        'unexpected budget path = 0',
        'unfinished outcomes are not counted as draws',
        'raw samples and provenance are retained',
      ],
      materiality:
        'No AI-quality materiality verdict is made by this infrastructure report.',
      primaryDecision:
        'Verify that every result exercised the requested search budget and expose its resource/outcome/behavior distributions.',
      workload:
        'Stratified scenario decisions with true horizontal mirrors plus paired seeded self-play.',
    },
    generatedAt: new Date().toISOString(),
    pathAssertionFailures,
    provenance: {
      arch: process.arch,
      command: process.argv.join(' '),
      cpuCount: os.cpus().length,
      fixtureSha256,
      gitDirty: status !== '' && status !== 'unknown',
      gitRevision: gitOutput(['rev-parse', 'HEAD']),
      node: process.version,
      packageVersion: packageJson.version ?? 'unknown',
      platform: `${os.platform()} ${os.release()}`,
      rawSampleCount:
        decisionSamples.length +
        settings.difficulties.reduce(
          (sum, difficulty) => sum + gameTracesByDifficulty[difficulty].length,
          0,
        ),
      rawSamplesPath: path.relative(process.cwd(), RAW_OUTPUT),
      rawSamplesSha256: rawSha256,
    },
    schemaVersion: AI_MEASUREMENT_SCHEMA_VERSION,
    settings: {
      ...settings,
      ruleConfig,
      searchBudget: searchBudget ?? { type: 'presetTime' },
    },
    summaries,
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(RAW_OUTPUT, rawPayload, 'utf8');
  await writeFile(JSON_OUTPUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(
    MARKDOWN_OUTPUT,
    buildMarkdown(report as unknown as Record<string, unknown>),
    'utf8',
  );

  if (pathAssertionFailures > 0) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
