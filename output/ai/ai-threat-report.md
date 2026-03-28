# AI Threat And Pressure Report

Generated at: 2026-03-28T17:22:00.574Z

This file is a generated report artifact from `npm run ai:threat`.

Methodology:
- Pressure diagnostics are computed from the selected move traces rather than from static board snapshots.
- `pressureEventRate` counts plies that create freeze pressure, capture-control pressure, frontier compression, or direct win-condition progress.
- `frontierCompressionRate` measures how often moves shrink the reply frontier instead of just shuffling pieces.
- Report settings: 6 mirrored seed pairs per row, 40 continuation plies per trace.

| Scenario | Difficulty | Pressure Rate | Frontier Compression | Risk Progress Share | Mobility Slope | Decompression Slope | Drama | Tension | Decisive |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| opening | easy | 0.81875 | 0.178661 | 0.890625 | 0.022024 | 0.000331 | 1.482906 | 0 | 0 |
| opening | medium | 0.829167 | 0.185667 | 0.95 | 0.025 | 0 | 1.478632 | 0 | 0 |
| opening | hard | 0.8 | 0.156399 | 0.88 | 0.019048 | 0.000661 | 1.641026 | 0 | 0 |
| turn25 | easy | 0.802083 | 0.278626 | 1 | -0.30119 | 0.003968 | 0.987179 | 0 | 0 |
| turn25 | medium | 0.785417 | 0.270676 | 0 | -0.30119 | 0.003968 | 0.995726 | 0 | 0 |
| turn25 | hard | 0.8 | 0.277417 | 0 | -0.30119 | 0.003968 | 0.982906 | 0 | 0 |
| turn50 | easy | 0.758333 | 0.265682 | 0.829545 | -0.021429 | 0.006349 | 1 | 0 | 0 |
| turn50 | medium | 0.8 | 0.286129 | 0.84127 | -0.021429 | 0.006349 | 1.149573 | 0 | 0 |
| turn50 | hard | 0.797917 | 0.276777 | 0.821429 | -0.021429 | 0.006349 | 1.029915 | 0 | 0 |
| turn75 | easy | 0.8 | 0.283181 | 0.929167 | -0.152381 | 0 | 1.047009 | 0 | 0 |
| turn75 | medium | 0.791667 | 0.301738 | 0.9125 | -0.152381 | 0 | 0.987179 | 0 | 0 |
| turn75 | hard | 0.789583 | 0.379508 | 0.939583 | -0.37381 | 0.003968 | 1.025641 | 0 | 0 |
| turn100 | easy | 0.825 | 0.288817 | 0.927083 | -0.197619 | 0 | 1 | 0 | 0 |
| turn100 | medium | 0.804167 | 0.301738 | 0.9125 | -0.197619 | 0 | 0.935897 | 0 | 0 |
| turn100 | hard | 0.695833 | 0.269102 | 0.870833 | -0.197619 | 0 | 1.273504 | 0 | 0 |
| turn150 | easy | 0.804167 | 0.272107 | 0.9375 | 0.007143 | 0.006349 | 0.970085 | 0 | 0 |
| turn150 | medium | 0.804167 | 0.30134 | 0.925 | 0.007143 | 0.006349 | 0.957265 | 0 | 0 |
| turn150 | hard | 0.677083 | 0.263583 | 0.895833 | 0.007143 | 0.006349 | 1.303419 | 0 | 0 |
| turn200 | easy | 0.90625 | 0.293025 | 0.883333 | -0.214286 | 0 | 1.128205 | 0 | 0 |
| turn200 | medium | 0.902083 | 0.303886 | 0.864583 | -0.214286 | 0 | 1.111111 | 0 | 0 |
| turn200 | hard | 0.86875 | 0.311936 | 0.85 | -0.214286 | 0 | 1.055556 | 0 | 0 |
