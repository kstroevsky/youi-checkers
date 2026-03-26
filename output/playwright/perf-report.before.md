# Performance Report

Generated: 2026-03-26T19:58:14.587Z

## Summary
- [GOOD] Desktop FCP: 264ms
- [GOOD] Mobile FCP: 36ms
- [BAD] Desktop move dialog: 347.2ms
- [BAD] Mobile move dialog: 824.1ms
- [GOOD] Mobile hard AI opening: 1262.3ms
- [GOOD] Domain full action scan: 0.0998ms
- [GOOD] Domain cell action scan: 0.0002ms
- [GOOD] Hash position: 0.0054ms

## Load
- Desktop: FCP 264ms, LCP 264ms, load 30.8ms
- Mobile: FCP 36ms, LCP 164ms, load 21.3ms

## Render / UI
- Desktop DOM nodes: 419, checker nodes: 36
- Mobile DOM nodes: 349, checker nodes: 36
- Desktop move dialog open: 347.2ms
- Mobile move dialog open: 824.1ms
- Mobile tab switch: Info 55.5ms, History 54.5ms

## AI
- Mobile opening turn: easy 187.6ms, medium 461.5ms, hard 1262.3ms
- Mobile reply turn: easy 173.7ms, medium 448.5ms, hard 1252.6ms

## Weak Device (CPU Throttle)
- 4x: move dialog 382.5ms, hard opening 1299.3ms, hard reply 1295.9ms
- 6x: move dialog 414.2ms, hard opening 1335.6ms, hard reply 1337ms

## Late-Game AI (Hard)
- 1x: opening 1250.3ms, turn50 1258.4ms, turn100 1269.3ms, turn200 1295.1ms
- 4x: opening 1296ms, turn50 1346.2ms, turn100 1387ms, turn200 1487.4ms
- 6x: opening 1331.2ms, turn50 1405.9ms, turn100 1441ms, turn200 1579ms

## Domain
- hashPosition avg: 0.0054ms
- getLegalActions avg: 0.0998ms
- getLegalActionsForCell avg: 0.0002ms
- selectable scan avg: 0.0959ms
- hasLegalAction check avg: 0.0116ms
- Cell-vs-full action speedup: 499x
- Hash-vs-full action speedup: 18.48x

## Root Ordering Cache Benchmark
- opening: baseline 113.6228ms, optimized 19.1502ms, gain 94.4726ms (83.15%)
- turn50: baseline 93.5117ms, optimized 15.7554ms, gain 77.7563ms (83.15%)
- turn100: baseline 93.61ms, optimized 15.8963ms, gain 77.7137ms (83.02%)
- turn200: baseline 93.9582ms, optimized 16.088ms, gain 77.8702ms (82.88%)

## Lifecycle
- Store lifecycle now terminates AI workers on `visibilitychange:hidden`, `pagehide`, and store destroy/unmount.
- Covered by store lifecycle tests in `createGameStore.test.ts`.
