import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import studyProtocol from '@/ai/test/fixtures/human-ai-study-protocol.json';
import {
  HUMAN_CALIBRATION_SCHEMA_VERSION,
  MINI_PXI_CONSTRUCTS,
  fitHumanPreferenceModel,
  validateHumanPreferenceObservations,
  type HumanPreferenceObservation,
  type MiniPxiConstruct,
} from '@/ai/test/humanCalibration';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function parseArgs(argv: string[]): { input: string; out: string } {
  const allowed = new Set(['input', 'out']);
  const args = new Map<string, string>();
  for (const entry of argv) {
    if (!entry.startsWith('--')) continue;
    const [key, value = ''] = entry.slice(2).split('=');
    if (!allowed.has(key)) throw new Error(`Unknown argument --${key}.`);
    args.set(key, value);
  }
  const input = args.get('input');
  if (!input) throw new Error('--input=<observations.jsonl> is required.');
  return {
    input: path.resolve(input),
    out:
      args.get('out') ??
      path.join(process.cwd(), 'output', 'ai', 'human-calibration'),
  };
}

function parseJsonl(payload: string): HumanPreferenceObservation[] {
  return payload
    .split('\n')
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line) as HumanPreferenceObservation;
      } catch (error) {
        throw new Error(
          `Invalid JSON on input line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
    });
}

function summarizeMiniPxi(observations: HumanPreferenceObservation[]) {
  const differences = Object.fromEntries(
    MINI_PXI_CONSTRUCTS.map((construct) => [construct, [] as number[]]),
  ) as Record<MiniPxiConstruct, number[]>;
  for (const observation of observations) {
    if (!observation.miniPxi) continue;
    const orientation = observation.leftPolicyId === 'current' ? 1 : -1;
    for (const construct of MINI_PXI_CONSTRUCTS) {
      differences[construct].push(
        orientation *
          (observation.miniPxi.left[construct] -
            observation.miniPxi.right[construct]),
      );
    }
  }
  return Object.fromEntries(
    MINI_PXI_CONSTRUCTS.map((construct) => {
      const values = differences[construct];
      return [
        construct,
        {
          meanCurrentMinusLegacy: values.length
            ? values.reduce((sum, value) => sum + value, 0) / values.length
            : null,
          observationCount: values.length,
        },
      ];
    }),
  );
}

function markdown(report: {
  confirmatoryReady: boolean;
  model: ReturnType<typeof fitHumanPreferenceModel>;
  observationCount: number;
  participantCount: number;
  studyKindCounts: Record<string, number>;
}): string {
  return [
    '# Human AI Experience Calibration',
    '',
    `Participants: ${report.participantCount}; observations: ${report.observationCount}; confirmatory minimum reached: ${report.confirmatoryReady}.`,
    '',
    `Study modes: ${JSON.stringify(report.studyKindCounts)}.`,
    '',
    `Training log loss: ${report.model.trainingMetrics.logLoss}; held-out-player log loss: ${report.model.heldoutMetrics?.logLoss ?? 'unavailable'}.`,
    '',
    `Held-out players: ${report.model.heldoutParticipantIds.length}.`,
    '',
    'Preference coefficients are regularized mixed-effects estimates. miniPXI constructs remain separate secondary outcomes; neither is a release gate until the preregistered participant minimum and held-out-player criteria are met.',
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  const { input, out } = parseArgs(process.argv.slice(2));
  const raw = await readFile(input, 'utf8');
  const observations = parseJsonl(raw);
  validateHumanPreferenceObservations(observations);
  const participantCount = new Set(
    observations.map(({ participantId }) => participantId),
  ).size;
  const model = fitHumanPreferenceModel(observations);
  const report = {
    confirmatoryReady:
      participantCount >=
        studyProtocol.minimumParticipantsBeforeConfirmatoryFit &&
      model.heldoutMetrics !== null,
    generatedAt: new Date().toISOString(),
    miniPxi: summarizeMiniPxi(observations),
    model,
    observationCount: observations.length,
    participantCount,
    provenance: {
      inputHash: sha256(raw),
      protocolHash: sha256(JSON.stringify(studyProtocol)),
    },
    protocol: studyProtocol,
    schemaVersion: HUMAN_CALIBRATION_SCHEMA_VERSION,
    studyKindCounts: Object.fromEntries(
      ['fullGameCrossover', 'replayPreference'].map((kind) => [
        kind,
        observations.filter((observation) => observation.studyKind === kind)
          .length,
      ]),
    ),
  };
  const summary = markdown(report);
  await mkdir(path.dirname(out), { recursive: true });
  await Promise.all([
    writeFile(`${out}.json`, `${JSON.stringify(report, null, 2)}\n`, 'utf8'),
    writeFile(`${out}.md`, summary, 'utf8'),
  ]);
  process.stdout.write(summary);
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
