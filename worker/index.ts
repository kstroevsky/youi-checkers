import {
  handleTelemetryRequest,
  runTelemetryRetention,
  type TelemetryWorkerEnv,
} from './telemetry';
import { MatchRoom } from './matchRoom';
import {
  handleMultiplayerRequest,
  type MultiplayerWorkerEnv,
} from './multiplayer';

export type Env = TelemetryWorkerEnv & MultiplayerWorkerEnv & {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
};

type ExecutionContextLike = {
  waitUntil: (promise: Promise<unknown>) => void;
};

type ScheduledControllerLike = {
  scheduledTime: number;
};

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/telemetry/batches') {
      return handleTelemetryRequest(request, env);
    }

    const multiplayerResponse = await handleMultiplayerRequest(request, env);

    if (multiplayerResponse) {
      return multiplayerResponse;
    }

    if (url.pathname.startsWith('/api/')) {
      return Response.json(
        { message: 'Not found.' },
        {
          headers: {
            'cache-control': 'no-store',
          },
          status: 404,
        },
      );
    }

    return env.ASSETS.fetch(request);
  },
  scheduled(
    _controller: ScheduledControllerLike,
    env: Env,
    context: ExecutionContextLike,
  ): void {
    context.waitUntil(runTelemetryRetention(env));
  },
};

export { MatchRoom };
export default worker;
