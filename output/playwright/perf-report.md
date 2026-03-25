# Performance Report

Generated: 2026-03-25T17:44:47.219Z

## Summary
- [GOOD] Desktop FCP: 84ms
- [GOOD] Mobile FCP: 44ms
- [BAD] Desktop move dialog: 375.7ms
- [BAD] Mobile move dialog: 355.9ms
- [GOOD] Mobile hard AI opening: 1270.1ms
- [GOOD] Domain full action scan: 0.1421ms
- [GOOD] Domain cell action scan: 0.0007ms
- [GOOD] Hash position: 0.0053ms

## Load
- Desktop: FCP 84ms, LCP 84ms, load 52.5ms
- Mobile: FCP 44ms, LCP 176ms, load 22.1ms

## Render / UI
- Desktop DOM nodes: 421, checker nodes: 36
- Mobile DOM nodes: 351, checker nodes: 36
- Desktop move dialog open: 375.7ms
- Mobile move dialog open: 355.9ms
- Mobile tab switch: Info 54.4ms, History 57.8ms

## AI
- Mobile opening turn: easy 198.3ms, medium 474.9ms, hard 1270.1ms
- Mobile reply turn: easy 174.1ms, medium 455.2ms, hard 1265ms

## Weak Device (CPU Throttle)
- 4x: move dialog 387ms, hard opening 1301.1ms, hard reply 1302.5ms
- 6x: move dialog 437.1ms, hard opening 1355.4ms, hard reply 1345.1ms

## Late-Game AI (Hard)
- 1x: opening 1265.8ms, turn50 1259.7ms, turn100 1277.9ms, turn200 1305.1ms
- 4x: opening 1422.3ms, turn50 1434.8ms, turn100 1452.9ms, turn200 2055ms
- 6x: opening 1363.6ms, turn50 1450.3ms, turn100 1493.1ms, turn200 1625.2ms

## Domain
- hashPosition avg: 0.0053ms
- getLegalActions avg: 0.1421ms
- getLegalActionsForCell avg: 0.0007ms
- selectable scan avg: 0.1373ms
- hasLegalAction check avg: 0.0472ms
- Cell-vs-full action speedup: 203x
- Hash-vs-full action speedup: 26.81x

## Root Ordering Cache Benchmark
- opening: baseline 166.6921ms, optimized 27.249ms, gain 139.4431ms (83.65%)
- turn50: baseline 152.279ms, optimized 24.7172ms, gain 127.5618ms (83.77%)
- turn100: baseline 148.2932ms, optimized 24.7755ms, gain 123.5178ms (83.29%)
- turn200: baseline 148.0415ms, optimized 24.4427ms, gain 123.5988ms (83.49%)

## Lifecycle
- Store lifecycle now terminates AI workers on `visibilitychange:hidden`, `pagehide`, and store destroy/unmount.
- Covered by store lifecycle tests in `createGameStore.test.ts`.
