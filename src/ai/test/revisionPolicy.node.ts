import { createHash, randomUUID } from 'node:crypto';

import {
  materializeRevisionPolicyWorkspace,
  RevisionPolicyRpc,
} from '@/ai/test/legacyPolicyV0.node';
import type {
  AiPolicy,
  AiPolicyDecision,
  AiPolicyDecisionRequest,
  AiPolicySession,
} from '@/ai/test/policy';
import { fingerprintRevisionAiSource } from '@/ai/test/policyProvenance.node';

export const REVISION_POLICY_ADAPTER_VERSION = 1;

export type RevisionPolicyOptions = {
  behaviorSeedNamespace?: string;
  id: string;
  revision: string;
  workspace?: string;
};

function createRevisionPolicyServerSource(
  behaviorSeedNamespace: string,
): string {
  const namespace = JSON.stringify(behaviorSeedNamespace);
  return String.raw`
import readline from 'node:readline';
import { createAiBehaviorProfile } from './src/ai/behavior.ts';
import { chooseComputerAction } from './src/ai/search/rootSearch.ts';

function createSeededRandom(seed = 1) {
  let current = seed >>> 0;
  return () => {
    current = (current * 1664525 + 1013904223) >>> 0;
    return current / 0x100000000;
  };
}

const sessions = new Map();
const lines = readline.createInterface({ input: process.stdin });

lines.on('line', (line) => {
  let message;
  try {
    message = JSON.parse(line);
    if (message.method === 'createSession') {
      sessions.set(message.sessionId, {
        behaviorProfile: createAiBehaviorProfile(
          ${namespace} + message.seed,
        ),
        previousStrategicIntent: null,
        random: createSeededRandom(message.seed),
      });
      process.stdout.write(JSON.stringify({ id: message.id, ok: true }) + '\n');
      return;
    }

    if (message.method === 'disposeSession') {
      sessions.delete(message.sessionId);
      process.stdout.write(JSON.stringify({ id: message.id, ok: true }) + '\n');
      return;
    }

    const session = sessions.get(message.sessionId);
    if (!session) throw new Error('Unknown revision policy session.');
    const result = chooseComputerAction({
      behaviorProfile: session.behaviorProfile,
      diagnosticAblation: message.request.diagnosticAblation,
      difficulty: message.request.difficulty,
      previousStrategicIntent: session.previousStrategicIntent,
      random: session.random,
      ruleConfig: message.request.ruleConfig,
      searchBudget: message.request.searchBudget,
      state: message.request.state,
    });
    session.previousStrategicIntent = result.strategicIntent ?? null;
    process.stdout.write(
      JSON.stringify({ id: message.id, ok: true, result }) + '\n',
    );
  } catch (error) {
    process.stdout.write(
      JSON.stringify({
        error: error instanceof Error ? error.stack ?? error.message : String(error),
        id: message?.id ?? 'unknown',
        ok: false,
      }) + '\n',
    );
  }
});
`;
}

export function fingerprintRevisionPolicy({
  behaviorSeedNamespace = 'policy-revision-',
  id,
  revision,
}: RevisionPolicyOptions): string {
  const serverSource = createRevisionPolicyServerSource(behaviorSeedNamespace);
  return createHash('sha256')
    .update(
      JSON.stringify({
        adapterVersion: REVISION_POLICY_ADAPTER_VERSION,
        behaviorSeedNamespace,
        id,
        revision,
        serverSourceHash: createHash('sha256')
          .update(serverSource)
          .digest('hex'),
        sourceHash: fingerprintRevisionAiSource(revision),
      }),
    )
    .digest('hex');
}

export async function loadRevisionPolicy(
  options: RevisionPolicyOptions,
): Promise<AiPolicy> {
  const {
    behaviorSeedNamespace = 'policy-revision-',
    id,
    revision,
    workspace = process.cwd(),
  } = options;
  const serverFileName = 'revision-policy-server.ts';
  const serverSource = createRevisionPolicyServerSource(behaviorSeedNamespace);
  const sourceHash = fingerprintRevisionPolicy(options);
  const rpc = new RevisionPolicyRpc(
    await materializeRevisionPolicyWorkspace({
      revision,
      serverFileName,
      serverSource,
      tempPrefix: 'youi-revision-policy-',
      workspace,
    }),
    { label: `RevisionPolicy(${id}@${revision})`, serverFileName },
  );
  let disposed = false;

  return {
    id,
    sourceHash,
    async createSession(seed): Promise<AiPolicySession> {
      if (disposed) throw new Error(`Revision policy ${id} has been disposed.`);
      const sessionId = randomUUID();
      await rpc.request('createSession', { seed, sessionId });
      let sessionDisposed = false;

      return {
        async decide(
          request: AiPolicyDecisionRequest,
        ): Promise<AiPolicyDecision> {
          if (sessionDisposed) {
            throw new Error(`Revision policy ${id} session has been disposed.`);
          }
          const result = (await rpc.request('decide', {
            request,
            sessionId,
          })) as { action?: AiPolicyDecision['action'] };
          return { action: result.action ?? null, diagnostics: result };
        },
        async dispose() {
          if (sessionDisposed) return;
          sessionDisposed = true;
          await rpc.request('disposeSession', { sessionId });
        },
      };
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      await rpc.dispose();
    },
  };
}
