# AI Variety Report

Generated at: 2026-03-28T16:13:26.861Z

This file is a generated report artifact from `npm run ai:variety`.

Methodology:
- Each difficulty is evaluated with the same mirrored self-play harness used by `runAiVarietySuite()` in `src/ai/test/metrics.ts`.
- The `Status` column compares the measured value to the target bands in `src/ai/test/fixtures/ai-variety-target-bands.json`.
- `good`, `warn`, and `bad` are directional: some metrics want higher values, others want lower values.
- The `Regressions` section compares the current summary against the checked-in baseline file in `src/ai/test/fixtures/ai-variety-baselines.json`.

## easy

Games: 64, average plies: 58.34375, terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":5,"stalemateTiebreakWin":0,"threefoldDraw":21,"stalemateDraw":0,"unfinished":38}

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0.078125 | >= 0.35 (warn 0.15) | bad |
| twoPlyUndoRate | 0.058918 | <= 0.02 (warn 0.08) | warn |
| sameFamilyQuietRepeatRate | 0.033505 | <= 0.25 (warn 0.45) | good |
| repetitionPlyShare | 0.038297 | <= 0.1 (warn 0.2) | good |
| threefoldDrawShare | 0.328125 | <= 0.3 (warn 0.55) | warn |
| stagnationWindowRate | 0.456356 | <= 0.15 (warn 0.3) | bad |
| openingEntropy | 1.584612 | >= 1 (warn 0.5) | good |
| sourceFamilyOpeningHhi | 0.297607 | <= 0.32 (warn 0.45) | good |
| uniqueOpeningLineShare | 0.1875 | >= 0.35 (warn 0.2) | bad |
| decompressionSlope | 0.000124 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | 0.015309 | >= 0.05 (warn 0) | warn |
| meanBoardDisplacement | 0.073833 | >= 0.08 (warn 0.06) | warn |
| drama | 1.143324 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |
| compositeInterestingness | 0.031623 | >= 0.65 (warn 0.4) | bad |

## medium

Games: 64, average plies: 58.890625, terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":5,"stalemateTiebreakWin":0,"threefoldDraw":23,"stalemateDraw":0,"unfinished":36}

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0.078125 | >= 0.35 (warn 0.15) | bad |
| twoPlyUndoRate | 0.060759 | <= 0.02 (warn 0.08) | warn |
| sameFamilyQuietRepeatRate | 0.01087 | <= 0.25 (warn 0.45) | good |
| repetitionPlyShare | 0.041656 | <= 0.1 (warn 0.2) | good |
| threefoldDrawShare | 0.359375 | <= 0.3 (warn 0.55) | warn |
| stagnationWindowRate | 0.489127 | <= 0.15 (warn 0.3) | bad |
| openingEntropy | 1.584612 | >= 1 (warn 0.5) | good |
| sourceFamilyOpeningHhi | 0.30542 | <= 0.32 (warn 0.45) | good |
| uniqueOpeningLineShare | 0.109375 | >= 0.35 (warn 0.2) | bad |
| decompressionSlope | 0 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | 0.018657 | >= 0.05 (warn 0) | warn |
| meanBoardDisplacement | 0.0746 | >= 0.08 (warn 0.06) | warn |
| drama | 1.099595 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |
| compositeInterestingness | 0.031623 | >= 0.65 (warn 0.4) | bad |

## hard

Games: 64, average plies: 57.546875, terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":0,"stalemateTiebreakWin":0,"threefoldDraw":25,"stalemateDraw":0,"unfinished":39}

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0 | >= 0.35 (warn 0.15) | bad |
| twoPlyUndoRate | 0.057562 | <= 0.02 (warn 0.08) | warn |
| sameFamilyQuietRepeatRate | 0 | <= 0.25 (warn 0.45) | good |
| repetitionPlyShare | 0.043443 | <= 0.1 (warn 0.2) | good |
| threefoldDrawShare | 0.390625 | <= 0.3 (warn 0.55) | warn |
| stagnationWindowRate | 0.470711 | <= 0.15 (warn 0.3) | bad |
| openingEntropy | 1.584612 | >= 1 (warn 0.5) | good |
| sourceFamilyOpeningHhi | 0.304688 | <= 0.32 (warn 0.45) | good |
| uniqueOpeningLineShare | 0.125 | >= 0.35 (warn 0.2) | bad |
| decompressionSlope | 0.000434 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | 0.014751 | >= 0.05 (warn 0) | warn |
| meanBoardDisplacement | 0.07432 | >= 0.08 (warn 0.06) | warn |
| drama | 1.123515 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |
| compositeInterestingness | 0.031623 | >= 0.65 (warn 0.4) | bad |

