# AI Loop Benchmark Report

Generated at: 2026-03-28T17:10:33.868Z

This file is a generated report artifact from `npm run ai:loop-benchmark`.

Methodology:
- Scenarios use the deterministic imported benchmark states from `scripts/aiScenarioCatalog.ts`.
- Late states are normalized into playable continuation states before playout.
- Core loop metrics come from `src/ai/test/metrics.ts`; advanced recurrence and escape metrics come from `src/ai/test/advancedMetrics.ts`.
- Report settings: 8 mirrored seed pairs per row, 40 continuation plies per trace.

| Scenario | Difficulty | Repetition | Undo | Stagnation | Recurrence RR | DET | LAM | Trap Time | Escape<=8 | Escape<=16 | Mean Escape Ply | Pos LZC | Score SampEn | Score PermEn |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| turn50 | easy | 0.025 | 0.067187 | 0.503571 | 0.001282 | 0 | 0 | 0 | 1 | 1 | 5 | 33.020901 | 0.741222 | 0.751941 |
| turn50 | medium | 0.035937 | 0.082812 | 0.394643 | 0.001843 | 0.375 | 0 | 0 | 1 | 1 | 6.0625 | 31.9482 | 0.708097 | 0.801853 |
| turn50 | hard | 0.025 | 0.067187 | 0.376786 | 0.001282 | 0 | 0 | 0 | 1 | 1 | 5 | 33.220473 | 0.732675 | 0.764374 |
| turn75 | easy | 0 | 0.060937 | 0.294643 | 0 | 0 | 0 | 0 | 1 | 1 | 3 | 33.652879 | 0.683507 | 0.76061 |
| turn75 | medium | 0 | 0.085938 | 0.316071 | 0 | 0 | 0 | 0 | 1 | 1 | 3 | 34.309805 | 0.695173 | 0.739566 |
| turn75 | hard | 0 | 0.075 | 0.285714 | 0 | 0 | 0 | 0 | 1 | 1 | 1 | 33.262051 | 0.523248 | 0.737524 |
| turn100 | easy | 0 | 0.0625 | 0.321429 | 0 | 0 | 0 | 0 | 1 | 1 | 2 | 33.885714 | 0.701748 | 0.752087 |
| turn100 | medium | 0 | 0.085938 | 0.335714 | 0 | 0 | 0 | 0 | 1 | 1 | 2 | 34.334752 | 0.724392 | 0.724202 |
| turn100 | hard | 0.021875 | 0.170313 | 0.3625 | 0.001122 | 0.4375 | 0 | 0 | 1 | 1 | 2 | 31.889991 | 0.644266 | 0.796596 |
| turn150 | easy | 0.001563 | 0.0375 | 0.366071 | 0.00008 | 0 | 0 | 0 | 1 | 1 | 1 | 34.043709 | 0.718045 | 0.733652 |
| turn150 | medium | 0 | 0.06875 | 0.357143 | 0 | 0 | 0 | 0 | 1 | 1 | 1 | 34.30149 | 0.721506 | 0.73112 |
| turn150 | hard | 0.021875 | 0.15625 | 0.392857 | 0.001122 | 0.4375 | 0 | 0 | 1 | 1 | 1 | 31.756943 | 0.64515 | 0.801277 |
| turn200 | easy | 0 | 0.035937 | 0.103571 | 0 | 0 | 0 | 0 | 1 | 1 | 2 | 34.858629 | 0.685459 | 0.80918 |
| turn200 | medium | 0 | 0.05 | 0.121429 | 0 | 0 | 0 | 0 | 1 | 1 | 2 | 35.04157 | 0.649423 | 0.801019 |
| turn200 | hard | 0.007813 | 0.067187 | 0.257143 | 0.000401 | 0 | 0 | 0 | 1 | 1 | 2 | 33.977185 | 0.628893 | 0.764354 |
