# AI Variety Report

Generated at: 2026-07-15T22:15:23.909Z

This file is a generated report artifact from `npm run ai:variety`.

Methodology:
- Each difficulty is evaluated with the same mirrored self-play harness used by `runAiVarietySuite()` in `src/ai/test/metrics.ts`.
- The `Status` column compares the measured value to the target bands in `src/ai/test/fixtures/ai-variety-target-bands.json`.
- `good`, `warn`, and `bad` are directional: some metrics want higher values, others want lower values.
- The `Regressions` section compares the current summary against the checked-in baseline file in `src/ai/test/fixtures/ai-variety-baselines.json`.

## easy

Games: 64, average plies: 80, terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":0,"stalemateTiebreakWin":0,"threefoldDraw":0,"stalemateDraw":0,"unfinished":64}

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0 | >= 0.35 (warn 0.15) | bad |
| twoPlyUndoRate | 0.081445 | <= 0.02 (warn 0.08) | bad |
| sameFamilyQuietRepeatRate | 0.05642 | <= 0.25 (warn 0.45) | good |
| repetitionPlyShare | 0.001953 | <= 0.1 (warn 0.2) | good |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| stagnationWindowRate | 0.35625 | <= 0.15 (warn 0.3) | bad |
| openingEntropy | 1.584612 | >= 1 (warn 0.5) | good |
| openingSimpsonDiversity | 0.666504 | n/a | n/a |
| openingJsDivergence | 0 | n/a | n/a |
| sourceFamilyOpeningHhi | 0.256836 | <= 0.32 (warn 0.45) | good |
| uniqueOpeningLineShare | 0.171875 | >= 0.35 (warn 0.2) | bad |
| normalizedLempelZiv | 4.15247 | n/a | n/a |
| noveltyScore | 0.204356 | n/a | n/a |
| behaviorSpaceCoverage | 0.005952 | n/a | n/a |
| meanParticipationDelta | 36.743555 | n/a | n/a |
| positiveParticipationPlyShare | 0.425391 | n/a | n/a |
| decompressionSlope | 0.000496 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | 0.053106 | >= 0.05 (warn 0) | good |
| meanBoardDisplacement | 0.074832 | >= 0.08 (warn 0.06) | warn |
| drama | 1.552611 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |
| compositeInterestingness | 0.045882 | >= 0.65 (warn 0.4) | bad |

Regressions:
- sameFamilyQuietRepeatRate: 0.05642 vs threshold 0.036857 (lower is better)
- twoPlyUndoRate: 0.081445 vs threshold 0.064811 (lower is better)

## medium

Games: 64, average plies: 80, terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":0,"stalemateTiebreakWin":0,"threefoldDraw":0,"stalemateDraw":0,"unfinished":64}

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0 | >= 0.35 (warn 0.15) | bad |
| twoPlyUndoRate | 0.089844 | <= 0.02 (warn 0.08) | bad |
| sameFamilyQuietRepeatRate | 0.029528 | <= 0.25 (warn 0.45) | good |
| repetitionPlyShare | 0.001172 | <= 0.1 (warn 0.2) | good |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| stagnationWindowRate | 0.347917 | <= 0.15 (warn 0.3) | bad |
| openingEntropy | 1.584612 | >= 1 (warn 0.5) | good |
| openingSimpsonDiversity | 0.666504 | n/a | n/a |
| openingJsDivergence | 0 | n/a | n/a |
| sourceFamilyOpeningHhi | 0.259521 | <= 0.32 (warn 0.45) | good |
| uniqueOpeningLineShare | 0.09375 | >= 0.35 (warn 0.2) | bad |
| normalizedLempelZiv | 4.112958 | n/a | n/a |
| noveltyScore | 0.15256 | n/a | n/a |
| behaviorSpaceCoverage | 0.005952 | n/a | n/a |
| meanParticipationDelta | 65.351758 | n/a | n/a |
| positiveParticipationPlyShare | 0.394336 | n/a | n/a |
| decompressionSlope | 0.00031 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | 0.056213 | >= 0.05 (warn 0) | good |
| meanBoardDisplacement | 0.07506 | >= 0.08 (warn 0.06) | warn |
| drama | 1.565269 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |
| compositeInterestingness | 0.044485 | >= 0.65 (warn 0.4) | bad |

Regressions:
- sameFamilyQuietRepeatRate: 0.029528 vs threshold 0.011958 (lower is better)
- twoPlyUndoRate: 0.089844 vs threshold 0.066836 (lower is better)

## hard

Games: 64, average plies: 80, terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":0,"stalemateTiebreakWin":0,"threefoldDraw":0,"stalemateDraw":0,"unfinished":64}

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0 | >= 0.35 (warn 0.15) | bad |
| twoPlyUndoRate | 0.08457 | <= 0.02 (warn 0.08) | bad |
| sameFamilyQuietRepeatRate | 0.035789 | <= 0.25 (warn 0.45) | good |
| repetitionPlyShare | 0.000195 | <= 0.1 (warn 0.2) | good |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| stagnationWindowRate | 0.36 | <= 0.15 (warn 0.3) | bad |
| openingEntropy | 1.584612 | >= 1 (warn 0.5) | good |
| openingSimpsonDiversity | 0.666504 | n/a | n/a |
| openingJsDivergence | 0 | n/a | n/a |
| sourceFamilyOpeningHhi | 0.25415 | <= 0.32 (warn 0.45) | good |
| uniqueOpeningLineShare | 0.109375 | >= 0.35 (warn 0.2) | bad |
| normalizedLempelZiv | 4.146296 | n/a | n/a |
| noveltyScore | 0.066802 | n/a | n/a |
| behaviorSpaceCoverage | 0.005952 | n/a | n/a |
| meanParticipationDelta | 100.686328 | n/a | n/a |
| positiveParticipationPlyShare | 0.402539 | n/a | n/a |
| decompressionSlope | 0.000744 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | 0.051004 | >= 0.05 (warn 0) | good |
| meanBoardDisplacement | 0.074463 | >= 0.08 (warn 0.06) | warn |
| drama | 1.547073 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |
| compositeInterestingness | 0.044566 | >= 0.65 (warn 0.4) | bad |

Regressions:
- sameFamilyQuietRepeatRate: 0.035789 vs threshold 0.000001 (lower is better)
- twoPlyUndoRate: 0.08457 vs threshold 0.063319 (lower is better)

