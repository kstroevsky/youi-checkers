import {
  MULTIPLAYER_PROTOCOL_VERSION,
  applyMatchCommand,
  hashMatchState,
  type AuthoritativeMatchState,
  type ClientMessage,
  type CommittedMatchCommand,
  type CreateMatchResponse,
  type CreateSessionResponse,
  type MatchCommand,
  type MatchCommandEnvelope,
  type MatchLifecycle,
  type MatchParticipant,
  type ServerMessage,
} from '@/shared/multiplayer';

const CHECKPOINT_EVERY_REVISIONS = 16;
const MAX_CHECKPOINT_BYTES = 1_500_000;
const SOCKET_BACKPRESSURE_BYTES = 64 * 1024;
const DIRECT_BACKPRESSURE_BYTES = 64 * 1024;
const STUN_URL = 'stun:stun.cloudflare.com:3478';

export type OnlineConnectionStatus =
  | 'connecting'
  | 'waiting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export type OnlineMatchView = {
  directConnected: boolean;
  error: string | null;
  inviteUrl: string | null;
  lifecycle: MatchLifecycle;
  matchId: string | null;
  participant: MatchParticipant | null;
  peerPresent: boolean;
  pendingCommand: boolean;
  revision: number;
  status: OnlineConnectionStatus;
};

type ProjectionOptions = {
  connected: boolean;
  participant: MatchParticipant;
  pending: boolean;
};

type MultiplayerCallbacks = {
  getCreateOptions: () => {
    format: 'single' | 'series';
    rules: AuthoritativeMatchState['rules'];
    targetPoints: number;
  };
  project: (state: AuthoritativeMatchState, options: ProjectionOptions) => void;
  setView: (view: OnlineMatchView | null) => void;
};

type PendingCommand = {
  envelope: MatchCommandEnvelope;
  predicted: AuthoritativeMatchState;
};

type StoredCheckpoint = {
  revision: number;
  state: AuthoritativeMatchState;
  stateHash: string;
};

type PeerProposal = {
  actor: MatchParticipant;
  baseRevision: number;
  command: MatchCommand;
  commandId: string;
  predictedStateHash: string;
  type: 'proposal';
};

type PeerSignal =
  | { candidate: RTCIceCandidateInit }
  | { description: RTCSessionDescriptionInit };

function checkpointKey(matchId: string): string {
  return `youi.multiplayer.checkpoint.${matchId}`;
}

function socketUrl(matchId: string): string {
  const url = new URL(`/api/matches/${matchId}/socket`, window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

function parseInvite(value: string): {
  capability: string | null;
  matchId: string;
} | null {
  let url: URL;

  try {
    url = new URL(value, window.location.href);
  } catch {
    return null;
  }

  const params = new URLSearchParams(url.hash.slice(1));
  const matchId = params.get('match');
  const capability = params.get('cap');

  if (!matchId || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/u.test(matchId)) {
    return null;
  }

  if (capability && !/^[A-Za-z0-9_-]{43}$/u.test(capability)) {
    return null;
  }

  return { capability, matchId };
}

async function responseMessage(response: Response): Promise<string> {
  try {
    const value = (await response.json()) as { message?: unknown };
    return typeof value.message === 'string'
      ? value.message
      : `Request failed (${response.status}).`;
  } catch {
    return `Request failed (${response.status}).`;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canUseDirectPath(): boolean {
  if (typeof RTCPeerConnection === 'undefined') return false;
  const connection = (
    navigator as Navigator & {
      connection?: { effectiveType?: string; saveData?: boolean };
    }
  ).connection;

  return (
    !connection?.saveData &&
    connection?.effectiveType !== 'slow-2g' &&
    connection?.effectiveType !== '2g' &&
    (navigator.hardwareConcurrency ?? 2) >= 2
  );
}

export class MultiplayerClient {
  private authoritative: AuthoritativeMatchState | null = null;
  private callbacks: MultiplayerCallbacks;
  private channel: RTCDataChannel | null = null;
  private closed = false;
  private lifecycle: MatchLifecycle = 'waiting';
  private hashingCommand = false;
  private matchId: string | null = null;
  private messageQueue: Promise<void> = Promise.resolve();
  private participant: MatchParticipant | null = null;
  private peer: RTCPeerConnection | null = null;
  private peerCandidates: RTCIceCandidateInit[] = [];
  private pending: PendingCommand | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: number | null = null;
  private revision = 0;
  private socket: WebSocket | null = null;
  private speculativePeerCommandId: string | null = null;
  private speculativeTimer: number | null = null;
  private stateHash: string | null = null;
  private view: OnlineMatchView | null = null;

  constructor(callbacks: MultiplayerCallbacks) {
    this.callbacks = callbacks;

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          this.saveCheckpoint();
        }
      });
    }
  }

  bootstrap(): void {
    if (typeof window === 'undefined' || !window.location.hash) {
      return;
    }

    const invite = parseInvite(window.location.href);
    if (invite) {
      void this.join(window.location.href);
    }
  }

  async create(): Promise<string | null> {
    this.prepareConnection();
    this.setView({
      directConnected: false,
      error: null,
      inviteUrl: null,
      lifecycle: 'waiting',
      matchId: null,
      participant: null,
      peerPresent: false,
      pendingCommand: false,
      revision: 0,
      status: 'connecting',
    });

    try {
      const response = await fetch('/api/matches', {
        body: JSON.stringify(this.callbacks.getCreateOptions()),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(await responseMessage(response));
      }

      const created = (await response.json()) as CreateMatchResponse;
      await this.exchangeCapability(created.matchId, created.capability);
      const inviteUrl = new URL(window.location.href);
      inviteUrl.hash = new URLSearchParams({
        cap: created.inviteCapability,
        match: created.matchId,
      }).toString();
      this.replaceLocationCapability(created.matchId);
      this.connect(created.matchId, created.participant, inviteUrl.toString());
      return inviteUrl.toString();
    } catch (error) {
      this.fail(error);
      return null;
    }
  }

  async join(inviteValue: string): Promise<boolean> {
    const invite = parseInvite(inviteValue);

    if (!invite) {
      this.fail(new Error('Invalid multiplayer invitation.'));
      return false;
    }

    this.prepareConnection();
    this.setView({
      directConnected: false,
      error: null,
      inviteUrl: null,
      lifecycle: 'waiting',
      matchId: invite.matchId,
      participant: null,
      peerPresent: false,
      pendingCommand: false,
      revision: 0,
      status: 'connecting',
    });

    try {
      let participant = this.readCheckpointParticipant(invite.matchId);

      if (invite.capability) {
        participant = await this.exchangeCapability(
          invite.matchId,
          invite.capability,
        );
        this.replaceLocationCapability(invite.matchId);
      }

      if (!participant) {
        // The scoped HttpOnly cookie may still be valid; the room confirms the seat.
        participant = 'first';
      }

      this.connect(invite.matchId, participant, null);
      return true;
    } catch (error) {
      this.fail(error);
      return false;
    }
  }

  leave(): void {
    this.closed = true;
    this.closeTransport();
    this.authoritative = null;
    this.matchId = null;
    this.participant = null;
    this.pending = null;
    this.hashingCommand = false;
    this.clearSpeculation();
    this.revision = 0;
    this.stateHash = null;
    this.setView(null);

    if (typeof window !== 'undefined') {
      history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}`,
      );
    }
  }

  submit(command: MatchCommand): boolean {
    if (
      !this.authoritative ||
      !this.participant ||
      !this.stateHash ||
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN ||
      this.lifecycle !== 'active' ||
      this.pending ||
      this.hashingCommand
    ) {
      return false;
    }

    let predicted: AuthoritativeMatchState;

    try {
      predicted = applyMatchCommand(
        this.authoritative,
        this.participant,
        command,
      ).state;
    } catch {
      return false;
    }

    const commandId = crypto.randomUUID();
    const baseRevision = this.revision;
    const previousStateHash = this.stateHash;
    this.hashingCommand = true;
    this.callbacks.project(predicted, {
      connected: true,
      participant: this.participant,
      pending: true,
    });
    this.patchView({ pendingCommand: true });

    void hashMatchState(predicted)
      .then((predictedStateHash) => {
        this.hashingCommand = false;
        if (
          !this.authoritative ||
          !this.participant ||
          this.revision !== baseRevision ||
          this.stateHash !== previousStateHash
        ) {
          this.projectAuthoritative();
          return;
        }

        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
          this.patchView({ pendingCommand: false });
          this.projectAuthoritative();
          return;
        }

        const envelope: MatchCommandEnvelope = {
          baseRevision,
          command,
          commandId,
          predictedStateHash,
          previousStateHash,
        };
        this.pending = { envelope, predicted };
        this.sendSocket({ type: 'submit', envelope });
        this.sendDirect({
          actor: this.participant,
          baseRevision,
          command,
          commandId,
          predictedStateHash,
          type: 'proposal',
        });
      })
      .catch(() => {
        this.hashingCommand = false;
        this.requestResync();
      });

    return true;
  }

  private async exchangeCapability(
    matchId: string,
    capability: string,
  ): Promise<MatchParticipant> {
    const response = await fetch(`/api/matches/${matchId}/session`, {
      body: JSON.stringify({ capability }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(await responseMessage(response));
    }

    const session = (await response.json()) as CreateSessionResponse;
    localStorage.setItem(
      `${checkpointKey(matchId)}.participant`,
      session.participant,
    );
    return session.participant;
  }

  private readCheckpointParticipant(matchId: string): MatchParticipant | null {
    const value = localStorage.getItem(`${checkpointKey(matchId)}.participant`);
    return value === 'first' || value === 'second' ? value : null;
  }

  private connect(
    matchId: string,
    participant: MatchParticipant,
    inviteUrl: string | null,
  ): void {
    this.matchId = matchId;
    this.participant = participant;
    this.loadCheckpoint(matchId);
    this.patchView({
      inviteUrl,
      matchId,
      participant,
      revision: this.revision,
      status: this.reconnectAttempt ? 'reconnecting' : 'connecting',
    });
    this.openSocket();
  }

  private openSocket(): void {
    if (this.closed || !this.matchId) return;

    const socket = new WebSocket(socketUrl(this.matchId));
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.reconnectAttempt = 0;
      this.sendSocket({
        type: 'hello',
        protocol: MULTIPLAYER_PROTOCOL_VERSION,
        revision: this.revision,
        stateHash: this.stateHash,
      });
      if (this.pending) {
        this.sendSocket({ type: 'submit', envelope: this.pending.envelope });
      }
    });
    socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return;
      this.messageQueue = this.messageQueue.then(() =>
        this.handleServerMessage(event.data),
      );
    });
    socket.addEventListener('close', () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.closePeer();
      if (!this.closed) this.scheduleReconnect();
    });
    socket.addEventListener('error', () => socket.close());
  }

  private async handleServerMessage(raw: string): Promise<void> {
    let message: ServerMessage;

    try {
      message = JSON.parse(raw) as ServerMessage;
    } catch {
      this.socket?.close(1008, 'Invalid server message');
      return;
    }

    if (message.type === 'ready') {
      this.participant = message.participant;
      this.lifecycle = message.lifecycle;
      if (this.matchId) {
        localStorage.setItem(
          `${checkpointKey(this.matchId)}.participant`,
          message.participant,
        );
      }
      const synchronized =
        this.revision === message.revision && this.stateHash === message.stateHash;
      this.patchView({
        lifecycle: message.lifecycle,
        participant: message.participant,
        revision: message.revision,
        status:
          message.lifecycle === 'waiting'
            ? 'waiting'
            : synchronized
              ? 'connected'
              : 'reconnecting',
      });
      this.projectAuthoritative();
      return;
    }

    if (message.type === 'snapshot') {
      this.authoritative = message.snapshot.state;
      this.revision = message.snapshot.revision;
      this.stateHash = message.snapshot.stateHash;
      this.pending = null;
      this.clearSpeculation();
      this.patchView({
        pendingCommand: false,
        revision: this.revision,
        status: this.lifecycle === 'waiting' ? 'waiting' : 'connected',
      });
      this.projectAuthoritative();
      this.saveCheckpoint();
      return;
    }

    if (message.type === 'commands') {
      for (const commit of message.commands) {
        if (!(await this.acceptCommit(commit))) return;
      }
      this.patchView({ status: 'connected' });
      this.projectAuthoritative();
      this.saveCheckpoint();
      return;
    }

    if (message.type === 'committed') {
      await this.acceptCommit(message.commit);
      return;
    }

    if (message.type === 'rejected') {
      if (this.pending?.envelope.commandId === message.commandId) {
        this.pending = null;
        this.patchView({ pendingCommand: false });
        this.projectAuthoritative();
      }

      if (message.reason === 'matchNotReady') {
        this.lifecycle = 'waiting';
        this.patchView({ lifecycle: 'waiting', status: 'waiting' });
      }

      if (
        message.reason === 'revisionConflict' ||
        message.reason === 'stateMismatch'
      ) {
        this.requestResync();
      }
      return;
    }

    if (message.type === 'peerPresence') {
      this.patchView({ peerPresent: message.connected });
      if (message.connected) {
        this.lifecycle = 'active';
        this.patchView({ lifecycle: 'active', status: 'connected' });
        this.projectAuthoritative();
        if (this.participant === 'first') void this.startPeerOffer();
      } else {
        this.closePeer();
      }
      return;
    }

    if (message.type === 'peerSignal') {
      await this.acceptPeerSignal(message.signal);
    }
  }

  private async acceptCommit(commit: CommittedMatchCommand): Promise<boolean> {
    if (!this.authoritative || commit.revision !== this.revision + 1) {
      this.requestResync();
      return false;
    }

    let next: AuthoritativeMatchState;

    if (this.pending?.envelope.commandId === commit.commandId) {
      next = this.pending.predicted;
      if (this.pending.envelope.predictedStateHash !== commit.stateHash) {
        this.requestResync();
        return false;
      }
    } else {
      try {
        next = applyMatchCommand(
          this.authoritative,
          commit.actor,
          commit.command,
        ).state;
      } catch {
        this.requestResync();
        return false;
      }

      if ((await hashMatchState(next)) !== commit.stateHash) {
        this.requestResync();
        return false;
      }
    }

    this.authoritative = next;
    this.revision = commit.revision;
    this.stateHash = commit.stateHash;
    this.pending = null;
    this.clearSpeculation();
    this.patchView({ pendingCommand: false, revision: this.revision });
    this.projectAuthoritative();

    if (
      this.revision % CHECKPOINT_EVERY_REVISIONS === 0 ||
      next.series?.phase === 'matchOver' ||
      (!next.series && next.engine.status === 'gameOver')
    ) {
      this.saveCheckpoint();
    }

    return true;
  }

  private projectAuthoritative(): void {
    if (!this.authoritative || !this.participant) return;
    this.callbacks.project(this.authoritative, {
      connected: this.view?.status === 'connected',
      participant: this.participant,
      pending: Boolean(this.pending) || this.hashingCommand,
    });
  }

  private requestResync(): void {
    this.pending = null;
    this.clearSpeculation();
    this.patchView({ pendingCommand: false });
    this.projectAuthoritative();
    this.sendSocket({
      type: 'resync',
      revision: this.revision,
      stateHash: this.stateHash,
    });
  }

  private sendSocket(message: ClientMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

    if (this.socket.bufferedAmount > SOCKET_BACKPRESSURE_BYTES) {
      this.socket.close(1013, 'Reconnect to resume');
      return;
    }

    this.socket.send(JSON.stringify(message));
  }

  private scheduleReconnect(): void {
    this.reconnectAttempt += 1;
    this.patchView({ directConnected: false, status: 'reconnecting' });
    const delay = Math.min(15_000, 500 * 2 ** (this.reconnectAttempt - 1));
    this.reconnectTimer = window.setTimeout(() => this.openSocket(), delay);
  }

  private async startPeerOffer(): Promise<void> {
    if (this.peer || this.participant !== 'first' || !canUseDirectPath()) {
      return;
    }
    const peer = this.createPeer();
    this.attachChannel(
      peer.createDataChannel('youi-fast-path', {
        maxRetransmits: 0,
        ordered: false,
      }),
    );
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    this.sendSocket({
      type: 'peerSignal',
      signal: { description: peer.localDescription },
    });
  }

  private createPeer(): RTCPeerConnection {
    const peer = new RTCPeerConnection({
      iceServers: [{ urls: STUN_URL }],
    });
    this.peer = peer;
    peer.addEventListener('icecandidate', (event) => {
      if (event.candidate) {
        this.sendSocket({
          type: 'peerSignal',
          signal: { candidate: event.candidate.toJSON() },
        });
      }
    });
    peer.addEventListener('datachannel', (event) =>
      this.attachChannel(event.channel),
    );
    peer.addEventListener('connectionstatechange', () => {
      if (
        peer.connectionState === 'failed' ||
        peer.connectionState === 'closed'
      ) {
        this.closePeer();
      }
    });
    return peer;
  }

  private async acceptPeerSignal(value: unknown): Promise<void> {
    if (!isRecord(value) || !canUseDirectPath()) return;
    const signal = value as PeerSignal;
    const peer = this.peer ?? this.createPeer();

    try {
      if ('description' in signal && signal.description) {
        await peer.setRemoteDescription(signal.description);
        for (const candidate of this.peerCandidates.splice(0)) {
          await peer.addIceCandidate(candidate);
        }

        if (signal.description.type === 'offer') {
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          this.sendSocket({
            type: 'peerSignal',
            signal: { description: peer.localDescription },
          });
        }
      } else if ('candidate' in signal && signal.candidate) {
        if (peer.remoteDescription) {
          await peer.addIceCandidate(signal.candidate);
        } else {
          this.peerCandidates.push(signal.candidate);
        }
      }
    } catch {
      this.closePeer();
    }
  }

  private attachChannel(channel: RTCDataChannel): void {
    this.channel = channel;
    channel.addEventListener('open', () =>
      this.patchView({ directConnected: true }),
    );
    channel.addEventListener('close', () =>
      this.patchView({ directConnected: false }),
    );
    channel.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return;
      void this.acceptPeerProposal(event.data);
    });
  }

  private async acceptPeerProposal(raw: string): Promise<void> {
    if (!this.authoritative || !this.participant || this.pending) return;

    let proposal: PeerProposal;

    try {
      proposal = JSON.parse(raw) as PeerProposal;
    } catch {
      return;
    }

    if (
      proposal.type !== 'proposal' ||
      proposal.actor === this.participant ||
      proposal.baseRevision !== this.revision
    ) {
      return;
    }

    try {
      const predicted = applyMatchCommand(
        this.authoritative,
        proposal.actor,
        proposal.command,
      ).state;
      if ((await hashMatchState(predicted)) !== proposal.predictedStateHash)
        return;
      this.speculativePeerCommandId = proposal.commandId;
      if (this.speculativeTimer !== null) {
        window.clearTimeout(this.speculativeTimer);
      }
      this.speculativeTimer = window.setTimeout(() => {
        if (this.speculativePeerCommandId === proposal.commandId) {
          this.clearSpeculation();
          this.projectAuthoritative();
        }
      }, 1500);
      this.callbacks.project(predicted, {
        connected: true,
        participant: this.participant,
        pending: true,
      });
    } catch {
      // WebRTC is speculative only; canonical WebSocket delivery remains sufficient.
    }
  }

  private sendDirect(proposal: PeerProposal): void {
    if (
      !this.channel ||
      this.channel.readyState !== 'open' ||
      this.channel.bufferedAmount > DIRECT_BACKPRESSURE_BYTES
    ) {
      return;
    }

    this.channel.send(JSON.stringify(proposal));
  }

  private closePeer(): void {
    this.channel?.close();
    this.peer?.close();
    this.channel = null;
    this.peer = null;
    this.peerCandidates = [];
    this.patchView({ directConnected: false });
  }

  private clearSpeculation(): void {
    this.speculativePeerCommandId = null;
    if (this.speculativeTimer !== null) {
      window.clearTimeout(this.speculativeTimer);
      this.speculativeTimer = null;
    }
  }

  private closeTransport(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close(1000, 'Client closed');
    this.socket = null;
    this.closePeer();
  }

  private prepareConnection(): void {
    this.closed = true;
    this.closeTransport();
    this.authoritative = null;
    this.hashingCommand = false;
    this.lifecycle = 'waiting';
    this.matchId = null;
    this.participant = null;
    this.pending = null;
    this.reconnectAttempt = 0;
    this.revision = 0;
    this.stateHash = null;
    this.clearSpeculation();
    this.closed = false;
  }

  private saveCheckpoint(): void {
    if (!this.matchId || !this.authoritative || !this.stateHash) return;

    const checkpoint: StoredCheckpoint = {
      revision: this.revision,
      state: this.authoritative,
      stateHash: this.stateHash,
    };
    const serialized = JSON.stringify(checkpoint);

    if (serialized.length <= MAX_CHECKPOINT_BYTES) {
      try {
        localStorage.setItem(checkpointKey(this.matchId), serialized);
      } catch {
        // Storage pressure must never affect the live match.
      }
    }
  }

  private loadCheckpoint(matchId: string): void {
    try {
      const raw = localStorage.getItem(checkpointKey(matchId));
      if (!raw) return;
      const checkpoint = JSON.parse(raw) as StoredCheckpoint;
      if (
        Number.isSafeInteger(checkpoint.revision) &&
        typeof checkpoint.stateHash === 'string' &&
        checkpoint.state
      ) {
        this.authoritative = checkpoint.state;
        this.revision = checkpoint.revision;
        this.stateHash = checkpoint.stateHash;
        this.projectAuthoritative();
      }
    } catch {
      localStorage.removeItem(checkpointKey(matchId));
    }
  }

  private replaceLocationCapability(matchId: string): void {
    const url = new URL(window.location.href);
    url.hash = new URLSearchParams({ match: matchId }).toString();
    history.replaceState(null, '', url);
  }

  private fail(error: unknown): void {
    const message =
      error instanceof Error ? error.message : 'Multiplayer failed.';
    this.patchView({ error: message, status: 'error' });
  }

  private setView(view: OnlineMatchView | null): void {
    this.view = view;
    this.callbacks.setView(view);
  }

  private patchView(patch: Partial<OnlineMatchView>): void {
    if (!this.view) {
      this.setView({
        directConnected: false,
        error: null,
        inviteUrl: null,
        lifecycle: this.lifecycle,
        matchId: this.matchId,
        participant: this.participant,
        peerPresent: false,
        pendingCommand: false,
        revision: this.revision,
        status: 'connecting',
        ...patch,
      });
      return;
    }

    this.setView({ ...this.view, ...patch });
  }
}
