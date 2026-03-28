# AI Variety Comparison

Generated: 2026-03-28T17:15:52.673Z

This file is a generated comparison artifact between two JSON report snapshots.
- Before: `working-tree` (output/ai/ai-variety-report.json)
- After: `working-tree` (output/ai/ai-variety-report.json)
- `delta` is `after - before`.
- `delta%` is relative to the absolute `before` value when `before != 0`; otherwise it is `n/a`.
- Improvement direction is metric-specific; use the target bands and AI variety semantics from `src/ai/test/metrics.ts`.

## Summary
- Numeric metrics compared: 218
- Top absolute changes surfaced below: 10

## Largest Changes
- `baselineVersion`: 1 -> 1 (0, 0%)
- `regressions.easy.0.current`: 0 -> 0 (0, n/a)
- `regressions.easy.0.threshold`: 0.000111 -> 0.000111 (0, 0%)
- `regressions.easy.1.current`: 0.064815 -> 0.064815 (0, 0%)
- `regressions.easy.1.threshold`: 0.066449 -> 0.066449 (0, 0%)
- `regressions.easy.2.current`: 0 -> 0 (0, n/a)
- `regressions.easy.2.threshold`: 1.42615 -> 1.42615 (0, 0%)
- `regressions.easy.3.current`: 0 -> 0 (0, n/a)
- `regressions.easy.3.threshold`: 0.599853 -> 0.599853 (0, 0%)
- `regressions.hard.0.current`: 0 -> 0 (0, n/a)

## Full Comparison
| metric | before | after | delta | delta% |
| --- | ---: | ---: | ---: | ---: |
| baselineVersion | 1 | 1 | 0 | 0% |
| regressions.easy.0.current | 0 | 0 | 0 | n/a |
| regressions.easy.0.threshold | 0.000111 | 0.000111 | 0 | 0% |
| regressions.easy.1.current | 0.064815 | 0.064815 | 0 | 0% |
| regressions.easy.1.threshold | 0.066449 | 0.066449 | 0 | 0% |
| regressions.easy.2.current | 0 | 0 | 0 | n/a |
| regressions.easy.2.threshold | 1.42615 | 1.42615 | 0 | 0% |
| regressions.easy.3.current | 0 | 0 | 0 | n/a |
| regressions.easy.3.threshold | 0.599853 | 0.599853 | 0 | 0% |
| regressions.hard.0.current | 0 | 0 | 0 | n/a |
| regressions.hard.0.threshold | 0.00039 | 0.00039 | 0 | 0% |
| regressions.hard.1.current | 0.064815 | 0.064815 | 0 | 0% |
| regressions.hard.1.threshold | 0.066887 | 0.066887 | 0 | 0% |
| regressions.hard.2.current | 0 | 0 | 0 | n/a |
| regressions.hard.2.threshold | 1.42615 | 1.42615 | 0 | 0% |
| regressions.hard.3.current | 0 | 0 | 0 | n/a |
| regressions.hard.3.threshold | 0.599853 | 0.599853 | 0 | 0% |
| regressions.medium.0.current | 0.064815 | 0.064815 | 0 | 0% |
| regressions.medium.0.threshold | 0.067139 | 0.067139 | 0 | 0% |
| regressions.medium.1.current | 0 | 0 | 0 | n/a |
| regressions.medium.1.threshold | 1.42615 | 1.42615 | 0 | 0% |
| regressions.medium.2.current | 0 | 0 | 0 | n/a |
| regressions.medium.2.threshold | 0.599853 | 0.599853 | 0 | 0% |
| settings.maxTurns | 12 | 12 | 0 | 0% |
| settings.pairCount | 1 | 1 | 0 | 0% |
| summaries.easy.gameCount | 2 | 2 | 0 | 0% |
| summaries.easy.games.averagePlies | 12 | 12 | 0 | 0% |
| summaries.easy.games.terminalCounts.homeField | 0 | 0 | 0 | n/a |
| summaries.easy.games.terminalCounts.sixStacks | 0 | 0 | 0 | n/a |
| summaries.easy.games.terminalCounts.stalemateDraw | 0 | 0 | 0 | n/a |
| summaries.easy.games.terminalCounts.stalemateTiebreakWin | 0 | 0 | 0 | n/a |
| summaries.easy.games.terminalCounts.threefoldDraw | 0 | 0 | 0 | n/a |
| summaries.easy.games.terminalCounts.threefoldTiebreakWin | 0 | 0 | 0 | n/a |
| summaries.easy.games.terminalCounts.unfinished | 2 | 2 | 0 | 0% |
| summaries.easy.metadata.gameCount | 2 | 2 | 0 | 0% |
| summaries.easy.metadata.maxTurns | 12 | 12 | 0 | 0% |
| summaries.easy.metadata.mirrorPairCount | 1 | 1 | 0 | 0% |
| summaries.easy.metadata.stableCalls | 8 | 8 | 0 | 0% |
| summaries.easy.metrics.behaviorSpaceCoverage | 0.002976 | 0.002976 | 0 | 0% |
| summaries.easy.metrics.compositeInterestingness | 0.031623 | 0.031623 | 0 | 0% |
| summaries.easy.metrics.decisiveResultShare | 0 | 0 | 0 | n/a |
| summaries.easy.metrics.decompressionSlope | 0 | 0 | 0 | n/a |
| summaries.easy.metrics.drama | 2 | 2 | 0 | 0% |
| summaries.easy.metrics.firstFourActionKindEntropy | 0.811278 | 0.811278 | 0 | 0% |
| summaries.easy.metrics.firstFourTagEntropy | 1.721928 | 1.721928 | 0 | 0% |
| summaries.easy.metrics.frozenCountChurn | 0.016204 | 0.016204 | 0 | 0% |
| summaries.easy.metrics.gameRefinement | 0 | 0 | 0 | n/a |
| summaries.easy.metrics.homeProgressAuc | 0.125 | 0.125 | 0 | 0% |
| summaries.easy.metrics.intentSwitchRate | 0.727273 | 0.727273 | 0 | 0% |
| summaries.easy.metrics.lateSuspense | 0 | 0 | 0 | n/a |
| summaries.easy.metrics.leadChangeRate | 1 | 1 | 0 | 0% |
| summaries.easy.metrics.maxRepeatedStateRun | 0 | 0 | 0 | n/a |
| summaries.easy.metrics.meanBoardDisplacement | 0.064815 | 0.064815 | 0 | 0% |
| summaries.easy.metrics.mobilityReleaseSlope | 0.036905 | 0.036905 | 0 | 0% |
| summaries.easy.metrics.normalizedLempelZiv | 8.962406 | 8.962406 | 0 | 0% |
| summaries.easy.metrics.noveltyScore | 0.065271 | 0.065271 | 0 | 0% |
| summaries.easy.metrics.openingEntropy | 0 | 0 | 0 | n/a |
| summaries.easy.metrics.openingJsDivergence | 0.448818 | 0.448818 | 0 | 0% |
| summaries.easy.metrics.openingSimpsonDiversity | 0 | 0 | 0 | n/a |
| summaries.easy.metrics.repetitionPlyShare | 0 | 0 | 0 | n/a |
| summaries.easy.metrics.sameFamilyQuietRepeatRate | 0 | 0 | 0 | n/a |
| summaries.easy.metrics.sixStackProgressAuc | 0 | 0 | 0 | n/a |
| summaries.easy.metrics.sourceFamilyOpeningHhi | 0.277778 | 0.277778 | 0 | 0% |
| summaries.easy.metrics.stackProfileChurn | 0.009259 | 0.009259 | 0 | 0% |
| summaries.easy.metrics.stagnationWindowRate | 0 | 0 | 0 | n/a |
| summaries.easy.metrics.stalemateDrawShare | 0 | 0 | 0 | n/a |
| summaries.easy.metrics.tension | 0 | 0 | 0 | n/a |
| summaries.easy.metrics.threefoldDrawShare | 0 | 0 | 0 | n/a |
| summaries.easy.metrics.twoPlyUndoRate | 0 | 0 | 0 | n/a |
| summaries.easy.metrics.uniqueOpeningLineShare | 0.5 | 0.5 | 0 | 0% |
| summaries.easy.samples.firstFourActionKindDistribution.climbOne | 2 | 2 | 0 | 0% |
| summaries.easy.samples.firstFourActionKindDistribution.jumpSequence | 6 | 6 | 0 | 0% |
| summaries.easy.samples.firstFourTagDistribution.advanceMass | 8 | 8 | 0 | 0% |
| summaries.easy.samples.firstFourTagDistribution.captureControl | 2 | 2 | 0 | 0% |
| summaries.easy.samples.firstFourTagDistribution.freezeBlock | 2 | 2 | 0 | 0% |
| summaries.easy.samples.firstFourTagDistribution.openLane | 8 | 8 | 0 | 0% |
| summaries.easy.samples.firstMoveDistribution.climbOne:A3:A4 | 2 | 2 | 0 | 0% |
| summaries.easy.samples.firstMoveSourceFamilyDistribution.white-13 | 2 | 2 | 0 | 0% |
| summaries.easy.samples.firstTenLineDistribution.climbOne:A3:A4 | jumpSequence:C5:A3 | jumpSequence:E3:C5 | jumpSequence:E5:E3 | jumpSequence:C3:E5 | jumpSequence:A5:C3 | jumpSequence:C5:A5 | climbOne:E4:D3 | jumpSequence:E2:E4 | manualUnfreeze:E3 | 2 | 2 | 0 | 0% |
| summaries.easy.samples.strategicIntentDistribution.home | 6 | 6 | 0 | 0% |
| summaries.easy.samples.strategicIntentDistribution.hybrid | 16 | 16 | 0 | 0% |
| summaries.easy.samples.strategicIntentDistribution.sixStack | 2 | 2 | 0 | 0% |
| summaries.easy.samples.terminalDistribution.homeField | 0 | 0 | 0 | n/a |
| summaries.easy.samples.terminalDistribution.sixStacks | 0 | 0 | 0 | n/a |
| summaries.easy.samples.terminalDistribution.stalemateDraw | 0 | 0 | 0 | n/a |
| summaries.easy.samples.terminalDistribution.stalemateTiebreakWin | 0 | 0 | 0 | n/a |
| summaries.easy.samples.terminalDistribution.threefoldDraw | 0 | 0 | 0 | n/a |
| summaries.easy.samples.terminalDistribution.threefoldTiebreakWin | 0 | 0 | 0 | n/a |
| summaries.easy.samples.terminalDistribution.unfinished | 2 | 2 | 0 | 0% |
| summaries.hard.gameCount | 2 | 2 | 0 | 0% |
| summaries.hard.games.averagePlies | 12 | 12 | 0 | 0% |
| summaries.hard.games.terminalCounts.homeField | 0 | 0 | 0 | n/a |
| summaries.hard.games.terminalCounts.sixStacks | 0 | 0 | 0 | n/a |
| summaries.hard.games.terminalCounts.stalemateDraw | 0 | 0 | 0 | n/a |
| summaries.hard.games.terminalCounts.stalemateTiebreakWin | 0 | 0 | 0 | n/a |
| summaries.hard.games.terminalCounts.threefoldDraw | 0 | 0 | 0 | n/a |
| summaries.hard.games.terminalCounts.threefoldTiebreakWin | 0 | 0 | 0 | n/a |
| summaries.hard.games.terminalCounts.unfinished | 2 | 2 | 0 | 0% |
| summaries.hard.metadata.gameCount | 2 | 2 | 0 | 0% |
| summaries.hard.metadata.maxTurns | 12 | 12 | 0 | 0% |
| summaries.hard.metadata.mirrorPairCount | 1 | 1 | 0 | 0% |
| summaries.hard.metadata.stableCalls | 12 | 12 | 0 | 0% |
| summaries.hard.metrics.behaviorSpaceCoverage | 0.002976 | 0.002976 | 0 | 0% |
| summaries.hard.metrics.compositeInterestingness | 0.031623 | 0.031623 | 0 | 0% |
| summaries.hard.metrics.decisiveResultShare | 0 | 0 | 0 | n/a |
| summaries.hard.metrics.decompressionSlope | 0 | 0 | 0 | n/a |
| summaries.hard.metrics.drama | 2 | 2 | 0 | 0% |
| summaries.hard.metrics.firstFourActionKindEntropy | 0.811278 | 0.811278 | 0 | 0% |
| summaries.hard.metrics.firstFourTagEntropy | 1.721928 | 1.721928 | 0 | 0% |
| summaries.hard.metrics.frozenCountChurn | 0.016204 | 0.016204 | 0 | 0% |
| summaries.hard.metrics.gameRefinement | 0 | 0 | 0 | n/a |
| summaries.hard.metrics.homeProgressAuc | 0.125 | 0.125 | 0 | 0% |
| summaries.hard.metrics.intentSwitchRate | 0.727273 | 0.727273 | 0 | 0% |
| summaries.hard.metrics.lateSuspense | 0 | 0 | 0 | n/a |
| summaries.hard.metrics.leadChangeRate | 1 | 1 | 0 | 0% |
| summaries.hard.metrics.maxRepeatedStateRun | 0 | 0 | 0 | n/a |
| summaries.hard.metrics.meanBoardDisplacement | 0.064815 | 0.064815 | 0 | 0% |
| summaries.hard.metrics.mobilityReleaseSlope | 0.036905 | 0.036905 | 0 | 0% |
| summaries.hard.metrics.normalizedLempelZiv | 8.962406 | 8.962406 | 0 | 0% |
| summaries.hard.metrics.noveltyScore | 0.065271 | 0.065271 | 0 | 0% |
| summaries.hard.metrics.openingEntropy | 0 | 0 | 0 | n/a |
| summaries.hard.metrics.openingJsDivergence | 0.448818 | 0.448818 | 0 | 0% |
| summaries.hard.metrics.openingSimpsonDiversity | 0 | 0 | 0 | n/a |
| summaries.hard.metrics.repetitionPlyShare | 0 | 0 | 0 | n/a |
| summaries.hard.metrics.sameFamilyQuietRepeatRate | 0 | 0 | 0 | n/a |
| summaries.hard.metrics.sixStackProgressAuc | 0 | 0 | 0 | n/a |
| summaries.hard.metrics.sourceFamilyOpeningHhi | 0.277778 | 0.277778 | 0 | 0% |
| summaries.hard.metrics.stackProfileChurn | 0.009259 | 0.009259 | 0 | 0% |
| summaries.hard.metrics.stagnationWindowRate | 0 | 0 | 0 | n/a |
| summaries.hard.metrics.stalemateDrawShare | 0 | 0 | 0 | n/a |
| summaries.hard.metrics.tension | 0 | 0 | 0 | n/a |
| summaries.hard.metrics.threefoldDrawShare | 0 | 0 | 0 | n/a |
| summaries.hard.metrics.twoPlyUndoRate | 0 | 0 | 0 | n/a |
| summaries.hard.metrics.uniqueOpeningLineShare | 0.5 | 0.5 | 0 | 0% |
| summaries.hard.samples.firstFourActionKindDistribution.climbOne | 2 | 2 | 0 | 0% |
| summaries.hard.samples.firstFourActionKindDistribution.jumpSequence | 6 | 6 | 0 | 0% |
| summaries.hard.samples.firstFourTagDistribution.advanceMass | 8 | 8 | 0 | 0% |
| summaries.hard.samples.firstFourTagDistribution.captureControl | 2 | 2 | 0 | 0% |
| summaries.hard.samples.firstFourTagDistribution.freezeBlock | 2 | 2 | 0 | 0% |
| summaries.hard.samples.firstFourTagDistribution.openLane | 8 | 8 | 0 | 0% |
| summaries.hard.samples.firstMoveDistribution.climbOne:A3:A4 | 2 | 2 | 0 | 0% |
| summaries.hard.samples.firstMoveSourceFamilyDistribution.white-13 | 2 | 2 | 0 | 0% |
| summaries.hard.samples.firstTenLineDistribution.climbOne:A3:A4 | jumpSequence:C5:A3 | jumpSequence:E3:C5 | jumpSequence:E5:E3 | jumpSequence:C3:E5 | jumpSequence:A5:C3 | jumpSequence:C5:A5 | climbOne:E4:D3 | jumpSequence:E2:E4 | manualUnfreeze:E3 | 2 | 2 | 0 | 0% |
| summaries.hard.samples.strategicIntentDistribution.home | 6 | 6 | 0 | 0% |
| summaries.hard.samples.strategicIntentDistribution.hybrid | 16 | 16 | 0 | 0% |
| summaries.hard.samples.strategicIntentDistribution.sixStack | 2 | 2 | 0 | 0% |
| summaries.hard.samples.terminalDistribution.homeField | 0 | 0 | 0 | n/a |
| summaries.hard.samples.terminalDistribution.sixStacks | 0 | 0 | 0 | n/a |
| summaries.hard.samples.terminalDistribution.stalemateDraw | 0 | 0 | 0 | n/a |
| summaries.hard.samples.terminalDistribution.stalemateTiebreakWin | 0 | 0 | 0 | n/a |
| summaries.hard.samples.terminalDistribution.threefoldDraw | 0 | 0 | 0 | n/a |
| summaries.hard.samples.terminalDistribution.threefoldTiebreakWin | 0 | 0 | 0 | n/a |
| summaries.hard.samples.terminalDistribution.unfinished | 2 | 2 | 0 | 0% |
| summaries.medium.gameCount | 2 | 2 | 0 | 0% |
| summaries.medium.games.averagePlies | 12 | 12 | 0 | 0% |
| summaries.medium.games.terminalCounts.homeField | 0 | 0 | 0 | n/a |
| summaries.medium.games.terminalCounts.sixStacks | 0 | 0 | 0 | n/a |
| summaries.medium.games.terminalCounts.stalemateDraw | 0 | 0 | 0 | n/a |
| summaries.medium.games.terminalCounts.stalemateTiebreakWin | 0 | 0 | 0 | n/a |
| summaries.medium.games.terminalCounts.threefoldDraw | 0 | 0 | 0 | n/a |
| summaries.medium.games.terminalCounts.threefoldTiebreakWin | 0 | 0 | 0 | n/a |
| summaries.medium.games.terminalCounts.unfinished | 2 | 2 | 0 | 0% |
| summaries.medium.metadata.gameCount | 2 | 2 | 0 | 0% |
| summaries.medium.metadata.maxTurns | 12 | 12 | 0 | 0% |
| summaries.medium.metadata.mirrorPairCount | 1 | 1 | 0 | 0% |
| summaries.medium.metadata.stableCalls | 10 | 10 | 0 | 0% |
| summaries.medium.metrics.behaviorSpaceCoverage | 0.002976 | 0.002976 | 0 | 0% |
| summaries.medium.metrics.compositeInterestingness | 0.031623 | 0.031623 | 0 | 0% |
| summaries.medium.metrics.decisiveResultShare | 0 | 0 | 0 | n/a |
| summaries.medium.metrics.decompressionSlope | 0 | 0 | 0 | n/a |
| summaries.medium.metrics.drama | 2 | 2 | 0 | 0% |
| summaries.medium.metrics.firstFourActionKindEntropy | 0.811278 | 0.811278 | 0 | 0% |
| summaries.medium.metrics.firstFourTagEntropy | 1.721928 | 1.721928 | 0 | 0% |
| summaries.medium.metrics.frozenCountChurn | 0.016204 | 0.016204 | 0 | 0% |
| summaries.medium.metrics.gameRefinement | 0 | 0 | 0 | n/a |
| summaries.medium.metrics.homeProgressAuc | 0.125 | 0.125 | 0 | 0% |
| summaries.medium.metrics.intentSwitchRate | 0.727273 | 0.727273 | 0 | 0% |
| summaries.medium.metrics.lateSuspense | 0 | 0 | 0 | n/a |
| summaries.medium.metrics.leadChangeRate | 1 | 1 | 0 | 0% |
| summaries.medium.metrics.maxRepeatedStateRun | 0 | 0 | 0 | n/a |
| summaries.medium.metrics.meanBoardDisplacement | 0.064815 | 0.064815 | 0 | 0% |
| summaries.medium.metrics.mobilityReleaseSlope | 0.036905 | 0.036905 | 0 | 0% |
| summaries.medium.metrics.normalizedLempelZiv | 8.962406 | 8.962406 | 0 | 0% |
| summaries.medium.metrics.noveltyScore | 0.065271 | 0.065271 | 0 | 0% |
| summaries.medium.metrics.openingEntropy | 0 | 0 | 0 | n/a |
| summaries.medium.metrics.openingJsDivergence | 0.448818 | 0.448818 | 0 | 0% |
| summaries.medium.metrics.openingSimpsonDiversity | 0 | 0 | 0 | n/a |
| summaries.medium.metrics.repetitionPlyShare | 0 | 0 | 0 | n/a |
| summaries.medium.metrics.sameFamilyQuietRepeatRate | 0 | 0 | 0 | n/a |
| summaries.medium.metrics.sixStackProgressAuc | 0 | 0 | 0 | n/a |
| summaries.medium.metrics.sourceFamilyOpeningHhi | 0.277778 | 0.277778 | 0 | 0% |
| summaries.medium.metrics.stackProfileChurn | 0.009259 | 0.009259 | 0 | 0% |
| summaries.medium.metrics.stagnationWindowRate | 0 | 0 | 0 | n/a |
| summaries.medium.metrics.stalemateDrawShare | 0 | 0 | 0 | n/a |
| summaries.medium.metrics.tension | 0 | 0 | 0 | n/a |
| summaries.medium.metrics.threefoldDrawShare | 0 | 0 | 0 | n/a |
| summaries.medium.metrics.twoPlyUndoRate | 0 | 0 | 0 | n/a |
| summaries.medium.metrics.uniqueOpeningLineShare | 0.5 | 0.5 | 0 | 0% |
| summaries.medium.samples.firstFourActionKindDistribution.climbOne | 2 | 2 | 0 | 0% |
| summaries.medium.samples.firstFourActionKindDistribution.jumpSequence | 6 | 6 | 0 | 0% |
| summaries.medium.samples.firstFourTagDistribution.advanceMass | 8 | 8 | 0 | 0% |
| summaries.medium.samples.firstFourTagDistribution.captureControl | 2 | 2 | 0 | 0% |
| summaries.medium.samples.firstFourTagDistribution.freezeBlock | 2 | 2 | 0 | 0% |
| summaries.medium.samples.firstFourTagDistribution.openLane | 8 | 8 | 0 | 0% |
| summaries.medium.samples.firstMoveDistribution.climbOne:A3:A4 | 2 | 2 | 0 | 0% |
| summaries.medium.samples.firstMoveSourceFamilyDistribution.white-13 | 2 | 2 | 0 | 0% |
| summaries.medium.samples.firstTenLineDistribution.climbOne:A3:A4 | jumpSequence:C5:A3 | jumpSequence:E3:C5 | jumpSequence:E5:E3 | jumpSequence:C3:E5 | jumpSequence:A5:C3 | jumpSequence:C5:A5 | climbOne:E4:D3 | jumpSequence:E2:E4 | manualUnfreeze:E3 | 2 | 2 | 0 | 0% |
| summaries.medium.samples.strategicIntentDistribution.home | 6 | 6 | 0 | 0% |
| summaries.medium.samples.strategicIntentDistribution.hybrid | 16 | 16 | 0 | 0% |
| summaries.medium.samples.strategicIntentDistribution.sixStack | 2 | 2 | 0 | 0% |
| summaries.medium.samples.terminalDistribution.homeField | 0 | 0 | 0 | n/a |
| summaries.medium.samples.terminalDistribution.sixStacks | 0 | 0 | 0 | n/a |
| summaries.medium.samples.terminalDistribution.stalemateDraw | 0 | 0 | 0 | n/a |
| summaries.medium.samples.terminalDistribution.stalemateTiebreakWin | 0 | 0 | 0 | n/a |
| summaries.medium.samples.terminalDistribution.threefoldDraw | 0 | 0 | 0 | n/a |
| summaries.medium.samples.terminalDistribution.threefoldTiebreakWin | 0 | 0 | 0 | n/a |
| summaries.medium.samples.terminalDistribution.unfinished | 2 | 2 | 0 | 0% |
| targetBandVersion | 1 | 1 | 0 | 0% |
