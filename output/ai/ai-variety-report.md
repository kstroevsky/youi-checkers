# AI Variety Report

Generated at: 2026-03-26T21:37:02.032Z

## easy

Games: 64, average plies: 39.3125, terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":7,"stalemateTiebreakWin":0,"threefoldDraw":56,"stalemateDraw":0,"unfinished":1}

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| twoPlyUndoRate | 0.117647 | <= 0.02 (warn 0.08) | bad |
| sameFamilyQuietRepeatRate | 0.027397 | <= 0.25 (warn 0.45) | good |
| repetitionPlyShare | 0.197933 | <= 0.1 (warn 0.2) | warn |
| threefoldDrawShare | 0.875 | <= 0.3 (warn 0.55) | bad |
| stagnationWindowRate | 0.415756 | <= 0.15 (warn 0.3) | bad |
| openingEntropy | 0 | >= 1 (warn 0.5) | bad |
| sourceFamilyOpeningHhi | 0.385742 | <= 0.32 (warn 0.45) | warn |
| uniqueOpeningLineShare | 0.015625 | >= 0.35 (warn 0.2) | bad |
| decompressionSlope | 0.003968 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | -0.090476 | >= 0.05 (warn 0) | bad |
| meanBoardDisplacement | 0.069522 | >= 0.08 (warn 0.06) | warn |
| drama | 1.320555 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |
| compositeInterestingness | 0.021204 | >= 0.65 (warn 0.4) | bad |

Regressions:
- maxRepeatedStateRun: 8 vs threshold 5.500001 (lower is better)
- stagnationWindowRate: 0.415756 vs threshold 0.412501 (lower is better)
- twoPlyUndoRate: 0.117647 vs threshold 0.000001 (lower is better)
- decompressionSlope: 0.003968 vs threshold 0.012856 (higher is better)

## medium

Games: 64, average plies: 80, terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":0,"stalemateTiebreakWin":0,"threefoldDraw":0,"stalemateDraw":0,"unfinished":64}

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| twoPlyUndoRate | 0.0375 | <= 0.02 (warn 0.08) | warn |
| sameFamilyQuietRepeatRate | 0 | <= 0.25 (warn 0.45) | good |
| repetitionPlyShare | 0 | <= 0.1 (warn 0.2) | good |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| stagnationWindowRate | 0.546667 | <= 0.15 (warn 0.3) | bad |
| openingEntropy | 0 | >= 1 (warn 0.5) | bad |
| sourceFamilyOpeningHhi | 0.398926 | <= 0.32 (warn 0.45) | warn |
| uniqueOpeningLineShare | 0.015625 | >= 0.35 (warn 0.2) | bad |
| decompressionSlope | 0.003968 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | -0.090476 | >= 0.05 (warn 0) | bad |
| meanBoardDisplacement | 0.074305 | >= 0.08 (warn 0.06) | warn |
| drama | 0.78481 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |
| compositeInterestingness | 0.01 | >= 0.65 (warn 0.4) | bad |

Regressions:
- stagnationWindowRate: 0.546667 vs threshold 0.412501 (lower is better)
- twoPlyUndoRate: 0.0375 vs threshold 0.000001 (lower is better)
- decompressionSlope: 0.003968 vs threshold 0.012856 (higher is better)

## hard

Games: 64, average plies: 78.359375, terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":0,"stalemateTiebreakWin":0,"threefoldDraw":3,"stalemateDraw":0,"unfinished":61}

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| twoPlyUndoRate | 0.039681 | <= 0.02 (warn 0.08) | warn |
| sameFamilyQuietRepeatRate | 0 | <= 0.25 (warn 0.45) | good |
| repetitionPlyShare | 0.006381 | <= 0.1 (warn 0.2) | good |
| threefoldDrawShare | 0.046875 | <= 0.3 (warn 0.55) | good |
| stagnationWindowRate | 0.545687 | <= 0.15 (warn 0.3) | bad |
| openingEntropy | 0 | >= 1 (warn 0.5) | bad |
| sourceFamilyOpeningHhi | 0.398926 | <= 0.32 (warn 0.45) | warn |
| uniqueOpeningLineShare | 0.015625 | >= 0.35 (warn 0.2) | bad |
| decompressionSlope | 0.003968 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | -0.090476 | >= 0.05 (warn 0) | bad |
| meanBoardDisplacement | 0.074216 | >= 0.08 (warn 0.06) | warn |
| drama | 0.801858 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |
| compositeInterestingness | 0.01 | >= 0.65 (warn 0.4) | bad |

Regressions:
- maxRepeatedStateRun: 8 vs threshold 5.500001 (lower is better)
- stagnationWindowRate: 0.545687 vs threshold 0.412501 (lower is better)
- twoPlyUndoRate: 0.039681 vs threshold 0.000001 (lower is better)
- decompressionSlope: 0.003968 vs threshold 0.012856 (higher is better)

