import { createHash, randomUUID } from 'node:crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

import type {
  AiPolicy,
  AiPolicyDecision,
  AiPolicyDecisionRequest,
  AiPolicySession,
} from '@/ai/test/policy';
import {
  fingerprintRevisionAiSource,
  listProductionAiFilesAtRevision,
  readRevisionFile,
} from '@/ai/test/policyProvenance.node';

/** The structural merge-base of main and feat/computer-mode-improvements. */
export const LEGACY_POLICY_V0_REVISION =
  '2bd9c455ec2537aa84b1fef38550ce13c53efd29';
export const FIRST_FEATURE_POLICY_REVISION =
  '944e0f06d937d3a8bce6fba2f6063485a3266ecb';
export const LEGACY_POLICY_V0_ADAPTER_VERSION = 1;

type RpcSuccess = {
  id: string;
  ok: true;
  result?: unknown;
};

type RpcFailure = {
  error: string;
  id: string;
  ok: false;
};

type PendingRpc = {
  reject: (error: Error) => void;
  resolve: (value: unknown) => void;
};

const SERVER_SOURCE = String.raw`
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
          'policy-legacy-v0-' + message.seed,
        ),
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
    if (!session) throw new Error('Unknown legacy policy session.');
    const result = chooseComputerAction({
      behaviorProfile: session.behaviorProfile,
      difficulty: message.request.difficulty,
      random: session.random,
      ruleConfig: message.request.ruleConfig,
      searchBudget: message.request.searchBudget,
      state: message.request.state,
    });
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

async function symlinkDirectory(target: string, destination: string) {
  await symlink(target, destination, 'dir');
}

async function materializeLegacyWorkspace(workspace: string): Promise<string> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'youi-legacy-v0-'));
  const sourceRoot = path.join(tempRoot, 'src');
  await mkdir(sourceRoot, { recursive: true });

  for (const filePath of listProductionAiFilesAtRevision(
    LEGACY_POLICY_V0_REVISION,
  )) {
    const destination = path.join(tempRoot, filePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(
      destination,
      readRevisionFile(LEGACY_POLICY_V0_REVISION, filePath),
      'utf8',
    );
  }

  await Promise.all([
    symlinkDirectory(
      path.join(workspace, 'src', 'domain'),
      path.join(sourceRoot, 'domain'),
    ),
    symlinkDirectory(
      path.join(workspace, 'src', 'shared'),
      path.join(sourceRoot, 'shared'),
    ),
    symlinkDirectory(
      path.join(workspace, 'node_modules'),
      path.join(tempRoot, 'node_modules'),
    ),
    writeFile(
      path.join(tempRoot, 'package.json'),
      JSON.stringify({ private: true, type: 'module' }),
      'utf8',
    ),
    writeFile(
      path.join(tempRoot, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: { '@/*': ['./src/*'] },
          target: 'ES2022',
        },
      }),
      'utf8',
    ),
    writeFile(path.join(tempRoot, 'legacy-policy-server.ts'), SERVER_SOURCE),
  ]);

  return tempRoot;
}

class LegacyPolicyRpc {
  readonly pending = new Map<string, PendingRpc>();
  readonly process: ChildProcessWithoutNullStreams;
  readonly tempRoot: string;
  private stderr = '';

  constructor(tempRoot: string) {
    this.tempRoot = tempRoot;
    this.process = spawn(
      process.execPath,
      ['--import', 'tsx', path.join(tempRoot, 'legacy-policy-server.ts')],
      { cwd: tempRoot, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const output = readline.createInterface({ input: this.process.stdout });
    output.on('line', (line) => this.handleLine(line));
    this.process.stderr.on('data', (chunk) => {
      this.stderr = `${this.stderr}${String(chunk)}`.slice(-16_000);
    });
    this.process.on('exit', (code) => {
      const error = new Error(
        `LegacyPolicyV0 process exited with code ${code}. ${this.stderr}`,
      );
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    });
  }

  private handleLine(line: string) {
    let response: RpcSuccess | RpcFailure;
    try {
      response = JSON.parse(line) as RpcSuccess | RpcFailure;
    } catch {
      return;
    }
    const pending = this.pending.get(response.id);
    if (!pending) return;
    this.pending.delete(response.id);
    if (response.ok) pending.resolve(response.result);
    else pending.reject(new Error(response.error));
  }

  request(method: string, payload: Record<string, unknown> = {}) {
    const id = randomUUID();
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { reject, resolve });
      this.process.stdin.write(
        JSON.stringify({ id, method, ...payload }) + '\n',
      );
    });
  }

  async dispose() {
    this.process.stdin.end();
    if (this.process.exitCode === null) this.process.kill();
    await rm(this.tempRoot, { force: true, recursive: true });
  }
}

export async function loadLegacyPolicyV0(
  workspace = process.cwd(),
): Promise<AiPolicy> {
  const sourceHash = createHash('sha256')
    .update(
      JSON.stringify({
        adapterVersion: LEGACY_POLICY_V0_ADAPTER_VERSION,
        adapterSourceHash: createHash('sha256')
          .update(SERVER_SOURCE)
          .digest('hex'),
        revision: LEGACY_POLICY_V0_REVISION,
        sourceHash: fingerprintRevisionAiSource(LEGACY_POLICY_V0_REVISION),
      }),
    )
    .digest('hex');
  const rpc = new LegacyPolicyRpc(await materializeLegacyWorkspace(workspace));
  let disposed = false;

  return {
    id: 'legacy-v0',
    sourceHash,
    async createSession(seed): Promise<AiPolicySession> {
      if (disposed) throw new Error('LegacyPolicyV0 has been disposed.');
      const sessionId = randomUUID();
      await rpc.request('createSession', { seed, sessionId });
      let sessionDisposed = false;

      return {
        async decide(
          request: AiPolicyDecisionRequest,
        ): Promise<AiPolicyDecision> {
          if (sessionDisposed) {
            throw new Error('LegacyPolicyV0 session has been disposed.');
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
