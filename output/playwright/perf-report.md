# Performance Report

Generated: 2026-03-25T18:09:12.349Z

## Summary
- [GOOD] Desktop FCP: 84ms
- [GOOD] Mobile FCP: 40ms
- [BAD] Desktop move dialog: 375.2ms
- [BAD] Mobile move dialog: 364.8ms
- [GOOD] Mobile hard AI opening: 1271.7ms
- [GOOD] Domain full action scan: 0.1003ms
- [GOOD] Domain cell action scan: 0.0002ms
- [GOOD] Hash position: 0.0051ms

## Load
- Desktop: FCP 84ms, LCP 84ms, load 50.8ms
- Mobile: FCP 40ms, LCP 172ms, load 21.5ms

## Render / UI
- Desktop DOM nodes: 421, checker nodes: 36
- Mobile DOM nodes: 351, checker nodes: 36
- Desktop move dialog open: 375.2ms
- Mobile move dialog open: 364.8ms
- Mobile tab switch: Info 58.2ms, History 57ms

## AI
- Mobile opening turn: easy 192.3ms, medium 469.4ms, hard 1271.7ms
- Mobile reply turn: easy 184ms, medium 466.6ms, hard 1259.8ms

## Weak Device (CPU Throttle)
- 4x: move dialog 379.5ms, hard opening 1298.4ms, hard reply 1289.7ms
- 6x: move dialog 420.5ms, hard opening 1321.1ms, hard reply 1310.1ms

## Late-Game AI (Hard)
- 1x: opening 1260.3ms, turn50 1260.3ms, turn100 1265.5ms, turn200 1300ms
- 4x: opening 1295.7ms, turn50 1338.8ms, turn100 1399.8ms, turn200 1478ms
- 6x: opening 1334.2ms, turn50 1415.9ms, turn100 1465.3ms, turn200 1596.2ms

## Domain
- hashPosition avg: 0.0051ms
- getLegalActions avg: 0.1003ms
- getLegalActionsForCell avg: 0.0002ms
- selectable scan avg: 0.0966ms
- hasLegalAction check avg: 0.0123ms
- Cell-vs-full action speedup: 501.5x
- Hash-vs-full action speedup: 19.67x

## Root Ordering Cache Benchmark
- opening: baseline 116.0214ms, optimized 19.2523ms, gain 96.7691ms (83.41%)
- turn50: baseline 94.294ms, optimized 15.2912ms, gain 79.0027ms (83.78%)
- turn100: baseline 91.1853ms, optimized 15.4024ms, gain 75.7829ms (83.11%)
- turn200: baseline 92.4186ms, optimized 15.3859ms, gain 77.0327ms (83.35%)

## Lifecycle
- Store lifecycle now terminates AI workers on `visibilitychange:hidden`, `pagehide`, and store destroy/unmount.
- Covered by store lifecycle tests in `createGameStore.test.ts`.
