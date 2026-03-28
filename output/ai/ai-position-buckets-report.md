# AI Position Bucket Report

Generated at: 2026-03-28T17:13:21.913Z

This file is a generated report artifact from `npm run ai:position-buckets`.

Methodology:
- Deterministic benchmark positions are grouped into structural buckets instead of being judged one-by-one.
- Bucket aggregation answers whether the AI handles a class of positions well, not just one single fixture.
- For non-opening buckets, `openingEntropy` means first-reply entropy from that bucket state, not literal game openings.
- Report settings: 4 mirrored seed pairs per scenario, 40 continuation plies per trace.

| Bucket | Difficulty | Scenarios | Opening Entropy | Unique Lines | Repetition | Stagnation | Loop Escape<=8 | Pressure | Pos LZC | SampEn | PermEn | Interestingness |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| opening | easy | opening | 1.5 | 0.625 | 0.046875 | 0.321429 | 0.25 | 0.834375 | 27.640764 | 0.522539 | 0.734986 | 0 |
| opening | medium | opening | 1.5 | 0.5 | 0.06875 | 0.35 | 0.625 | 0.840625 | 26.193865 | 0.474031 | 0.731886 | 0 |
| opening | hard | opening | 1.5 | 0.625 | 0.11875 | 0.392857 | 0.5 | 0.8125 | 24.81349 | 0.37576 | 0.682828 | 0 |
| congested | easy | turn25 | 0 | 0.125 | 0.025 | 0.567857 | 1 | 0.803125 | 31.898306 | 0.702865 | 0.737372 | 0 |
| congested | medium | turn25 | 0 | 0.125 | 0.0375 | 0.653571 | 1 | 0.778125 | 30.81729 | 0.653933 | 0.735731 | 0 |
| congested | hard | turn25 | 0 | 0.125 | 0.025 | 0.582143 | 1 | 0.803125 | 31.964831 | 0.704613 | 0.732468 | 0 |
| loopPressure | easy | turn50, turn75 | 1 | 0.125 | 0.0125 | 0.414286 | 1 | 0.78125 | 33.320259 | 0.717118 | 0.759699 | 0 |
| loopPressure | medium | turn50, turn75 | 1 | 0.125 | 0.01875 | 0.380357 | 1 | 0.79375 | 32.754804 | 0.698406 | 0.77538 | 0 |
| loopPressure | hard | turn50, turn75 | 1 | 0.125 | 0.0125 | 0.346429 | 1 | 0.7875 | 33.24542 | 0.634695 | 0.748719 | 0 |
| conversionRace | easy | turn100, turn150 | 1 | 0.25 | 0.001563 | 0.3625 | 1 | 0.814063 | 34.043709 | 0.72574 | 0.750158 | 0 |
| conversionRace | medium | turn100, turn150 | 1 | 0.125 | 0 | 0.335714 | 1 | 0.803125 | 34.160126 | 0.727487 | 0.731999 | 0 |
| conversionRace | hard | turn100, turn150 | 1 | 0.125 | 0.025 | 0.378571 | 1 | 0.690625 | 31.399376 | 0.635215 | 0.812786 | 0 |
| lateSparse | easy | turn200 | 0 | 0.25 | 0 | 0.092857 | 1 | 0.9125 | 34.841998 | 0.696369 | 0.804127 | 0 |
| lateSparse | medium | turn200 | 0 | 0.125 | 0 | 0.142857 | 1 | 0.896875 | 34.925153 | 0.642718 | 0.79362 | 0 |
| lateSparse | hard | turn200 | 0 | 0.125 | 0.00625 | 0.235714 | 1 | 0.871875 | 34.326436 | 0.639759 | 0.768042 | 0 |
