# AI Variety Comparison

Generated: 2026-08-09T17:12:57.684Z

This file is a generated comparison artifact between two JSON report snapshots.
- Before: `69872da` (../../../../../var/folders/3v/x1mcnkjx34v_q3qbx98mhd_40000gn/T/youi-report-compare-BGEye1/output/ai/ai-variety-report.json)
- After: `working-tree` (output/ai/ai-variety-report.json)
- `delta` is `after - before`.
- `delta%` is relative to the absolute `before` value when `before != 0`; otherwise it is `n/a`.
- Improvement direction is metric-specific; use the target bands and AI variety semantics from `src/ai/test/metrics.ts`.

## Summary
- Numeric metrics compared: 248
- Top absolute changes surfaced below: 10

## Largest Changes
- `summaries.medium.samples.strategicIntentDistribution.home`: 967 -> 2639 (+1672, +172.91%)
- `summaries.hard.samples.strategicIntentDistribution.home`: 1437 -> 3018 (+1581, +110.02%)
- `summaries.hard.samples.strategicIntentDistribution.hybrid`: 2014 -> 192 (-1822, -90.47%)
- `summaries.medium.samples.strategicIntentDistribution.hybrid`: 2014 -> 192 (-1822, -90.47%)
- `summaries.easy.samples.strategicIntentDistribution.hybrid`: 1955 -> 192 (-1763, -90.18%)
- `summaries.easy.samples.strategicIntentDistribution.home`: 1551 -> 2905 (+1354, +87.3%)
- `summaries.hard.metrics.intentSwitchRate`: 0.199119 -> 0.036258 (-0.16286099999999998, -81.79%)
- `summaries.easy.metrics.intentSwitchRate`: 0.241587 -> 0.047476 (-0.194111, -80.35%)
- `summaries.medium.metrics.intentSwitchRate`: 0.192508 -> 0.047877 (-0.144631, -75.13%)
- `summaries.easy.samples.firstTenLineDistribution.climbOne:C3:B4 | jumpSequence:C5:C3 | jumpSequence:E3:C5 | jumpSequence:E5:E3 | jumpSequence:C5:E5 | climbOne:F4:F3 | jumpSequence:D2:F4 | jumpSequence:A5:C5 | jumpSequence:A3:A5 | jumpSequence:C3:A3`: 3 -> 4 (+1, +33.33%)

## Full Comparison
| metric | before | after | delta | delta% |
| --- | ---: | ---: | ---: | ---: |
| summaries.medium.samples.strategicIntentDistribution.home | 967 | 2639 | +1672 | +172.91% |
| summaries.hard.samples.strategicIntentDistribution.home | 1437 | 3018 | +1581 | +110.02% |
| summaries.hard.samples.strategicIntentDistribution.hybrid | 2014 | 192 | -1822 | -90.47% |
| summaries.medium.samples.strategicIntentDistribution.hybrid | 2014 | 192 | -1822 | -90.47% |
| summaries.easy.samples.strategicIntentDistribution.hybrid | 1955 | 192 | -1763 | -90.18% |
| summaries.easy.samples.strategicIntentDistribution.home | 1551 | 2905 | +1354 | +87.3% |
| summaries.hard.metrics.intentSwitchRate | 0.199119 | 0.036258 | -0.16286099999999998 | -81.79% |
| summaries.easy.metrics.intentSwitchRate | 0.241587 | 0.047476 | -0.194111 | -80.35% |
| summaries.medium.metrics.intentSwitchRate | 0.192508 | 0.047877 | -0.144631 | -75.13% |
| summaries.easy.samples.firstTenLineDistribution.climbOne:C3:B4 | jumpSequence:C5:C3 | jumpSequence:E3:C5 | jumpSequence:E5:E3 | jumpSequence:C5:E5 | climbOne:F4:F3 | jumpSequence:D2:F4 | jumpSequence:A5:C5 | jumpSequence:A3:A5 | jumpSequence:C3:A3 | 3 | 4 | +1 | +33.33% |
| summaries.hard.samples.firstTenLineDistribution.climbOne:C3:B4 | jumpSequence:E5:C3 | jumpSequence:E3:E5 | jumpSequence:C5:E3 | jumpSequence:E5:C5 | jumpSequence:E3:E5 | jumpSequence:C1:E3 | jumpSequence:C3:C1 | climbOne:C5:C6 | jumpSequence:E5:C3 | 10 | 13 | +3 | +30% |
| summaries.hard.samples.firstTenLineDistribution.climbOne:C3:B4 | jumpSequence:E5:C3 | jumpSequence:E3:E5 | jumpSequence:C5:E3 | jumpSequence:E5:C5 | jumpSequence:E3:E5 | jumpSequence:C1:E3 | jumpSequence:C3:C1 | climbOne:C5:D6 | jumpSequence:E5:C3 | 7 | 9 | +2 | +28.57% |
| summaries.easy.samples.strategicIntentDistribution.sixStack | 1614 | 2023 | +409 | +25.34% |
| summaries.hard.samples.firstTenLineDistribution.climbOne:C3:B4 | jumpSequence:E5:C3 | jumpSequence:E3:E5 | jumpSequence:C5:E3 | jumpSequence:E5:C5 | jumpSequence:E3:E5 | jumpSequence:C1:E3 | jumpSequence:C3:C1 | climbOne:C5:B6 | jumpSequence:E5:C3 | 25 | 20 | -5 | -20% |
| summaries.hard.metrics.twoPlyUndoRate | 0.046289 | 0.05332 | +0.0070310000000000025 | +15.19% |
| summaries.hard.samples.strategicIntentDistribution.sixStack | 1669 | 1910 | +241 | +14.44% |
| summaries.easy.metrics.noveltyScore | 0.131877 | 0.149981 | +0.01810400000000001 | +13.73% |
| summaries.easy.metrics.uniqueOpeningLineShare | 0.140625 | 0.125 | -0.015625 | -11.11% |
| regressions.hard.0.current | 0.048223 | 0.044665 | -0.0035579999999999987 | -7.38% |
| summaries.hard.metrics.sameFamilyQuietRepeatRate | 0.048223 | 0.044665 | -0.0035579999999999987 | -7.38% |
| summaries.medium.samples.strategicIntentDistribution.sixStack | 2139 | 2289 | +150 | +7.01% |
| summaries.medium.metrics.noveltyScore | 0.090063 | 0.08425 | -0.005812999999999999 | -6.45% |
| summaries.hard.metrics.noveltyScore | 0.049467 | 0.052511 | +0.003044000000000005 | +6.15% |
| summaries.hard.metrics.repetitionPlyShare | 0.006836 | 0.006445 | -0.00039099999999999985 | -5.72% |
| summaries.medium.metrics.repetitionPlyShare | 0.004297 | 0.004492 | +0.00019500000000000073 | +4.54% |
| summaries.hard.metrics.sixStackProgressAuc | 0.203809 | 0.210775 | +0.006966 | +3.42% |
| summaries.easy.metrics.sameFamilyQuietRepeatRate | 0.004914 | 0.004773 | -0.00014099999999999963 | -2.87% |
| regressions.hard.5.current | 0.283203 | 0.291016 | +0.007813000000000014 | +2.76% |
| summaries.hard.metrics.positiveParticipationPlyShare | 0.283203 | 0.291016 | +0.007813000000000014 | +2.76% |
| summaries.hard.metrics.drama | 1.132911 | 1.162184 | +0.029273000000000104 | +2.58% |
| summaries.hard.metrics.leadChangeRate | 0.566456 | 0.581092 | +0.014636000000000093 | +2.58% |
| summaries.hard.metrics.stackProfileChurn | 0.005143 | 0.005263 | +0.00012000000000000031 | +2.33% |
| summaries.hard.metrics.stagnationWindowRate | 0.505625 | 0.494167 | -0.011457999999999968 | -2.27% |
| summaries.hard.metrics.meanParticipationDelta | 102.171484 | 104.446289 | +2.2748049999999864 | +2.23% |
| regressions.medium.0.current | 0.065957 | 0.064516 | -0.0014409999999999978 | -2.18% |
| summaries.medium.metrics.sameFamilyQuietRepeatRate | 0.065957 | 0.064516 | -0.0014409999999999978 | -2.18% |
| summaries.easy.metrics.homeProgressAuc | 0.186252 | 0.182259 | -0.0039929999999999966 | -2.14% |
| summaries.easy.metrics.stackProfileChurn | 0.006142 | 0.006272 | +0.0001299999999999999 | +2.12% |
| regressions.medium.2.current | 0.0875 | 0.089258 | +0.0017580000000000096 | +2.01% |
| summaries.medium.metrics.twoPlyUndoRate | 0.0875 | 0.089258 | +0.0017580000000000096 | +2.01% |
| summaries.easy.metrics.sixStackProgressAuc | 0.177897 | 0.18125 | +0.003352999999999995 | +1.88% |
| summaries.medium.metrics.meanParticipationDelta | 72.509961 | 71.700391 | -0.8095700000000079 | -1.12% |
| summaries.hard.metrics.frozenCountChurn | 0.019314 | 0.019103 | -0.00021100000000000285 | -1.09% |
| summaries.easy.metrics.stagnationWindowRate | 0.39625 | 0.392083 | -0.004166999999999976 | -1.05% |
| summaries.hard.metrics.normalizedLempelZiv | 0.986566 | 0.99521 | +0.008643999999999985 | +0.88% |
| summaries.easy.metrics.positiveParticipationPlyShare | 0.406836 | 0.40332 | -0.0035159999999999636 | -0.86% |
| summaries.medium.metrics.stackProfileChurn | 0.007368 | 0.007313 | -0.00005500000000000036 | -0.75% |
| regressions.hard.1.current | 0.416748 | 0.414063 | -0.002684999999999993 | -0.64% |
| summaries.hard.metrics.sourceFamilyOpeningHhi | 0.416748 | 0.414063 | -0.002684999999999993 | -0.64% |
| summaries.hard.metrics.homeProgressAuc | 0.136057 | 0.136903 | +0.0008459999999999857 | +0.62% |
| regressions.easy.0.current | 0.373047 | 0.375244 | +0.0021970000000000045 | +0.59% |
| summaries.easy.metrics.sourceFamilyOpeningHhi | 0.373047 | 0.375244 | +0.0021970000000000045 | +0.59% |
| summaries.easy.metrics.frozenCountChurn | 0.018539 | 0.018636 | +0.00009699999999999986 | +0.52% |
| summaries.easy.metrics.normalizedLempelZiv | 1.047069 | 1.052008 | +0.004939000000000027 | +0.47% |
| summaries.medium.metrics.frozenCountChurn | 0.018408 | 0.018332 | -0.00007599999999999968 | -0.41% |
| summaries.easy.metrics.drama | 1.445411 | 1.439873 | -0.005538000000000043 | -0.38% |
| summaries.easy.metrics.leadChangeRate | 0.722706 | 0.719937 | -0.0027689999999999104 | -0.38% |
| summaries.easy.metrics.twoPlyUndoRate | 0.060547 | 0.060742 | +0.00019500000000000073 | +0.32% |
| summaries.hard.metrics.meanBoardDisplacement | 0.07487 | 0.074658 | -0.00021200000000000385 | -0.28% |
| regressions.medium.6.current | 0.333008 | 0.332227 | -0.0007810000000000317 | -0.23% |
| summaries.medium.metrics.positiveParticipationPlyShare | 0.333008 | 0.332227 | -0.0007810000000000317 | -0.23% |
| summaries.medium.metrics.sixStackProgressAuc | 0.21224 | 0.211816 | -0.0004240000000000077 | -0.2% |
| summaries.medium.metrics.leadChangeRate | 0.664161 | 0.665348 | +0.0011870000000000491 | +0.18% |
| summaries.medium.metrics.drama | 1.328323 | 1.330696 | +0.0023730000000001805 | +0.18% |
| summaries.easy.metrics.meanParticipationDelta | 35.301758 | 35.25332 | -0.04843799999999732 | -0.14% |
| summaries.easy.metrics.meanBoardDisplacement | 0.074094 | 0.074192 | +0.00009800000000000086 | +0.13% |
| summaries.medium.metrics.meanBoardDisplacement | 0.073964 | 0.073888 | -0.00007600000000000662 | -0.1% |
| summaries.medium.metrics.homeProgressAuc | 0.149599 | 0.149523 | -0.0000760000000000205 | -0.05% |
| summaries.medium.metrics.stagnationWindowRate | 0.409583 | 0.409375 | -0.00020799999999998597 | -0.05% |
| baselineVersion | 2 | 2 | 0 | 0% |
| regressions.easy.0.threshold | 0.327369 | 0.327369 | 0 | 0% |
| regressions.easy.1.current | -0.0141 | -0.0141 | 0 | 0% |
| regressions.easy.1.threshold | 0.013777 | 0.013777 | 0 | 0% |
| regressions.easy.2.current | 0 | 0 | 0 | n/a |
| regressions.easy.2.threshold | 1.42615 | 1.42615 | 0 | 0% |
| regressions.easy.3.current | 0 | 0 | 0 | n/a |
| regressions.easy.3.threshold | 0.599853 | 0.599853 | 0 | 0% |
| regressions.hard.0.threshold | 0.000001 | 0.000001 | 0 | 0% |
| regressions.hard.1.threshold | 0.335158 | 0.335158 | 0 | 0% |
| regressions.hard.2.current | -0.000893 | -0.000893 | 0 | 0% |
| regressions.hard.2.threshold | 0.013275 | 0.013275 | 0 | 0% |
| regressions.hard.3.current | 0 | 0 | 0 | n/a |
| regressions.hard.3.threshold | 1.42615 | 1.42615 | 0 | 0% |
| regressions.hard.4.current | 0 | 0 | 0 | n/a |
| regressions.hard.4.threshold | 0.599853 | 0.599853 | 0 | 0% |
| regressions.hard.5.threshold | 0.362284 | 0.362284 | 0 | 0% |
| regressions.medium.0.threshold | 0.011958 | 0.011958 | 0 | 0% |
| regressions.medium.1.current | 0.380859 | 0.380859 | 0 | 0% |
| regressions.medium.1.threshold | 0.335963 | 0.335963 | 0 | 0% |
| regressions.medium.2.threshold | 0.066836 | 0.066836 | 0 | 0% |
| regressions.medium.3.current | -0.015774 | -0.015774 | 0 | 0% |
| regressions.medium.3.threshold | 0.01679 | 0.01679 | 0 | 0% |
| regressions.medium.4.current | 0 | 0 | 0 | n/a |
| regressions.medium.4.threshold | 1.42615 | 1.42615 | 0 | 0% |
| regressions.medium.5.current | 0 | 0 | 0 | n/a |
| regressions.medium.5.threshold | 0.599853 | 0.599853 | 0 | 0% |
| regressions.medium.6.threshold | 0.354901 | 0.354901 | 0 | 0% |
| settings.maxTurns | 80 | 80 | 0 | 0% |
| settings.pairCount | 32 | 32 | 0 | 0% |
| summaries.easy.gameCount | 64 | 64 | 0 | 0% |
| summaries.easy.games.averagePlies | 80 | 80 | 0 | 0% |
| summaries.easy.games.terminalCounts.homeField | 0 | 0 | 0 | n/a |
| summaries.easy.games.terminalCounts.sixStacks | 0 | 0 | 0 | n/a |
| summaries.easy.games.terminalCounts.stalemateDraw | 0 | 0 | 0 | n/a |
| summaries.easy.games.terminalCounts.stalemateTiebreakWin | 0 | 0 | 0 | n/a |
| summaries.easy.games.terminalCounts.threefoldDraw | 0 | 0 | 0 | n/a |
| summaries.easy.games.terminalCounts.threefoldTiebreakWin | 0 | 0 | 0 | n/a |
| summaries.easy.games.terminalCounts.unfinished | 64 | 64 | 0 | 0% |
| summaries.easy.metadata.gameCount | 64 | 64 | 0 | 0% |
| summaries.easy.metadata.maxTurns | 80 | 80 | 0 | 0% |
| summaries.easy.metadata.mirrorPairCount | 32 | 32 | 0 | 0% |
| summaries.easy.metadata.stableCalls | 8 | 8 | 0 | 0% |
| summaries.easy.metrics.behaviorSpaceCoverage | 0.005952 | 0.005952 | 0 | 0% |
| summaries.easy.metrics.compositeInterestingness | 0.019821 | 0.019821 | 0 | 0% |
| summaries.easy.metrics.decisiveResultShare | 0 | 0 | 0 | n/a |
| summaries.easy.metrics.decompressionSlope | 0.002542 | 0.002542 | 0 | 0% |
| summaries.easy.metrics.firstFourActionKindEntropy | 0.811278 | 0.811278 | 0 | 0% |
| summaries.easy.metrics.firstFourTagEntropy | 1.721928 | 1.721928 | 0 | 0% |
| summaries.easy.metrics.gameRefinement | 0 | 0 | 0 | n/a |
| summaries.easy.metrics.lateSuspense | 0 | 0 | 0 | n/a |
| summaries.easy.metrics.maxRepeatedStateRun | 1 | 1 | 0 | 0% |
| summaries.easy.metrics.mobilityReleaseSlope | -0.0141 | -0.0141 | 0 | 0% |
| summaries.easy.metrics.openingEntropy | 0 | 0 | 0 | n/a |
| summaries.easy.metrics.openingJsDivergence | 0.464378 | 0.464378 | 0 | 0% |
| summaries.easy.metrics.openingSimpsonDiversity | 0 | 0 | 0 | n/a |
| summaries.easy.metrics.repetitionPlyShare | 0.003711 | 0.003711 | 0 | 0% |
| summaries.easy.metrics.stalemateDrawShare | 0 | 0 | 0 | n/a |
| summaries.easy.metrics.tension | 0 | 0 | 0 | n/a |
| summaries.easy.metrics.threefoldDrawShare | 0 | 0 | 0 | n/a |
| summaries.easy.samples.firstFourActionKindDistribution.climbOne | 64 | 64 | 0 | 0% |
| summaries.easy.samples.firstFourActionKindDistribution.jumpSequence | 192 | 192 | 0 | 0% |
| summaries.easy.samples.firstFourTagDistribution.advanceMass | 256 | 256 | 0 | 0% |
| summaries.easy.samples.firstFourTagDistribution.captureControl | 64 | 64 | 0 | 0% |
| summaries.easy.samples.firstFourTagDistribution.freezeBlock | 64 | 64 | 0 | 0% |
| summaries.easy.samples.firstFourTagDistribution.openLane | 256 | 256 | 0 | 0% |
| summaries.easy.samples.firstMoveDistribution.climbOne:C3:B4 | 64 | 64 | 0 | 0% |
| summaries.easy.samples.firstMoveSourceFamilyDistribution.white-15 | 64 | 64 | 0 | 0% |
| summaries.easy.samples.firstTenLineDistribution.climbOne:C3:B4 | jumpSequence:C5:C3 | jumpSequence:E3:C5 | jumpSequence:E5:E3 | jumpSequence:C5:E5 | climbOne:E4:D3 | jumpSequence:E2:E4 | jumpSequence:A5:C5 | jumpSequence:A3:A5 | jumpSequence:C3:A3 | 35 | 35 | 0 | 0% |
| summaries.easy.samples.firstTenLineDistribution.climbOne:C3:B4 | jumpSequence:C5:C3 | jumpSequence:E3:C5 | jumpSequence:E5:E3 | jumpSequence:C5:E5 | climbOne:F4:F3 | jumpSequence:D2:F4 | jumpSequence:C3:C5 | jumpSequence:C1:C3 | climbOne:C4:C3 | 1 | 1 | 0 | 0% |
| summaries.easy.samples.firstTenLineDistribution.climbOne:C3:B4 | jumpSequence:C5:C3 | jumpSequence:E3:C5 | jumpSequence:E5:E3 | jumpSequence:C5:E5 | jumpSequence:E3:C5 | jumpSequence:C1:E3 | jumpSequence:C3:C1 | climbOne:E5:D6 | jumpSequence:C5:C3 | 2 | 2 | 0 | 0% |
| summaries.easy.samples.firstTenLineDistribution.climbOne:C3:B4 | jumpSequence:E5:C3 | jumpSequence:E3:E5 | jumpSequence:C5:E3 | jumpSequence:E5:C5 | climbOne:C4:B3 | jumpSequence:C2:C4 | jumpSequence:E3:E5 | climbOne:C5:B6 | jumpSequence:E4:C2 | 1 | 1 | 0 | 0% |
| summaries.easy.samples.firstTenLineDistribution.climbOne:C3:B4 | jumpSequence:E5:C3 | jumpSequence:E3:E5 | jumpSequence:C5:E3 | jumpSequence:E5:C5 | jumpSequence:E3:E5 | jumpSequence:C1:E3 | jumpSequence:C3:C1 | climbOne:C5:B6 | jumpSequence:E5:C3 | 7 | 7 | 0 | 0% |
| summaries.easy.samples.firstTenLineDistribution.climbOne:C3:B4 | jumpSequence:E5:C3 | jumpSequence:E3:E5 | jumpSequence:C5:E3 | jumpSequence:E5:C5 | jumpSequence:E3:E5 | jumpSequence:C1:E3 | jumpSequence:C3:C1 | climbOne:C5:C6 | jumpSequence:E5:C3 | 7 | 7 | 0 | 0% |
| summaries.easy.samples.firstTenLineDistribution.climbOne:C3:B4 | jumpSequence:E5:C3 | jumpSequence:E3:E5 | jumpSequence:C5:E3 | jumpSequence:E5:C5 | jumpSequence:E3:E5 | jumpSequence:C1:E3 | jumpSequence:C3:C1 | climbOne:C5:D6 | jumpSequence:E5:C3 | 7 | 7 | 0 | 0% |
| summaries.easy.samples.terminalDistribution.homeField | 0 | 0 | 0 | n/a |
| summaries.easy.samples.terminalDistribution.sixStacks | 0 | 0 | 0 | n/a |
| summaries.easy.samples.terminalDistribution.stalemateDraw | 0 | 0 | 0 | n/a |
| summaries.easy.samples.terminalDistribution.stalemateTiebreakWin | 0 | 0 | 0 | n/a |
| summaries.easy.samples.terminalDistribution.threefoldDraw | 0 | 0 | 0 | n/a |
| summaries.easy.samples.terminalDistribution.threefoldTiebreakWin | 0 | 0 | 0 | n/a |
| summaries.easy.samples.terminalDistribution.unfinished | 64 | 64 | 0 | 0% |
| summaries.hard.gameCount | 64 | 64 | 0 | 0% |
| summaries.hard.games.averagePlies | 80 | 80 | 0 | 0% |
| summaries.hard.games.terminalCounts.homeField | 0 | 0 | 0 | n/a |
| summaries.hard.games.terminalCounts.sixStacks | 0 | 0 | 0 | n/a |
| summaries.hard.games.terminalCounts.stalemateDraw | 0 | 0 | 0 | n/a |
| summaries.hard.games.terminalCounts.stalemateTiebreakWin | 0 | 0 | 0 | n/a |
| summaries.hard.games.terminalCounts.threefoldDraw | 0 | 0 | 0 | n/a |
| summaries.hard.games.terminalCounts.threefoldTiebreakWin | 0 | 0 | 0 | n/a |
| summaries.hard.games.terminalCounts.unfinished | 64 | 64 | 0 | 0% |
| summaries.hard.metadata.gameCount | 64 | 64 | 0 | 0% |
| summaries.hard.metadata.maxTurns | 80 | 80 | 0 | 0% |
| summaries.hard.metadata.mirrorPairCount | 32 | 32 | 0 | 0% |
| summaries.hard.metadata.stableCalls | 12 | 12 | 0 | 0% |
| summaries.hard.metrics.behaviorSpaceCoverage | 0.005952 | 0.005952 | 0 | 0% |
| summaries.hard.metrics.compositeInterestingness | 0.016925 | 0.016925 | 0 | 0% |
| summaries.hard.metrics.decisiveResultShare | 0 | 0 | 0 | n/a |
| summaries.hard.metrics.decompressionSlope | 0.001364 | 0.001364 | 0 | 0% |
| summaries.hard.metrics.firstFourActionKindEntropy | 0.811278 | 0.811278 | 0 | 0% |
| summaries.hard.metrics.firstFourTagEntropy | 1.721928 | 1.721928 | 0 | 0% |
| summaries.hard.metrics.gameRefinement | 0 | 0 | 0 | n/a |
| summaries.hard.metrics.lateSuspense | 0 | 0 | 0 | n/a |
| summaries.hard.metrics.maxRepeatedStateRun | 1 | 1 | 0 | 0% |
| summaries.hard.metrics.mobilityReleaseSlope | -0.000893 | -0.000893 | 0 | 0% |
| summaries.hard.metrics.openingEntropy | 0 | 0 | 0 | n/a |
| summaries.hard.metrics.openingJsDivergence | 0.464378 | 0.464378 | 0 | 0% |
| summaries.hard.metrics.openingSimpsonDiversity | 0 | 0 | 0 | n/a |
| summaries.hard.metrics.stalemateDrawShare | 0 | 0 | 0 | n/a |
| summaries.hard.metrics.tension | 0 | 0 | 0 | n/a |
| summaries.hard.metrics.threefoldDrawShare | 0 | 0 | 0 | n/a |
| summaries.hard.metrics.uniqueOpeningLineShare | 0.0625 | 0.0625 | 0 | 0% |
| summaries.hard.samples.firstFourActionKindDistribution.climbOne | 64 | 64 | 0 | 0% |
| summaries.hard.samples.firstFourActionKindDistribution.jumpSequence | 192 | 192 | 0 | 0% |
| summaries.hard.samples.firstFourTagDistribution.advanceMass | 256 | 256 | 0 | 0% |
| summaries.hard.samples.firstFourTagDistribution.captureControl | 64 | 64 | 0 | 0% |
| summaries.hard.samples.firstFourTagDistribution.freezeBlock | 64 | 64 | 0 | 0% |
| summaries.hard.samples.firstFourTagDistribution.openLane | 256 | 256 | 0 | 0% |
| summaries.hard.samples.firstMoveDistribution.climbOne:C3:B4 | 64 | 64 | 0 | 0% |
| summaries.hard.samples.firstMoveSourceFamilyDistribution.white-15 | 64 | 64 | 0 | 0% |
| summaries.hard.samples.firstTenLineDistribution.climbOne:C3:B4 | jumpSequence:C5:C3 | jumpSequence:E3:C5 | jumpSequence:E5:E3 | jumpSequence:C5:E5 | climbOne:E4:D3 | jumpSequence:E2:E4 | jumpSequence:A5:C5 | jumpSequence:A3:A5 | jumpSequence:C3:A3 | 22 | 22 | 0 | 0% |
| summaries.hard.samples.terminalDistribution.homeField | 0 | 0 | 0 | n/a |
| summaries.hard.samples.terminalDistribution.sixStacks | 0 | 0 | 0 | n/a |
| summaries.hard.samples.terminalDistribution.stalemateDraw | 0 | 0 | 0 | n/a |
| summaries.hard.samples.terminalDistribution.stalemateTiebreakWin | 0 | 0 | 0 | n/a |
| summaries.hard.samples.terminalDistribution.threefoldDraw | 0 | 0 | 0 | n/a |
| summaries.hard.samples.terminalDistribution.threefoldTiebreakWin | 0 | 0 | 0 | n/a |
| summaries.hard.samples.terminalDistribution.unfinished | 64 | 64 | 0 | 0% |
| summaries.medium.gameCount | 64 | 64 | 0 | 0% |
| summaries.medium.games.averagePlies | 80 | 80 | 0 | 0% |
| summaries.medium.games.terminalCounts.homeField | 0 | 0 | 0 | n/a |
| summaries.medium.games.terminalCounts.sixStacks | 0 | 0 | 0 | n/a |
| summaries.medium.games.terminalCounts.stalemateDraw | 0 | 0 | 0 | n/a |
| summaries.medium.games.terminalCounts.stalemateTiebreakWin | 0 | 0 | 0 | n/a |
| summaries.medium.games.terminalCounts.threefoldDraw | 0 | 0 | 0 | n/a |
| summaries.medium.games.terminalCounts.threefoldTiebreakWin | 0 | 0 | 0 | n/a |
| summaries.medium.games.terminalCounts.unfinished | 64 | 64 | 0 | 0% |
| summaries.medium.metadata.gameCount | 64 | 64 | 0 | 0% |
| summaries.medium.metadata.maxTurns | 80 | 80 | 0 | 0% |
| summaries.medium.metadata.mirrorPairCount | 32 | 32 | 0 | 0% |
| summaries.medium.metadata.stableCalls | 10 | 10 | 0 | 0% |
| summaries.medium.metrics.behaviorSpaceCoverage | 0.005952 | 0.005952 | 0 | 0% |
| summaries.medium.metrics.compositeInterestingness | 0.020057 | 0.020057 | 0 | 0% |
| summaries.medium.metrics.decisiveResultShare | 0 | 0 | 0 | n/a |
| summaries.medium.metrics.decompressionSlope | 0.002604 | 0.002604 | 0 | 0% |
| summaries.medium.metrics.firstFourActionKindEntropy | 0.811278 | 0.811278 | 0 | 0% |
| summaries.medium.metrics.firstFourTagEntropy | 1.721928 | 1.721928 | 0 | 0% |
| summaries.medium.metrics.gameRefinement | 0 | 0 | 0 | n/a |
| summaries.medium.metrics.lateSuspense | 0 | 0 | 0 | n/a |
| summaries.medium.metrics.maxRepeatedStateRun | 1 | 1 | 0 | 0% |
| summaries.medium.metrics.mobilityReleaseSlope | -0.015774 | -0.015774 | 0 | 0% |
| summaries.medium.metrics.normalizedLempelZiv | 1.045834 | 1.045834 | 0 | 0% |
| summaries.medium.metrics.openingEntropy | 0 | 0 | 0 | n/a |
| summaries.medium.metrics.openingJsDivergence | 0.464378 | 0.464378 | 0 | 0% |
| summaries.medium.metrics.openingSimpsonDiversity | 0 | 0 | 0 | n/a |
| summaries.medium.metrics.sourceFamilyOpeningHhi | 0.380859 | 0.380859 | 0 | 0% |
| summaries.medium.metrics.stalemateDrawShare | 0 | 0 | 0 | n/a |
| summaries.medium.metrics.tension | 0 | 0 | 0 | n/a |
| summaries.medium.metrics.threefoldDrawShare | 0 | 0 | 0 | n/a |
| summaries.medium.metrics.uniqueOpeningLineShare | 0.046875 | 0.046875 | 0 | 0% |
| summaries.medium.samples.firstFourActionKindDistribution.climbOne | 64 | 64 | 0 | 0% |
| summaries.medium.samples.firstFourActionKindDistribution.jumpSequence | 192 | 192 | 0 | 0% |
| summaries.medium.samples.firstFourTagDistribution.advanceMass | 256 | 256 | 0 | 0% |
| summaries.medium.samples.firstFourTagDistribution.captureControl | 64 | 64 | 0 | 0% |
| summaries.medium.samples.firstFourTagDistribution.freezeBlock | 64 | 64 | 0 | 0% |
| summaries.medium.samples.firstFourTagDistribution.openLane | 256 | 256 | 0 | 0% |
| summaries.medium.samples.firstMoveDistribution.climbOne:C3:B4 | 64 | 64 | 0 | 0% |
| summaries.medium.samples.firstMoveSourceFamilyDistribution.white-15 | 64 | 64 | 0 | 0% |
| summaries.medium.samples.firstTenLineDistribution.climbOne:C3:B4 | jumpSequence:C5:C3 | jumpSequence:E3:C5 | jumpSequence:E5:E3 | jumpSequence:C5:E5 | climbOne:E4:D3 | jumpSequence:E2:E4 | jumpSequence:A5:C5 | jumpSequence:A3:A5 | jumpSequence:C3:A3 | 42 | 42 | 0 | 0% |
| summaries.medium.samples.firstTenLineDistribution.climbOne:C3:B4 | jumpSequence:E5:C3 | jumpSequence:E3:E5 | jumpSequence:C5:E3 | jumpSequence:E5:C5 | jumpSequence:E3:E5 | jumpSequence:C1:E3 | jumpSequence:C3:C1 | climbOne:C5:B6 | jumpSequence:E5:C3 | 14 | 14 | 0 | 0% |
| summaries.medium.samples.firstTenLineDistribution.climbOne:C3:B4 | jumpSequence:E5:C3 | jumpSequence:E3:E5 | jumpSequence:C5:E3 | jumpSequence:E5:C5 | jumpSequence:E3:E5 | jumpSequence:C1:E3 | jumpSequence:C3:C1 | climbOne:C5:C6 | jumpSequence:E5:C3 | 8 | 8 | 0 | 0% |
| summaries.medium.samples.terminalDistribution.homeField | 0 | 0 | 0 | n/a |
| summaries.medium.samples.terminalDistribution.sixStacks | 0 | 0 | 0 | n/a |
| summaries.medium.samples.terminalDistribution.stalemateDraw | 0 | 0 | 0 | n/a |
| summaries.medium.samples.terminalDistribution.stalemateTiebreakWin | 0 | 0 | 0 | n/a |
| summaries.medium.samples.terminalDistribution.threefoldDraw | 0 | 0 | 0 | n/a |
| summaries.medium.samples.terminalDistribution.threefoldTiebreakWin | 0 | 0 | 0 | n/a |
| summaries.medium.samples.terminalDistribution.unfinished | 64 | 64 | 0 | 0% |
| targetBandVersion | 1 | 1 | 0 | 0% |
