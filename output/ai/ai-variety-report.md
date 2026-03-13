# AI Variety Report

Generated at: 2026-03-13T00:31:27.178Z

## easy

Games: 4, average plies: 40, terminals: {"homeField":0,"sixStacks":0,"threefoldDraw":0,"stalemateDraw":0,"unfinished":4}

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| twoPlyUndoRate | 0.05 | <= 0.02 (warn 0.08) | warn |
| sameFamilyQuietRepeatRate | 0 | <= 0.25 (warn 0.45) | good |
| repetitionPlyShare | 0 | <= 0.1 (warn 0.2) | good |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| stagnationWindowRate | 0.314286 | <= 0.15 (warn 0.3) | bad |
| openingEntropy | 0 | >= 1 (warn 0.5) | bad |
| sourceFamilyOpeningHhi | 0.421875 | <= 0.32 (warn 0.45) | warn |
| uniqueOpeningLineShare | 0.25 | >= 0.35 (warn 0.2) | warn |
| decompressionSlope | 0.003968 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | -0.096429 | >= 0.05 (warn 0) | bad |
| meanBoardDisplacement | 0.070139 | >= 0.08 (warn 0.06) | warn |
| drama | 1.076923 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |
| compositeInterestingness | 0.028672 | >= 0.65 (warn 0.4) | bad |

Regressions:
- twoPlyUndoRate: 0.05 vs threshold 0.000001 (lower is better)
- decompressionSlope: 0.003968 vs threshold 0.012856 (higher is better)

## medium

Games: 4, average plies: 40, terminals: {"homeField":0,"sixStacks":0,"threefoldDraw":0,"stalemateDraw":0,"unfinished":4}

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| twoPlyUndoRate | 0.325 | <= 0.02 (warn 0.08) | bad |
| sameFamilyQuietRepeatRate | 0.333333 | <= 0.25 (warn 0.45) | warn |
| repetitionPlyShare | 0.125 | <= 0.1 (warn 0.2) | warn |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| stagnationWindowRate | 0.457143 | <= 0.15 (warn 0.3) | bad |
| openingEntropy | 0 | >= 1 (warn 0.5) | bad |
| sourceFamilyOpeningHhi | 0.296875 | <= 0.32 (warn 0.45) | good |
| uniqueOpeningLineShare | 0.25 | >= 0.35 (warn 0.2) | warn |
| decompressionSlope | 0.003968 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | -0.096429 | >= 0.05 (warn 0) | bad |
| meanBoardDisplacement | 0.06875 | >= 0.08 (warn 0.06) | warn |
| drama | 1.641026 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |
| compositeInterestingness | 0.027733 | >= 0.65 (warn 0.4) | bad |

Regressions:
- stagnationWindowRate: 0.457143 vs threshold 0.412501 (lower is better)
- twoPlyUndoRate: 0.325 vs threshold 0.000001 (lower is better)
- decompressionSlope: 0.003968 vs threshold 0.012856 (higher is better)

## hard

Games: 4, average plies: 40, terminals: {"homeField":0,"sixStacks":0,"threefoldDraw":0,"stalemateDraw":0,"unfinished":4}

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| twoPlyUndoRate | 0.175 | <= 0.02 (warn 0.08) | bad |
| sameFamilyQuietRepeatRate | 0.4 | <= 0.25 (warn 0.45) | warn |
| repetitionPlyShare | 0.025 | <= 0.1 (warn 0.2) | good |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| stagnationWindowRate | 0.485714 | <= 0.15 (warn 0.3) | bad |
| openingEntropy | 0 | >= 1 (warn 0.5) | bad |
| sourceFamilyOpeningHhi | 0.296875 | <= 0.32 (warn 0.45) | good |
| uniqueOpeningLineShare | 0.25 | >= 0.35 (warn 0.2) | warn |
| decompressionSlope | 0.003968 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | -0.096429 | >= 0.05 (warn 0) | bad |
| meanBoardDisplacement | 0.064583 | >= 0.08 (warn 0.06) | warn |
| drama | 1.641026 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |
| compositeInterestingness | 0.029448 | >= 0.65 (warn 0.4) | bad |

Regressions:
- stagnationWindowRate: 0.485714 vs threshold 0.412501 (lower is better)
- twoPlyUndoRate: 0.175 vs threshold 0.000001 (lower is better)
- decompressionSlope: 0.003968 vs threshold 0.012856 (higher is better)

