import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { chooseComputerAction, type AiSearchResult } from '@/ai';
import { createAiBehaviorProfile } from '@/ai/behavior';
import {
  evaluateCompetenceGates,
  scoreTacticalDecision,
  summarizeCompetenceSamples,
  type TacticalDecisionSample,
} from '@/ai/test/competenceMetrics';
import {
  buildTacticalOracleFixtures,
  tacticalActionKey,
  type TacticalOracleFixture,
} from '@/ai/test/tacticalFixtures';
import { getLegalActions, hashPosition } from '@/domain';
import { withRuleDefaults } from '@/domain/model/ruleConfig';
import type { AiDifficulty } from '@/shared/types/session';

const OUTPUT_DIR = path.join(process.cwd(), 'output', 'ai');
const JSON_OUTPUT = path.join(OUTPUT_DIR, 'ai-competence-report.json');
const MARKDOWN_OUTPUT = path.join(OUTPUT_DIR, 'ai-competence-report.md');
const RAW_OUTPUT = path.join(OUTPUT_DIR, 'ai-competence-samples.jsonl');
const SCHEMA_VERSION = 1 as const;

type Profile = 'full' | 'smoke';

type Settings = {
  catastrophicRegretThreshold: number;
  difficulties: AiDifficulty[];
  enforceGates: boolean;
  nodeBudgets: number[];
  oracleDepth: number;
  profile: Profile;
  repetitions: number;
};

type OracleRecord = {
  bestActionKey: string;
  candidates: Array<{ actionKey: string; score: number }>;
  completedDepth: number;
  evaluatedNodes: number;
  fixtureId: string;
  legalActionCount: number;
  result: AiSearchResult;
};

type RawDecisionRecord = TacticalDecisionSample & {
  kind: 'tacticalDecision';
  positionHash: string;
  result: AiSearchResult;
};

function parsePositiveInteger(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`--${name} must contain positive safe integers.`);
  }
  return parsed;
}

function parseArgs(argv: string[]): Settings {
  const args = new Map<string, string>();
  for (const entry of argv) {
    if (!entry.startsWith('--')) continue;
    const [key, value = ''] = entry.slice(2).split('=');
    args.set(key, value);
  }

  const profile = (args.get('profile') ?? 'smoke') as Profile;
  if (profile !== 'smoke' && profile !== 'full') {
    throw new Error('--profile must be smoke or full.');
  }
  const difficulties = (args.get('difficulties') ?? 'easy,medium,hard')
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

  const defaultBudgets =
    profile === 'full' ? '64,128,256,512,1024,2048' : '64,256';
  const nodeBudgets = (args.get('nodes') ?? defaultBudgets)
    .split(',')
    .map((value) => parsePositiveInteger(value, 'nodes'));
  if (new Set(nodeBudgets).size !== nodeBudgets.length) {
    throw new Error('--nodes must not contain duplicate budgets.');
  }

  return {
    catastrophicRegretThreshold: parsePositiveInteger(
      args.get('catastrophic-regret') ?? '5000',
      'catastrophic-regret',
    ),
    difficulties,
    enforceGates: args.get('enforce-gates') === 'true',
    nodeBudgets: [...nodeBudgets].sort((left, right) => left - right),
    oracleDepth: parsePositiveInteger(
      args.get('oracle-depth') ?? '3',
      'oracle-depth',
    ),
    profile,
    repetitions: parsePositiveInteger(
      args.get('repetitions') ?? (profile === 'full' ? '8' : '1'),
      'repetitions',
    ),
  };
}

function createSeededRandom(seed: number): () => number {
  let current = seed >>> 0;
  return () => {
    current = (current * 1_664_525 + 1_013_904_223) >>> 0;
    return current / 0x1_0000_0000;
  };
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

function runOracle(
  fixture: TacticalOracleFixture,
  legalActionCount: number,
  settings: Settings,
  ruleConfig: ReturnType<typeof withRuleDefaults>,
): OracleRecord {
  const result = chooseComputerAction({
    diagnosticRootCandidateLimit: legalActionCount,
    difficulty: 'hard',
    random: () => 0,
    ruleConfig,
    searchBudget: { depth: settings.oracleDepth, type: 'fixedDepth' },
    state: fixture.state,
  });
  const candidates = result.rootCandidates.map((candidate) => ({
    actionKey: tacticalActionKey(candidate.action),
    score: candidate.score,
  }));

  return {
    bestActionKey: tacticalActionKey(result.bestSearchAction),
    candidates,
    completedDepth: result.completedDepth,
    evaluatedNodes: result.evaluatedNodes,
    fixtureId: fixture.id,
    legalActionCount,
    result,
  };
}

function buildMarkdown(report: {
  curve: ReturnType<typeof summarizeCompetenceSamples>;
  gates: ReturnType<typeof evaluateCompetenceGates>;
  provenance: {
    fixtureSha256: string;
    gitRevision: string;
    rawSamplesSha256: string;
  };
  settings: Settings;
}): string {
  const lines = [
    '# AI Competence And Fixed-Node Regret',
    '',
    `Revision: \`${report.provenance.gitRevision}\``,
    '',
    `Fixture checksum: \`${report.provenance.fixtureSha256}\``,
    '',
    `Raw checksum: \`${report.provenance.rawSamplesSha256}\``,
    '',
    `Gate verdict at the largest node budget: **${report.gates.verdict}**`,
    '',
    'The oracle is a complete fixed-depth root search. Candidate actions are rescored on that deeper root scale; missing oracle candidates remain missing rather than becoming zero regret.',
    '',
    '| Difficulty | Nodes | Samples | Oracle coverage | Unique-win accuracy | Unique-defense accuracy | Mean regret | P95 regret | Catastrophic regret | Root prep transitions | Completed root | Partial depth | Fallback | Zero depth |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];

  const share = (value: { share: number } | null): string =>
    value ? String(value.share) : '—';
  for (const point of report.curve) {
    lines.push(
      `| ${point.difficulty} | ${point.nodeBudget} | ${point.sampleCount} | ${share(point.oracleCoverage)} | ${share(point.uniqueWinAccuracy)} | ${share(point.uniqueDefenseAccuracy)} | ${point.oracleRegret?.mean ?? '—'} | ${point.oracleRegret?.p95 ?? '—'} | ${share(point.catastrophicRegretShare)} | ${point.rootPreparationTransitions.mean} | ${share(point.fullRootCoverageShare)} | ${share(point.partialDepthShare)} | ${share(point.fallbackShare)} | ${share(point.zeroDepthShare)} |`,
    );
  }

  lines.push(
    '',
    'Confirmatory failures:',
    '',
    ...(report.gates.failures.length
      ? report.gates.failures.map(
          (failure) =>
            `- ${failure.difficulty} ${failure.metric}: ${failure.observed ?? 'missing'} (required ${failure.required})`,
        )
      : ['- None.']),
    '',
    `Settings: oracle depth ${report.settings.oracleDepth}; node budgets ${report.settings.nodeBudgets.join(', ')}; repetitions ${report.settings.repetitions}; catastrophic-regret threshold ${report.settings.catastrophicRegretThreshold}.`,
  );
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const settings = parseArgs(process.argv.slice(2));
  const ruleConfig = withRuleDefaults({ drawRule: 'none', scoringMode: 'off' });
  const fixtures = buildTacticalOracleFixtures(ruleConfig);
  const oracleRecords = new Map<string, OracleRecord>();
  let pathAssertionFailures = 0;

  for (const fixture of fixtures) {
    const legalActionCount = getLegalActions(fixture.state, ruleConfig).length;
    const oracle = runOracle(fixture, legalActionCount, settings, ruleConfig);
    oracleRecords.set(fixture.id, oracle);

    if (!fixture.expectedActionKeys.includes(oracle.bestActionKey)) {
      pathAssertionFailures += 1;
    }
    if (
      oracle.result.fallbackKind !== 'none' ||
      oracle.result.searchBudget?.type !== 'fixedDepth' ||
      oracle.completedDepth < 1
    ) {
      pathAssertionFailures += 1;
    }
    if (
      fixture.objective === 'uniqueDefense' &&
      (oracle.completedDepth !== settings.oracleDepth ||
        oracle.candidates.length !== legalActionCount)
    ) {
      pathAssertionFailures += 1;
    }
  }

  const rawSamples: RawDecisionRecord[] = [];
  for (const difficulty of settings.difficulties) {
    for (const nodeBudget of settings.nodeBudgets) {
      for (const fixture of fixtures) {
        const oracle = oracleRecords.get(fixture.id) as OracleRecord;
        for (
          let repetition = 0;
          repetition < settings.repetitions;
          repetition += 1
        ) {
          const seed =
            settings.difficulties.indexOf(difficulty) * 1_000_000 +
            settings.nodeBudgets.indexOf(nodeBudget) * 10_000 +
            fixtures.indexOf(fixture) * 100 +
            repetition +
            1;
          const result = chooseComputerAction({
            behaviorProfile: createAiBehaviorProfile(
              `competence/${difficulty}/${fixture.id}/${repetition}`,
            ),
            difficulty,
            random: createSeededRandom(seed),
            ruleConfig,
            searchBudget: {
              maxDepth: 8,
              maxEvaluatedNodes: nodeBudget,
              type: 'fixedNodes',
            },
            state: fixture.state,
          });
          const selectedActionKey = tacticalActionKey(result.action);
          const score = scoreTacticalDecision({
            catastrophicRegretThreshold: settings.catastrophicRegretThreshold,
            expectedActionKeys: fixture.expectedActionKeys,
            oracleCandidates: oracle.candidates,
            selectedActionKey,
          });

          rawSamples.push({
            ...score,
            completedDepth: result.completedDepth,
            completedRootMoves: result.completedRootMoves,
            difficulty,
            evaluatedNodes: result.evaluatedNodes,
            fallbackKind: result.fallbackKind,
            fixtureId: fixture.id,
            kind: 'tacticalDecision',
            legalActionCount: oracle.legalActionCount,
            nodeBudget,
            objective: fixture.objective,
            partialDepth: result.partialDepth,
            partialRootMoves: result.partialRootMoves,
            positionHash: hashPosition(fixture.state),
            result,
            rootPreparationTransitions:
              result.diagnostics.rootPreparationTransitions,
            seed,
            selectedActionKey,
            spatialVariant: fixture.spatialVariant,
            timedOut: result.timedOut,
          });
        }
      }
    }
  }

  const curve = summarizeCompetenceSamples(rawSamples);
  const gates = evaluateCompetenceGates(curve, {
    maxCatastrophicRegretShare: { easy: 0.1, hard: 0, medium: 0.05 },
    maxP95OracleRegret: { easy: 5_000, hard: 1_000, medium: 2_500 },
    minTacticalAccuracy: { easy: 0.9, hard: 1, medium: 0.95 },
  });
  const rawPayload = `${rawSamples.map((sample) => JSON.stringify(sample)).join('\n')}\n`;
  const rawSamplesSha256 = createHash('sha256')
    .update(rawPayload)
    .digest('hex');
  const fixtureManifest = fixtures.map((fixture) => ({
    expectedActionKeys: fixture.expectedActionKeys,
    id: fixture.id,
    objective: fixture.objective,
    origin: fixture.origin,
    positionHash: hashPosition(fixture.state),
    spatialVariant: fixture.spatialVariant,
  }));
  const fixtureSha256 = createHash('sha256')
    .update(JSON.stringify(fixtureManifest))
    .digest('hex');
  const packageJson = JSON.parse(
    await readFile(path.join(process.cwd(), 'package.json'), 'utf8'),
  ) as { version?: string };
  const status = gitOutput(['status', '--porcelain']);
  const report = {
    contract: {
      budgetCurve:
        'Every subject decision uses the same fixture, seed identity, and fixed-node work levels.',
      gateScope:
        'Confirmatory gates apply only to the largest measured node budget per difficulty.',
      missingness:
        'A selected action absent from the complete oracle root is missing oracle coverage, never zero regret.',
      oracle:
        'Hard search at complete fixed depth, with every searched root candidate returned for rescoring.',
      tacticalLabels:
        'Unique wins and defenses are derived from domain rules and validated after exact geometric mirroring.',
    },
    curve,
    gates,
    generatedAt: new Date().toISOString(),
    oracle: [...oracleRecords.values()],
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
      rawSampleCount: rawSamples.length,
      rawSamplesPath: path.relative(process.cwd(), RAW_OUTPUT),
      rawSamplesSha256,
    },
    schemaVersion: SCHEMA_VERSION,
    settings: { ...settings, ruleConfig },
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(RAW_OUTPUT, rawPayload, 'utf8');
  await writeFile(JSON_OUTPUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(MARKDOWN_OUTPUT, buildMarkdown(report), 'utf8');

  if (
    pathAssertionFailures > 0 ||
    (settings.enforceGates && gates.verdict === 'fail')
  ) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
