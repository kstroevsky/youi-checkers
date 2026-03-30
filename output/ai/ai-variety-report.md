# AI Variety Report

Generated at: 2026-03-28T23:30:42.072Z

This file is a generated report artifact from `npm run ai:variety`.

Methodology:
- Each difficulty is evaluated with the same mirrored self-play harness used by `runAiVarietySuite()` in `src/ai/test/metrics.ts`.
- The `Status` column compares the measured value to the target bands in `src/ai/test/fixtures/ai-variety-target-bands.json`.
- `good`, `warn`, and `bad` are directional: some metrics want higher values, others want lower values.
- The `Regressions` section compares the current summary against the checked-in baseline file in `src/ai/test/fixtures/ai-variety-baselines.json`.

## easy

Games: 64, average plies: 79.40625, terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":2,"stalemateTiebreakWin":0,"threefoldDraw":0,"stalemateDraw":0,"unfinished":62}

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0.03125 | >= 0.35 (warn 0.15) | bad |
| twoPlyUndoRate | 0.040929 | <= 0.02 (warn 0.08) | warn |
| sameFamilyQuietRepeatRate | 0.033268 | <= 0.25 (warn 0.45) | good |
| repetitionPlyShare | 0.003148 | <= 0.1 (warn 0.2) | good |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| stagnationWindowRate | 0.459681 | <= 0.15 (warn 0.3) | bad |
| openingEntropy | 1.584612 | >= 1 (warn 0.5) | good |
| openingSimpsonDiversity | 0.666504 | n/a | n/a |
| openingJsDivergence | 0 | n/a | n/a |
| sourceFamilyOpeningHhi | 0.260498 | <= 0.32 (warn 0.45) | good |
| uniqueOpeningLineShare | 0.171875 | >= 0.35 (warn 0.2) | bad |
| normalizedLempelZiv | 2.592853 | n/a | n/a |
| noveltyScore | 0.186562 | n/a | n/a |
| behaviorSpaceCoverage | 0.008929 | n/a | n/a |
| decompressionSlope | 0.000434 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | 0.012798 | >= 0.05 (warn 0) | warn |
| meanBoardDisplacement | 0.074375 | >= 0.08 (warn 0.06) | warn |
| drama | 1.099641 | >= 0.25 (warn 0.18) | good |
| tension | 0.000019 | >= 0.45 (warn 0.3) | bad |
| compositeInterestingness | 0.044508 | >= 0.65 (warn 0.4) | bad |

Regressions:
- mobilityReleaseSlope: 0.012798 vs threshold 0.013777 (higher is better)

## medium

Games: 64, average plies: 78.8125, terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":4,"stalemateTiebreakWin":0,"threefoldDraw":0,"stalemateDraw":0,"unfinished":60}

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0.0625 | >= 0.35 (warn 0.15) | bad |
| twoPlyUndoRate | 0.056106 | <= 0.02 (warn 0.08) | warn |
| sameFamilyQuietRepeatRate | 0.028322 | <= 0.25 (warn 0.45) | good |
| repetitionPlyShare | 0.002379 | <= 0.1 (warn 0.2) | good |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| stagnationWindowRate | 0.490898 | <= 0.15 (warn 0.3) | bad |
| openingEntropy | 1.584612 | >= 1 (warn 0.5) | good |
| openingSimpsonDiversity | 0.666504 | n/a | n/a |
| openingJsDivergence | 0 | n/a | n/a |
| sourceFamilyOpeningHhi | 0.261475 | <= 0.32 (warn 0.45) | good |
| uniqueOpeningLineShare | 0.09375 | >= 0.35 (warn 0.2) | bad |
| normalizedLempelZiv | 2.52605 | n/a | n/a |
| noveltyScore | 0.139881 | n/a | n/a |
| behaviorSpaceCoverage | 0.008929 | n/a | n/a |
| decompressionSlope | 0.00031 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | 0.014937 | >= 0.05 (warn 0) | warn |
| meanBoardDisplacement | 0.075128 | >= 0.08 (warn 0.06) | warn |
| drama | 1.118474 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |
| compositeInterestingness | 0.044485 | >= 0.65 (warn 0.4) | bad |

Regressions:
- sameFamilyQuietRepeatRate: 0.028322 vs threshold 0.011958 (lower is better)
- mobilityReleaseSlope: 0.014937 vs threshold 0.01679 (higher is better)

## hard

Games: 64, average plies: 80, terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":0,"stalemateTiebreakWin":0,"threefoldDraw":0,"stalemateDraw":0,"unfinished":64}

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0 | >= 0.35 (warn 0.15) | bad |
| twoPlyUndoRate | 0.063281 | <= 0.02 (warn 0.08) | warn |
| sameFamilyQuietRepeatRate | 0.027184 | <= 0.25 (warn 0.45) | good |
| repetitionPlyShare | 0.000195 | <= 0.1 (warn 0.2) | good |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| stagnationWindowRate | 0.4225 | <= 0.15 (warn 0.3) | bad |
| openingEntropy | 1.584612 | >= 1 (warn 0.5) | good |
| openingSimpsonDiversity | 0.666504 | n/a | n/a |
| openingJsDivergence | 0 | n/a | n/a |
| sourceFamilyOpeningHhi | 0.25415 | <= 0.32 (warn 0.45) | good |
| uniqueOpeningLineShare | 0.109375 | >= 0.35 (warn 0.2) | bad |
| normalizedLempelZiv | 2.664594 | n/a | n/a |
| noveltyScore | 0.057792 | n/a | n/a |
| behaviorSpaceCoverage | 0.005952 | n/a | n/a |
| decompressionSlope | 0.000744 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | 0.011031 | >= 0.05 (warn 0) | warn |
| meanBoardDisplacement | 0.074653 | >= 0.08 (warn 0.06) | warn |
| drama | 1.160997 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |
| compositeInterestingness | 0.044566 | >= 0.65 (warn 0.4) | bad |

Regressions:
- sameFamilyQuietRepeatRate: 0.027184 vs threshold 0.000001 (lower is better)
- mobilityReleaseSlope: 0.011031 vs threshold 0.013275 (higher is better)

