# ADR 0001: One authoritative room per online match

Status: Accepted — 2026-07-10

## Context

YOUI needs stable two-player online single games and points matches without turning its local-first application into a conventional game-server fleet. Rule calculations must remain identical to local play, including optional threefold behavior and potentially very long draw-disabled games. The expected ceiling is hundreds, not millions, of concurrent players.

## Decision

Use one Cloudflare SQLite Durable Object per match. Browsers predict through the shared `applyMatchCommand()` reducer; the room validates the same command through that same reducer, persists state plus the idempotent command row atomically, and broadcasts a compact commit over hibernatable WebSockets.

WebRTC is STUN-only and speculative. It may deliver a proposal to the peer earlier, but it never commits state and automatically falls back to WebSocket. Invite capabilities are 256-bit fragment secrets, consumed into path-scoped HttpOnly session cookies. Raw capabilities and session tickets are not stored.

The authoritative representation is `EngineState`, not `GameState`: complete per-turn snapshots and undo frames remain local-only concepts. Repetition counts stay exact. They migrate once from inline JSON to 16 deterministic SQLite shards when their encoded size exceeds 128 KiB.

## Performance consequences

- One move causes one room request, one SQLite transaction, and one small broadcast.
- Normal commit payloads contain no board or repetition table and are guarded below 1 KiB.
- At 25 deterministic moves in the current engine, history-free state is about 8.8 KiB versus about 149 KiB for `GameState` with snapshot history.
- Reconnect work is capped at 32 incremental commands before snapshot replacement.
- React does not own sockets, peer connections, command logs, or hash work; it receives only projected state and connection metadata.

## Quality consequences

Network optimization does not use approximated legality, lossy repetition keys, reduced search depth, or altered victory checks. Browser prediction and server arbitration share the exact domain engine and compare a canonical SHA-256 state hash. Any mismatch requests a snapshot instead of accepting divergent state.

Online undo, restart, import, rule changes, and format changes are disabled because they would require a separate consensus protocol. Local hot-seat and computer games retain their existing behavior.

## Trade-offs

- A regional room may add more latency than a globally distributed relay, but provides a single serializable authority with much less infrastructure.
- STUN-only WebRTC will fail on restrictive/symmetric NATs. This affects only the optional fast path because WebSocket is always present.
- No account recovery exists in v1. Losing both the scoped cookie and the one-time capability loses that seat, which is consistent with invite-only guest sessions.
- Sixteen repetition shards are intentionally simple. They postpone SQLite row-size pressure far beyond normal games without introducing a secondary storage service.
