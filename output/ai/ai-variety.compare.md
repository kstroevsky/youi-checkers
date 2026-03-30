# AI Variety Comparison

Generated: 2026-03-28T23:30:42.115Z

This file is a generated comparison artifact between two JSON report snapshots.
- Before: `5607638` (../../../../../var/folders/3v/x1mcnkjx34v_q3qbx98mhd_40000gn/T/youi-report-compare-5aAgqU/output/ai/ai-variety-report.json)
- After: `working-tree` (output/ai/ai-variety-report.json)
- `delta` is `after - before`.
- `delta%` is relative to the absolute `before` value when `before != 0`; otherwise it is `n/a`.
- Improvement direction is metric-specific; use the target bands and AI variety semantics from `src/ai/test/metrics.ts`.

## Summary
- Numeric metrics compared: 203
- Top absolute changes surfaced below: 10

## Largest Changes
- `regressions.medium.1.threshold`: 0.000001 -> 0.01679 (+0.016789, +1678900%)
- `summaries.medium.metrics.noveltyScore`: 0.000137 -> 0.139881 (+0.139744, +102002.92%)
- `summaries.easy.games.terminalCounts.unfinished`: 1 -> 62 (+61, +6100%)
- `summaries.easy.samples.terminalDistribution.unfinished`: 1 -> 62 (+61, +6100%)
- `summaries.easy.metrics.uniqueOpeningLineShare`: 0.015625 -> 0.171875 (+0.15625, +1000%)
- `summaries.hard.metrics.uniqueOpeningLineShare`: 0.015625 -> 0.109375 (+0.09375, +600%)
- `summaries.easy.metrics.noveltyScore`: 0.027098 -> 0.186562 (+0.159464, +588.47%)
- `summaries.medium.metrics.uniqueOpeningLineShare`: 0.015625 -> 0.09375 (+0.078125, +500%)
- `summaries.hard.metrics.compositeInterestingness`: 0.01 -> 0.044566 (+0.034566, +345.66%)
- `summaries.medium.metrics.compositeInterestingness`: 0.01 -> 0.044485 (+0.034484999999999995, +344.85%)

## Full Comparison
| metric | before | after | delta | delta% |
| --- | ---: | ---: | ---: | ---: |
| regressions.medium.1.threshold | 0.000001 | 0.01679 | +0.016789 | +1678900% |
| summaries.medium.metrics.noveltyScore | 0.000137 | 0.139881 | +0.139744 | +102002.92% |
| summaries.easy.games.terminalCounts.unfinished | 1 | 62 | +61 | +6100% |
| summaries.easy.samples.terminalDistribution.unfinished | 1 | 62 | +61 | +6100% |
| summaries.easy.metrics.uniqueOpeningLineShare | 0.015625 | 0.171875 | +0.15625 | +1000% |
| summaries.hard.metrics.uniqueOpeningLineShare | 0.015625 | 0.109375 | +0.09375 | +600% |
| summaries.easy.metrics.noveltyScore | 0.027098 | 0.186562 | +0.159464 | +588.47% |
| summaries.medium.metrics.uniqueOpeningLineShare | 0.015625 | 0.09375 | +0.078125 | +500% |
| summaries.hard.metrics.compositeInterestingness | 0.01 | 0.044566 | +0.034566 | +345.66% |
| summaries.medium.metrics.compositeInterestingness | 0.01 | 0.044485 | +0.034484999999999995 | +344.85% |
| summaries.easy.samples.strategicIntentDistribution.sixStack | 495 | 1791 | +1296 | +261.82% |
| summaries.medium.metrics.behaviorSpaceCoverage | 0.002976 | 0.008929 | +0.005953 | +200.03% |
| summaries.medium.samples.strategicIntentDistribution.home | 576 | 1702 | +1126 | +195.49% |
| summaries.easy.samples.strategicIntentDistribution.home | 651 | 1724 | +1073 | +164.82% |
| summaries.hard.samples.strategicIntentDistribution.home | 594 | 1494 | +900 | +151.52% |
| summaries.medium.metrics.mobilityReleaseSlope | -0.090476 | 0.014937 | +0.105413 | +116.51% |
| summaries.easy.metrics.mobilityReleaseSlope | -0.090476 | 0.012798 | +0.103274 | +114.15% |
| summaries.hard.metrics.mobilityReleaseSlope | -0.090476 | 0.011031 | +0.101507 | +112.19% |
| summaries.easy.metrics.compositeInterestingness | 0.021204 | 0.044508 | +0.023304 | +109.9% |
| summaries.easy.games.averagePlies | 39.3125 | 79.40625 | +40.09375 | +101.99% |
| summaries.easy.games.terminalCounts.threefoldDraw | 56 | 0 | -56 | -100% |
| summaries.easy.metrics.openingJsDivergence | 1 | 0 | -1 | -100% |
| summaries.easy.metrics.threefoldDrawShare | 0.875 | 0 | -0.875 | -100% |
| summaries.easy.samples.terminalDistribution.threefoldDraw | 56 | 0 | -56 | -100% |
| summaries.hard.games.terminalCounts.threefoldDraw | 3 | 0 | -3 | -100% |
| summaries.hard.metrics.openingJsDivergence | 1 | 0 | -1 | -100% |
| summaries.hard.metrics.threefoldDrawShare | 0.046875 | 0 | -0.046875 | -100% |
| summaries.hard.samples.terminalDistribution.threefoldDraw | 3 | 0 | -3 | -100% |
| summaries.medium.metrics.openingJsDivergence | 1 | 0 | -1 | -100% |
| regressions.hard.0.threshold | 5.500001 | 0.000001 | -5.5 | -100% |
| regressions.easy.0.current | 8 | 0.012798 | -7.987202 | -99.84% |
| regressions.easy.0.threshold | 5.500001 | 0.013777 | -5.486224 | -99.75% |
| regressions.hard.0.current | 8 | 0.027184 | -7.972816 | -99.66% |
| summaries.medium.metrics.homeProgressAuc | 0.097917 | 0.194422 | +0.09650500000000001 | +98.56% |
| summaries.easy.metrics.repetitionPlyShare | 0.197933 | 0.003148 | -0.19478499999999999 | -98.41% |
| regressions.hard.1.current | 0.545687 | 0.011031 | -0.534656 | -97.98% |
| regressions.medium.0.threshold | 0.412501 | 0.011958 | -0.400543 | -97.1% |
| summaries.hard.metrics.repetitionPlyShare | 0.006381 | 0.000195 | -0.0061860000000000005 | -96.94% |
| regressions.hard.1.threshold | 0.412501 | 0.013275 | -0.399226 | -96.78% |
| summaries.hard.metrics.homeProgressAuc | 0.097515 | 0.19133 | +0.093815 | +96.21% |
| regressions.medium.0.current | 0.546667 | 0.028322 | -0.5183450000000001 | -94.82% |
| summaries.easy.metrics.homeProgressAuc | 0.091266 | 0.177398 | +0.086132 | +94.37% |
| summaries.medium.metrics.decompressionSlope | 0.003968 | 0.00031 | -0.0036580000000000002 | -92.19% |
| summaries.easy.metrics.decompressionSlope | 0.003968 | 0.000434 | -0.0035340000000000002 | -89.06% |
| summaries.easy.metrics.maxRepeatedStateRun | 8 | 1 | -7 | -87.5% |
| summaries.hard.metrics.maxRepeatedStateRun | 8 | 1 | -7 | -87.5% |
| summaries.hard.metrics.decompressionSlope | 0.003968 | 0.000744 | -0.0032240000000000003 | -81.25% |
| summaries.easy.games.terminalCounts.threefoldTiebreakWin | 7 | 2 | -5 | -71.43% |
| summaries.easy.metrics.decisiveResultShare | 0.109375 | 0.03125 | -0.078125 | -71.43% |
| summaries.easy.samples.terminalDistribution.threefoldTiebreakWin | 7 | 2 | -5 | -71.43% |
| summaries.easy.samples.firstMoveDistribution.climbOne:C3:B4 | 64 | 21 | -43 | -67.19% |
| summaries.easy.samples.firstMoveSourceFamilyDistribution.white-15 | 64 | 21 | -43 | -67.19% |
| summaries.hard.samples.firstMoveDistribution.climbOne:C3:B4 | 64 | 21 | -43 | -67.19% |
| summaries.hard.samples.firstMoveSourceFamilyDistribution.white-15 | 64 | 21 | -43 | -67.19% |
| summaries.medium.samples.firstMoveDistribution.climbOne:C3:B4 | 64 | 21 | -43 | -67.19% |
| summaries.medium.samples.firstMoveSourceFamilyDistribution.white-15 | 64 | 21 | -43 | -67.19% |
| summaries.easy.metrics.twoPlyUndoRate | 0.117647 | 0.040929 | -0.07671800000000001 | -65.21% |
| regressions.medium.1.current | 0.0375 | 0.014937 | -0.022563 | -60.17% |
| summaries.hard.metrics.twoPlyUndoRate | 0.039681 | 0.063281 | +0.023600000000000003 | +59.47% |
| summaries.medium.samples.strategicIntentDistribution.hybrid | 3008 | 1421 | -1587 | -52.76% |
| summaries.hard.samples.strategicIntentDistribution.hybrid | 2944 | 1463 | -1481 | -50.31% |
| summaries.medium.metrics.twoPlyUndoRate | 0.0375 | 0.056106 | +0.018606000000000004 | +49.62% |
| summaries.hard.samples.strategicIntentDistribution.sixStack | 1477 | 2163 | +686 | +46.45% |
| summaries.hard.metrics.drama | 0.801858 | 1.160997 | +0.3591390000000001 | +44.79% |
| summaries.hard.metrics.leadChangeRate | 0.405818 | 0.580498 | +0.17467999999999995 | +43.04% |
| summaries.medium.metrics.leadChangeRate | 0.392405 | 0.560601 | +0.168196 | +42.86% |
| summaries.easy.metrics.normalizedLempelZiv | 4.530825 | 2.592853 | -1.9379720000000002 | -42.77% |
| summaries.medium.metrics.drama | 0.78481 | 1.118474 | +0.33366399999999996 | +42.52% |
| summaries.hard.metrics.sourceFamilyOpeningHhi | 0.398926 | 0.25415 | -0.14477600000000002 | -36.29% |
| summaries.medium.metrics.sourceFamilyOpeningHhi | 0.398926 | 0.261475 | -0.137451 | -34.46% |
| summaries.easy.metrics.sourceFamilyOpeningHhi | 0.385742 | 0.260498 | -0.12524399999999997 | -32.47% |
| summaries.hard.metrics.stackProfileChurn | 0.004841 | 0.00638 | +0.0015390000000000004 | +31.79% |
| summaries.medium.samples.strategicIntentDistribution.sixStack | 1536 | 1921 | +385 | +25.07% |
| summaries.hard.metrics.stagnationWindowRate | 0.545687 | 0.4225 | -0.12318700000000005 | -22.57% |
| summaries.easy.metrics.frozenCountChurn | 0.015379 | 0.018819 | +0.0034399999999999986 | +22.37% |
| summaries.easy.metrics.sameFamilyQuietRepeatRate | 0.027397 | 0.033268 | +0.005870999999999998 | +21.43% |
| summaries.easy.metrics.intentSwitchRate | 0.599918 | 0.478278 | -0.12163999999999997 | -20.28% |
| summaries.easy.metrics.gameRefinement | 0.150784 | 0.120265 | -0.030519000000000004 | -20.24% |
| summaries.easy.metrics.leadChangeRate | 0.662048 | 0.550574 | -0.11147399999999996 | -16.84% |
| summaries.easy.metrics.drama | 1.320555 | 1.099641 | -0.22091399999999983 | -16.73% |
| summaries.hard.metrics.noveltyScore | 0.049756 | 0.057792 | +0.008036000000000001 | +16.15% |
| summaries.easy.samples.strategicIntentDistribution.hybrid | 1370 | 1567 | +197 | +14.38% |
| summaries.medium.metrics.stackProfileChurn | 0.004861 | 0.005518 | +0.0006570000000000005 | +13.52% |
| summaries.medium.metrics.normalizedLempelZiv | 2.844868 | 2.52605 | -0.3188179999999998 | -11.21% |
| summaries.medium.metrics.intentSwitchRate | 0.443038 | 0.491365 | +0.04832700000000001 | +10.91% |
| summaries.easy.metrics.stagnationWindowRate | 0.415756 | 0.459681 | +0.04392499999999999 | +10.57% |
| summaries.medium.metrics.stagnationWindowRate | 0.546667 | 0.490898 | -0.05576900000000001 | -10.2% |
| summaries.hard.metrics.normalizedLempelZiv | 2.900297 | 2.664594 | -0.235703 | -8.13% |
| summaries.easy.metrics.meanBoardDisplacement | 0.069522 | 0.074375 | +0.004852999999999996 | +6.98% |
| summaries.medium.games.terminalCounts.unfinished | 64 | 60 | -4 | -6.25% |
| summaries.medium.samples.terminalDistribution.unfinished | 64 | 60 | -4 | -6.25% |
| summaries.hard.games.terminalCounts.unfinished | 61 | 64 | +3 | +4.92% |
| summaries.hard.samples.terminalDistribution.unfinished | 61 | 64 | +3 | +4.92% |
| summaries.easy.metrics.stackProfileChurn | 0.005918 | 0.006155 | +0.00023700000000000023 | +4% |
| summaries.medium.games.terminalCounts.threefoldTiebreakWin | 0 | 4 | +4 | n/a |
| summaries.medium.samples.terminalDistribution.threefoldTiebreakWin | 0 | 4 | +4 | n/a |
| summaries.hard.games.averagePlies | 78.359375 | 80 | +1.640625 | +2.09% |
| summaries.easy.metrics.openingEntropy | 0 | 1.584612 | +1.584612 | n/a |
| summaries.hard.metrics.openingEntropy | 0 | 1.584612 | +1.584612 | n/a |
| summaries.medium.metrics.openingEntropy | 0 | 1.584612 | +1.584612 | n/a |
| summaries.medium.games.averagePlies | 80 | 78.8125 | -1.1875 | -1.48% |
| summaries.hard.metrics.frozenCountChurn | 0.01937 | 0.019097 | -0.00027299999999999894 | -1.41% |
| summaries.medium.metrics.meanBoardDisplacement | 0.074305 | 0.075128 | +0.0008230000000000043 | +1.11% |
| summaries.medium.metrics.maxRepeatedStateRun | 0 | 1 | +1 | n/a |
| summaries.easy.metrics.openingSimpsonDiversity | 0 | 0.666504 | +0.666504 | n/a |
| summaries.hard.metrics.openingSimpsonDiversity | 0 | 0.666504 | +0.666504 | n/a |
| summaries.medium.metrics.openingSimpsonDiversity | 0 | 0.666504 | +0.666504 | n/a |
| summaries.medium.metrics.frozenCountChurn | 0.019445 | 0.019572 | +0.00012699999999999864 | +0.65% |
| summaries.hard.metrics.meanBoardDisplacement | 0.074216 | 0.074653 | +0.00043699999999999295 | +0.59% |
| summaries.hard.metrics.intentSwitchRate | 0.44698 | 0.4464 | -0.0005799999999999694 | -0.13% |
| summaries.medium.metrics.gameRefinement | 0 | 0.120265 | +0.120265 | n/a |
| summaries.medium.metrics.decisiveResultShare | 0 | 0.0625 | +0.0625 | n/a |
| summaries.medium.metrics.sameFamilyQuietRepeatRate | 0 | 0.028322 | +0.028322 | n/a |
| summaries.hard.metrics.sameFamilyQuietRepeatRate | 0 | 0.027184 | +0.027184 | n/a |
| summaries.hard.metrics.sixStackProgressAuc | 0 | 0.02513 | +0.02513 | n/a |
| summaries.medium.metrics.sixStackProgressAuc | 0 | 0.008789 | +0.008789 | n/a |
| summaries.easy.metrics.sixStackProgressAuc | 0 | 0.007308 | +0.007308 | n/a |
| summaries.medium.metrics.repetitionPlyShare | 0 | 0.002379 | +0.002379 | n/a |
| summaries.easy.metrics.lateSuspense | 0 | 0.000027 | +0.000027 | n/a |
| summaries.easy.metrics.tension | 0 | 0.000019 | +0.000019 | n/a |
| baselineVersion | 1 | 1 | 0 | 0% |
| settings.maxTurns | 80 | 80 | 0 | 0% |
| settings.pairCount | 32 | 32 | 0 | 0% |
| summaries.easy.gameCount | 64 | 64 | 0 | 0% |
| summaries.easy.games.terminalCounts.homeField | 0 | 0 | 0 | n/a |
| summaries.easy.games.terminalCounts.sixStacks | 0 | 0 | 0 | n/a |
| summaries.easy.games.terminalCounts.stalemateDraw | 0 | 0 | 0 | n/a |
| summaries.easy.games.terminalCounts.stalemateTiebreakWin | 0 | 0 | 0 | n/a |
| summaries.easy.metadata.gameCount | 64 | 64 | 0 | 0% |
| summaries.easy.metadata.maxTurns | 80 | 80 | 0 | 0% |
| summaries.easy.metadata.mirrorPairCount | 32 | 32 | 0 | 0% |
| summaries.easy.metadata.stableCalls | 8 | 8 | 0 | 0% |
| summaries.easy.metrics.behaviorSpaceCoverage | 0.008929 | 0.008929 | 0 | 0% |
| summaries.easy.metrics.firstFourActionKindEntropy | 0.811278 | 0.811278 | 0 | 0% |
| summaries.easy.metrics.firstFourTagEntropy | 1.721928 | 1.721928 | 0 | 0% |
| summaries.easy.metrics.stalemateDrawShare | 0 | 0 | 0 | n/a |
| summaries.easy.samples.firstFourActionKindDistribution.climbOne | 64 | 64 | 0 | 0% |
| summaries.easy.samples.firstFourActionKindDistribution.jumpSequence | 192 | 192 | 0 | 0% |
| summaries.easy.samples.firstFourTagDistribution.advanceMass | 256 | 256 | 0 | 0% |
| summaries.easy.samples.firstFourTagDistribution.captureControl | 64 | 64 | 0 | 0% |
| summaries.easy.samples.firstFourTagDistribution.freezeBlock | 64 | 64 | 0 | 0% |
| summaries.easy.samples.firstFourTagDistribution.openLane | 256 | 256 | 0 | 0% |
| summaries.easy.samples.terminalDistribution.homeField | 0 | 0 | 0 | n/a |
| summaries.easy.samples.terminalDistribution.sixStacks | 0 | 0 | 0 | n/a |
| summaries.easy.samples.terminalDistribution.stalemateDraw | 0 | 0 | 0 | n/a |
| summaries.easy.samples.terminalDistribution.stalemateTiebreakWin | 0 | 0 | 0 | n/a |
| summaries.hard.gameCount | 64 | 64 | 0 | 0% |
| summaries.hard.games.terminalCounts.homeField | 0 | 0 | 0 | n/a |
| summaries.hard.games.terminalCounts.sixStacks | 0 | 0 | 0 | n/a |
| summaries.hard.games.terminalCounts.stalemateDraw | 0 | 0 | 0 | n/a |
| summaries.hard.games.terminalCounts.stalemateTiebreakWin | 0 | 0 | 0 | n/a |
| summaries.hard.games.terminalCounts.threefoldTiebreakWin | 0 | 0 | 0 | n/a |
| summaries.hard.metadata.gameCount | 64 | 64 | 0 | 0% |
| summaries.hard.metadata.maxTurns | 80 | 80 | 0 | 0% |
| summaries.hard.metadata.mirrorPairCount | 32 | 32 | 0 | 0% |
| summaries.hard.metadata.stableCalls | 12 | 12 | 0 | 0% |
| summaries.hard.metrics.behaviorSpaceCoverage | 0.005952 | 0.005952 | 0 | 0% |
| summaries.hard.metrics.decisiveResultShare | 0 | 0 | 0 | n/a |
| summaries.hard.metrics.firstFourActionKindEntropy | 0.811278 | 0.811278 | 0 | 0% |
| summaries.hard.metrics.firstFourTagEntropy | 1.721928 | 1.721928 | 0 | 0% |
| summaries.hard.metrics.gameRefinement | 0 | 0 | 0 | n/a |
| summaries.hard.metrics.lateSuspense | 0 | 0 | 0 | n/a |
| summaries.hard.metrics.stalemateDrawShare | 0 | 0 | 0 | n/a |
| summaries.hard.metrics.tension | 0 | 0 | 0 | n/a |
| summaries.hard.samples.firstFourActionKindDistribution.climbOne | 64 | 64 | 0 | 0% |
| summaries.hard.samples.firstFourActionKindDistribution.jumpSequence | 192 | 192 | 0 | 0% |
| summaries.hard.samples.firstFourTagDistribution.advanceMass | 256 | 256 | 0 | 0% |
| summaries.hard.samples.firstFourTagDistribution.captureControl | 64 | 64 | 0 | 0% |
| summaries.hard.samples.firstFourTagDistribution.freezeBlock | 64 | 64 | 0 | 0% |
| summaries.hard.samples.firstFourTagDistribution.openLane | 256 | 256 | 0 | 0% |
| summaries.hard.samples.terminalDistribution.homeField | 0 | 0 | 0 | n/a |
| summaries.hard.samples.terminalDistribution.sixStacks | 0 | 0 | 0 | n/a |
| summaries.hard.samples.terminalDistribution.stalemateDraw | 0 | 0 | 0 | n/a |
| summaries.hard.samples.terminalDistribution.stalemateTiebreakWin | 0 | 0 | 0 | n/a |
| summaries.hard.samples.terminalDistribution.threefoldTiebreakWin | 0 | 0 | 0 | n/a |
| summaries.medium.gameCount | 64 | 64 | 0 | 0% |
| summaries.medium.games.terminalCounts.homeField | 0 | 0 | 0 | n/a |
| summaries.medium.games.terminalCounts.sixStacks | 0 | 0 | 0 | n/a |
| summaries.medium.games.terminalCounts.stalemateDraw | 0 | 0 | 0 | n/a |
| summaries.medium.games.terminalCounts.stalemateTiebreakWin | 0 | 0 | 0 | n/a |
| summaries.medium.games.terminalCounts.threefoldDraw | 0 | 0 | 0 | n/a |
| summaries.medium.metadata.gameCount | 64 | 64 | 0 | 0% |
| summaries.medium.metadata.maxTurns | 80 | 80 | 0 | 0% |
| summaries.medium.metadata.mirrorPairCount | 32 | 32 | 0 | 0% |
| summaries.medium.metadata.stableCalls | 10 | 10 | 0 | 0% |
| summaries.medium.metrics.firstFourActionKindEntropy | 0.811278 | 0.811278 | 0 | 0% |
| summaries.medium.metrics.firstFourTagEntropy | 1.721928 | 1.721928 | 0 | 0% |
| summaries.medium.metrics.lateSuspense | 0 | 0 | 0 | n/a |
| summaries.medium.metrics.stalemateDrawShare | 0 | 0 | 0 | n/a |
| summaries.medium.metrics.tension | 0 | 0 | 0 | n/a |
| summaries.medium.metrics.threefoldDrawShare | 0 | 0 | 0 | n/a |
| summaries.medium.samples.firstFourActionKindDistribution.climbOne | 64 | 64 | 0 | 0% |
| summaries.medium.samples.firstFourActionKindDistribution.jumpSequence | 192 | 192 | 0 | 0% |
| summaries.medium.samples.firstFourTagDistribution.advanceMass | 256 | 256 | 0 | 0% |
| summaries.medium.samples.firstFourTagDistribution.captureControl | 64 | 64 | 0 | 0% |
| summaries.medium.samples.firstFourTagDistribution.freezeBlock | 64 | 64 | 0 | 0% |
| summaries.medium.samples.firstFourTagDistribution.openLane | 256 | 256 | 0 | 0% |
| summaries.medium.samples.terminalDistribution.homeField | 0 | 0 | 0 | n/a |
| summaries.medium.samples.terminalDistribution.sixStacks | 0 | 0 | 0 | n/a |
| summaries.medium.samples.terminalDistribution.stalemateDraw | 0 | 0 | 0 | n/a |
| summaries.medium.samples.terminalDistribution.stalemateTiebreakWin | 0 | 0 | 0 | n/a |
| summaries.medium.samples.terminalDistribution.threefoldDraw | 0 | 0 | 0 | n/a |
| targetBandVersion | 1 | 1 | 0 | 0% |
