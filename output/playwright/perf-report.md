# Performance Report

Generated: 2026-03-12T14:07:17.913Z

## Summary
- [GOOD] Desktop FCP: 72ms
- [GOOD] Mobile FCP: 96ms
- [BAD] Desktop move dialog: 374.3ms
- [BAD] Mobile move dialog: 367.4ms
- [GOOD] Mobile hard AI opening: 1286ms
- [GOOD] Domain full action scan: 0.2193ms
- [GOOD] Domain cell action scan: 0.0002ms
- [GOOD] Hash position: 0.0054ms

## Load
- Desktop: FCP 72ms, LCP 72ms, load 31.6ms
- Mobile: FCP 96ms, LCP 96ms, load 65ms

## Render / UI
- Desktop DOM nodes: 399, checker nodes: 0
- Mobile DOM nodes: 366, checker nodes: 0
- Desktop move dialog open: 374.3ms
- Mobile move dialog open: 367.4ms
- Mobile tab switch: Info 38.2ms, History 55.3ms

## AI
- Mobile opening turn: easy 211.1ms, medium 493.8ms, hard 1286ms
- Mobile reply turn: easy 184.7ms, medium 457.7ms, hard 1249.4ms

## Domain
- hashPosition avg: 0.0054ms
- getLegalActions avg: 0.2193ms
- getLegalActionsForCell avg: 0.0002ms
- selectable scan avg: 0.1954ms
- hasLegalAction check avg: 0.0107ms
- Cell-vs-full action speedup: 1096.5x
- Hash-vs-full action speedup: 40.61x

## Lifecycle
- Store lifecycle now terminates AI workers on `visibilitychange:hidden`, `pagehide`, and store destroy/unmount.
- Covered by store lifecycle tests in `createGameStore.test.ts`.
