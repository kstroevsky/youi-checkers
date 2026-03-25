# Performance Report

Generated: 2026-03-25T17:43:26.262Z

## Summary
- [GOOD] Desktop FCP: 108ms
- [GOOD] Mobile FCP: 112ms
- [BAD] Desktop move dialog: 356.3ms
- [BAD] Mobile move dialog: 338.7ms
- [GOOD] Mobile hard AI opening: 1289.4ms
- [GOOD] Domain full action scan: 0.1189ms
- [GOOD] Domain cell action scan: 0.0002ms
- [GOOD] Hash position: 0.0052ms

## Load
- Desktop: FCP 108ms, LCP 108ms, load 64.9ms
- Mobile: FCP 112ms, LCP 280ms, load 90ms

## Render / UI
- Desktop DOM nodes: 421, checker nodes: 36
- Mobile DOM nodes: 351, checker nodes: 36
- Desktop move dialog open: 356.3ms
- Mobile move dialog open: 338.7ms
- Mobile tab switch: Info 54ms, History 57.8ms

## AI
- Mobile opening turn: easy 232.9ms, medium 475ms, hard 1289.4ms
- Mobile reply turn: easy 186.5ms, medium 469ms, hard 1257.4ms

## Weak Device (CPU Throttle)
- 4x: move dialog 381.9ms, hard opening 1316.7ms, hard reply 1308.1ms
- 6x: move dialog 429.4ms, hard opening 1360.7ms, hard reply 1327.7ms

## Late-Game AI (Hard)
- 1x: opening 1256ms, turn50 1264.7ms, turn100 1280.1ms, turn200 1291.4ms
- 4x: opening 1313.9ms, turn50 1364.4ms, turn100 1401.5ms, turn200 1499.4ms
- 6x: opening 1357.5ms, turn50 1434.3ms, turn100 1477.9ms, turn200 1620.8ms

## Domain
- hashPosition avg: 0.0052ms
- getLegalActions avg: 0.1189ms
- getLegalActionsForCell avg: 0.0002ms
- selectable scan avg: 0.1135ms
- hasLegalAction check avg: 0.0232ms
- Cell-vs-full action speedup: 594.5x
- Hash-vs-full action speedup: 22.87x

## Root Ordering Cache Benchmark
- opening: baseline 133.9801ms, optimized 22.2791ms, gain 111.7011ms (83.37%)
- turn50: baseline 126.0666ms, optimized 20.9497ms, gain 105.1169ms (83.38%)
- turn100: baseline 129.6159ms, optimized 21.9054ms, gain 107.7105ms (83.1%)
- turn200: baseline 129.5422ms, optimized 21.5506ms, gain 107.9916ms (83.36%)

## Lifecycle
- Store lifecycle now terminates AI workers on `visibilitychange:hidden`, `pagehide`, and store destroy/unmount.
- Covered by store lifecycle tests in `createGameStore.test.ts`.
