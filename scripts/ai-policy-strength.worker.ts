import process from 'node:process';

import { loadLegacyPolicyV0 } from '@/ai/test/legacyPolicyV0.node';
import { runPolicyMatchPair } from '@/ai/test/policyMatch';
import type {
  PolicyStrengthWorkerRequest,
  PolicyStrengthWorkerResponse,
} from '@/ai/test/policyStrengthCampaign';
import { loadCurrentAiPolicy } from '@/ai/test/policyProvenance.node';

async function main(): Promise<void> {
  if (!process.send) {
    throw new Error('Policy-strength workers require a parent IPC channel.');
  }

  const [currentPolicy, legacyPolicy] = await Promise.all([
    loadCurrentAiPolicy(),
    loadLegacyPolicyV0(),
  ]);
  let busy = false;
  let disposed = false;

  const send = (message: PolicyStrengthWorkerResponse): void => {
    process.send?.(message);
  };
  const dispose = async (): Promise<void> => {
    if (disposed) return;
    disposed = true;
    await Promise.all([currentPolicy.dispose(), legacyPolicy.dispose()]);
  };

  process.on('disconnect', () => {
    void dispose().finally(() => process.exit());
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      void dispose().finally(() =>
        process.exit(signal === 'SIGINT' ? 130 : 143),
      );
    });
  }
  process.on('message', (message: PolicyStrengthWorkerRequest) => {
    if (message.type === 'shutdown') {
      void dispose().finally(() => process.exit());
      return;
    }
    if (busy) {
      send({
        error: 'Policy-strength worker received overlapping jobs.',
        jobIndex: message.job.job.jobIndex,
        type: 'error',
      });
      return;
    }

    busy = true;
    const { fixture, job, ruleConfig, settings } = message.job;
    void runPolicyMatchPair({
      adjudicateHorizon: true,
      difficulty: settings.difficulty,
      fixture,
      maxPlies: settings.maxPlies,
      nodeBudget: settings.nodeBudget,
      pairId: job.pairId,
      policyA: currentPolicy,
      policyASeed: job.seedBase + 17,
      policyB: legacyPolicy,
      policyBSeed: job.seedBase + 29,
      ruleConfig,
    })
      .then((pair) => {
        busy = false;
        send({ jobIndex: job.jobIndex, pair, type: 'result' });
      })
      .catch((error) => {
        send({
          error:
            error instanceof Error
              ? (error.stack ?? error.message)
              : String(error),
          jobIndex: job.jobIndex,
          type: 'error',
        });
        busy = false;
      });
  });

  send({
    currentPolicyHash: currentPolicy.sourceHash,
    legacyPolicyHash: legacyPolicy.sourceHash,
    type: 'ready',
  });
}

main().catch((error) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  if (process.send) {
    process.send({
      error: message,
      jobIndex: null,
      type: 'error',
    } satisfies PolicyStrengthWorkerResponse);
  } else {
    process.stderr.write(`${message}\n`);
  }
  process.exitCode = 1;
});
