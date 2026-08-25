import { createHash } from 'node:crypto';
import { mkdir, open, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { actionKey } from '@/ai/search/shared';
import {
  solveWdlProofQueryV1,
  verifyWdlProofCertificateV1,
  WDL_PROOF_PROTOCOL_HASH_V1,
  wdlProofQueryIdentityV1,
  type WdlProofLimitsV1,
  type WdlProofResultV1,
} from '@/ai/test/wdlProof.node';
import {
  advanceGeneratedEngineState,
  getLegalActions,
  withRuleDefaults,
  type EngineState,
  type RuleConfig,
} from '@/domain';

export type WdlProofQueryKindV1 =
  | 'catalogRoot'
  | 'rootActionSuccessor'
  | 'potentiallyReferenceSafe'
  | 'nextOpponentBoundary'
  | 'playerReply'
  | 'playerReplySuccessor';

export type WdlProofQueryV1 = {
  actionKey: string | null;
  kind: WdlProofQueryKindV1;
  lineageId: string;
  queryId: string;
  state: EngineState;
  stateKey: string;
};

export type WdlProofQuerySetV1 = {
  catalogHash: string;
  proofProtocolHash: string;
  queries: WdlProofQueryV1[];
  querySetHash: string;
  version: 1;
};

export type WdlEvidenceSnapshotV1 = {
  artifactHash: string;
  catalogHash: string;
  proofCertificates: NonNullable<WdlProofResultV1['certificate']>[];
  proofProtocolHash: string;
  proofQuerySetHash: string;
  resultRecords: WdlProofResultV1[];
  scope: 'development' | 'sealed';
  verificationReport: {
    invalidCertificateCount: number;
    resolvedCount: number;
    unknownCount: number;
    valid: boolean;
  };
  version: 1;
};

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(',')}}`;
}

function hash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function assertHash(name: string, value: string): void {
  if (!/^[a-f0-9]{64}$/u.test(value))
    throw new Error(`${name} must be a SHA-256 digest.`);
}

/** Builds the treatment-independent root and root-action proof neighborhood. */
export function buildWdlProofQuerySetV1({
  additionalQueries = [],
  catalogHash,
  config: configInput,
  roots,
}: {
  additionalQueries?: Array<{
    actionKey?: string | null;
    kind: Exclude<WdlProofQueryKindV1, 'catalogRoot' | 'rootActionSuccessor'>;
    lineageId: string;
    state: EngineState;
  }>;
  catalogHash: string;
  config: Partial<RuleConfig>;
  roots: Array<{ lineageId: string; state: EngineState }>;
}): WdlProofQuerySetV1 {
  assertHash('catalogHash', catalogHash);
  if (!roots.length)
    throw new Error('A proof query set requires catalog roots.');
  const config = withRuleDefaults(configInput);
  const candidates: Array<Omit<WdlProofQueryV1, 'queryId'>> = [];
  for (const { lineageId, state } of roots) {
    candidates.push({
      actionKey: null,
      kind: 'catalogRoot',
      lineageId,
      state: structuredClone(state),
      stateKey: wdlProofQueryIdentityV1(state, config),
    });
    for (const action of getLegalActions(state, config)
      .slice()
      .sort((left, right) => actionKey(left).localeCompare(actionKey(right)))) {
      const successor = advanceGeneratedEngineState(state, action, config);
      candidates.push({
        actionKey: actionKey(action),
        kind: 'rootActionSuccessor',
        lineageId,
        state: successor,
        stateKey: wdlProofQueryIdentityV1(successor, config),
      });
    }
  }
  for (const query of additionalQueries) {
    candidates.push({
      actionKey: query.actionKey ?? null,
      kind: query.kind,
      lineageId: query.lineageId,
      state: structuredClone(query.state),
      stateKey: wdlProofQueryIdentityV1(query.state, config),
    });
  }

  const unique = new Map<string, Omit<WdlProofQueryV1, 'queryId'>>();
  for (const candidate of candidates) {
    const identity = `${candidate.lineageId}\u0000${candidate.kind}\u0000${candidate.actionKey ?? '-'}\u0000${candidate.stateKey}`;
    if (!unique.has(identity)) unique.set(identity, candidate);
  }
  const queries = [...unique.values()]
    .sort((left, right) =>
      `${left.lineageId}:${left.kind}:${left.actionKey ?? ''}:${left.stateKey}`.localeCompare(
        `${right.lineageId}:${right.kind}:${right.actionKey ?? ''}:${right.stateKey}`,
      ),
    )
    .map(
      (query, index): WdlProofQueryV1 => ({
        ...query,
        queryId: `wdl-${String(index + 1).padStart(6, '0')}`,
      }),
    );
  const body = {
    catalogHash,
    proofProtocolHash: WDL_PROOF_PROTOCOL_HASH_V1,
    queries,
    version: 1 as const,
  };
  return { ...body, querySetHash: hash(body) };
}

export function createWdlEvidenceSnapshotV1({
  config: configInput,
  limits,
  querySet,
  scope,
}: {
  config: Partial<RuleConfig>;
  limits?: WdlProofLimitsV1;
  querySet: WdlProofQuerySetV1;
  scope: 'development' | 'sealed';
}): WdlEvidenceSnapshotV1 {
  const config = withRuleDefaults(configInput);
  const resultRecords = querySet.queries.map((query) =>
    solveWdlProofQueryV1({
      config,
      ...(limits ? { limits } : {}),
      queryId: query.queryId,
      state: query.state,
    }),
  );
  const invalidCertificateCount = resultRecords.filter(
    (result) =>
      result.certificate !== null &&
      !verifyWdlProofCertificateV1(result, config).valid,
  ).length;
  const verificationReport = {
    invalidCertificateCount,
    resolvedCount: resultRecords.filter((result) => result.source !== 'unknown')
      .length,
    unknownCount: resultRecords.filter((result) => result.source === 'unknown')
      .length,
    valid: invalidCertificateCount === 0,
  };
  const body = {
    catalogHash: querySet.catalogHash,
    proofCertificates: resultRecords.flatMap((result) =>
      result.certificate ? [result.certificate] : [],
    ),
    proofProtocolHash: querySet.proofProtocolHash,
    proofQuerySetHash: querySet.querySetHash,
    resultRecords,
    scope,
    verificationReport,
    version: 1 as const,
  };
  return { ...body, artifactHash: hash(body) };
}

/** Atomically freezes one snapshot and refuses replacement. */
export async function freezeWdlEvidenceSnapshotV1(
  outputPath: string,
  snapshot: WdlEvidenceSnapshotV1,
): Promise<void> {
  if (!snapshot.verificationReport.valid)
    throw new Error('Cannot freeze invalid proof certificates.');
  await mkdir(dirname(outputPath), { recursive: true });
  const lock = `${outputPath}.lock`;
  const handle = await open(lock, 'wx');
  await handle.close();
  const temporary = `${outputPath}.tmp-${process.pid}`;
  await writeFile(temporary, `${canonicalJson(snapshot)}\n`, 'utf8');
  await rename(temporary, outputPath);
}
