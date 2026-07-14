import { DurableObject } from 'cloudflare:workers';

import {
  MAX_INCREMENTAL_COMMANDS,
  MatchCommandError,
  applyMatchCommand,
  createCapability,
  decodeClientMessage,
  hashMatchState,
  sha256,
  type AuthoritativeMatchState,
  type CommittedMatchCommand,
  type MatchCommandEnvelope,
  type MatchLifecycle,
  type ServerMessage,
} from '../src/shared/multiplayer';
import type { MatchParticipant } from '../src/shared/types/session';

const INLINE_REPETITION_LIMIT_BYTES = 128 * 1024;
const REPETITION_SHARD_COUNT = 16;
const MAX_SOCKET_MESSAGE_BYTES = 64 * 1024;
const MAX_PEER_SIGNAL_BYTES = 16 * 1024;
const SOCKET_BACKPRESSURE_BYTES = 64 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_RETENTION_MS = 30 * DAY_MS;

type RepetitionMode = 'inline' | 'sharded';

type MatchRow = {
  created_at: number;
  expires_at: number;
  last_activity_at: number;
  lifecycle: MatchLifecycle;
  match_id: string;
  repetition_mode: RepetitionMode;
  revision: number;
  state_hash: string;
  state_json: string;
};

type CapabilityRow = {
  participant: MatchParticipant;
};

type SessionRow = {
  participant: MatchParticipant;
};

type CommandRow = {
  actor: MatchParticipant;
  command_id: string;
  command_json: string;
  revision: number;
  state_hash: string;
};

type ShardRow = {
  counts_json: string;
};

type SocketAttachment = {
  participant: MatchParticipant;
};

type CachedRoom = Omit<MatchRow, 'state_json'> & {
  state: AuthoritativeMatchState;
};

export type InitializeMatchInput = {
  firstCapabilityDigest: string;
  matchId: string;
  secondCapabilityDigest: string;
  state: AuthoritativeMatchState;
  stateHash: string;
};

export type MatchSession = {
  participant: MatchParticipant;
  ticket: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isParticipant(value: unknown): value is MatchParticipant {
  return value === 'first' || value === 'second';
}

function parseClientMessage(value: string) {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }

  return decodeClientMessage(parsed);
}

function shardForPosition(positionHash: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < positionHash.length; index += 1) {
    hash ^= positionHash.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0) % REPETITION_SHARD_COUNT;
}

function splitRepetitionCounts(
  counts: Record<string, number>,
): Array<Record<string, number>> {
  const shards = Array.from(
    { length: REPETITION_SHARD_COUNT },
    () => ({}) as Record<string, number>,
  );

  for (const [positionHash, count] of Object.entries(counts)) {
    shards[shardForPosition(positionHash)][positionHash] = count;
  }

  return shards;
}

function stateWithoutRepetitionCounts(
  state: AuthoritativeMatchState,
): AuthoritativeMatchState {
  return {
    ...state,
    engine: { ...state.engine, positionCounts: {} },
  };
}

function socketAttachment(socket: WebSocket): SocketAttachment | null {
  const attachment = socket.deserializeAttachment();

  return isRecord(attachment) && isParticipant(attachment.participant)
    ? { participant: attachment.participant }
    : null;
}

export class MatchRoom extends DurableObject<Record<string, never>> {
  private room: CachedRoom | null = null;
  private commandQueue: Promise<void> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: Record<string, never>) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS match_state (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          match_id TEXT NOT NULL,
          state_json TEXT NOT NULL,
          revision INTEGER NOT NULL,
          state_hash TEXT NOT NULL,
          lifecycle TEXT NOT NULL,
          repetition_mode TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          last_activity_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS capabilities (
          digest TEXT PRIMARY KEY,
          participant TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
          digest TEXT PRIMARY KEY,
          participant TEXT NOT NULL,
          expires_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS commands (
          command_id TEXT PRIMARY KEY,
          revision INTEGER NOT NULL,
          actor TEXT NOT NULL,
          command_json TEXT NOT NULL,
          state_hash TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS repetition_shards (
          shard INTEGER PRIMARY KEY,
          counts_json TEXT NOT NULL
        );
      `);
      ctx.setWebSocketAutoResponse(
        new WebSocketRequestResponsePair('ping', 'pong'),
      );
    });
  }

  async initialize(input: InitializeMatchInput): Promise<void> {
    if (
      this.ctx.storage.sql.exec('SELECT singleton FROM match_state').toArray()
        .length
    ) {
      return;
    }

    const now = Date.now();
    const expiresAt = now + DAY_MS;
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        `INSERT INTO match_state (
          singleton, match_id, state_json, revision, state_hash, lifecycle,
          repetition_mode, created_at, last_activity_at, expires_at
        ) VALUES (1, ?, ?, 0, ?, 'waiting', 'inline', ?, ?, ?)`,
        input.matchId,
        JSON.stringify(input.state),
        input.stateHash,
        now,
        now,
        expiresAt,
      );
      this.ctx.storage.sql.exec(
        'INSERT INTO capabilities (digest, participant) VALUES (?, ?), (?, ?)',
        input.firstCapabilityDigest,
        'first',
        input.secondCapabilityDigest,
        'second',
      );
    });
    await this.ctx.storage.setAlarm(expiresAt);
  }

  async createSession(capability: string): Promise<MatchSession | null> {
    const capabilityDigest = await sha256(capability);
    const capabilityRow = this.ctx.storage.sql
      .exec<CapabilityRow>(
        'SELECT participant FROM capabilities WHERE digest = ?',
        capabilityDigest,
      )
      .toArray()[0];

    if (!capabilityRow || !isParticipant(capabilityRow.participant)) {
      return null;
    }

    const room = this.loadRoom();
    const ticket = createCapability();
    const ticketDigest = await sha256(ticket);
    const now = Date.now();
    const participant = capabilityRow.participant;
    const lifecycle: MatchLifecycle =
      participant === 'second' && room.lifecycle === 'waiting'
        ? 'active'
        : room.lifecycle;
    const expiresAt =
      lifecycle === 'waiting'
        ? room.created_at + DAY_MS
        : now + ACTIVE_RETENTION_MS;

    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        `INSERT OR REPLACE INTO sessions (digest, participant, expires_at)
         VALUES (?, ?, ?)`,
        ticketDigest,
        participant,
        expiresAt,
      );
      this.ctx.storage.sql.exec(
        'DELETE FROM capabilities WHERE digest = ?',
        capabilityDigest,
      );
      this.ctx.storage.sql.exec(
        `UPDATE match_state
         SET lifecycle = ?, last_activity_at = ?, expires_at = ?
         WHERE singleton = 1`,
        lifecycle,
        now,
        expiresAt,
      );
    });
    this.room = {
      ...room,
      lifecycle,
      last_activity_at: now,
      expires_at: expiresAt,
    };
    await this.ctx.storage.setAlarm(expiresAt);

    return { participant, ticket };
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected a WebSocket upgrade.', { status: 426 });
    }

    const ticket = request.headers.get('x-youi-session-ticket');

    if (!ticket) {
      return new Response('Unauthorized.', { status: 401 });
    }

    const ticketDigest = await sha256(ticket);
    const session = this.ctx.storage.sql
      .exec<SessionRow>(
        `SELECT participant FROM sessions
         WHERE digest = ? AND expires_at > ?`,
        ticketDigest,
        Date.now(),
      )
      .toArray()[0];

    if (!session || !isParticipant(session.participant)) {
      return new Response('Unauthorized.', { status: 401 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.serializeAttachment({ participant: session.participant });
    this.ctx.acceptWebSocket(server, [session.participant]);
    this.broadcast(
      { type: 'peerPresence', connected: true },
      session.participant === 'first' ? 'second' : 'first',
    );

    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(
    socket: WebSocket,
    rawMessage: string | ArrayBuffer,
  ): Promise<void> {
    const byteLength =
      typeof rawMessage === 'string'
        ? new TextEncoder().encode(rawMessage).byteLength
        : rawMessage.byteLength;

    if (
      byteLength > MAX_SOCKET_MESSAGE_BYTES ||
      typeof rawMessage !== 'string'
    ) {
      socket.close(1009, 'Message too large');
      return Promise.resolve();
    }

    const message = parseClientMessage(rawMessage);
    const attachment = socketAttachment(socket);

    if (!message || !attachment) {
      socket.close(1008, 'Invalid protocol message');
      return Promise.resolve();
    }

    this.commandQueue = this.commandQueue
      .catch(() => undefined)
      .then(async () => {
        if (message.type === 'hello' || message.type === 'resync') {
          this.synchronize(socket, message.revision, message.stateHash);
          return;
        }

        if (message.type === 'peerSignal') {
          if (JSON.stringify(message.signal).length > MAX_PEER_SIGNAL_BYTES) {
            socket.close(1009, 'Signal too large');
            return;
          }

          this.broadcast(
            { type: 'peerSignal', signal: message.signal },
            attachment.participant === 'first' ? 'second' : 'first',
          );
          return;
        }

        await this.submit(socket, attachment.participant, message.envelope);
      })
      .catch(() => {
        socket.close(1011, 'Room command failed');
      });

    return this.commandQueue;
  }

  webSocketClose(socket: WebSocket): void {
    const attachment = socketAttachment(socket);

    if (attachment) {
      this.broadcast(
        { type: 'peerPresence', connected: false },
        attachment.participant === 'first' ? 'second' : 'first',
      );
    }
  }

  async alarm(): Promise<void> {
    const room = this.loadRoom();

    if (room.expires_at <= Date.now()) {
      this.room = null;
      await this.ctx.storage.deleteAll();
      return;
    }

    await this.ctx.storage.setAlarm(room.expires_at);
  }

  private loadRoom(): CachedRoom {
    if (this.room) {
      return this.room;
    }

    const row = this.ctx.storage.sql
      .exec<MatchRow>('SELECT * FROM match_state WHERE singleton = 1')
      .toArray()[0];

    if (!row) {
      throw new Error('MatchRoom is not initialized.');
    }

    const state = JSON.parse(row.state_json) as AuthoritativeMatchState;

    if (row.repetition_mode === 'sharded') {
      const counts: Record<string, number> = {};

      for (const shard of this.ctx.storage.sql
        .exec<ShardRow>('SELECT counts_json FROM repetition_shards')
        .toArray()) {
        Object.assign(counts, JSON.parse(shard.counts_json));
      }

      state.engine.positionCounts = counts;
    }

    this.room = { ...row, state };
    return this.room;
  }

  private synchronize(
    socket: WebSocket,
    clientRevision: number,
    clientStateHash: string | null,
  ): void {
    const room = this.loadRoom();
    const attachment = socketAttachment(socket);

    if (!attachment) {
      socket.close(1008, 'Missing session');
      return;
    }

    this.send(socket, {
      type: 'ready',
      participant: attachment.participant,
      lifecycle: room.lifecycle,
      revision: room.revision,
      stateHash: room.state_hash,
    });

    if (
      clientRevision === room.revision &&
      clientStateHash === room.state_hash
    ) {
      return;
    }

    const gap = room.revision - clientRevision;

    if (gap > 0 && gap <= MAX_INCREMENTAL_COMMANDS && clientStateHash) {
      const commands = this.ctx.storage.sql
        .exec<CommandRow>(
          `SELECT command_id, revision, actor, command_json, state_hash
           FROM commands WHERE revision > ? ORDER BY revision ASC`,
          clientRevision,
        )
        .toArray()
        .map(
          (row): CommittedMatchCommand => ({
            actor: row.actor,
            command: JSON.parse(row.command_json),
            commandId: row.command_id,
            revision: row.revision,
            stateHash: row.state_hash,
          }),
        );

      if (commands.length === gap) {
        this.send(socket, { type: 'commands', commands });
        return;
      }
    }

    this.send(socket, {
      type: 'snapshot',
      snapshot: {
        revision: room.revision,
        state: room.state,
        stateHash: room.state_hash,
      },
    });
  }

  private async submit(
    socket: WebSocket,
    actor: MatchParticipant,
    envelope: MatchCommandEnvelope,
  ): Promise<void> {
    let room = this.loadRoom();
    const existing = this.ctx.storage.sql
      .exec<CommandRow>(
        `SELECT command_id, revision, actor, command_json, state_hash
         FROM commands WHERE command_id = ?`,
        envelope.commandId,
      )
      .toArray()[0];

    if (existing) {
      this.send(socket, {
        type: 'committed',
        commit: {
          actor: existing.actor,
          command: JSON.parse(existing.command_json),
          commandId: existing.command_id,
          revision: existing.revision,
          stateHash: existing.state_hash,
        },
      });
      return;
    }

    if (room.lifecycle === 'waiting') {
      this.reject(socket, envelope.commandId, 'matchNotReady', room);
      return;
    }

    if (room.lifecycle === 'completed') {
      this.reject(socket, envelope.commandId, 'matchComplete', room);
      return;
    }

    if (envelope.baseRevision !== room.revision) {
      this.reject(socket, envelope.commandId, 'revisionConflict', room);
      return;
    }

    if (envelope.previousStateHash !== room.state_hash) {
      this.reject(socket, envelope.commandId, 'stateMismatch', room);
      return;
    }

    let result: ReturnType<typeof applyMatchCommand>;

    try {
      result = applyMatchCommand(room.state, actor, envelope.command);
    } catch (error) {
      this.reject(
        socket,
        envelope.commandId,
        error instanceof MatchCommandError ? error.reason : 'invalidCommand',
        room,
      );
      return;
    }

    const stateHash = await hashMatchState(result.state);

    if (stateHash !== envelope.predictedStateHash) {
      this.reject(socket, envelope.commandId, 'stateMismatch', room);
      return;
    }

    // The queue serializes commands, but reload after async hashing documents the invariant.
    room = this.loadRoom();
    if (room.revision !== envelope.baseRevision) {
      this.reject(socket, envelope.commandId, 'revisionConflict', room);
      return;
    }

    const now = Date.now();
    const revision = room.revision + 1;
    const matchComplete =
      result.state.series?.phase === 'matchOver' ||
      (!result.state.series && result.state.engine.status === 'gameOver');
    const lifecycle: MatchLifecycle = matchComplete ? 'completed' : 'active';
    const expiresAt = now + ACTIVE_RETENTION_MS;
    const commit: CommittedMatchCommand = {
      actor,
      command: envelope.command,
      commandId: envelope.commandId,
      revision,
      stateHash,
    };

    const repetitionMode = this.persistCommand(
      room,
      result.state,
      commit,
      result.updatedPositionHash,
      result.repetitionReset,
      lifecycle,
      now,
      expiresAt,
    );
    this.room = {
      ...room,
      expires_at: expiresAt,
      last_activity_at: now,
      lifecycle,
      repetition_mode: repetitionMode,
      revision,
      state: result.state,
      state_hash: stateHash,
    };
    this.broadcast({ type: 'committed', commit });
  }

  private persistCommand(
    previous: CachedRoom,
    state: AuthoritativeMatchState,
    commit: CommittedMatchCommand,
    updatedPositionHash: string | null,
    repetitionReset: boolean,
    lifecycle: MatchLifecycle,
    now: number,
    expiresAt: number,
  ): RepetitionMode {
    const countsJson =
      previous.repetition_mode === 'inline'
        ? JSON.stringify(state.engine.positionCounts)
        : null;
    const repetitionMode: RepetitionMode =
      previous.repetition_mode === 'sharded' ||
      (countsJson !== null &&
        new TextEncoder().encode(countsJson).byteLength >
        INLINE_REPETITION_LIMIT_BYTES
      )
        ? 'sharded'
        : 'inline';
    const storedState =
      repetitionMode === 'sharded'
        ? stateWithoutRepetitionCounts(state)
        : state;
    const fullShardRewrite =
      repetitionMode === 'sharded' &&
      (previous.repetition_mode === 'inline' ||
        repetitionReset ||
        commit.command.type === 'startNextGame' ||
        !updatedPositionHash);

    this.ctx.storage.transactionSync(() => {
      if (fullShardRewrite) {
        this.ctx.storage.sql.exec('DELETE FROM repetition_shards');
        splitRepetitionCounts(state.engine.positionCounts).forEach(
          (shard, index) => {
            if (Object.keys(shard).length) {
              this.ctx.storage.sql.exec(
                'INSERT INTO repetition_shards (shard, counts_json) VALUES (?, ?)',
                index,
                JSON.stringify(shard),
              );
            }
          },
        );
      } else if (repetitionMode === 'sharded' && updatedPositionHash) {
        const shardIndex = shardForPosition(updatedPositionHash);
        const storedShard = this.ctx.storage.sql
          .exec<ShardRow>(
            'SELECT counts_json FROM repetition_shards WHERE shard = ?',
            shardIndex,
          )
          .toArray()[0];
        const shard = storedShard
          ? (JSON.parse(storedShard.counts_json) as Record<string, number>)
          : {};
        const count = state.engine.positionCounts[updatedPositionHash];

        if (count === undefined) {
          delete shard[updatedPositionHash];
        } else {
          shard[updatedPositionHash] = count;
        }

        this.ctx.storage.sql.exec(
          `INSERT INTO repetition_shards (shard, counts_json) VALUES (?, ?)
           ON CONFLICT(shard) DO UPDATE SET counts_json = excluded.counts_json`,
          shardIndex,
          JSON.stringify(shard),
        );
      }

      this.ctx.storage.sql.exec(
        `UPDATE match_state SET
          state_json = ?, revision = ?, state_hash = ?, lifecycle = ?,
          repetition_mode = ?, last_activity_at = ?, expires_at = ?
         WHERE singleton = 1`,
        JSON.stringify(storedState),
        commit.revision,
        commit.stateHash,
        lifecycle,
        repetitionMode,
        now,
        expiresAt,
      );
      this.ctx.storage.sql.exec(
        `INSERT INTO commands (
          command_id, revision, actor, command_json, state_hash, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        commit.commandId,
        commit.revision,
        commit.actor,
        JSON.stringify(commit.command),
        commit.stateHash,
        now,
      );
    });

    return repetitionMode;
  }

  private reject(
    socket: WebSocket,
    commandId: string,
    reason: Extract<ServerMessage, { type: 'rejected' }>['reason'],
    room: CachedRoom,
  ): void {
    this.send(socket, {
      type: 'rejected',
      commandId,
      reason,
      revision: room.revision,
      stateHash: room.state_hash,
    });
  }

  private broadcast(
    message: ServerMessage,
    participant?: MatchParticipant,
  ): void {
    for (const socket of this.ctx.getWebSockets(participant)) {
      try {
        this.send(socket, message);
      } catch {
        socket.close(1011, 'Delivery failed');
      }
    }
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    if (socket.bufferedAmount > SOCKET_BACKPRESSURE_BYTES) {
      socket.close(1013, 'Reconnect to resume');
      return;
    }

    socket.send(JSON.stringify(message));
  }
}
