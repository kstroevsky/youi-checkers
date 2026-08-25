import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  generateFixtureCatalogV2,
  type FixtureCandidateV2,
  type FixtureOriginScheduleV2,
  type ImpossibleIntersectionV2,
} from '@/ai/test/fixtureGeneratorV2.node';

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  const allowed = new Set([
    'candidates',
    'impossible',
    'out',
    'pilot-corpus-hash',
    'run-seed',
    'sealed',
  ]);
  for (const entry of argv) {
    if (!entry.startsWith('--')) continue;
    const [key, value = ''] = entry.slice(2).split('=');
    if (!allowed.has(key)) throw new Error(`Unknown argument --${key}.`);
    args.set(key, value);
  }
  if (!args.get('candidates')) {
    throw new Error('--candidates=<fixture-candidates.jsonl> is required.');
  }
  return {
    candidates: args.get('candidates') as string,
    impossible: args.get('impossible') ?? null,
    out:
      args.get('out') ??
      path.join(process.cwd(), 'output', 'ai', 'fixture-catalog-v2'),
    pilotCorpusHash: args.get('pilot-corpus-hash') ?? null,
    runSeed: args.get('run-seed') ?? 'youi-fixture-development-v2',
    sealed: args.get('sealed') === 'true',
  };
}

async function readJsonl<T>(filePath: string): Promise<T[]> {
  return (await readFile(filePath, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const originSchedule: FixtureOriginScheduleV2 = args.pilotCorpusHash
    ? {
        mode: 'preexistingPilotAvailable',
        pilotCorpusHash: args.pilotCorpusHash,
      }
    : { mode: 'noPreexistingPilot', pilotCorpusHash: null };
  const candidates = await readJsonl<FixtureCandidateV2>(args.candidates);
  const impossible = args.impossible
    ? (JSON.parse(
        await readFile(args.impossible, 'utf8'),
      ) as ImpossibleIntersectionV2[])
    : [];
  const result = generateFixtureCatalogV2({
    candidates,
    impossible,
    originSchedule,
    runSeed: args.runSeed,
    sealed: args.sealed,
  });
  await mkdir(path.dirname(args.out), { recursive: true });
  await Promise.all([
    writeFile(
      `${args.out}.generation.json`,
      `${JSON.stringify(result, null, 2)}\n`,
    ),
    writeFile(
      `${args.out}.md`,
      [
        '# FixtureGeneratorV2',
        '',
        `Status: **${result.status}**`,
        '',
        `Schedule: ${result.schedule.length}; selected: ${result.catalog?.lineages.length ?? 0}; deficits: ${result.deficits.length}.`,
        '',
        `Schedule hash: \`${result.scheduleHash}\``,
        '',
        `Generator hash: \`${result.generatorHash}\``,
        '',
        result.status === 'inadequate'
          ? 'The complete catalog was not emitted. Supply treatment-independent candidates for every reported slot; do not relabel or fabricate origins.'
          : `Catalog hash: \`${result.catalog?.catalogHash}\``,
        '',
      ].join('\n'),
    ),
    ...(result.catalog
      ? [
          writeFile(
            `${args.out}.catalog.json`,
            `${JSON.stringify(result.catalog, null, 2)}\n`,
          ),
        ]
      : []),
  ]);
  process.stdout.write(
    `Fixture generation ${result.status}: ${args.out}.generation.json\n`,
  );
  if (result.status !== 'complete') process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
