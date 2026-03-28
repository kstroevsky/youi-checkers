# AI Stage Variety Report

Generated at: 2026-03-28T17:09:09.799Z

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
| easy | 33.875 | 0 | 0.375 | 0.057196 | 0.068266 | 0.378788 | 0.072109 | 1.357414 | 0 | 0.060886 | 0 | 0.060886 |
| medium | 35.3125 | 0 | 0.3125 | 0.056637 | 0.074336 | 0.375258 | 0.072419 | 1.391621 | 0 | 0.040708 | 0 | 0.040708 |
| hard | 31 | 0 | 0.5 | 0.094758 | 0.114919 | 0.401442 | 0.072581 | 1.554167 | 0 | 0.03629 | 0 | 0.03629 |

### easy

Terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":0,"stalemateTiebreakWin":0,"threefoldDraw":6,"stalemateDraw":0,"unfinished":10}. Risk-active games: 0.5625. Persona coverage: 1.

RiskMode ply shares: {"late":0,"normal":0.939114,"stagnation":0.060886}. Persona ply shares: {"builder":0.289668,"expander":0.319188,"hunter":0.391144}.

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0 | >= 0.35 (warn 0.15) | bad |
| threefoldDrawShare | 0.375 | <= 0.3 (warn 0.55) | warn |
| repetitionPlyShare | 0.057196 | <= 0.1 (warn 0.2) | good |
| twoPlyUndoRate | 0.068266 | <= 0.02 (warn 0.08) | warn |
| stagnationWindowRate | 0.378788 | <= 0.15 (warn 0.3) | bad |
| openingEntropy | 1.579434 | >= 1 (warn 0.5) | good |
| uniqueOpeningLineShare | 0.4375 | >= 0.35 (warn 0.2) | good |
| decompressionSlope | 0.000248 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | 0.01756 | >= 0.05 (warn 0) | warn |
| meanBoardDisplacement | 0.072109 | >= 0.08 (warn 0.06) | warn |
| drama | 1.357414 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |

### medium

Terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":0,"stalemateTiebreakWin":0,"threefoldDraw":5,"stalemateDraw":0,"unfinished":11}. Risk-active games: 0.5. Persona coverage: 1.

RiskMode ply shares: {"late":0,"normal":0.959292,"stagnation":0.040708}. Persona ply shares: {"builder":0.274336,"expander":0.329204,"hunter":0.39646}.

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0 | >= 0.35 (warn 0.15) | bad |
| threefoldDrawShare | 0.3125 | <= 0.3 (warn 0.55) | warn |
| repetitionPlyShare | 0.056637 | <= 0.1 (warn 0.2) | good |
| twoPlyUndoRate | 0.074336 | <= 0.02 (warn 0.08) | warn |
| stagnationWindowRate | 0.375258 | <= 0.15 (warn 0.3) | bad |
| openingEntropy | 1.579434 | >= 1 (warn 0.5) | good |
| uniqueOpeningLineShare | 0.25 | >= 0.35 (warn 0.2) | warn |
| decompressionSlope | 0 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | 0.019792 | >= 0.05 (warn 0) | warn |
| meanBoardDisplacement | 0.072419 | >= 0.08 (warn 0.06) | warn |
| drama | 1.391621 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |

### hard

Terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":0,"stalemateTiebreakWin":0,"threefoldDraw":8,"stalemateDraw":0,"unfinished":8}. Risk-active games: 0.375. Persona coverage: 1.

RiskMode ply shares: {"late":0,"normal":0.96371,"stagnation":0.03629}. Persona ply shares: {"builder":0.3125,"expander":0.308468,"hunter":0.379032}.

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0 | >= 0.35 (warn 0.15) | bad |
| threefoldDrawShare | 0.5 | <= 0.3 (warn 0.55) | warn |
| repetitionPlyShare | 0.094758 | <= 0.1 (warn 0.2) | good |
| twoPlyUndoRate | 0.114919 | <= 0.02 (warn 0.08) | bad |
| stagnationWindowRate | 0.401442 | <= 0.15 (warn 0.3) | bad |
| openingEntropy | 1.579434 | >= 1 (warn 0.5) | good |
| uniqueOpeningLineShare | 0.3125 | >= 0.35 (warn 0.2) | warn |
| decompressionSlope | 0.000744 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | 0.013095 | >= 0.05 (warn 0) | warn |
| meanBoardDisplacement | 0.072581 | >= 0.08 (warn 0.06) | warn |
| drama | 1.554167 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |

## turn50

Imported position move number: 51, replay turn count: 50.

| Difficulty | Avg plies | Decisive | 3fold draws | Repetition | Undo | Stagnation | Displacement | Drama | Tension | Risk active | Late risk | Stagnation risk |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| easy | 40 | 0 | 0 | 0.025 | 0.067187 | 0.503571 | 0.0773 | 0.996795 | 0 | 0.55 | 0.525 | 0.025 |
| medium | 40 | 0 | 0 | 0.035937 | 0.082812 | 0.394643 | 0.077474 | 1.134615 | 0 | 0.529687 | 0.525 | 0.004687 |
| hard | 40 | 0 | 0 | 0.025 | 0.067187 | 0.376786 | 0.077951 | 1.028846 | 0 | 0.525 | 0.525 | 0 |

### easy

Terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":0,"stalemateTiebreakWin":0,"threefoldDraw":0,"stalemateDraw":0,"unfinished":16}. Risk-active games: 1. Persona coverage: 1.

RiskMode ply shares: {"late":0.525,"normal":0.45,"stagnation":0.025}. Persona ply shares: {"builder":0.303125,"expander":0.303125,"hunter":0.39375}.

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0 | >= 0.35 (warn 0.15) | bad |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| repetitionPlyShare | 0.025 | <= 0.1 (warn 0.2) | good |
| twoPlyUndoRate | 0.067187 | <= 0.02 (warn 0.08) | warn |
| stagnationWindowRate | 0.503571 | <= 0.15 (warn 0.3) | bad |
| openingEntropy | 0 | >= 1 (warn 0.5) | bad |
| uniqueOpeningLineShare | 0.0625 | >= 0.35 (warn 0.2) | bad |
| decompressionSlope | 0.006349 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | -0.021429 | >= 0.05 (warn 0) | bad |
| meanBoardDisplacement | 0.0773 | >= 0.08 (warn 0.06) | warn |
| drama | 0.996795 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |

### medium

Terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":0,"stalemateTiebreakWin":0,"threefoldDraw":0,"stalemateDraw":0,"unfinished":16}. Risk-active games: 1. Persona coverage: 1.

RiskMode ply shares: {"late":0.525,"normal":0.470313,"stagnation":0.004687}. Persona ply shares: {"builder":0.30625,"expander":0.328125,"hunter":0.365625}.

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0 | >= 0.35 (warn 0.15) | bad |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| repetitionPlyShare | 0.035937 | <= 0.1 (warn 0.2) | good |
| twoPlyUndoRate | 0.082812 | <= 0.02 (warn 0.08) | bad |
| stagnationWindowRate | 0.394643 | <= 0.15 (warn 0.3) | bad |
| openingEntropy | 0 | >= 1 (warn 0.5) | bad |
| uniqueOpeningLineShare | 0.0625 | >= 0.35 (warn 0.2) | bad |
| decompressionSlope | 0.006349 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | -0.021429 | >= 0.05 (warn 0) | bad |
| meanBoardDisplacement | 0.077474 | >= 0.08 (warn 0.06) | warn |
| drama | 1.134615 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |

### hard

Terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":0,"stalemateTiebreakWin":0,"threefoldDraw":0,"stalemateDraw":0,"unfinished":16}. Risk-active games: 1. Persona coverage: 1.

RiskMode ply shares: {"late":0.525,"normal":0.475,"stagnation":0}. Persona ply shares: {"builder":0.307812,"expander":0.314063,"hunter":0.378125}.

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0 | >= 0.35 (warn 0.15) | bad |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| repetitionPlyShare | 0.025 | <= 0.1 (warn 0.2) | good |
| twoPlyUndoRate | 0.067187 | <= 0.02 (warn 0.08) | warn |
| stagnationWindowRate | 0.376786 | <= 0.15 (warn 0.3) | bad |
| openingEntropy | 0 | >= 1 (warn 0.5) | bad |
| uniqueOpeningLineShare | 0.0625 | >= 0.35 (warn 0.2) | bad |
| decompressionSlope | 0.006349 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | -0.021429 | >= 0.05 (warn 0) | bad |
| meanBoardDisplacement | 0.077951 | >= 0.08 (warn 0.06) | warn |
| drama | 1.028846 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |

## turn100

Imported position move number: 101, replay turn count: 100.

| Difficulty | Avg plies | Decisive | 3fold draws | Repetition | Undo | Stagnation | Displacement | Drama | Tension | Risk active | Late risk | Stagnation risk |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| easy | 40 | 0 | 0 | 0 | 0.0625 | 0.321429 | 0.077821 | 1.003205 | 0 | 1 | 1 | 0 |
| medium | 40 | 0 | 0 | 0 | 0.085938 | 0.335714 | 0.077213 | 0.929487 | 0 | 1 | 1 | 0 |
| hard | 40 | 0 | 0 | 0.021875 | 0.170313 | 0.3625 | 0.073915 | 1.221154 | 0 | 1 | 1 | 0 |

### easy

Terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":0,"stalemateTiebreakWin":0,"threefoldDraw":0,"stalemateDraw":0,"unfinished":16}. Risk-active games: 1. Persona coverage: 1.

RiskMode ply shares: {"late":1,"normal":0,"stagnation":0}. Persona ply shares: {"builder":0.3,"expander":0.3,"hunter":0.4}.

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0 | >= 0.35 (warn 0.15) | bad |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| repetitionPlyShare | 0 | <= 0.1 (warn 0.2) | good |
| twoPlyUndoRate | 0.0625 | <= 0.02 (warn 0.08) | warn |
| stagnationWindowRate | 0.321429 | <= 0.15 (warn 0.3) | bad |
| openingEntropy | 0 | >= 1 (warn 0.5) | bad |
| uniqueOpeningLineShare | 0.125 | >= 0.35 (warn 0.2) | bad |
| decompressionSlope | 0 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | -0.197619 | >= 0.05 (warn 0) | bad |
| meanBoardDisplacement | 0.077821 | >= 0.08 (warn 0.06) | warn |
| drama | 1.003205 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |

### medium

Terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":0,"stalemateTiebreakWin":0,"threefoldDraw":0,"stalemateDraw":0,"unfinished":16}. Risk-active games: 1. Persona coverage: 1.

RiskMode ply shares: {"late":1,"normal":0,"stagnation":0}. Persona ply shares: {"builder":0.309375,"expander":0.309375,"hunter":0.38125}.

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0 | >= 0.35 (warn 0.15) | bad |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| repetitionPlyShare | 0 | <= 0.1 (warn 0.2) | good |
| twoPlyUndoRate | 0.085938 | <= 0.02 (warn 0.08) | bad |
| stagnationWindowRate | 0.335714 | <= 0.15 (warn 0.3) | bad |
| openingEntropy | 0 | >= 1 (warn 0.5) | bad |
| uniqueOpeningLineShare | 0.0625 | >= 0.35 (warn 0.2) | bad |
| decompressionSlope | 0 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | -0.197619 | >= 0.05 (warn 0) | bad |
| meanBoardDisplacement | 0.077213 | >= 0.08 (warn 0.06) | warn |
| drama | 0.929487 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |

### hard

Terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":0,"stalemateTiebreakWin":0,"threefoldDraw":0,"stalemateDraw":0,"unfinished":16}. Risk-active games: 1. Persona coverage: 1.

RiskMode ply shares: {"late":1,"normal":0,"stagnation":0}. Persona ply shares: {"builder":0.30625,"expander":0.290625,"hunter":0.403125}.

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0 | >= 0.35 (warn 0.15) | bad |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| repetitionPlyShare | 0.021875 | <= 0.1 (warn 0.2) | good |
| twoPlyUndoRate | 0.170313 | <= 0.02 (warn 0.08) | bad |
| stagnationWindowRate | 0.3625 | <= 0.15 (warn 0.3) | bad |
| openingEntropy | 0 | >= 1 (warn 0.5) | bad |
| uniqueOpeningLineShare | 0.0625 | >= 0.35 (warn 0.2) | bad |
| decompressionSlope | 0 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | -0.197619 | >= 0.05 (warn 0) | bad |
| meanBoardDisplacement | 0.073915 | >= 0.08 (warn 0.06) | warn |
| drama | 1.221154 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |

## turn200

Imported position move number: 201, replay turn count: 200.

| Difficulty | Avg plies | Decisive | 3fold draws | Repetition | Undo | Stagnation | Displacement | Drama | Tension | Risk active | Late risk | Stagnation risk |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| easy | 40 | 0 | 0 | 0 | 0.035937 | 0.103571 | 0.075521 | 1.141026 | 0 | 1 | 1 | 0 |
| medium | 40 | 0 | 0 | 0 | 0.05 | 0.121429 | 0.076128 | 1.11859 | 0 | 1 | 1 | 0 |
| hard | 40 | 0 | 0 | 0.007813 | 0.067187 | 0.257143 | 0.076085 | 1.051282 | 0 | 1 | 1 | 0 |

### easy

Terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":0,"stalemateTiebreakWin":0,"threefoldDraw":0,"stalemateDraw":0,"unfinished":16}. Risk-active games: 1. Persona coverage: 1.

RiskMode ply shares: {"late":1,"normal":0,"stagnation":0}. Persona ply shares: {"builder":0.310937,"expander":0.30625,"hunter":0.382813}.

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0 | >= 0.35 (warn 0.15) | bad |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| repetitionPlyShare | 0 | <= 0.1 (warn 0.2) | good |
| twoPlyUndoRate | 0.035937 | <= 0.02 (warn 0.08) | warn |
| stagnationWindowRate | 0.103571 | <= 0.15 (warn 0.3) | good |
| openingEntropy | 0 | >= 1 (warn 0.5) | bad |
| uniqueOpeningLineShare | 0.125 | >= 0.35 (warn 0.2) | bad |
| decompressionSlope | 0 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | -0.214286 | >= 0.05 (warn 0) | bad |
| meanBoardDisplacement | 0.075521 | >= 0.08 (warn 0.06) | warn |
| drama | 1.141026 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |

### medium

Terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":0,"stalemateTiebreakWin":0,"threefoldDraw":0,"stalemateDraw":0,"unfinished":16}. Risk-active games: 1. Persona coverage: 1.

RiskMode ply shares: {"late":1,"normal":0,"stagnation":0}. Persona ply shares: {"builder":0.31875,"expander":0.31875,"hunter":0.3625}.

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0 | >= 0.35 (warn 0.15) | bad |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| repetitionPlyShare | 0 | <= 0.1 (warn 0.2) | good |
| twoPlyUndoRate | 0.05 | <= 0.02 (warn 0.08) | warn |
| stagnationWindowRate | 0.121429 | <= 0.15 (warn 0.3) | good |
| openingEntropy | 0 | >= 1 (warn 0.5) | bad |
| uniqueOpeningLineShare | 0.0625 | >= 0.35 (warn 0.2) | bad |
| decompressionSlope | 0 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | -0.214286 | >= 0.05 (warn 0) | bad |
| meanBoardDisplacement | 0.076128 | >= 0.08 (warn 0.06) | warn |
| drama | 1.11859 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |

### hard

Terminals: {"homeField":0,"sixStacks":0,"threefoldTiebreakWin":0,"stalemateTiebreakWin":0,"threefoldDraw":0,"stalemateDraw":0,"unfinished":16}. Risk-active games: 1. Persona coverage: 1.

RiskMode ply shares: {"late":1,"normal":0,"stagnation":0}. Persona ply shares: {"builder":0.3125,"expander":0.315625,"hunter":0.371875}.

| Metric | Value | Target | Status |
| --- | ---: | --- | --- |
| decisiveResultShare | 0 | >= 0.35 (warn 0.15) | bad |
| threefoldDrawShare | 0 | <= 0.3 (warn 0.55) | good |
| repetitionPlyShare | 0.007813 | <= 0.1 (warn 0.2) | good |
| twoPlyUndoRate | 0.067187 | <= 0.02 (warn 0.08) | warn |
| stagnationWindowRate | 0.257143 | <= 0.15 (warn 0.3) | warn |
| openingEntropy | 0 | >= 1 (warn 0.5) | bad |
| uniqueOpeningLineShare | 0.0625 | >= 0.35 (warn 0.2) | bad |
| decompressionSlope | 0 | >= 0.04 (warn 0.02) | bad |
| mobilityReleaseSlope | -0.214286 | >= 0.05 (warn 0) | bad |
| meanBoardDisplacement | 0.076085 | >= 0.08 (warn 0.06) | warn |
| drama | 1.051282 | >= 0.25 (warn 0.18) | good |
| tension | 0 | >= 0.45 (warn 0.3) | bad |

