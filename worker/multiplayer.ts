import {
  createAuthoritativeMatchState,
  createCapability,
  hashMatchState,
  sha256,
  type CreateMatchRequest,
  type CreateSessionRequest,
} from '../src/shared/multiplayer';
import type { InitializeMatchInput, MatchSession } from './matchRoom';

const MAX_MATCH_BODY_BYTES = 4 * 1024;
const SESSION_COOKIE = 'youi_match_session';
const MATCH_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f-]{27}$/u;

type RateLimiterLike = {
  limit: (options: { key: string }) => Promise<{ success: boolean }>;
};

type MatchRoomStubLike = {
  createSession: (capability: string) => Promise<MatchSession | null>;
  fetch: (request: Request) => Promise<Response>;
  initialize: (input: InitializeMatchInput) => Promise<void>;
};

type MatchRoomNamespaceLike = {
  get: (id: unknown) => MatchRoomStubLike;
  idFromName: (name: string) => unknown;
};

export type MultiplayerWorkerEnv = {
  MATCH_RATE_LIMITER?: RateLimiterLike;
  MATCH_ROOMS: MatchRoomNamespaceLike;
};

function noStoreHeaders(): HeadersInit {
  return { 'cache-control': 'no-store' };
}

function jsonError(message: string, status: number): Response {
  return Response.json({ message }, { headers: noStoreHeaders(), status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCreateMatchRequest(value: unknown): value is CreateMatchRequest {
  if (!isRecord(value) || !isRecord(value.rules)) {
    return false;
  }

  return (
    (value.format === 'single' || value.format === 'series') &&
    Number.isInteger(value.targetPoints) &&
    Number(value.targetPoints) >= 1 &&
    Number(value.targetPoints) <= 1_000_000 &&
    typeof value.rules.allowNonAdjacentFriendlyStackTransfer === 'boolean' &&
    (value.rules.drawRule === 'none' || value.rules.drawRule === 'threefold') &&
    (value.rules.scoringMode === 'off' || value.rules.scoringMode === 'basic')
  );
}

function isCreateSessionRequest(value: unknown): value is CreateSessionRequest {
  return (
    isRecord(value) &&
    typeof value.capability === 'string' &&
    /^[A-Za-z0-9_-]{43}$/u.test(value.capability)
  );
}

async function readJson(request: Request): Promise<unknown> {
  if (
    !request.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('application/json')
  ) {
    throw new Error('Expected application/json.');
  }

  const declaredLength = Number(request.headers.get('content-length') ?? 0);

  if (declaredLength > MAX_MATCH_BODY_BYTES) {
    throw new Error('Request body is too large.');
  }

  const text = await request.text();

  if (new TextEncoder().encode(text).byteLength > MAX_MATCH_BODY_BYTES) {
    throw new Error('Request body is too large.');
  }

  return JSON.parse(text);
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}

function roomStub(
  env: MultiplayerWorkerEnv,
  matchId: string,
): MatchRoomStubLike {
  return env.MATCH_ROOMS.get(env.MATCH_ROOMS.idFromName(matchId));
}

function cookieValue(request: Request, name: string): string | null {
  const cookies = request.headers.get('cookie');

  if (!cookies) {
    return null;
  }

  for (const entry of cookies.split(';')) {
    const [key, ...rest] = entry.trim().split('=');

    if (key === name) {
      return decodeURIComponent(rest.join('='));
    }
  }

  return null;
}

function sessionCookie(
  request: Request,
  matchId: string,
  ticket: string,
): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(ticket)}; Path=/api/matches/${matchId}; HttpOnly; SameSite=Strict; Max-Age=2592000${secure}`;
}

async function enforceRateLimit(
  request: Request,
  env: MultiplayerWorkerEnv,
): Promise<Response | null> {
  if (!env.MATCH_RATE_LIMITER) {
    return null;
  }

  const source = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const result = await env.MATCH_RATE_LIMITER.limit({ key: source });

  return result.success
    ? null
    : jsonError('Too many multiplayer requests.', 429);
}

async function createMatch(
  request: Request,
  env: MultiplayerWorkerEnv,
): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonError('Method not allowed.', 405);
  }

  if (!isSameOrigin(request)) {
    return jsonError('Cross-origin requests are not allowed.', 403);
  }

  const limited = await enforceRateLimit(request, env);
  if (limited) return limited;

  let body: unknown;

  try {
    body = await readJson(request);
  } catch {
    return jsonError('Invalid JSON request.', 400);
  }

  if (!isCreateMatchRequest(body)) {
    return jsonError('Invalid match configuration.', 400);
  }

  const matchId = crypto.randomUUID();
  const capability = createCapability();
  const inviteCapability = createCapability();
  const state = createAuthoritativeMatchState({
    format: body.format,
    rules: body.rules,
    targetPoints: body.targetPoints,
  });
  const [firstCapabilityDigest, secondCapabilityDigest, stateHash] =
    await Promise.all([
      sha256(capability),
      sha256(inviteCapability),
      hashMatchState(state),
    ]);

  await roomStub(env, matchId).initialize({
    firstCapabilityDigest,
    matchId,
    secondCapabilityDigest,
    state,
    stateHash,
  });

  return Response.json(
    { matchId, participant: 'first', capability, inviteCapability },
    { headers: noStoreHeaders(), status: 201 },
  );
}

async function createSession(
  request: Request,
  env: MultiplayerWorkerEnv,
  matchId: string,
): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonError('Method not allowed.', 405);
  }

  if (!isSameOrigin(request)) {
    return jsonError('Cross-origin requests are not allowed.', 403);
  }

  const limited = await enforceRateLimit(request, env);
  if (limited) return limited;

  let body: unknown;

  try {
    body = await readJson(request);
  } catch {
    return jsonError('Invalid JSON request.', 400);
  }

  if (!isCreateSessionRequest(body)) {
    return jsonError('Invalid capability.', 400);
  }

  const session = await roomStub(env, matchId).createSession(body.capability);

  if (!session) {
    return jsonError('Invalid or expired invitation.', 401);
  }

  return Response.json(
    { matchId, participant: session.participant },
    {
      headers: {
        ...noStoreHeaders(),
        'set-cookie': sessionCookie(request, matchId, session.ticket),
      },
    },
  );
}

async function openSocket(
  request: Request,
  env: MultiplayerWorkerEnv,
  matchId: string,
): Promise<Response> {
  if (request.method !== 'GET') {
    return jsonError('Method not allowed.', 405);
  }

  if (!isSameOrigin(request)) {
    return jsonError('Cross-origin requests are not allowed.', 403);
  }

  const ticket = cookieValue(request, SESSION_COOKIE);

  if (!ticket) {
    return jsonError('A match session is required.', 401);
  }

  const headers = new Headers(request.headers);
  headers.set('x-youi-session-ticket', ticket);

  return roomStub(env, matchId).fetch(
    new Request('https://match-room.internal/socket', {
      headers,
      method: 'GET',
    }),
  );
}

/** Returns null for non-multiplayer routes so the main worker can keep routing. */
export async function handleMultiplayerRequest(
  request: Request,
  env: MultiplayerWorkerEnv,
): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;

  if (pathname === '/api/matches') {
    return createMatch(request, env);
  }

  const match = pathname.match(/^\/api\/matches\/([^/]+)\/(session|socket)$/u);

  if (!match || !MATCH_ID_PATTERN.test(match[1])) {
    return null;
  }

  return match[2] === 'session'
    ? createSession(request, env, match[1])
    : openSocket(request, env, match[1]);
}
