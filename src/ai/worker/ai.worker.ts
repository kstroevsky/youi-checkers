/// <reference lib="webworker" />

import { chooseComputerAction } from '@/ai/search';
import type { AiWorkerRequest, AiWorkerResponse } from '@/ai/types';

/** Thin browser-worker bridge that keeps AI search off the main UI thread. */
self.onmessage = (event: MessageEvent<AiWorkerRequest>) => {
  const message = event.data;

  if (message.type !== 'chooseMove') {
    return;
  }

  try {
    const result = chooseComputerAction({
      difficulty: message.matchSettings.aiDifficulty,
      ruleConfig: message.ruleConfig,
      state: message.state,
    });
    const response: AiWorkerResponse = {
      requestId: message.requestId,
      result,
      type: 'result',
    };

    self.postMessage(response);
  } catch (error) {
    const response: AiWorkerResponse = {
      message: error instanceof Error ? error.message : 'Unknown AI worker error.',
      requestId: message.requestId,
      type: 'error',
    };

    self.postMessage(response);
  }
};
