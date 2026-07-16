# PWA Infrastructure and Report Tooling

**Copyright (c) 2026 Kostiantyn Stroievskyi. All Rights Reserved.**

No permission is granted to use, copy, modify, merge, publish, distribute, sublicense, or sell copies of this software or any portion of it, for any purpose, without explicit written permission from the copyright holder.

---

This document covers the browser runtime infrastructure around YOUI rather than the game logic itself: Progressive Web App configuration, anonymous diagnostics, lazy model delivery, and the scripts that emit performance and AI-behavior reports.

The key design constraint is local-first execution. The application remains playable without a backend service; the Cloudflare Worker receives optional bounded diagnostics and hosts invite-only rooms only when online play is selected.

```mermaid
flowchart LR
  App["YOUI App"] --> SW["Service Worker / Workbox"]
  SW --> Route{"Request path"}
  Route -- "/models/ai-policy-value.onnx" --> CacheFirst["CacheFirst model cache"]
  Route -- "other static assets" --> Static["Precaching / runtime fetch"]
  CacheFirst --> Cache["CacheStorage"]
  Static --> Network["Vite preview / static host"]
  App -. "batched diagnostics" .-> Telemetry["Worker API / D1"]
```

## Cloudflare Worker And Diagnostics

[`wrangler.jsonc`](../wrangler.jsonc) extends the existing `youi` static-assets Worker without moving the PWA to another platform. Static files bypass Worker code, while `/api/*` is routed through [`worker/index.ts`](../worker/index.ts). The `/api/telemetry/batches` endpoint accepts same-origin JSON batches up to 32 KiB and stores them in the `youi-telemetry` D1 database.

The browser collector is initialized through a small pre-React proxy and loads its observers asynchronously. It records aggregate Web Vitals, long tasks, foreground timer drift, startup and interaction timings, AI search diagnostics, sanitized errors, and exposed device/load capabilities. Exact GPU probing runs in a dedicated browser worker so weak devices do not pay that cost on the game thread.

Diagnostics are bounded by:

- a 64-event in-memory context ring and at most 20 severe incidents;
- client-side payload compaction below the Worker limit;
- at most 10 pending IndexedDB batches or 256 KiB;
- 30-day D1 retention enforced by the daily scheduled handler.

The Settings toggle uses `youi/diagnostics-enabled/v1`, independently from saved/imported games. Disabling it stops collection and deletes the `youi-telemetry` IndexedDB database. Batches do not contain board coordinates, board state, imported text, replays, raw stacks, IP addresses, WebRTC candidates, or a persistent browser identifier.

Database schema changes live in [`migrations/`](../migrations/). Local and remote operations use:

- `pnpm cf:d1:migrate:local`;
- `pnpm cf:dev`;
- `pnpm cf:preview`;
- `pnpm cf:deploy`.

The Worker also uses Cloudflare's native rate-limit binding with a high per-source ceiling (30 batches per minute). The source key is used only by the rate-limit service during enforcement; it is not written into D1.

## Multiplayer Infrastructure

Online play adds one SQLite-backed Durable Object class, `MatchRoom`, to the same Worker deployment. There is no separate matchmaking service, account database, relay fleet, cache, or message broker.

Routes:

- `POST /api/matches` creates a room and returns two independent 256-bit capabilities;
- `POST /api/matches/:id/session` consumes one capability and sets a path-scoped `HttpOnly; SameSite=Strict; Secure` cookie in HTTPS deployments;
- `GET /api/matches/:id/socket` authenticates that cookie and upgrades through the room.

The room uses hibernatable WebSockets with native ping/pong auto-response, so idle sockets do not require application heartbeats. SQLite updates the current state and idempotent command record in one synchronous transaction. Unjoined rooms expire after 24 hours; active and completed rooms expire 30 days after their last accepted activity. A single Durable Object alarm performs cleanup.

Connection recovery is bounded and state-aware. The server replays at most 32 compact commands for a small gap and otherwise returns a history-free snapshot. Browser checkpoints are written every 16 accepted revisions, when the page becomes hidden, and at match completion; failures or quota pressure in that optional cache never affect live play.

The optional direct fast path uses Cloudflare's public `stun:stun.cloudflare.com:3478` endpoint and deliberately has no TURN credentials in v1. NATs that cannot establish a direct path continue over the already-open room WebSocket without a user-visible failure. TURN can therefore be added later from measured connection telemetry rather than becoming mandatory infrastructure now.

The multiplayer rate-limit binding is independent from telemetry and allows 60 create/session requests per source per minute. WebSocket command rate is naturally serialized per room, messages are capped at 64 KiB, signaling is capped at 16 KiB, and sockets above 64 KiB buffered output are closed with a retryable status so reconnect can resume from the last committed revision.

Local verification:

- `pnpm exec wrangler deploy --dry-run` validates bindings and bundles the Worker;
- `pnpm cf:dev` runs the full Worker locally;
- `pnpm test:run worker/multiplayer.test.ts src/shared/multiplayer` exercises route security, rule parity, and payload bounds.

## PWA Configuration

[`vite.config.ts`](../vite.config.ts) defines the PWA boundary through `vite-plugin-pwa`.

Important settings:

- `registerType: 'prompt'`: update flow is explicit rather than silently replacing a running app;
- `navigateFallback: 'index.html'`: client-side routing keeps working offline;
- `maximumFileSizeToCacheInBytes: 32 * 1024 * 1024`: large static assets, including the optional model, are cacheable;
- manifest metadata defines standalone installability, icons, theme color, and background color.
- the concrete manifest colors are `theme_color: '#e8dfd2'` and `background_color: '#f9f3e8'`;
- the icon set is `pwa-192x192.png`, `pwa-512x512.png`, and the maskable `pwa-maskable-512x512.png`.

## Optional Model Delivery

The optional ONNX artifact lives at `/models/ai-policy-value.onnx`. The runtime handles it in two layers:

1. [`src/ai/model/guidance.ts`](../src/ai/model/guidance.ts) fetches the full model bytes, accepts only a `200` non-HTML-like response, and loads the `onnxruntime-web` WASM entry point only after those bytes are available. The inference session is created from the fetched bytes, never from a cached range probe.
2. [`vite.config.ts`](../vite.config.ts) applies a `CacheFirst` Workbox rule for that exact pathname with a 30-day retention window and `200` cacheable responses.

That split avoids bundling neural inference payloads into the main application path while still allowing offline reuse once the file has been fetched successfully.

## Why The Model Stays Outside The Bundle

The model is optional infrastructure, not a product prerequisite. Bundling it into the main JavaScript path would penalize hot-seat users and first-load performance for a feature they may never use. Keeping it in `public/models/` and loading it lazily preserves the following properties:

- the baseline app remains lightweight;
- the AI still works when no model file exists;
- browser inference failures degrade to heuristic search rather than blocking gameplay.

## Performance Report Pipeline

[`scripts/perf-report.mjs`](../scripts/perf-report.mjs) is the main performance harness. It does more than snapshot one page load:

- runs `vite preview` against the built app;
- launches Playwright against that preview;
- measures browser timings on desktop and mobile-style viewports;
- applies CPU throttling through Chrome DevTools for the default mobile profile set `1x`, `4x`, and `6x`;
- merges the browser results with the domain benchmark JSON produced by [`scripts/domainPerformance.report.ts`](../scripts/domainPerformance.report.ts).

Outputs:

- [`output/playwright/perf-report.json`](../output/playwright/perf-report.json): canonical machine-readable report;
- [`output/playwright/perf-report.md`](../output/playwright/perf-report.md): generated human-readable summary.

```mermaid
flowchart TD
  Build["npm run build"] --> Preview["vite preview"]
  Preview --> Browser["Playwright browser runs"]
  Browser --> Metrics["desktop + mobile metrics"]
  Browser --> CPU["1x / 4x / 6x CPU profiles"]
  Domain["domainPerformance.report.ts"] --> Merge["merge browser + domain results"]
  Metrics --> Merge
  CPU --> Merge
  Merge --> Json["perf-report.json"]
  Merge --> Md["perf-report.md"]
```

The harness covers more than one cold-load number. The browser side measures:

- initial navigation, paint, layout-shift, long-task, and DOM-size metrics;
- board interaction latency for opening the move dialog, choosing an action, and committing a move;
- compact-layout tab switching on the mobile viewport profile;
- fresh-match AI reply timing after human or computer opening ownership is configured;
- imported late-game hard-AI replies from serialized sessions.
- telemetry-attributed long tasks, requests during interactions, pending queue size, and startup heap delta.

The domain/AI fixtures come from [`scripts/lateGamePerfFixtures.ts`](../scripts/lateGamePerfFixtures.ts). The current labels are `opening`, seeded realistic `midgame20` and `midgame40`, deterministic `loopPressure50` and `loopPressure100`, and `lateSparse200`. The seeded midgames retain typical material and branching; the loop-derived fixtures intentionally stress repetition and late-risk behavior.

The domain-side report merged into the same JSON also measures root-ordering reuse on those fixtures by comparing a baseline full reordering loop against the optimized `precomputeOrderedActions()` plus `orderPrecomputedMoves()` path.

The Markdown file is a report artifact, not hand-authored documentation. Its prose should therefore explain methodology and thresholds, but the numeric body should always come from the generator.

### Paired immutable-revision A/B experiments

[`scripts/perf-ab.mjs`](../scripts/perf-ab.mjs) is the keep/reject runner for a proposed performance change. It is deliberately separate from `perf:report`: a one-off report describes a machine run, whereas `perf:ab` compares two immutable Git revisions under the same workload contract.

```mermaid
flowchart TD
  Refs["baseline + candidate Git refs"] --> Lock["verify distinct commits and identical lockfile"]
  Lock --> Worktrees["detached temporary worktrees"]
  Worktrees --> Validate["build + non-benchmark tests"]
  Validate --> Warm["one warmup per revision"]
  Warm --> Schedule["counterbalanced pairs: A/B, B/A, …"]
  Schedule --> Domain["domain pipeline or full browser pipeline"]
  Domain --> Contract["verify fixtures and workload schema"]
  Contract --> Summary["paired medians + bootstrap interval + guardrails"]
  Summary --> Artifacts["experiment.json, report.md, logs, warmups, raw samples"]
```

The default `domain` pipeline makes hard-mode AI nodes per second the decision metric. It treats per-fixture legal-action counts and completed depth as guardrails; selected legal moves are observations rather than an identity requirement because a faster time-bounded search can legitimately complete more work. A lower 95% confidence bound of at least 5% earns the material `confirmed-win` label. A smaller interval that remains above zero may be retained as a non-material improvement only after exact-equivalence and AI-quality comparisons pass. The `full` pipeline additionally normalizes browser, mobile-profile, and delivered-artifact metrics.

Run it with two immutable refs:

```bash
pnpm perf:ab --baseline=main --candidate=<candidate-ref>
```

Artifacts go under `output/perf-ab/` and are intentionally ignored by Git. They include the exact commits, environment metadata, counterbalanced schedule, raw reports, warmups, logs, and verdict, so the hand-authored documentation does not become a stale metric dump. The canonical methodology, statistical meaning of a verdict, controls, and interpretation limits live in [`performance-ab-testing.md`](./performance-ab-testing.md).

## Archival Baselines And Comparisons

The repository also keeps historical comparison artifacts:

- [`output/playwright/perf-report.before.json`](../output/playwright/perf-report.before.json): baseline machine snapshot;
- [`output/playwright/perf-report.before.md`](../output/playwright/perf-report.before.md): archival baseline summary;
- [`output/playwright/perf-report.before-after.md`](../output/playwright/perf-report.before-after.md): generated comparison between baseline and current report JSON.

The comparison file is now generated from JSON by [`scripts/compare-perf-reports.mjs`](../scripts/compare-perf-reports.mjs). That keeps the comparison reproducible and prevents the Markdown from drifting away from the underlying measurements.

## AI Variety Report Pipeline

[`scripts/ai-variety.report.ts`](../scripts/ai-variety.report.ts) runs the offline self-play behavior suite defined in [`src/ai/test/metrics.ts`](../src/ai/test/metrics.ts).

Outputs:

- [`output/ai/ai-variety-report.json`](../output/ai/ai-variety-report.json): structured report;
- [`output/ai/ai-variety-report.md`](../output/ai/ai-variety-report.md): generated summary.
- [`output/ai/ai-stage-variety-report.json`](../output/ai/ai-stage-variety-report.json): structured opening-versus-late-stage continuation report;
- [`output/ai/ai-stage-variety-report.md`](../output/ai/ai-stage-variety-report.md): generated stage-by-stage summary.
- [`output/ai/ai-crossplay-report.json`](../output/ai/ai-crossplay-report.json): difficulty-vs-difficulty and persona-vs-persona matrix data;
- [`output/ai/ai-crossplay-report.md`](../output/ai/ai-crossplay-report.md): human-readable cross-play matrix summary;
- [`output/ai/ai-loop-benchmark-report.json`](../output/ai/ai-loop-benchmark-report.json): late-stage loop/escape benchmark data;
- [`output/ai/ai-loop-benchmark-report.md`](../output/ai/ai-loop-benchmark-report.md): generated loop benchmark summary;
- [`output/ai/ai-position-buckets-report.json`](../output/ai/ai-position-buckets-report.json): structural-bucket AI behavior report;
- [`output/ai/ai-position-buckets-report.md`](../output/ai/ai-position-buckets-report.md): generated bucket summary;
- [`output/ai/ai-threat-report.json`](../output/ai/ai-threat-report.json): pressure/threat-oriented trace diagnostics;
- [`output/ai/ai-threat-report.md`](../output/ai/ai-threat-report.md): generated pressure report.

The generator compares current results against two checked-in fixtures:

- [`src/ai/test/fixtures/ai-variety-target-bands.json`](../src/ai/test/fixtures/ai-variety-target-bands.json): status thresholds;
- [`src/ai/test/fixtures/ai-variety-baselines.json`](../src/ai/test/fixtures/ai-variety-baselines.json): regression baseline.

That distinction matters. A metric can be inside its acceptable target band yet still regress against the previous known-good baseline, or vice versa.

The current harness intentionally exercises the same product behavior that ships in browser play:

- each side receives a hidden behavior profile (`expander`, `hunter`, or `builder`) derived from the mirrored seed pair;
- each search trace records the returned `behaviorProfileId` and `riskMode`;
- late or stagnating games therefore show up in the report as deliberate style/risk changes rather than as unexplained variance.

The Markdown summary is intentionally opinionated rather than exhaustive. It now foregrounds decisive-play health through `decisiveResultShare` alongside repetition, stagnation, decompression, mobility release, tension, and composite interestingness. Participation is guarded directly through `meanParticipationDelta` and `positiveParticipationPlyShare`; these values are aggregated from every traced selected candidate and are checked against the versioned baseline.

The complementary stage report exists because the aggregate suite can hide where a behavioral change really helps or hurts. `npm run ai:stage-variety` reruns the same mirrored self-play metrics from all six performance scenarios: the normal opening, two seeded realistic midgames, two deterministic loop-pressure positions, and one sparse late loop position. Each fixture is generated with draws disabled and then normalized into a playable continuation state by keeping the six most recent history records, rebuilding repetition counts from that window, and clearing terminal status; otherwise the shipped threefold rule can make a loop-derived imported position terminal before the AI is evaluated. The report also summarizes `riskMode` activation shares, so a latency change can be interpreted alongside the amount of actual stagnation/late-risk behavior being exercised. Because the normalization intentionally discards long-range repetition memory, early `stagnation` activation can look weaker there than on raw full-history loop fixtures; the stage report and perf fixtures should therefore be read together.

The wider report family exists because "interestingness" is not one scalar:

- `npm run ai:crossplay` asks whether the behavior remains distinct and competitive across difficulty tiers and forced personas.
- `npm run ai:loop-benchmark` isolates the cyclic late-stage fixtures and measures recurrence, laminarity, trapping time, loop-escape rates, and symbolic complexity.
- `npm run ai:position-buckets` aggregates scenarios into structural buckets (`opening`, `congested`, `loopPressure`, `conversionRace`, `lateSparse`) so one pathological fixture does not overrule the whole judgment.
- `npm run ai:threat` measures pressure creation directly from chosen moves: freeze swings, frontier compression, and certified risk progress.

These newer reports combine the core variety metrics from [`src/ai/test/metrics.ts`](../src/ai/test/metrics.ts) with nonlinear trace analytics from [`src/ai/test/advancedMetrics.ts`](../src/ai/test/advancedMetrics.ts). The current advanced metric family includes:

- recurrence quantification analysis over visited-state sequences (`recurrenceRate`, `determinism`, `laminarity`, `trappingTime`);
- sample entropy and permutation entropy over evaluation-score traces;
- normalized symbolic Lempel-Ziv complexity over visited-position sequences;
- explicit loop-escape latency metrics once risk activation or loop pressure appears.

When the intended shipped AI behavior changes materially, the workflow is:

1. run `npm run ai:variety`;
2. run `npm run ai:stage-variety` when a change is specifically meant to affect flat midgame or late-game behavior;
3. run one or more focused pipelines (`ai:loop-benchmark`, `ai:threat`, `ai:position-buckets`, `ai:crossplay`) when the change claims to improve loops, pressure, or style diversity rather than only aggregate variety;
4. inspect the generated JSON and Markdown;
5. update `src/ai/test/fixtures/ai-variety-baselines.json` only if the new aggregate behavior is the new accepted baseline;
6. keep `src/ai/test/fixtures/ai-variety-target-bands.json` as the longer-lived product target file rather than rewriting it for every iteration.

## Git-Aware Report Comparison

[`scripts/run-git-report-compare.mjs`](../scripts/run-git-report-compare.mjs) is the shared compare wrapper for report pipelines. It accepts a pipeline name plus `--before=<ref|working>` and `--after=<ref|working>`, materializes the requested snapshots, reruns the pipeline, flattens the numeric leaves from both JSON outputs, and writes a Markdown diff report.

Current compare wrappers:

- `npm run ai:variety:compare`
- `npm run ai:stage-variety:compare`
- `npm run ai:crossplay:compare`
- `npm run ai:loop-benchmark:compare`
- `npm run ai:position-buckets:compare`
- `npm run ai:threat:compare`
- `npm run perf:compare:git`
- `pnpm perf:ab --baseline=<ref> --candidate=<ref>`

The compare layer supports three common workflows directly:

- compare `HEAD` or `HEAD~N` against the current unstaged tree by passing `--after=working`;
- compare one branch, tag, or commit against another branch, tag, or commit;
- rerun the same working tree twice with different pipeline flags, for example a short smoke run versus a full default run.

The comparison script intentionally tolerates a non-zero exit code when the expected JSON report still exists. This matters for behavior gates such as `ai:variety`, which can exit non-zero purely because the report detected a regression.

One limitation remains structural rather than tooling-related: a comparison only works when the target ref still exposes the data and exports required by that pipeline. For example, a brand-new nonlinear trace report cannot be meaningfully run against a historical ref from before the corresponding telemetry existed in the AI trace layer.

## Operational Commands

The repository exposes the infrastructure/report commands through `package.json`:

- `npm run build`
- `npm run ai:crossplay`
- `npm run ai:loop-benchmark`
- `npm run ai:position-buckets`
- `npm run perf:report`
- `npm run perf:compare`
- `npm run perf:compare:git`
- `npm run ai:stage-variety`
- `npm run ai:threat`
- `npm run ai:variety`
- `pnpm cf:d1:migrate:local`
- `pnpm cf:dev`
- `pnpm cf:preview`
- `pnpm cf:deploy`
- `npm run ai:crossplay:compare`
- `npm run ai:loop-benchmark:compare`
- `npm run ai:position-buckets:compare`
- `npm run ai:stage-variety:compare`
- `npm run ai:threat:compare`
- `npm run ai:variety:compare`
- `npm run docs:check-links`

The last command is intentionally part of the documentation toolchain. Broken relative links are a documentation defect, and the repository now treats them as checkable.

## Boundary Of This Document

This file does not explain search algorithms, heuristic formulas, or domain legality. Those belong elsewhere:

- game and state semantics: [`src/domain/README.md`](../src/domain/README.md)
- AI architecture and lineage: [`src/ai/README.md`](../src/ai/README.md)
- heuristic formulas: [`src/ai/HEURISTICS.md`](../src/ai/HEURISTICS.md)
- paired performance methodology: [`performance-ab-testing.md`](./performance-ab-testing.md)
