# Performance Report

Generated: 2026-04-03T13:57:23.961Z

This file is a generated report artifact from `npm run perf:report`.
- Browser timings come from `scripts/perf-report.mjs` against a local `vite preview` build.
- Domain timings come from `scripts/domainPerformance.report.ts` and are merged into this summary.
- CPU throttle profiles use Chrome DevTools `Emulation.setCPUThrottlingRate` with `1x` meaning unthrottled, and `4x` / `6x` meaning progressively slower simulated devices.
- `GOOD`, `WARN`, and `BAD` in the summary are repository-specific guardrails encoded in `scripts/perf-report.mjs`, not universal SLAs.

## Summary
- [GOOD] Desktop FCP: 104ms
- [GOOD] Mobile FCP: 40ms
- [BAD] Desktop move dialog: 376.1ms
- [BAD] Mobile move dialog: 346.8ms
- [GOOD] Mobile hard AI opening: 1276.9ms
- [GOOD] Domain full action scan: 0.0643ms
- [GOOD] Domain cell action scan: 0.0028ms
- [GOOD] Hash position: 0.0047ms
- [WARN] Hard AI avg nodes/sec: 1376.08 nps
- [GOOD] Medium AI avg nodes/sec: 1174.53 nps
- [BAD] Hard AI depth efficiency: 0.125

## Load
- Desktop: FCP 104ms, LCP 328ms, load 60.6ms
- Mobile: FCP 40ms, LCP 188ms, load 22.6ms

## Render / UI
- Desktop DOM nodes: 419, checker nodes: 36
- Mobile DOM nodes: 413, checker nodes: 36
- Desktop move dialog open: 376.1ms
- Mobile move dialog open: 346.8ms
- Mobile tab switch: Info 62.7ms, History 62.2ms

## AI
- Mobile opening turn: easy 198.5ms, medium 485.3ms, hard 1276.9ms
- Mobile reply turn: easy 184.3ms, medium 459.8ms, hard 1269.5ms

## Weak Device (CPU Throttle)
- 4x: move dialog 389.3ms, hard opening 1316.9ms, hard reply 1305.7ms
- 6x: move dialog 408.6ms, hard opening 1327.3ms, hard reply 1308.1ms

## Late-Game AI (Hard)
- 1x: opening 1256ms, midgame20 1254.4ms, midgame40 1282.5ms, loopPressure50 1297.5ms, loopPressure100 1435.5ms, lateSparse200 1467.8ms
- 4x: opening 1807.1ms, midgame20 1804.1ms, midgame40 1438.1ms, loopPressure50 1432.6ms, loopPressure100 1515ms, lateSparse200 1858.7ms
- 6x: opening 1363.9ms, midgame20 1413.3ms, midgame40 1384.4ms, loopPressure50 1388ms, loopPressure100 1617.3ms, lateSparse200 1511.7ms

## Domain
- hashPosition avg: 0.0047ms
- getLegalActions avg: 0.0643ms
- getLegalActionsForCell avg: 0.0028ms
- selectable scan avg: 0.0657ms
- hasLegalAction check avg: 0.0764ms
- Cell-vs-full action speedup: 22.96x
- Hash-vs-full action speedup: 13.68x

## Search Efficiency
- Positions: initialState, midGame20 (seeded random play), midGame40 (seeded random play), threatState.
- midGame20/40 positions have all pieces active and a realistic branching factor (~15–30 legal moves).
- easy: avg 583.96 nps, depth efficiency 0 | initialState d0/110br 165.34nps, midGame20 d0/70br 207.4nps, midGame40 d0/106br 465.23nps, threatState d0/23br 1497.88nps
- medium: avg 1174.53 nps, depth efficiency 0.0625 | initialState d0/110br 314.28nps, midGame20 d0/70br 1368.53nps, midGame40 d0/106br 804.5nps, threatState d1/23br 2210.79nps
- hard: avg 1376.08 nps, depth efficiency 0.125 | initialState d0/110br 353.17nps, midGame20 d0/70br 1231.01nps, midGame40 d0/106br 993.98nps, threatState d3/23br 2926.15nps

## Root Ordering Cache Benchmark
- opening: baseline 87.2621ms, optimized 14.6346ms, gain 72.6275ms (83.23%)
- midgame20: baseline 52.055ms, optimized 8.4704ms, gain 43.5846ms (83.73%)
- midgame40: baseline 64.2357ms, optimized 10.3463ms, gain 53.8894ms (83.89%)
- loopPressure50: baseline 66.3646ms, optimized 11.2885ms, gain 55.0762ms (82.99%)
- loopPressure100: baseline 72.6667ms, optimized 11.5683ms, gain 61.0983ms (84.08%)
- lateSparse200: baseline 65.2096ms, optimized 11.0483ms, gain 54.1613ms (83.06%)
