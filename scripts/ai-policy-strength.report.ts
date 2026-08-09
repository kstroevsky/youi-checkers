import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import allocationFile from '@/ai/test/fixtures/ai-policy-strength-allocation.json';
import protocolFile from '@/ai/test/fixtures/ai-policy-strength-protocol.json';
import { loadLegacyPolicyV0 } from '@/ai/test/legacyPolicyV0.node';
import {
  runPolicyMatchPair,
  type PolicyMatchPair,
} from '@/ai/test/policyMatch';
import { loadCurrentAiPolicy } from '@/ai/test/policyProvenance.node';
import {
  evaluateSequentialStrength,
  type SequentialStrengthConfig,
  type StrengthQuestion,
} from '@/ai/test/policyStrengthProtocol';
import {
  expandStrengthFixtureSymmetry,
  type StrengthFixture,
} from '@/ai/test/referenceStrength';
import { STRENGTH_ADJUDICATION_VERSION } from '@/ai/test/strengthOutcome';
import { hashPosition, withRuleDefaults } from '@/domain';
import type { AiDifficulty } from '@/shared/types/session';

import {
  POSITION_BUCKET_SCENARIOS,
  buildScenarioState,
} from './aiScenarioCatalog';

export const AI_POLICY_STRENGTH_SCHEMA_VERSION = 1 as const;
export const FIXED_NODE_BUDGET_SEMANTICS_VERSION = 1 as const;

type Profile = 'full' | 'smoke';

type Settings = {
  alpha: number;
  beta: number;
  difficulty: AiDifficulty;
  enforceGate: boolean;
  margin: number;
  maxBlocks: number;
  maxPlies: number;
  minBlocks: number;
  nodeBudget: number;
  profile: Profile;
  question: StrengthQuestion;
  scenarioLimit: number;
};

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function parsePositiveInteger(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive safe integer.`);
  }
  return parsed;
}

function parseProbability(value: string, name: string): number {
  const parsed = Number(value);
  if (!(parsed > 0 && parsed < 1)) {
    throw new Error(`--${name} must be strictly between zero and one.`);
  }
  return parsed;
}

function parseArgs(argv: string[]): { out: string; settings: Settings } {
  const allowed = new Set([
    'alpha',
    'beta',
    'difficulty',
    'enforce-gate',
    'margin',
    'max-blocks',
    'max-plies',
    'min-blocks',
    'nodes',
    'out',
    'profile',
    'question',
    'scenario-limit',
  ]);
  const args = new Map<string, string>();
  for (const entry of argv) {
    if (!entry.startsWith('--')) continue;
    const [key, value = ''] = entry.slice(2).split('=');
    if (!allowed.has(key)) throw new Error(`Unknown argument --${key}.`);
    args.set(key, value);
  }
  const profile = (args.get('profile') ?? 'smoke') as Profile;
  if (profile !== 'full' && profile !== 'smoke') {
    throw new Error('--profile must be full or smoke.');
  }
  const question = (args.get('question') ??
    (profile === 'full'
      ? protocolFile.primary.question
      : 'nonInferiority')) as StrengthQuestion;
  if (!['equivalence', 'nonInferiority', 'superiority'].includes(question)) {
    throw new Error(
      '--question must be equivalence, nonInferiority, or superiority.',
    );
  }
  const difficulty = (args.get('difficulty') ??
    protocolFile.search.difficulty) as AiDifficulty;
  if (!['easy', 'medium', 'hard'].includes(difficulty)) {
    throw new Error('--difficulty must be easy, medium, or hard.');
  }
  const holdoutCount = POSITION_BUCKET_SCENARIOS.filter(
    (scenario) => scenario.strengthSplit === 'holdout',
  ).length;
  const maxBlocks = parsePositiveInteger(
    args.get('max-blocks') ??
      (profile === 'full'
        ? String(protocolFile.sampling.maxBalancedBlocks)
        : '1'),
    'max-blocks',
  );
  const minBlocks = parsePositiveInteger(
    args.get('min-blocks') ??
      (profile === 'full'
        ? String(protocolFile.sampling.minBalancedBlocks)
        : '1'),
    'min-blocks',
  );
  if (minBlocks > maxBlocks) {
    throw new Error('--min-blocks cannot exceed --max-blocks.');
  }

  return {
    out:
      args.get('out') ??
      path.join(process.cwd(), 'output', 'ai', 'ai-policy-strength'),
    settings: {
      alpha: parseProbability(
        args.get('alpha') ?? String(protocolFile.primary.alpha),
        'alpha',
      ),
      beta: parseProbability(
        args.get('beta') ?? String(protocolFile.primary.beta),
        'beta',
      ),
      difficulty,
      enforceGate: args.get('enforce-gate') === 'true',
      margin: parseProbability(
        args.get('margin') ?? String(protocolFile.primary.margin),
        'margin',
      ),
      maxBlocks,
      maxPlies: parsePositiveInteger(
        args.get('max-plies') ??
          (profile === 'full'
            ? String(protocolFile.primary.horizonPlies)
            : '4'),
        'max-plies',
      ),
      minBlocks,
      nodeBudget: parsePositiveInteger(
        args.get('nodes') ??
          (profile === 'full'
            ? String(protocolFile.search.fixedNodeBudget)
            : '32'),
        'nodes',
      ),
      profile,
      question,
      scenarioLimit: parsePositiveInteger(
        args.get('scenario-limit') ??
          String(profile === 'full' ? holdoutCount : 1),
        'scenario-limit',
      ),
    },
  };
}

function buildFixtures(settings: Settings): StrengthFixture[] {
  const ruleConfig = withRuleDefaults({
    drawRule: 'threefold',
    scoringMode: 'off',
  });
  return POSITION_BUCKET_SCENARIOS.filter(
    (scenario) => scenario.strengthSplit === 'holdout',
  )
    .slice(0, settings.scenarioLimit)
    .flatMap((scenario) =>
      expandStrengthFixtureSymmetry({
        bucket: scenario.bucket,
        id: scenario.label,
        mirror: 'original',
        origin: scenario.randomPlay
          ? 'randomLegal'
          : scenario.turnCount === 0
            ? 'initial'
            : 'syntheticLoop',
        split: scenario.strengthSplit,
        state: buildScenarioState(scenario, ruleConfig),
      }),
    );
}

async function fingerprintFiles(files: string[]): Promise<string> {
  const contents = await Promise.all(
    files
      .sort()
      .map(async (file) => `${file}\0${await readFile(file, 'utf8')}`),
  );
  return sha256(contents.join('\0'));
}

function gitFiles(directory: string): string[] {
  return execFileSync('git', ['ls-files', directory], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .map((file) => path.join(process.cwd(), file));
}

function gitRevision(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
}

function markdown(report: {
  primary: ReturnType<typeof evaluateSequentialStrength>;
  provenance: {
    currentPolicyHash: string;
    domainHash: string;
    harnessHash: string;
    legacyPolicyHash: string;
  };
  settings: Settings;
}): string {
  const { primary } = report;
  return [
    '# Current AI vs LegacyPolicyV0 Strength',
    '',
    `Primary question: **${report.settings.question}**; verdict: **${primary.verdict}**.`,
    '',
    `Fixed-horizon pentanomial point share: ${primary.meanPointShare ?? 'n/a'} over ${primary.pairCount} color-swapped pairs.`,
    '',
    `LLR: ${primary.llr ?? 'not evaluated'}; secondary LLR: ${primary.secondaryLlr ?? 'n/a'}; Wald bounds: ${primary.bounds.lower} .. ${primary.bounds.upper}.`,
    '',
    `Balanced block: ${primary.balancedBlock ?? 'incomplete'}; fixed horizon: ${report.settings.maxPlies} plies; fixed-node budget: ${report.settings.nodeBudget}.`,
    '',
    `Current policy: \`${report.provenance.currentPolicyHash}\``,
    '',
    `Legacy policy: \`${report.provenance.legacyPolicyHash}\``,
    '',
    `Domain: \`${report.provenance.domainHash}\``,
    '',
    `Harness: \`${report.provenance.harnessHash}\``,
    '',
    'Natural resolution remains secondary; unfinished games are resolved only by the versioned symmetric domain adjudicator for the declared primary endpoint.',
    '',
  ].join('\n');
}

function isAcceptVerdict(verdict: string): boolean {
  return verdict.startsWith('accept');
}

function isTerminalVerdict(verdict: string): boolean {
  return verdict !== 'continue';
}

async function main(): Promise<void> {
  const { out, settings } = parseArgs(process.argv.slice(2));
  const ruleConfig = withRuleDefaults({
    drawRule: 'threefold',
    scoringMode: 'off',
  });
  const fixtures = buildFixtures(settings);
  if (!fixtures.length) throw new Error('No holdout fixtures selected.');
  const allocation = Object.fromEntries(
    fixtures.map((fixture) => {
      const weight =
        allocationFile.allocation[
          fixture.id as keyof typeof allocationFile.allocation
        ];
      if (!weight) {
        throw new Error(`Frozen allocation is missing fixture ${fixture.id}.`);
      }
      return [fixture.id, weight];
    }),
  );
  const blockPairCount = Object.values(allocation).reduce(
    (sum, weight) => sum + weight,
    0,
  );
  const sequentialConfig: SequentialStrengthConfig = {
    allocation,
    alpha: settings.alpha,
    beta: settings.beta,
    margin: settings.margin,
    maxPairs: settings.maxBlocks * blockPairCount,
    minPairs: settings.minBlocks * blockPairCount,
    question: settings.question,
  };
  const currentPolicy = await loadCurrentAiPolicy();
  const legacyPolicy = await loadLegacyPolicyV0();
  const pairs: PolicyMatchPair[] = [];
  let primary = evaluateSequentialStrength(pairs, sequentialConfig);

  try {
    for (let block = 0; block < settings.maxBlocks; block += 1) {
      for (
        let fixtureIndex = 0;
        fixtureIndex < fixtures.length;
        fixtureIndex += 1
      ) {
        const fixture = fixtures[fixtureIndex];
        const weight = allocation[fixture.id];
        for (let repeat = 0; repeat < weight; repeat += 1) {
          const seedBase =
            (block + 1) * 1_000_003 + fixtureIndex * 10_007 + repeat * 101;
          pairs.push(
            await runPolicyMatchPair({
              adjudicateHorizon: true,
              difficulty: settings.difficulty,
              fixture,
              maxPlies: settings.maxPlies,
              nodeBudget: settings.nodeBudget,
              pairId: `${fixture.id}/block-${block}/repeat-${repeat}`,
              policyA: currentPolicy,
              policyASeed: seedBase + 17,
              policyB: legacyPolicy,
              policyBSeed: seedBase + 29,
              ruleConfig,
            }),
          );
        }
      }
      primary = evaluateSequentialStrength(pairs, sequentialConfig);
      if (isTerminalVerdict(primary.verdict)) break;
    }
  } finally {
    await Promise.all([currentPolicy.dispose(), legacyPolicy.dispose()]);
  }

  const naturalResolvedGames = pairs
    .flatMap((pair) => pair.games)
    .filter((game) => game.policyAPoints !== null).length;
  const fixtureManifest = fixtures.map((fixture) => ({
    bucket: fixture.bucket,
    id: fixture.id,
    mirror: fixture.mirror,
    origin: fixture.origin,
    positionHash: hashPosition(fixture.state),
    split: fixture.split,
  }));
  const raw = `${pairs.map((pair) => JSON.stringify(pair)).join('\n')}\n`;
  const [domainHash, harnessHash] = await Promise.all([
    fingerprintFiles(gitFiles('src/domain')),
    fingerprintFiles([
      path.join(process.cwd(), 'src/ai/test/policy.ts'),
      path.join(process.cwd(), 'src/ai/test/policyMatch.ts'),
      path.join(process.cwd(), 'src/ai/test/policyStrengthProtocol.ts'),
      path.join(process.cwd(), 'src/ai/test/strengthOutcome.ts'),
      path.join(process.cwd(), 'scripts/ai-policy-strength.report.ts'),
    ]),
  ]);
  const report = {
    allocation: {
      ...allocationFile,
      active: allocation,
      hash: sha256(JSON.stringify(allocationFile)),
    },
    protocol: {
      ...protocolFile,
      hash: sha256(JSON.stringify(protocolFile)),
    },
    generatedAt: new Date().toISOString(),
    primary,
    provenance: {
      adjudicationVersion: STRENGTH_ADJUDICATION_VERSION,
      budgetSemanticsVersion: FIXED_NODE_BUDGET_SEMANTICS_VERSION,
      currentPolicyHash: currentPolicy.sourceHash,
      domainHash,
      fixtureHash: sha256(JSON.stringify(fixtureManifest)),
      gitRevision: gitRevision(),
      harnessHash,
      legacyPolicyHash: legacyPolicy.sourceHash,
      rawHash: sha256(raw),
    },
    schemaVersion: AI_POLICY_STRENGTH_SCHEMA_VERSION,
    secondary: {
      naturalResolvedGameCount: naturalResolvedGames,
      naturalResolvedGameShare:
        naturalResolvedGames / Math.max(1, pairs.length * 2),
    },
    settings,
    workload: fixtureManifest,
  };
  const summary = markdown(report);
  await mkdir(path.dirname(out), { recursive: true });
  await Promise.all([
    writeFile(`${out}.json`, `${JSON.stringify(report, null, 2)}\n`, 'utf8'),
    writeFile(`${out}.md`, summary, 'utf8'),
    writeFile(`${out}.samples.jsonl`, raw, 'utf8'),
  ]);
  process.stdout.write(summary);

  if (settings.enforceGate && !isAcceptVerdict(primary.verdict)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
