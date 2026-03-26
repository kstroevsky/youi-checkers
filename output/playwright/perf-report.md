# Performance Report

Generated: 2026-03-26T20:33:35.663Z

## Summary
- [GOOD] Desktop FCP: 92ms
- [GOOD] Mobile FCP: 48ms
- [BAD] Desktop move dialog: 363.1ms
- [BAD] Mobile move dialog: 340.2ms
- [GOOD] Mobile hard AI opening: 1276.4ms
- [GOOD] Domain full action scan: 0.1146ms
- [GOOD] Domain cell action scan: 0.0002ms
- [GOOD] Hash position: 0.0058ms

## Load
- Desktop: FCP 92ms, LCP 308ms, load 55.7ms
- Mobile: FCP 48ms, LCP 216ms, load 24.2ms

## Render / UI
- Desktop DOM nodes: 419, checker nodes: 36
- Mobile DOM nodes: 349, checker nodes: 36
- Desktop move dialog open: 363.1ms
- Mobile move dialog open: 340.2ms
- Mobile tab switch: Info 54.6ms, History 57.7ms

## AI
- Mobile opening turn: easy 201.6ms, medium 476.7ms, hard 1276.4ms
- Mobile reply turn: easy 187.1ms, medium 469.6ms, hard 1261.6ms

## Weak Device (CPU Throttle)
- 4x: move dialog 416.4ms, hard opening 1337.7ms, hard reply 1322.5ms
- 6x: move dialog 446.6ms, hard opening 1386.4ms, hard reply 1371.6ms

## Late-Game AI (Hard)
- 1x: opening 1261.5ms, turn50 2777.9ms, turn100 1286.2ms, turn200 1304.6ms
- 4x: opening 1377.1ms, turn50 2943.7ms, turn100 1548.6ms, turn200 1714.9ms
- 6x: opening 1441.4ms, turn50 3038.6ms, turn100 1596.8ms, turn200 1765.8ms

## Domain
- hashPosition avg: 0.0058ms
- getLegalActions avg: 0.1146ms
- getLegalActionsForCell avg: 0.0002ms
- selectable scan avg: 0.1089ms
- hasLegalAction check avg: 0.0084ms
- Cell-vs-full action speedup: 573x
- Hash-vs-full action speedup: 19.76x

## Root Ordering Cache Benchmark
- opening: baseline 127.6285ms, optimized 21.1755ms, gain 106.4529ms (83.41%)
- turn50: baseline 97.3935ms, optimized 18.7821ms, gain 78.6114ms (80.72%)
- turn100: baseline 105.6968ms, optimized 16.8351ms, gain 88.8617ms (84.07%)
- turn200: baseline 96.7104ms, optimized 17.9219ms, gain 78.7885ms (81.47%)

## Lifecycle
- Store lifecycle now terminates AI workers on `visibilitychange:hidden`, `pagehide`, and store destroy/unmount.
- Covered by store lifecycle tests in `createGameStore.test.ts`.
