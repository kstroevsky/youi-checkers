# AI Cross-Play Report

Generated at: 2026-03-28T17:23:24.776Z

This file is a generated report artifact from `npm run ai:crossplay`.

Methodology:
- Each off-diagonal cell runs mirrored color pairings so the row side appears as both white and black.
- Difficulty cross-play uses the standard hidden-persona system.
- Persona cross-play fixes both sides to `hard` and pins the hidden persona ids explicitly.
- Report settings: 3 mirrored seed pairs per cell, 80 plies per trace.

## Difficulty Matrix

### Point Share

| row \ col | easy | medium | hard |
| --- | ---: | ---: | ---: |
| easy | 0.5 | 0.5 | 0.5 |
| medium | 0.416667 | 0.416667 | 0.5 |
| hard | 0.5 | 0.5 | 0.5 |

### Composite Interestingness

| row \ col | easy | medium | hard |
| --- | ---: | ---: | ---: |
| easy | 0 | 0 | 0 |
| medium | 0 | 0 | 0 |
| hard | 0 | 0 | 0 |

### Loop Escape <= 8 Plies

| row \ col | easy | medium | hard |
| --- | ---: | ---: | ---: |
| easy | 0.666667 | 0.666667 | 0.666667 |
| medium | 0.666667 | 0.666667 | 0.666667 |
| hard | 0.5 | 0.5 | 0.5 |

### Pressure Event Rate

| row \ col | easy | medium | hard |
| --- | ---: | ---: | ---: |
| easy | 0.81875 | 0.810417 | 0.8125 |
| medium | 0.813021 | 0.833854 | 0.825 |
| hard | 0.810784 | 0.814951 | 0.814951 |

## Persona Matrix (`hard` only)

### Point Share

| row \ col | expander | hunter | builder |
| --- | ---: | ---: | ---: |
| expander | 0.5 | 0.5 | 0.5 |
| hunter | 0.5 | 0.5 | 0.5 |
| builder | 0.5 | 0.5 | 0.5 |

### Composite Interestingness

| row \ col | expander | hunter | builder |
| --- | ---: | ---: | ---: |
| expander | 0 | 0 | 0 |
| hunter | 0 | 0 | 0 |
| builder | 0 | 0 | 0 |

### Recurrence Laminarity

| row \ col | expander | hunter | builder |
| --- | ---: | ---: | ---: |
| expander | 0 | 0 | 0 |
| hunter | 0 | 0 | 0 |
| builder | 0 | 0 | 0 |

### Decisive Result Share

| row \ col | expander | hunter | builder |
| --- | ---: | ---: | ---: |
| expander | 0 | 0 | 0 |
| hunter | 0 | 0 | 0 |
| builder | 0 | 0 | 0 |

