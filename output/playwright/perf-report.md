# Performance Report

Generated: 2026-03-28T16:09:44.835Z

This file is a generated report artifact from `npm run perf:report`.
- Browser timings come from `scripts/perf-report.mjs` against a local `vite preview` build.
- Domain timings come from `scripts/domainPerformance.report.ts` and are merged into this summary.
- CPU throttle profiles use Chrome DevTools `Emulation.setCPUThrottlingRate` with `1x` meaning unthrottled, and `4x` / `6x` meaning progressively slower simulated devices.
- `GOOD`, `WARN`, and `BAD` in the summary are repository-specific guardrails encoded in `scripts/perf-report.mjs`, not universal SLAs.

## Summary
- [GOOD] Desktop FCP: 108ms
- [GOOD] Mobile FCP: 44ms
- [BAD] Desktop move dialog: 350.8ms
- [BAD] Mobile move dialog: 823.6ms
- [GOOD] Mobile hard AI opening: 1271.6ms
- [GOOD] Domain full action scan: 0.114ms
- [GOOD] Domain cell action scan: 0.0003ms
- [GOOD] Hash position: 0.0072ms

## Load
- Desktop: FCP 108ms, LCP 320ms, load 68.1ms
- Mobile: FCP 44ms, LCP 172ms, load 23ms

## Render / UI
- Desktop DOM nodes: 419, checker nodes: 36
- Mobile DOM nodes: 349, checker nodes: 36
- Desktop move dialog open: 350.8ms
- Mobile move dialog open: 823.6ms
- Mobile tab switch: Info 54.7ms, History 57.6ms

## AI
- Mobile opening turn: easy 196.1ms, medium 471.2ms, hard 1271.6ms
- Mobile reply turn: easy 186.8ms, medium 462ms, hard 1260.8ms

## Weak Device (CPU Throttle)
- 4x: move dialog 384.7ms, hard opening 1294.2ms, hard reply 1282.8ms
- 6x: move dialog 420.9ms, hard opening 1336.7ms, hard reply 1317.5ms

## Late-Game AI (Hard)
- 1x: opening 1254.9ms, turn50 1267.9ms, turn100 1266.8ms, turn200 1279.1ms
- 4x: opening 1395.2ms, turn50 1436.6ms, turn100 1408.7ms, turn200 1577.1ms
- 6x: opening 1327.3ms, turn50 1406.4ms, turn100 1464ms, turn200 1614.1ms

## Domain
- hashPosition avg: 0.0072ms
- getLegalActions avg: 0.114ms
- getLegalActionsForCell avg: 0.0003ms
- selectable scan avg: 0.1197ms
- hasLegalAction check avg: 0.0097ms
- Cell-vs-full action speedup: 380x
- Hash-vs-full action speedup: 15.83x

## Root Ordering Cache Benchmark
- opening: baseline 197.169ms, optimized 31.8671ms, gain 165.3019ms (83.84%)
- turn50: baseline 139.6531ms, optimized 24.3464ms, gain 115.3067ms (82.57%)
- turn100: baseline 149.4096ms, optimized 30.9738ms, gain 118.4358ms (79.27%)
- turn200: baseline 146.2351ms, optimized 22.3662ms, gain 123.8689ms (84.71%)
