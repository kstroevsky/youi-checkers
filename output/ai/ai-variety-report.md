# AI Variety Report

Generated at: 2026-08-09T17:12:57.630Z

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
| twoPlyUndoRate | 0.060742 | <= 0.02 (warn 0.08) | warn |
| sameFamilyQuietRepeatRate | 0.004773 | <= 0.25 (warn 0.45) | good |
| repetitionPlyShare | 0.003711 | <= 0.1 (warn 0.2) | good |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| stagnationWindowRate | 0.392083 | <= 0.15 (warn 0.3) | bad |
| openingEntropy | 0 | >= 1 (warn 0.5) | bad |
| openingSimpsonDiversity | 0 | n/a | n/a |
| openingJsDivergence | 0.464378 | n/a | n/a |
| sourceFamilyOpeningHhi | 0.375244 | <= 0.32 (warn 0.45) | warn |
| uniqueOpeningLineShare | 0.125 | >= 0.35 (warn 0.2) | bad |
| normalizedLempelZiv | 1.052008 | n/a | n/a |
| noveltyScore | 0.149981 | n/a | n/a |
| behaviorSpaceCoverage | 0.005952 | n/a | n/a |
| meanParticipationDelta | 35.25332 | n/a | n/a |
| positiveParticipationPlyShare | 0.40332 | n/a | n/a |
| decompressionSlope | 0.002542 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | -0.0141 | >= 0.05 (warn 0) | bad |
| meanBoardDisplacement | 0.074192 | >= 0.08 (warn 0.06) | warn |
| drama | 1.439873 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |
| compositeInterestingness | 0.019821 | >= 0.65 (warn 0.4) | bad |

Regressions:
- sourceFamilyOpeningHhi: 0.375244 vs threshold 0.327369 (lower is better)
- mobilityReleaseSlope: -0.0141 vs threshold 0.013777 (higher is better)
- openingEntropy: 0 vs threshold 1.42615 (higher is better)
- openingSimpsonDiversity: 0 vs threshold 0.599853 (higher is better)

## medium

Games: 64, average plies: 80, terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":0,"stalemateTiebreakWin":0,"threefoldDraw":0,"stalemateDraw":0,"unfinished":64}

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0 | >= 0.35 (warn 0.15) | bad |
| twoPlyUndoRate | 0.089258 | <= 0.02 (warn 0.08) | bad |
| sameFamilyQuietRepeatRate | 0.064516 | <= 0.25 (warn 0.45) | good |
| repetitionPlyShare | 0.004492 | <= 0.1 (warn 0.2) | good |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| stagnationWindowRate | 0.409375 | <= 0.15 (warn 0.3) | bad |
| openingEntropy | 0 | >= 1 (warn 0.5) | bad |
| openingSimpsonDiversity | 0 | n/a | n/a |
| openingJsDivergence | 0.464378 | n/a | n/a |
| sourceFamilyOpeningHhi | 0.380859 | <= 0.32 (warn 0.45) | warn |
| uniqueOpeningLineShare | 0.046875 | >= 0.35 (warn 0.2) | bad |
| normalizedLempelZiv | 1.045834 | n/a | n/a |
| noveltyScore | 0.08425 | n/a | n/a |
| behaviorSpaceCoverage | 0.005952 | n/a | n/a |
| meanParticipationDelta | 71.700391 | n/a | n/a |
| positiveParticipationPlyShare | 0.332227 | n/a | n/a |
| decompressionSlope | 0.002604 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | -0.015774 | >= 0.05 (warn 0) | bad |
| meanBoardDisplacement | 0.073888 | >= 0.08 (warn 0.06) | warn |
| drama | 1.330696 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |
| compositeInterestingness | 0.020057 | >= 0.65 (warn 0.4) | bad |

Regressions:
- sameFamilyQuietRepeatRate: 0.064516 vs threshold 0.011958 (lower is better)
- sourceFamilyOpeningHhi: 0.380859 vs threshold 0.335963 (lower is better)
- twoPlyUndoRate: 0.089258 vs threshold 0.066836 (lower is better)
- mobilityReleaseSlope: -0.015774 vs threshold 0.01679 (higher is better)
- openingEntropy: 0 vs threshold 1.42615 (higher is better)
- openingSimpsonDiversity: 0 vs threshold 0.599853 (higher is better)
- positiveParticipationPlyShare: 0.332227 vs threshold 0.354901 (higher is better)

## hard

Games: 64, average plies: 80, terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":0,"stalemateTiebreakWin":0,"threefoldDraw":0,"stalemateDraw":0,"unfinished":64}

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0 | >= 0.35 (warn 0.15) | bad |
| twoPlyUndoRate | 0.05332 | <= 0.02 (warn 0.08) | warn |
| sameFamilyQuietRepeatRate | 0.044665 | <= 0.25 (warn 0.45) | good |
| repetitionPlyShare | 0.006445 | <= 0.1 (warn 0.2) | good |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| stagnationWindowRate | 0.494167 | <= 0.15 (warn 0.3) | bad |
| openingEntropy | 0 | >= 1 (warn 0.5) | bad |
| openingSimpsonDiversity | 0 | n/a | n/a |
| openingJsDivergence | 0.464378 | n/a | n/a |
| sourceFamilyOpeningHhi | 0.414063 | <= 0.32 (warn 0.45) | warn |
| uniqueOpeningLineShare | 0.0625 | >= 0.35 (warn 0.2) | bad |
| normalizedLempelZiv | 0.99521 | n/a | n/a |
| noveltyScore | 0.052511 | n/a | n/a |
| behaviorSpaceCoverage | 0.005952 | n/a | n/a |
| meanParticipationDelta | 104.446289 | n/a | n/a |
| positiveParticipationPlyShare | 0.291016 | n/a | n/a |
| decompressionSlope | 0.001364 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | -0.000893 | >= 0.05 (warn 0) | bad |
| meanBoardDisplacement | 0.074658 | >= 0.08 (warn 0.06) | warn |
| drama | 1.162184 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |
| compositeInterestingness | 0.016925 | >= 0.65 (warn 0.4) | bad |

Regressions:
- sameFamilyQuietRepeatRate: 0.044665 vs threshold 0.000001 (lower is better)
- sourceFamilyOpeningHhi: 0.414063 vs threshold 0.335158 (lower is better)
- mobilityReleaseSlope: -0.000893 vs threshold 0.013275 (higher is better)
- openingEntropy: 0 vs threshold 1.42615 (higher is better)
- openingSimpsonDiversity: 0 vs threshold 0.599853 (higher is better)
- positiveParticipationPlyShare: 0.291016 vs threshold 0.362284 (higher is better)

