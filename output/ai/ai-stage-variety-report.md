# AI Stage Variety Report

Generated at: 2026-07-15T22:16:20.634Z

This file is a generated report artifact from `npm run ai:stage-variety`.

Methodology:
- Each scenario reuses the deterministic imported positions from `scripts/lateGamePerfFixtures.ts`.
- `opening` starts from the standard initial position; `turn50`, `turn100`, and `turn200` start from replayed benchmark states.
- The late-stage fixtures are replayed with draws disabled, then normalized into playable continuation states by retaining only the recent history window and rebuilding repetition counts for that window.
- Metrics whose names contain `opening` still measure the first reply distribution from that stage position, not only literal game openings.
- `riskMode` shares show how often the new stagnation and late-game escalation logic actually activates during the continuation playouts.
- Report settings: 8 mirrored seed pairs per difficulty, 40 continuation plies per trace.

## opening

Imported position move number: 1, replay turn count: 0.

| Difficulty | Avg plies | Decisive | 3fold draws | Repetition | Undo | Stagnation | Displacement | Drama | Tension | Risk active | Late risk | Stagnation risk |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| easy | 40 | 0 | 0 | 0.001563 | 0.070313 | 0.2375 | 0.07322 | 1.721154 | 0 | 0.003125 | 0 | 0.003125 |
| medium | 40 | 0 | 0 | 0 | 0.045312 | 0.235714 | 0.072873 | 1.740385 | 0 | 0 | 0 | 0 |
| hard | 40 | 0 | 0 | 0 | 0.042188 | 0.217857 | 0.072266 | 1.794872 | 0 | 0 | 0 | 0 |

### easy

Terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":0,"stalemateTiebreakWin":0,"threefoldDraw":0,"stalemateDraw":0,"unfinished":16}. Risk-active games: 0.0625. Persona coverage: 1.

RiskMode ply shares: {"late":0,"normal":0.996875,"stagnation":0.003125}. Persona ply shares: {"builder":0.31875,"expander":0.304688,"hunter":0.376563}.

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0 | >= 0.35 (warn 0.15) | bad |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| repetitionPlyShare | 0.001563 | <= 0.1 (warn 0.2) | good |
| twoPlyUndoRate | 0.070313 | <= 0.02 (warn 0.08) | warn |
| stagnationWindowRate | 0.2375 | <= 0.15 (warn 0.3) | warn |
| openingEntropy | 1.579434 | >= 1 (warn 0.5) | good |
| uniqueOpeningLineShare | 0.4375 | >= 0.35 (warn 0.2) | good |
| meanParticipationDelta | 35.679688 | n/a | n/a |
| positiveParticipationPlyShare | 0.489063 | n/a | n/a |
| decompressionSlope | 0.000248 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | 0.056994 | >= 0.05 (warn 0) | good |
| meanBoardDisplacement | 0.07322 | >= 0.08 (warn 0.06) | warn |
| drama | 1.721154 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |

### medium

Terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":0,"stalemateTiebreakWin":0,"threefoldDraw":0,"stalemateDraw":0,"unfinished":16}. Risk-active games: 0. Persona coverage: 1.

RiskMode ply shares: {"late":0,"normal":1,"stagnation":0}. Persona ply shares: {"builder":0.317188,"expander":0.279687,"hunter":0.403125}.

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0 | >= 0.35 (warn 0.15) | bad |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| repetitionPlyShare | 0 | <= 0.1 (warn 0.2) | good |
| twoPlyUndoRate | 0.045312 | <= 0.02 (warn 0.08) | warn |
| stagnationWindowRate | 0.235714 | <= 0.15 (warn 0.3) | warn |
| openingEntropy | 1.579434 | >= 1 (warn 0.5) | good |
| uniqueOpeningLineShare | 0.25 | >= 0.35 (warn 0.2) | warn |
| meanParticipationDelta | 72.9 | n/a | n/a |
| positiveParticipationPlyShare | 0.471875 | n/a | n/a |
| decompressionSlope | 0 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | 0.05997 | >= 0.05 (warn 0) | good |
| meanBoardDisplacement | 0.072873 | >= 0.08 (warn 0.06) | warn |
| drama | 1.740385 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |

### hard

Terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":0,"stalemateTiebreakWin":0,"threefoldDraw":0,"stalemateDraw":0,"unfinished":16}. Risk-active games: 0. Persona coverage: 1.

RiskMode ply shares: {"late":0,"normal":1,"stagnation":0}. Persona ply shares: {"builder":0.321875,"expander":0.303125,"hunter":0.375}.

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0 | >= 0.35 (warn 0.15) | bad |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| repetitionPlyShare | 0 | <= 0.1 (warn 0.2) | good |
| twoPlyUndoRate | 0.042188 | <= 0.02 (warn 0.08) | warn |
| stagnationWindowRate | 0.217857 | <= 0.15 (warn 0.3) | warn |
| openingEntropy | 1.579434 | >= 1 (warn 0.5) | good |
| uniqueOpeningLineShare | 0.3125 | >= 0.35 (warn 0.2) | warn |
| meanParticipationDelta | 86.917187 | n/a | n/a |
| positiveParticipationPlyShare | 0.492188 | n/a | n/a |
| decompressionSlope | 0.000744 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | 0.051042 | >= 0.05 (warn 0) | good |
| meanBoardDisplacement | 0.072266 | >= 0.08 (warn 0.06) | warn |
| drama | 1.794872 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |

## midgame20

Imported position move number: 21, replay turn count: 20.

| Difficulty | Avg plies | Decisive | 3fold draws | Repetition | Undo | Stagnation | Displacement | Drama | Tension | Risk active | Late risk | Stagnation risk |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| easy | 40 | 0 | 0 | 0 | 0.098437 | 0.498214 | 0.075955 | 1.144231 | 0 | 0 | 0 | 0 |
| medium | 40 | 0 | 0 | 0.025 | 0.125 | 0.857143 | 0.079166 | 1.025641 | 0 | 0 | 0 | 0 |
| hard | 40 | 0 | 0 | 0 | 0.1 | 0.657143 | 0.076389 | 1.128205 | 0 | 0 | 0 | 0 |

### easy

Terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":0,"stalemateTiebreakWin":0,"threefoldDraw":0,"stalemateDraw":0,"unfinished":16}. Risk-active games: 0. Persona coverage: 1.

RiskMode ply shares: {"late":0,"normal":1,"stagnation":0}. Persona ply shares: {"builder":0.315625,"expander":0.3,"hunter":0.384375}.

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0 | >= 0.35 (warn 0.15) | bad |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| repetitionPlyShare | 0 | <= 0.1 (warn 0.2) | good |
| twoPlyUndoRate | 0.098437 | <= 0.02 (warn 0.08) | bad |
| stagnationWindowRate | 0.498214 | <= 0.15 (warn 0.3) | bad |
| openingEntropy | 0 | >= 1 (warn 0.5) | bad |
| uniqueOpeningLineShare | 0.125 | >= 0.35 (warn 0.2) | bad |
| meanParticipationDelta | 44.398438 | n/a | n/a |
| positiveParticipationPlyShare | 0.210938 | n/a | n/a |
| decompressionSlope | 0 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | -1.367857 | >= 0.05 (warn 0) | bad |
| meanBoardDisplacement | 0.075955 | >= 0.08 (warn 0.06) | warn |
| drama | 1.144231 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |

### medium

Terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":0,"stalemateTiebreakWin":0,"threefoldDraw":0,"stalemateDraw":0,"unfinished":16}. Risk-active games: 0. Persona coverage: 1.

RiskMode ply shares: {"late":0,"normal":1,"stagnation":0}. Persona ply shares: {"builder":0.3125,"expander":0.3125,"hunter":0.375}.

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0 | >= 0.35 (warn 0.15) | bad |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| repetitionPlyShare | 0.025 | <= 0.1 (warn 0.2) | good |
| twoPlyUndoRate | 0.125 | <= 0.02 (warn 0.08) | bad |
| stagnationWindowRate | 0.857143 | <= 0.15 (warn 0.3) | bad |
| openingEntropy | 0 | >= 1 (warn 0.5) | bad |
| uniqueOpeningLineShare | 0.0625 | >= 0.35 (warn 0.2) | bad |
| meanParticipationDelta | 290.625 | n/a | n/a |
| positiveParticipationPlyShare | 0.2 | n/a | n/a |
| decompressionSlope | 0 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | -1.367857 | >= 0.05 (warn 0) | bad |
| meanBoardDisplacement | 0.079166 | >= 0.08 (warn 0.06) | warn |
| drama | 1.025641 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |

### hard

Terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":0,"stalemateTiebreakWin":0,"threefoldDraw":0,"stalemateDraw":0,"unfinished":16}. Risk-active games: 0. Persona coverage: 1.

RiskMode ply shares: {"late":0,"normal":1,"stagnation":0}. Persona ply shares: {"builder":0.3125,"expander":0.3125,"hunter":0.375}.

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0 | >= 0.35 (warn 0.15) | bad |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| repetitionPlyShare | 0 | <= 0.1 (warn 0.2) | good |
| twoPlyUndoRate | 0.1 | <= 0.02 (warn 0.08) | bad |
| stagnationWindowRate | 0.657143 | <= 0.15 (warn 0.3) | bad |
| openingEntropy | 0 | >= 1 (warn 0.5) | bad |
| uniqueOpeningLineShare | 0.0625 | >= 0.35 (warn 0.2) | bad |
| meanParticipationDelta | 317.375 | n/a | n/a |
| positiveParticipationPlyShare | 0.175 | n/a | n/a |
| decompressionSlope | 0 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | -1.367857 | >= 0.05 (warn 0) | bad |
| meanBoardDisplacement | 0.076389 | >= 0.08 (warn 0.06) | warn |
| drama | 1.128205 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |

## midgame40

Imported position move number: 41, replay turn count: 40.

| Difficulty | Avg plies | Decisive | 3fold draws | Repetition | Undo | Stagnation | Displacement | Drama | Tension | Risk active | Late risk | Stagnation risk |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| easy | 40 | 0 | 0 | 0.003125 | 0.196875 | 0.628571 | 0.080078 | 1.384615 | 0 | 0.275 | 0.275 | 0 |
| medium | 40 | 0 | 0 | 0 | 0.171875 | 0.517857 | 0.077647 | 1.544872 | 0 | 0.275 | 0.275 | 0 |
| hard | 40 | 0 | 0 | 0 | 0.15 | 0.517857 | 0.076823 | 1.576923 | 0 | 0.275 | 0.275 | 0 |

### easy

Terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":0,"stalemateTiebreakWin":0,"threefoldDraw":0,"stalemateDraw":0,"unfinished":16}. Risk-active games: 1. Persona coverage: 1.

RiskMode ply shares: {"late":0.275,"normal":0.725,"stagnation":0}. Persona ply shares: {"builder":0.314063,"expander":0.325,"hunter":0.360938}.

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0 | >= 0.35 (warn 0.15) | bad |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| repetitionPlyShare | 0.003125 | <= 0.1 (warn 0.2) | good |
| twoPlyUndoRate | 0.196875 | <= 0.02 (warn 0.08) | bad |
| stagnationWindowRate | 0.628571 | <= 0.15 (warn 0.3) | bad |
| openingEntropy | 0 | >= 1 (warn 0.5) | bad |
| uniqueOpeningLineShare | 0.125 | >= 0.35 (warn 0.2) | bad |
| meanParticipationDelta | 73.839062 | n/a | n/a |
| positiveParticipationPlyShare | 0.348438 | n/a | n/a |
| decompressionSlope | 0 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | 0.728571 | >= 0.05 (warn 0) | good |
| meanBoardDisplacement | 0.080078 | >= 0.08 (warn 0.06) | good |
| drama | 1.384615 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |

### medium

Terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":0,"stalemateTiebreakWin":0,"threefoldDraw":0,"stalemateDraw":0,"unfinished":16}. Risk-active games: 1. Persona coverage: 1.

RiskMode ply shares: {"late":0.275,"normal":0.725,"stagnation":0}. Persona ply shares: {"builder":0.3125,"expander":0.320313,"hunter":0.367188}.

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0 | >= 0.35 (warn 0.15) | bad |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| repetitionPlyShare | 0 | <= 0.1 (warn 0.2) | good |
| twoPlyUndoRate | 0.171875 | <= 0.02 (warn 0.08) | bad |
| stagnationWindowRate | 0.517857 | <= 0.15 (warn 0.3) | bad |
| openingEntropy | 0 | >= 1 (warn 0.5) | bad |
| uniqueOpeningLineShare | 0.0625 | >= 0.35 (warn 0.2) | bad |
| meanParticipationDelta | 163.985938 | n/a | n/a |
| positiveParticipationPlyShare | 0.420312 | n/a | n/a |
| decompressionSlope | 0 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | 0.728571 | >= 0.05 (warn 0) | good |
| meanBoardDisplacement | 0.077647 | >= 0.08 (warn 0.06) | warn |
| drama | 1.544872 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |

### hard

Terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":0,"stalemateTiebreakWin":0,"threefoldDraw":0,"stalemateDraw":0,"unfinished":16}. Risk-active games: 1. Persona coverage: 1.

RiskMode ply shares: {"late":0.275,"normal":0.725,"stagnation":0}. Persona ply shares: {"builder":0.315625,"expander":0.317188,"hunter":0.367188}.

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0 | >= 0.35 (warn 0.15) | bad |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| repetitionPlyShare | 0 | <= 0.1 (warn 0.2) | good |
| twoPlyUndoRate | 0.15 | <= 0.02 (warn 0.08) | bad |
| stagnationWindowRate | 0.517857 | <= 0.15 (warn 0.3) | bad |
| openingEntropy | 0 | >= 1 (warn 0.5) | bad |
| uniqueOpeningLineShare | 0.0625 | >= 0.35 (warn 0.2) | bad |
| meanParticipationDelta | 193.639062 | n/a | n/a |
| positiveParticipationPlyShare | 0.4625 | n/a | n/a |
| decompressionSlope | 0 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | 0.728571 | >= 0.05 (warn 0) | good |
| meanBoardDisplacement | 0.076823 | >= 0.08 (warn 0.06) | warn |
| drama | 1.576923 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |

## loopPressure50

Imported position move number: 51, replay turn count: 50.

| Difficulty | Avg plies | Decisive | 3fold draws | Repetition | Undo | Stagnation | Displacement | Drama | Tension | Risk active | Late risk | Stagnation risk |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| easy | 40 | 0 | 0 | 0 | 0.034375 | 0.419643 | 0.078819 | 1.269231 | 0 | 0.525 | 0.525 | 0 |
| medium | 40 | 0 | 0 | 0 | 0.095312 | 0.417857 | 0.079297 | 1.342949 | 0 | 0.525 | 0.525 | 0 |
| hard | 40 | 0 | 0 | 0 | 0.134375 | 0.485714 | 0.079427 | 1.365385 | 0 | 0.525 | 0.525 | 0 |

### easy

Terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":0,"stalemateTiebreakWin":0,"threefoldDraw":0,"stalemateDraw":0,"unfinished":16}. Risk-active games: 1. Persona coverage: 1.

RiskMode ply shares: {"late":0.525,"normal":0.475,"stagnation":0}. Persona ply shares: {"builder":0.3125,"expander":0.307812,"hunter":0.379688}.

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0 | >= 0.35 (warn 0.15) | bad |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| repetitionPlyShare | 0 | <= 0.1 (warn 0.2) | good |
| twoPlyUndoRate | 0.034375 | <= 0.02 (warn 0.08) | warn |
| stagnationWindowRate | 0.419643 | <= 0.15 (warn 0.3) | bad |
| openingEntropy | 0 | >= 1 (warn 0.5) | bad |
| uniqueOpeningLineShare | 0.0625 | >= 0.35 (warn 0.2) | bad |
| meanParticipationDelta | 68.26875 | n/a | n/a |
| positiveParticipationPlyShare | 0.440625 | n/a | n/a |
| decompressionSlope | 0 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | 0.155952 | >= 0.05 (warn 0) | good |
| meanBoardDisplacement | 0.078819 | >= 0.08 (warn 0.06) | warn |
| drama | 1.269231 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |

### medium

Terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":0,"stalemateTiebreakWin":0,"threefoldDraw":0,"stalemateDraw":0,"unfinished":16}. Risk-active games: 1. Persona coverage: 1.

RiskMode ply shares: {"late":0.525,"normal":0.475,"stagnation":0}. Persona ply shares: {"builder":0.315625,"expander":0.315625,"hunter":0.36875}.

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0 | >= 0.35 (warn 0.15) | bad |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| repetitionPlyShare | 0 | <= 0.1 (warn 0.2) | good |
| twoPlyUndoRate | 0.095312 | <= 0.02 (warn 0.08) | bad |
| stagnationWindowRate | 0.417857 | <= 0.15 (warn 0.3) | bad |
| openingEntropy | 0 | >= 1 (warn 0.5) | bad |
| uniqueOpeningLineShare | 0.0625 | >= 0.35 (warn 0.2) | bad |
| meanParticipationDelta | 115.095313 | n/a | n/a |
| positiveParticipationPlyShare | 0.4125 | n/a | n/a |
| decompressionSlope | 0 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | 0.155952 | >= 0.05 (warn 0) | good |
| meanBoardDisplacement | 0.079297 | >= 0.08 (warn 0.06) | warn |
| drama | 1.342949 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |

### hard

Terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":0,"stalemateTiebreakWin":0,"threefoldDraw":0,"stalemateDraw":0,"unfinished":16}. Risk-active games: 1. Persona coverage: 1.

RiskMode ply shares: {"late":0.525,"normal":0.475,"stagnation":0}. Persona ply shares: {"builder":0.315625,"expander":0.315625,"hunter":0.36875}.

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0 | >= 0.35 (warn 0.15) | bad |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| repetitionPlyShare | 0 | <= 0.1 (warn 0.2) | good |
| twoPlyUndoRate | 0.134375 | <= 0.02 (warn 0.08) | bad |
| stagnationWindowRate | 0.485714 | <= 0.15 (warn 0.3) | bad |
| openingEntropy | 0 | >= 1 (warn 0.5) | bad |
| uniqueOpeningLineShare | 0.0625 | >= 0.35 (warn 0.2) | bad |
| meanParticipationDelta | 173.646875 | n/a | n/a |
| positiveParticipationPlyShare | 0.415625 | n/a | n/a |
| decompressionSlope | 0 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | 0.155952 | >= 0.05 (warn 0) | good |
| meanBoardDisplacement | 0.079427 | >= 0.08 (warn 0.06) | warn |
| drama | 1.365385 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |

## loopPressure100

Imported position move number: 101, replay turn count: 100.

| Difficulty | Avg plies | Decisive | 3fold draws | Repetition | Undo | Stagnation | Displacement | Drama | Tension | Risk active | Late risk | Stagnation risk |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| easy | 40 | 0 | 0 | 0 | 0.10625 | 0.378571 | 0.077604 | 1.410256 | 0 | 1 | 1 | 0 |
| medium | 40 | 0 | 0 | 0 | 0.126562 | 0.408929 | 0.077908 | 1.36859 | 0 | 1 | 1 | 0 |
| hard | 40 | 0 | 0 | 0 | 0.00625 | 0.253571 | 0.074913 | 1.464744 | 0 | 1 | 1 | 0 |

### easy

Terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":0,"stalemateTiebreakWin":0,"threefoldDraw":0,"stalemateDraw":0,"unfinished":16}. Risk-active games: 1. Persona coverage: 1.

RiskMode ply shares: {"late":1,"normal":0,"stagnation":0}. Persona ply shares: {"builder":0.314063,"expander":0.30625,"hunter":0.379688}.

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0 | >= 0.35 (warn 0.15) | bad |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| repetitionPlyShare | 0 | <= 0.1 (warn 0.2) | good |
| twoPlyUndoRate | 0.10625 | <= 0.02 (warn 0.08) | bad |
| stagnationWindowRate | 0.378571 | <= 0.15 (warn 0.3) | bad |
| openingEntropy | 0 | >= 1 (warn 0.5) | bad |
| uniqueOpeningLineShare | 0.0625 | >= 0.35 (warn 0.2) | bad |
| meanParticipationDelta | 79.145313 | n/a | n/a |
| positiveParticipationPlyShare | 0.454688 | n/a | n/a |
| decompressionSlope | 0 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | -0.127381 | >= 0.05 (warn 0) | bad |
| meanBoardDisplacement | 0.077604 | >= 0.08 (warn 0.06) | warn |
| drama | 1.410256 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |

### medium

Terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":0,"stalemateTiebreakWin":0,"threefoldDraw":0,"stalemateDraw":0,"unfinished":16}. Risk-active games: 1. Persona coverage: 1.

RiskMode ply shares: {"late":1,"normal":0,"stagnation":0}. Persona ply shares: {"builder":0.309375,"expander":0.295312,"hunter":0.395313}.

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0 | >= 0.35 (warn 0.15) | bad |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| repetitionPlyShare | 0 | <= 0.1 (warn 0.2) | good |
| twoPlyUndoRate | 0.126562 | <= 0.02 (warn 0.08) | bad |
| stagnationWindowRate | 0.408929 | <= 0.15 (warn 0.3) | bad |
| openingEntropy | 0 | >= 1 (warn 0.5) | bad |
| uniqueOpeningLineShare | 0.0625 | >= 0.35 (warn 0.2) | bad |
| meanParticipationDelta | 94.025 | n/a | n/a |
| positiveParticipationPlyShare | 0.4 | n/a | n/a |
| decompressionSlope | 0 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | -0.127381 | >= 0.05 (warn 0) | bad |
| meanBoardDisplacement | 0.077908 | >= 0.08 (warn 0.06) | warn |
| drama | 1.36859 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |

### hard

Terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":0,"stalemateTiebreakWin":0,"threefoldDraw":0,"stalemateDraw":0,"unfinished":16}. Risk-active games: 1. Persona coverage: 1.

RiskMode ply shares: {"late":1,"normal":0,"stagnation":0}. Persona ply shares: {"builder":0.309375,"expander":0.310937,"hunter":0.379688}.

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0 | >= 0.35 (warn 0.15) | bad |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| repetitionPlyShare | 0 | <= 0.1 (warn 0.2) | good |
| twoPlyUndoRate | 0.00625 | <= 0.02 (warn 0.08) | good |
| stagnationWindowRate | 0.253571 | <= 0.15 (warn 0.3) | warn |
| openingEntropy | 0 | >= 1 (warn 0.5) | bad |
| uniqueOpeningLineShare | 0.0625 | >= 0.35 (warn 0.2) | bad |
| meanParticipationDelta | 103.607812 | n/a | n/a |
| positiveParticipationPlyShare | 0.5 | n/a | n/a |
| decompressionSlope | 0 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | -0.127381 | >= 0.05 (warn 0) | bad |
| meanBoardDisplacement | 0.074913 | >= 0.08 (warn 0.06) | warn |
| drama | 1.464744 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |

## lateSparse200

Imported position move number: 201, replay turn count: 200.

| Difficulty | Avg plies | Decisive | 3fold draws | Repetition | Undo | Stagnation | Displacement | Drama | Tension | Risk active | Late risk | Stagnation risk |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| easy | 40 | 0 | 0 | 0 | 0.060937 | 0.230357 | 0.074609 | 1.512821 | 0 | 1 | 1 | 0 |
| medium | 40 | 0 | 0 | 0 | 0.0375 | 0.192857 | 0.076606 | 1.448718 | 0 | 1 | 1 | 0 |
| hard | 40 | 0 | 0 | 0 | 0.032813 | 0.203571 | 0.075911 | 1.467949 | 0 | 1 | 1 | 0 |

### easy

Terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":0,"stalemateTiebreakWin":0,"threefoldDraw":0,"stalemateDraw":0,"unfinished":16}. Risk-active games: 1. Persona coverage: 1.

RiskMode ply shares: {"late":1,"normal":0,"stagnation":0}. Persona ply shares: {"builder":0.317188,"expander":0.309375,"hunter":0.373437}.

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0 | >= 0.35 (warn 0.15) | bad |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| repetitionPlyShare | 0 | <= 0.1 (warn 0.2) | good |
| twoPlyUndoRate | 0.060937 | <= 0.02 (warn 0.08) | warn |
| stagnationWindowRate | 0.230357 | <= 0.15 (warn 0.3) | warn |
| openingEntropy | 0 | >= 1 (warn 0.5) | bad |
| uniqueOpeningLineShare | 0.0625 | >= 0.35 (warn 0.2) | bad |
| meanParticipationDelta | 70.04375 | n/a | n/a |
| positiveParticipationPlyShare | 0.501563 | n/a | n/a |
| decompressionSlope | 0 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | -0.121429 | >= 0.05 (warn 0) | bad |
| meanBoardDisplacement | 0.074609 | >= 0.08 (warn 0.06) | warn |
| drama | 1.512821 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |

### medium

Terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":0,"stalemateTiebreakWin":0,"threefoldDraw":0,"stalemateDraw":0,"unfinished":16}. Risk-active games: 1. Persona coverage: 1.

RiskMode ply shares: {"late":1,"normal":0,"stagnation":0}. Persona ply shares: {"builder":0.320313,"expander":0.30625,"hunter":0.373437}.

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0 | >= 0.35 (warn 0.15) | bad |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| repetitionPlyShare | 0 | <= 0.1 (warn 0.2) | good |
| twoPlyUndoRate | 0.0375 | <= 0.02 (warn 0.08) | warn |
| stagnationWindowRate | 0.192857 | <= 0.15 (warn 0.3) | warn |
| openingEntropy | 0 | >= 1 (warn 0.5) | bad |
| uniqueOpeningLineShare | 0.0625 | >= 0.35 (warn 0.2) | bad |
| meanParticipationDelta | 74.939063 | n/a | n/a |
| positiveParticipationPlyShare | 0.51875 | n/a | n/a |
| decompressionSlope | 0 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | -0.121429 | >= 0.05 (warn 0) | bad |
| meanBoardDisplacement | 0.076606 | >= 0.08 (warn 0.06) | warn |
| drama | 1.448718 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |

### hard

Terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":0,"stalemateTiebreakWin":0,"threefoldDraw":0,"stalemateDraw":0,"unfinished":16}. Risk-active games: 1. Persona coverage: 1.

RiskMode ply shares: {"late":1,"normal":0,"stagnation":0}. Persona ply shares: {"builder":0.3125,"expander":0.314063,"hunter":0.373437}.

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0 | >= 0.35 (warn 0.15) | bad |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| repetitionPlyShare | 0 | <= 0.1 (warn 0.2) | good |
| twoPlyUndoRate | 0.032813 | <= 0.02 (warn 0.08) | warn |
| stagnationWindowRate | 0.203571 | <= 0.15 (warn 0.3) | warn |
| openingEntropy | 0 | >= 1 (warn 0.5) | bad |
| uniqueOpeningLineShare | 0.0625 | >= 0.35 (warn 0.2) | bad |
| meanParticipationDelta | 120.998437 | n/a | n/a |
| positiveParticipationPlyShare | 0.451562 | n/a | n/a |
| decompressionSlope | 0 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | -0.121429 | >= 0.05 (warn 0) | bad |
| meanBoardDisplacement | 0.075911 | >= 0.08 (warn 0.06) | warn |
| drama | 1.467949 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |

