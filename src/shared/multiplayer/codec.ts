import {
  MULTIPLAYER_PROTOCOL_VERSION,
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
} from './contracts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isParticipant(value: unknown): value is MatchParticipant {
  return value === 'first' || value === 'second';
}

function isLifecycle(value: unknown): value is MatchLifecycle {
  return value === 'waiting' || value === 'active' || value === 'completed';
}

function isRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isHash(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/u.test(value);
}

function isCommandId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 8 &&
    value.length <= 128 &&
    /^[A-Za-z0-9._:-]+$/u.test(value)
  );
}

function isCommand(value: unknown): value is MatchCommand {
  if (!isRecord(value)) return false;

  return (
    (value.type === 'submitAction' && isRecord(value.action)) ||
    (value.type === 'chooseNextColor' &&
      (value.color === 'white' || value.color === 'black')) ||
    value.type === 'startNextGame'
  );
}

function isCommandEnvelope(value: unknown): value is MatchCommandEnvelope {
  return (
    isRecord(value) &&
    isCommand(value.command) &&
    isRevision(value.baseRevision) &&
    isCommandId(value.commandId) &&
    isHash(value.predictedStateHash) &&
    isHash(value.previousStateHash)
  );
}

function isCommittedCommand(value: unknown): value is CommittedMatchCommand {
  return (
    isRecord(value) &&
    isParticipant(value.actor) &&
    isCommand(value.command) &&
    isCommandId(value.commandId) &&
    isRevision(value.revision) &&
    isHash(value.stateHash)
  );
}

function isAuthoritativeMatchState(
  value: unknown,
): value is AuthoritativeMatchState {
  return (
    isRecord(value) &&
    isRecord(value.engine) &&
    isRecord(value.engine.board) &&
    isRecord(value.engine.positionCounts) &&
    (value.engine.currentPlayer === 'white' || value.engine.currentPlayer === 'black') &&
    Number.isSafeInteger(value.engine.moveNumber) &&
    (value.engine.status === 'active' || value.engine.status === 'gameOver') &&
    isRecord(value.engine.victory) &&
    (value.engine.pendingJump === null || isRecord(value.engine.pendingJump)) &&
    (value.format === 'single' || value.format === 'series') &&
    isRecord(value.rules) &&
    (value.series === null || isRecord(value.series))
  );
}

export function decodeClientMessage(value: unknown): ClientMessage | null {
  if (!isRecord(value)) return null;

  if (
    value.type === 'hello' &&
    value.protocol === MULTIPLAYER_PROTOCOL_VERSION &&
    isRevision(value.revision) &&
    (value.stateHash === null || isHash(value.stateHash))
  ) {
    return value as ClientMessage;
  }

  if (
    value.type === 'resync' &&
    isRevision(value.revision) &&
    (value.stateHash === null || isHash(value.stateHash))
  ) {
    return value as ClientMessage;
  }

  if (value.type === 'submit' && isCommandEnvelope(value.envelope)) {
    return value as ClientMessage;
  }

  if (value.type === 'peerSignal' && 'signal' in value) {
    return value as ClientMessage;
  }

  return null;
}

export function decodeServerMessage(value: unknown): ServerMessage | null {
  if (!isRecord(value)) return null;

  if (
    value.type === 'ready' &&
    isParticipant(value.participant) &&
    isLifecycle(value.lifecycle) &&
    isRevision(value.revision) &&
    isHash(value.stateHash)
  ) {
    return value as ServerMessage;
  }

  if (
    value.type === 'snapshot' &&
    isRecord(value.snapshot) &&
    isRevision(value.snapshot.revision) &&
    isAuthoritativeMatchState(value.snapshot.state) &&
    isHash(value.snapshot.stateHash)
  ) {
    return value as ServerMessage;
  }

  if (
    value.type === 'commands' &&
    Array.isArray(value.commands) &&
    value.commands.length <= 32 &&
    value.commands.every(isCommittedCommand)
  ) {
    return value as ServerMessage;
  }

  if (value.type === 'committed' && isCommittedCommand(value.commit)) {
    return value as ServerMessage;
  }

  if (
    value.type === 'rejected' &&
    isCommandId(value.commandId) &&
    ['invalidCommand', 'matchNotReady', 'notYourTurn', 'revisionConflict', 'stateMismatch', 'matchComplete'].includes(String(value.reason)) &&
    isRevision(value.revision) &&
    isHash(value.stateHash)
  ) {
    return value as ServerMessage;
  }

  if (value.type === 'peerSignal' && 'signal' in value) {
    return value as ServerMessage;
  }

  if (
    value.type === 'peerPresence' &&
    typeof value.connected === 'boolean'
  ) {
    return value as ServerMessage;
  }

  return null;
}

export function decodeCreateMatchResponse(
  value: unknown,
): CreateMatchResponse | null {
  if (
    !isRecord(value) ||
    typeof value.matchId !== 'string' ||
    !isParticipant(value.participant) ||
    !isHash(value.capability) ||
    !isHash(value.inviteCapability)
  ) {
    return null;
  }

  return value as CreateMatchResponse;
}

export function decodeCreateSessionResponse(
  value: unknown,
): CreateSessionResponse | null {
  if (
    !isRecord(value) ||
    typeof value.matchId !== 'string' ||
    !isParticipant(value.participant)
  ) {
    return null;
  }

  return value as CreateSessionResponse;
}

export type PeerProposal = {
  actor: MatchParticipant;
  baseRevision: number;
  command: MatchCommand;
  commandId: string;
  predictedStateHash: string;
  type: 'proposal';
};

export function decodePeerProposal(value: unknown): PeerProposal | null {
  if (
    !isRecord(value) ||
    value.type !== 'proposal' ||
    !isParticipant(value.actor) ||
    !isRevision(value.baseRevision) ||
    !isCommand(value.command) ||
    !isCommandId(value.commandId) ||
    !isHash(value.predictedStateHash)
  ) {
    return null;
  }

  return value as PeerProposal;
}
