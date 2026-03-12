/// <reference lib="webworker" />

import { getModelGuidance } from '@/ai/model/guidance';
import { chooseComputerAction } from '@/ai/search';
import type { AiWorkerRequest, AiWorkerResponse } from '@/ai/types';

async function handleChooseMove(message: AiWorkerRequest): Promise<AiWorkerResponse> {
  try {
    const modelGuidance = await getModelGuidance(message.state, message.ruleConfig);
    const result = chooseComputerAction({
      difficulty: message.matchSettings.aiDifficulty,
      modelGuidance,
      ruleConfig: message.ruleConfig,
      state: message.state,
    });

    return {
      requestId: message.requestId,
      result,
      type: 'result',
    };
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : 'Unknown AI worker error.',
      requestId: message.requestId,
      type: 'error',
    };
  }
}

/** Thin browser-worker bridge that keeps AI search off the main UI thread. */
self.onmessage = (event: MessageEvent<AiWorkerRequest>) => {
  const message = event.data;

  if (message.type !== 'chooseMove') {
    return;
  }

  void handleChooseMove(message).then((response) => {
    self.postMessage(response);
  });
};
