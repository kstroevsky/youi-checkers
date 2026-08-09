# AI Engine

**Copyright (c) 2026 Kostiantyn Stroievskyi. All Rights Reserved.**

No permission is granted to use, copy, modify, merge, publish, distribute, sublicense, or sell copies of this software or any portion of it, for any purpose, without explicit written permission from the copyright holder.

---

`src/ai/` contains YOUI's computer-opponent system. It is separated from React, separated from the store, and almost entirely separated from browser APIs except for the worker bridge and the optional ONNX loading path.

The runtime AI is a hybrid, but the hierarchy matters:

1. the domain engine defines which actions are legal and what state follows from each action;
2. the AI orders those legal actions using structural heuristics and optional policy priors;
3. the search explores the resulting tree under a bounded time/depth budget;
4. the result layer returns one chosen action plus diagnostics and root candidates.

This is therefore a search-first engine with heuristic and neural guidance, not a neural-only move picker.

## Boundary With The Rest Of The App

```mermaid
flowchart TD
  Store["Store notices computer turn"] --> Worker["worker/ai.worker.ts"]
  Worker --> Guidance["model/guidance.ts"]
  Worker --> Root["search/rootSearch.ts"]
  Root --> Behavior["behavior.ts"]
  Root --> Order["moveOrdering.ts"]
  Root --> Negamax["search/negamax.ts"]
  Root --> Risk["risk.ts"]
  Negamax --> Quiescence["search/quiescence.ts"]
  Order --> Eval["evaluation.ts"]
  Eval --> Strategy["strategy.ts"]
  Eval --> Participation["participation.ts"]
  Root --> Domain["src/domain<br/>getLegalActions() + advanceGeneratedEngineState()"]
  Negamax --> Domain
```

The AI does not mutate live application state. It receives an immutable engine snapshot, searches, and returns one `AiSearchResult`.

## What The Runtime AI Is

The current runtime AI is:

- deterministic search under a bounded browser-side time budget;
- iterative deepening over a negamax tree with alpha-beta pruning;
- principal-variation-style null-window re-search;
- quiescence extension on forcing leaves;
- domain-specific ordering, strategy, and participation heuristics;
- optionally nudged by masked policy priors from a residual policy/value network.

The current runtime AI is not:

- Monte Carlo Tree Search;
- a direct AlphaZero reproduction;
- a server-backed opponent;
- a model-only move selector.

## Public Entry Points

| File                                             | Role                                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| [`index.ts`](./index.ts)                         | stable barrel used by store, worker, tests, and scripts                 |
| [`search.ts`](./search.ts)                       | Public search re-export                                                 |
| [`search/rootSearch.ts`](./search/rootSearch.ts) | `chooseComputerAction()` orchestration                                  |
| [`behavior.ts`](./behavior.ts)                   | hidden persona generation and persona-specific style bias               |
| [`perf.ts`](./perf.ts)                           | lazy per-search summary cache and keyed legal-action reuse              |
| [`risk.ts`](./risk.ts)                           | stagnation detection, dynamic draw utility, and risk-mode state bonuses |
| [`worker/ai.worker.ts`](./worker/ai.worker.ts)   | Worker boundary for browser integration                                 |
| [`types.ts`](./types.ts)                         | Search request/result contracts                                         |
| [`presets.ts`](./presets.ts)                     | Product difficulty policy encoded as data                               |

## End-To-End Decision Flow

```mermaid
sequenceDiagram
  participant Store
  participant Worker
  participant Guidance as Model Guidance
  participant Search as chooseComputerAction()
  participant Domain

  Store->>Worker: chooseMove(requestId, state, ruleConfig, matchSettings, behaviorProfile)
  Worker->>Guidance: getModelGuidance(state, ruleConfig)
  Guidance-->>Worker: action priors or null
  Worker->>Search: chooseComputerAction(difficulty, state, ruleConfig, modelGuidance)
  Search->>Domain: getLegalActions()
  Search->>Search: getRiskProfile()
  Search->>Search: buildParticipationState()
  Search->>Search: iterative deepening root search
  Search->>Domain: advanceGeneratedEngineState() for generated candidate lines
  Search-->>Worker: AiSearchResult
  Worker-->>Store: result or error
```

The worker exists for responsiveness, not to supply rule truth. Correctness still comes from the domain engine and the search code.

## Search Pipeline

### Root orchestration

[`chooseComputerAction()`](./search/rootSearch.ts) is the top-level coordinator. It:

- reads the difficulty preset;
- gathers legal root actions from the domain engine;
- recomputes the current `riskMode` from recent history, repetition pressure, and `moveNumber`;
- derives strategic intent from heuristics unless a model-supplied intent exists, and deliberately prefers heuristic intent once risk escalation is active;
- reconstructs participation context from recent history;
- precomputes expensive root ordering features;
- searches depths `1..maxDepth` under a fixed deadline;
- uses aspiration windows around the last completed score;
- degrades gracefully on timeout with ordered or previous-depth fallbacks;
- returns the chosen action, principal variation, root candidates, diagnostics, the active `riskMode`, and the persona id that shaped the search.

Fallback labels are explicit:

| `fallbackKind`        | Meaning                                                           |
| --------------------- | ----------------------------------------------------------------- |
| `none`                | normal search completion                                          |
| `orderedRoot`         | timeout before meaningful depth completion; root ordering decides |
| `partialCurrentDepth` | timeout after partial ranking at the current depth                |
| `previousDepth`       | deeper search timed out, so the previous completed depth stands   |
| `legalOrder`          | trivial legal-order fallback                                      |

#### Time-governed iterative deepening

The root search is not "depth first until it feels done." It is deadline-driven iterative deepening:

- depth `1` is completed first so the engine always has a legal fallback;
- each completed depth becomes a better-informed fallback for the next one;
- aspiration windows narrow the expected score range around the last completed result;
- timeouts are handled as part of the normal control flow rather than as exceptional corruption.

That is why the search can fail soft under a browser deadline while still returning a coherent `AiSearchResult`.

### Negamax with alpha-beta pruning

[`search/negamax.ts`](./search/negamax.ts) implements the core recursive search. The game fits the negamax formulation because it is:

- deterministic;
- zero-sum;
- alternating-turn;
- perfect information.

The search stores bounded transposition entries, updates killer/history/continuation tables on quiet cutoffs, and maintains a per-search principal-variation hint map.

#### Search stack (`SearchStack`)

The recursive search passes a `SearchStack`—a fixed-capacity backing array plus
a depth cursor—through every call frame instead of using `push()` and `pop()`.
Each ply writes `stack.entries[stack.depth]` and increments the cursor in a
`try/finally` guard that decrements it on exit. The array is created once at
root-search startup with capacity
`preset.maxDepth + MAX_QUIESCENCE_DEPTH + 4`, so the search does not grow,
shrink, or replace that backing array. Because `new Array(capacity)` is holey,
this README deliberately makes no “packed elements” claim. Search-line entry
objects are still created per visited edge; the optimization concerns stack
container reuse, not zero-allocation recursion.

![Zero-sum negamax score-scale illustration](../../docs/img/zero-sum-negamax-scale.jpeg)

_This visual belongs with negamax rather than with evaluation because it explains the sign convention that makes the whole recursive search coherent: one side's gain is the other side's loss, so the score at a child node is interpreted through a sign flip when lifted back to the parent._

### Principal variation search

The first child at each node is searched on the full window. Later children are searched on a null window first and re-searched only when they fail high inside the full alpha-beta range. The implementation surfaces these re-searches as `pvsResearches` in diagnostics.

This keeps the common case cheap while still preserving full correctness when a later move proves better than the current principal variation.

### Aspiration windows

After the first completed depth, root search centers a narrower window around the previous best score:

```text
windowSize = 220 + depth * 80
alpha = bestScore - windowSize
beta  = bestScore + windowSize
```

If the top result falls outside that range, the depth is re-run on a full window and `aspirationResearches` is incremented.

### Quiescence

[`search/quiescence.ts`](./search/quiescence.ts) extends unstable leaves rather than trusting a depth cutoff in the middle of a forcing exchange.

It considers:

- jumps;
- manual unfreezes;
- strong home-row and front-row continuation moves selected through `getQuiescenceMoves()`.

The quiescence search still uses the same ordering machinery and still applies move penalties, but it restricts the action set to moves that are likely to change the tactical picture immediately.

#### Horizon-effect mitigation

Quiescence exists because a leaf at nominal search depth is not necessarily strategically quiet. Without it, the engine can stop one ply before an obvious jump chain, unfreeze, or front-row structural swing and then evaluate an unstable position as if it were settled.

![Search-depth cutoff versus quiescence illustration](../../docs/img/search-score-depth.jpeg)

_This is a useful non-Mermaid illustration because the issue is not control flow but the shape of an evaluation error: a nominal depth cutoff can look stable until one more forcing ply causes the score to collapse._

#### Staged quiescence candidate scoring

Quiescence used to send every geometrically plausible candidate through
`orderMoves()` and only afterwards discard entries that were neither forcing
nor tactical. That ordering call advances each action and builds strategic,
participation, repetition, and tiebreak metadata. For ordinary home/front-row
moves, all of that work was unused unless the transition ended the game.

[`getQuiescenceScoringActions()`](./search/quiescence.ts) now applies the same
retention logic in two stages:

1. preserve the old no-action and single-candidate behavior exactly;
2. retain every jump sequence without a probe;
3. retain every manual unfreeze because its tactical status requires the full
   profile;
4. for every other multi-candidate action, run only the generated transition
   and retain it only when the successor is terminal;
5. call `orderMoves()` only for the survivors, then apply the unchanged final
   forcing/tactical predicate.

```mermaid
flowchart TD
  Candidates["geometric quiescence candidates"] --> Count{"zero or one?"}
  Count -- "yes" --> Full["full orderMoves scoring"]
  Count -- "no" --> Kind{"jump or manual unfreeze?"}
  Kind -- "yes" --> Full
  Kind -- "no" --> Probe["generated transition only"]
  Probe --> Terminal{"game over?"}
  Terminal -- "yes" --> Full
  Terminal -- "no" --> Reject["discard before feature extraction"]
  Full --> Final["unchanged forcing/tactical retention predicate"]
```

If `k` is the number of geometric candidates, `m` the non-jump/non-unfreeze
candidates, `r` the actions that survive the prefilter and reach full scoring,
`C_t` the transition cost, and `C_f` the full ordering-feature cost, the
relevant shape changes from approximately
`k * C_f` to `m * C_t + r * C_f`. A retained ordinary terminal move may be
transitioned once in the probe and again during full scoring, so this is not a
blanket "one transition per move" claim. It wins because in the measured
quiescence workload `r` is much smaller than `k` and `C_f` includes several
board summaries beyond the transition itself.

The correctness oracle in [`test/quiescence.test.ts`](./test/quiescence.test.ts)
contains the pre-staging algorithm and compares its complete ordered output
with the staged implementation on the opening, two seeded realistic midgames,
and the legacy single-candidate case. This is stronger than checking only the
chosen action.

## Move Ordering And Evaluation

The AI becomes practical because it searches promising moves early. The details live in two files:

- [`moveOrdering.ts`](./moveOrdering.ts): static and dynamic action ordering
- [`evaluation.ts`](./evaluation.ts): quiet leaf scoring

Both of those rely on:

- [`strategy.ts`](./strategy.ts): structural interpretation and intent classification
- [`participation.ts`](./participation.ts): anti-oscillation and variety pressure

The exact formulas are intentionally kept in the dedicated appendix:

- [`HEURISTICS.md`](./HEURISTICS.md)
- [`../../docs/ALGORITHMS.md`](../../docs/ALGORITHMS.md)

That separation matters. This README explains architecture, data flow, and lineage. `HEURISTICS.md` is the exact coefficient and formula reference, while [`../../docs/ALGORITHMS.md`](../../docs/ALGORITHMS.md) is the step-by-step algorithm explanation and trade-off guide across search, rules, and training.

### `moveOrdering.ts`

Move ordering is the bridge between shallow heuristics and deep search. The file combines:

- static action features computed from one-step simulation;
- dynamic search-learned features such as TT, PV, history, continuation, and killer bonuses;
- anti-repetition and anti-self-undo penalties;
- tiebreak-aware draw-trap metadata for draw-prone, adverse-repeat lines;
- strategic and participation deltas;
- optional policy priors from the neural guidance path.

The expensive static part is precomputed once at the root and then rescored with dynamic terms across iterative-deepening passes.

That split has a strict ownership boundary:

1. `precomputeOrderedActions()` advances each legal action once and records state-derived, depth-invariant facts in a search-private `PrecomputedOrderedAction` entry.
2. `orderPrecomputedMoves()` overwrites that entry's `score` with `staticScore + dynamicScore`, sorts it, and applies quiet-move trimming for the current pass.

The entries are private to the current ordering operation; they are not application state and are not shared between searches. Mutating `score` in place is therefore safe because every rescore assigns a complete new score before sorting. It avoids cloning a large metadata object for every action at every iterative-deepening pass without changing the score formula or tie-breaking path.

Dynamic terms must still be applied before sorting and trimming. In YOUI, `quietMoveLimit` means ordering controls both search order and which non-tactical moves are admitted to the bounded search. Treating dynamic history/PV/TT information as a cosmetic post-selection reorder would change the searched tree and is not a semantics-preserving optimization.

The ordered entries also carry metadata that later layers reuse instead of recomputing:

| Field              | Why it matters                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `winsImmediately`  | marks direct terminal wins before deeper search                                             |
| `isForced`         | distinguishes terminal or forced lines during result shaping                                |
| `isTactical`       | protects tactical moves from quiet trimming                                                 |
| `drawTrapRisk`     | measures how dangerous a draw-prone continuation is when the actor is tiebreak-behind       |
| `tiebreakEdgeKind` | records whether a repeated or stagnant finish would currently favor, hurt, or tie the actor |
| `sourceFamily`     | tracks checker-family reuse across result shaping and variety metrics                       |
| `sourceRegion`     | tracks coarse board-region reuse through the participation layer                            |

```mermaid
flowchart TD
  Action["Legal action"] --> Next["advanceGeneratedEngineState(state, action)"]
  Next --> Analysis["base + successor PositionAnalysis"]
  Next --> Struct["evaluateStructureState delta"]
  Next --> Strat["getActionStrategicProfile()"]
  Next --> Part["getActionParticipationProfile()"]
  Guidance["optional action priors"] --> Prior["policy-prior term"]
  Tables["TT / PV / history / continuation / killer tables"] --> Dynamic["dynamic search bonuses"]
  Struct --> Static["static ordering score"]
  Strat --> Static
  Part --> Static
  Analysis --> Strat
  Analysis --> Part
  Prior --> Static
  Static --> Final["final move-order score"]
  Dynamic --> Final
```

### Quiet move trimming

After ordering:

- tactical moves are preserved;
- quiet moves are truncated to the preset's `quietMoveLimit`;
- harder difficulties therefore search both deeper and wider, not only deeper.

## Difficulty Presets

Difficulty is encoded as data, not as vague labels.

| Difficulty | `timeBudgetMs` | `maxDepth` | `quietMoveLimit` | `rootCandidateLimit` |
| ---------- | -------------: | ---------: | ---------------: | -------------------: |
| `easy`     |          `120` |        `2` |              `8` |                  `4` |
| `medium`   |          `400` |        `4` |             `16` |                  `5` |
| `hard`     |         `1200` |        `6` |             `28` |                  `6` |

The presets also supply the heuristic coefficients for:

- participation pressure;
- repetition and self-undo penalties;
- policy-prior weight;
- controlled variety among near-equal root candidates.

Because those values encode product behavior, tests and report generators import them directly rather than copying them.

The newer preset fields are equally important to behavior identity:

- draw-aversion coefficients for terminal draws;
- stagnation-index weights and activation threshold;
- risk-mode widening, loop penalties, and progress/tactical bonuses;
- policy-prior attenuation under escalation.

Difficulty is therefore not just "more depth." It is a bundle of search budget, safety rails, draw contempt, and variety pressure.

## Behavior Profiles And Risk Modes

The current computer opponent deliberately separates long-lived style from short-lived urgency.

### Hidden per-match personas

[`behavior.ts`](./behavior.ts) defines three hidden personas:

- `expander`: prefers decompression, lane opening, and broader board geometry;
- `hunter`: prefers freeze pressure, capture control, and tactical obstruction;
- `builder`: prefers front-row scaffolding, stack construction, and forward mass shaping.

The store generates one persona per computer match by hashing a fresh session id and persists it in `aiBehaviorProfile`. That keeps resumed saves behaviorally stable without introducing a new player-facing mode switch.

The persona influences three layers:

- move ordering through tag-based action bonuses;
- opening roots through source-geometry bonuses derived from the persisted persona seed, so equal-score starts can split across different checker families instead of replaying one opener forever;
- quiet leaf evaluation through state-shape bonuses that bias equal lines toward different strategic textures.

During the first six plies the root search also attenuates policy-prior weight when a persona is active. That does not disable neural guidance globally; it only stops the opening from snapping back to one model-favored move when several near-equal persona-consistent moves exist.

### Dynamic draw aversion

[`risk.ts`](./risk.ts) replaces the old "every draw is `0`" convention with state-dependent draw utility:

- terminal wins and losses remain `±1_000_000`;
- equal or structurally favorable draws are scored negatively;
- clearly losing draws can be neutral or slightly positive;
- `stagnation` and `late` modes increase draw aversion further.

This is the implementation of the product rule "avoid a draw like a defeat" without breaking zero-sum search correctness. The engine does not globally pretend that a draw is always a loss; it only changes how attractive a draw is relative to the current board.

The newer tiebreak-aware layer goes one step further for nonterminal positions:

- draw pressure is estimated from repetition pressure, structural flatness, and late-game escalation;
- the engine computes whether the acting side is currently `ahead`, `tied`, or `behind` on the rules-level draw tiebreak;
- repetition-adjacent or flat continuations get a `drawTrapRisk` penalty only when that projected finish is adverse or neutral, while tiebreak-favorable draw lines remain acceptable.

### Risk escalation

Search distinguishes three urgency modes:

| `riskMode`   | Trigger                                                         | Intended effect                                                 |
| ------------ | --------------------------------------------------------------- | --------------------------------------------------------------- |
| `normal`     | default                                                         | standard bounded search                                         |
| `stagnation` | recent plies are repetitive, low-displacement, and low-progress | prefer decompression and decisive continuations                 |
| `late`       | unresolved game with `moveNumber >= 70`                         | widen the near-best band and push hardest against sterile draws |

`stagnation` is computed from a weighted index over:

- repetition pressure;
- quiet self-undo motifs;
- low board displacement;
- flat mobility change;
- flat home-field and six-stack progress.

`late` is a hard fallback trigger, not a new rules-level draw condition.

Once a non-`normal` mode activates, non-forced tactical lines are no longer exempt from the anti-loop logic. Jump-heavy lines can still win on tactical truth, but they now pay repetition and self-undo costs unless they are genuinely forced.

## Result Shaping

[`search/result.ts`](./search/result.ts) turns internal ranking into the public result object:

- sorts root actions stably;
- reconstructs the principal variation from the transposition table;
- widens the root candidate band in two specific low-confidence cases: the first few opening plies and timeout/fallback risk roots;
- compresses raw score gaps inside that widened band and then chooses the best adjusted candidate deterministically, so hidden personas and risk bonuses actually surface in browser play instead of being washed out by noisy shallow scores;
- applies extra risk reranking inside the near-best band when `riskMode` is `stagnation` or `late`, including non-forced tactical candidates instead of only quiet ones;
- limits the exposed candidate set while preserving family diversity.

This is why the runtime returns more than a move. `AiSearchResult` is also a diagnostic envelope.

The key safety rule is that risk never overrides tactical truth:

- immediate wins still dominate;
- only-move defenses still dominate;
- only genuinely forced lines bypass the "be more interesting" preference.

## Search Context And Supporting Heuristics

[`search/types.ts`](./search/types.ts) defines the mutable search context shared across helpers:

- deadline and timer function;
- transposition table;
- killer/history/continuation tables;
- per-search lazy `perfCache` for pure position summaries;
- hidden `behaviorProfile`;
- participation state;
- live `riskMode`;
- previous same-side action and strategic tags at the root;
- diagnostic counters.

### `search/shared.ts`

[`search/shared.ts`](./search/shared.ts) provides the low-level glue that the rest of the search code assumes:

- `actionKey()` for stable action serialization across ordering, tests, and caches;
- `throwIfTimedOut()` and `isSearchTimeout()` for one timeout protocol across search phases;
- `makeTableKey()` for transposition-table addressing via the 64-bit Zobrist hash (`zobristHash`).

[`search/heuristics.ts`](./search/heuristics.ts) owns the supporting logic for:

- transposition-table capacity;
- move-penalty application;
- quiet cutoff learning;
- reconstruction of previous same-side action/position/tag context.

It also codifies two hard resource boundaries:

- `TRANSPOSITION_LIMIT = 50_000`
- `MAX_QUIESCENCE_DEPTH = 6`

Those numbers are not mathematical truths. They are bounded browser-runtime policy.

#### History aging

After each completed iterative-deepening pass, the root search right-shifts
every history score by 2 (i.e., divides by 4). Schaeffer (1989) is the lineage
for using accumulated cutoff history to improve alpha-beta move ordering; the
exact divide-by-four schedule is this repository's bounded forgetting policy,
not a claim about a formula prescribed by that paper. The shift prevents
shallow iterations from permanently dominating later ordering and keeps the
`Int32Array` values away from their saturation cap. It is applied to all
`2_736` entries in one loop after the depth's best action is recorded.

## Search-Time Summary Reuse

[`perf.ts`](./perf.ts) is the AI's semantics-preserving optimization layer. It exists because the newer draw-pressure, tiebreak, participation, and persona features all depend on pure board summaries that would otherwise be recomputed many times per node.

The design is intentionally conservative:

- every cached value is a pure function of `EngineState` plus, for legal actions, `RuleConfig`;
- the per-search `StatePerfBundle` is lazy, so evaluation does not pay for move-generation-only fields unless it actually asks for them;
- board-wide summaries reuse the canonical position hash, so scoring, tiebreak metrics, structural analysis, and legal-action lookup do not each re-hash the same state independently;
- cache reuse never changes formulas, thresholds, or candidate ranking policy.

The main reused summaries are:

- strategic analysis and strategic intent;
- informational score summary;
- draw-tiebreak metrics;
- empty-cell count;
- progress snapshot;
- legal-action count and legal-action list;
- base tiebreak-pressure profile per player and `riskMode`.

The structural analysis itself is also a reusable feature vector, not only a scalar score. `PositionAnalysis.players[player]` contains `frontierWidth`: the number of board files containing material that is currently either a movable single or a controlled stack. The strategic scan already establishes that fact while calculating mobility and lane features, so participation scoring receives the same base and successor analyses instead of performing a second board scan.

```mermaid
flowchart LR
  State["EngineState"] --> Scan["strategy.ts: one board scan"]
  Scan --> Analysis["PositionAnalysis\nphase + per-player features\nincluding frontierWidth"]
  Analysis --> Strategic["strategic score and tags"]
  Analysis --> Participation["before/after participation profiles"]
  Participation --> Ordering["static action score"]
  Strategic --> Ordering
```

This is common-subexpression elimination in project terms: one predicate and one board traversal establish a fact once, then several consumers read that fact. The fallback profile API can still calculate frontier width directly when a caller has no `PositionAnalysis`; the hot move-ordering path always supplies one.

The generated-child path also reuses work produced below the AI layer:

```mermaid
sequenceDiagram
  participant Order as precomputeOrderedActions()
  participant Domain as advanceGeneratedEngineTransition()
  participant Victory as victory/repetition resolution
  participant Cache as StatePerfBundle

  Order->>Domain: generated action + overlay storage option
  Domain->>Victory: resolve terminal state and repetition
  Victory-->>Domain: victory + canonical active-state hash when available
  Domain-->>Order: nextState + positionHash
  Order->>Cache: getStatePerfBundle(nextState, positionHash)
  Cache-->>Order: lazy summaries keyed without another active-state hash
```

Move ordering requests `positionCountStorage: 'overlay'`. The domain layer
creates a one-entry object whose prototype is the parent repetition-count
record. Creating a speculative child is therefore constant-size with respect
to the number of historically seen positions, while lookup follows ordinary
JavaScript property resolution through at most the bounded search ancestry.
This is a narrow, search-local application of persistent-version ideas, not a
claim that JavaScript prototype objects provide the full asymptotic guarantees
of a general persistent map. Public and serializable transitions continue to
copy plain records.

For active successors, the transition's `positionHash` is passed directly to
`getStatePerfBundle()`. A terminal successor deliberately falls back to a fresh
hash because terminal normalization can change `currentPlayer`, `status`, or
`pendingJump` after the immediate victory probe. That exception is part of the
correctness boundary, not an unoptimized oversight.

## Strategic Analysis Layer

[`strategy.ts`](./strategy.ts) is the position interpreter. It turns raw board geometry into a higher-level structural reading of the position.

### `strategy.ts`

The strategy layer performs one cached board scan and derives features such as:

- lane openness and jump-lane availability;
- home-field progress and total distance to home;
- front-row stack development;
- buried debt inside stacks;
- frozen singles and frozen critical singles.

Those features are reused by evaluation, move ordering, and reporting.

#### Main exports

| Function                                  | Role                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| `analyzePosition()`                       | cached structural summary of the current position                               |
| `analyzePositionByKey()`                  | structural summary lookup when a caller already has the canonical position hash |
| `getStrategicIntentFromAnalysis()`        | plan classification from a precomputed structural analysis                      |
| `getStrategicIntent()`                    | classifies the macro plan as `home`, `sixStack`, or `hybrid`                    |
| `getStrategicScoreFromAnalysis()`         | scalar strategic score from a precomputed structural analysis                   |
| `getStrategicScore()`                     | plan-centric scalar position score                                              |
| `getActionStrategicProfileFromAnalysis()` | per-move tags and deltas without rescanning sibling states                      |
| `getActionStrategicProfile()`             | per-move strategic tags, intent delta, and policy bias                          |
| `getNoveltyPenalty()`                     | semantic anti-repetition penalty across same-side turns                         |
| `inferPreviousStrategicTags()`            | history-based reconstruction of the previous same-side move story               |

## Participation Layer

[`participation.ts`](./participation.ts) is the AI subsystem that tries to keep play legible and materially broad when tactics do not demand narrow reuse.

### `participation.ts`

It tracks recent same-side move participation through:

- moved checker identities;
- source families derived from checker ids;
- coarse source regions such as `left-front` or `center-mid`;
- recent reuse streaks;
- active material breadth and idle reserve mass.

#### Resolving oscillating mechanics

Classical local search can become tactically competent yet behaviorally narrow, repeatedly reusing the same source family or the same board region in neutral positions. The participation layer penalizes that concentration and rewards bringing previously idle material into the active frontier.

#### Main exports

| Function                                      | Role                                                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `buildParticipationState()`                   | reconstructs rolling recent-move context from history                                                                  |
| `getParticipationScore()`                     | board-level participation term for static evaluation                                                                   |
| `getActionParticipationProfileFromAnalysis()` | per-move participation delta while reusing precomputed structural analyses and the two computed participation profiles |
| `getActionParticipationProfile()`             | per-move participation delta and next rolling state                                                                    |

For a candidate action, the hot path builds exactly two participation profiles: one for the current state and one for the successor. It passes those profiles to `getParticipationScoreFromProfile()` rather than rebuilding them inside a second scoring helper. The formula is unchanged; this only removes duplicate set construction, concentration calculations, idle-reserve analysis, and frontier extraction.

The frontier invariant is deliberately shared with `strategy.ts`:

```text
frontierWidth(player) = number of files containing a coordinate where
  isMovableSingle(board, coord, player) OR isControlledStack(board, coord, player)
```

`strategy.ts` records this with a per-player file bitmask while visiting each coordinate. `participation.ts` reads the resulting width from `PositionAnalysis`. Keeping that definition in one place is important: a faster but differently defined frontier would silently change ordering behavior.

## Static Evaluation

[`evaluation.ts`](./evaluation.ts) is intentionally not a tactical oracle. It is the quiet leaf evaluator that the search calls once forcing lines have been handled by search depth and quiescence.

It exposes two evaluators:

- `evaluateStructureState()` for cheaper structure-first scoring used heavily in ordering;
- `evaluateState()` for the full leaf score used at quiet search leaves.

Exact coefficients live in [`HEURISTICS.md`](./HEURISTICS.md); this README keeps the architectural role of each evaluator distinct from the formulas themselves.

## Model Guidance Path

The neural path is optional but real.

### Action space

[`model/actionSpace.ts`](./model/actionSpace.ts) defines a fixed `2_736`-action policy head:

| Segment                 |   Count |
| ----------------------- | ------: |
| manual unfreeze         |    `36` |
| jump directions         |   `288` |
| adjacent move kinds     | `1_152` |
| friendly stack transfer | `1_260` |
| total                   | `2_736` |

The fixed action space is the contract shared by self-play generation, training, ONNX export, and runtime masking.

Important exports:

| Function                    | Role                                                                           |
| --------------------------- | ------------------------------------------------------------------------------ |
| `encodeActionIndex()`       | maps one legal domain action into the fixed policy-head index                  |
| `buildMaskedActionPriors()` | turns raw logits into a normalized distribution over legal actions only        |
| `getActionSpaceMetadata()`  | exposes offsets and counts for tests, tooling, and documentation sanity checks |

### State encoding

[`model/encoding.ts`](./model/encoding.ts) encodes the side-to-move position into `16` planes on a `6 x 6` board:

- own active singles
- own frozen singles
- own top checker on height-2 stacks
- own top checker on height-3 stacks
- own buried depth-1 material
- own buried depth-2 material
- the same six planes for the opponent
- empty cells
- own home-row mask
- own front-home-row mask
- pending-jump source

The encoding is perspective-aligned so the same model serves both players without having to learn separate "white" and "black" geometries.

The important architectural point is not "convolution" but perspective normalization: the tensor consistently means "own" material, "opponent" material, and own-goal landmarks regardless of whether the acting side is white or black.

The committed asset filename below predates the terminology cleanup. It should be read as a visualization of the `16` input planes consumed by the residual policy/value network, not as a statement that the runtime system is a CNN-only engine.

![Sixteen-plane state-encoding illustration](../../docs/img/16ch-cnn-map.jpeg)

### Runtime guidance bridge

[`model/guidance.ts`](./model/guidance.ts) performs runtime inference:

1. fetch `/models/ai-policy-value.onnx` as complete bytes and reject a non-`200` or HTML-like response;
2. only after valid bytes are available, lazily import the WASM entry point from `onnxruntime-web`;
3. create one optimized inference session from those bytes;
4. encode the current state;
5. run inference;
6. extract policy logits and optional value scalar;
7. mask policy logits down to the currently legal action set.

Important current behavior:

- if the model file is missing, the search silently falls back to heuristic-only ordering;
- a session is never created from a cached range probe or a server fallback HTML document;
- `actionPriors` are consumed by move ordering;
- `valueEstimate` is exposed for diagnostics and tests only;
- `strategicIntent` is currently returned as `null`, so the runtime continues to rely on heuristic intent inference.

### Training path

The offline workflow is:

```mermaid
flowchart LR
  A["scripts/ai-selfplay-dataset.ts"] --> B["JSONL self-play dataset"]
  B --> C["training/train_policy_value.py"]
  C --> D["public/models/ai-policy-value.onnx"]
  D --> E["model/guidance.ts"]
```

[`training/train_policy_value.py`](../../training/train_policy_value.py) trains a small residual policy/value network:

- `4` residual blocks
- `32` channels
- policy head over `2_736` actions
- scalar `tanh` value head

The model is best described as a neural guidance model, not as the runtime intelligence itself.

## Training Pipeline

The offline path is intentionally separate from runtime play:

### Self-play dataset generation

[`scripts/ai-selfplay-dataset.ts`](../../scripts/ai-selfplay-dataset.ts) records search-driven self-play into JSONL examples aligned with the fixed action space and the `16 x 6 x 6` encoding.

The generator intentionally fixes several policy choices so the dataset is reproducible:

- `drawRule: 'threefold'`
- `scoringMode: 'off'`
- deterministic seeded randomness through `createSeededRandom(gameIndex + 1)`
- deterministic hidden personas for both sides derived from the game index
- horizontal mirroring of every recorded position/action set

Each example stores the sparse root-candidate policy target, the terminal value from the acting side's perspective, and the heuristic strategic-intent label chosen at search time.

### Training script

[`training/train_policy_value.py`](../../training/train_policy_value.py) trains and exports the small residual policy/value model that the browser can consume through ONNX.

The deeper operational details live in [`../../training/README.md`](../../training/README.md).

## Algorithmic Lineage And References

The repository code does not embed a formal bibliography, so the list below should be read as the closest academic lineage for the techniques that are visibly implemented here, not as a claim that the project is a direct reproduction of any single paper.

| Technique visible in this repo                                                   | Closest reference                                                                                                                                                                                   |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alpha-beta search / negamax-style zero-sum pruning                               | Donald E. Knuth and Ronald W. Moore, "An Analysis of Alpha-Beta Pruning," _Artificial Intelligence_ 6(4), 1975. DOI: `10.1016/0004-3702(75)90019-3`.                                                |
| Iterative deepening under bounded search budgets                                 | Richard E. Korf, "Depth-first Iterative-Deepening: An Optimal Admissible Tree Search," _Artificial Intelligence_ 27(1), 1985. DOI: `10.1016/0004-3702(85)90084-0`.                                  |
| Null-window / principal-variation-style search refinement                        | Murray Campbell and Tony Marsland, "A Comparison of Minimax Tree Search Algorithms," _Artificial Intelligence_ 20(4), 1983. DOI: `10.1016/0004-3702(83)90037-5`.                                    |
| Quiescence search to stabilize tactical leaves                                   | Larry Harris, "The Heuristic Search and the Game of Chess: A Study of Quiescence, Sacrifices, and Plan Oriented Play," _IJCAI 1975_.                                                                |
| History heuristic family of move-ordering improvements                           | Jonathan Schaeffer, "The History Heuristic and Alpha-Beta Search Enhancements in Practice," _IEEE Transactions on Pattern Analysis and Machine Intelligence_ 11(11), 1989. DOI: `10.1109/34.42858`. |
| Policy/value self-play guidance as conceptual lineage for the offline model path | David Silver et al., "Mastering the game of Go without human knowledge," _Nature_ 550, 2017. DOI: `10.1038/nature24270`.                                                                            |
| Residual network architecture used in the training script                        | Kaiming He, Xiangyu Zhang, Shaoqing Ren, and Jian Sun, "Deep Residual Learning for Image Recognition," _CVPR 2016_.                                                                                 |

The key takeaway is that this AI is intentionally hybrid: classical tree search does the hard tactical work, while domain-specific heuristics and optional neural priors improve ordering and style without replacing the deterministic rule engine underneath.

## Reporting And Quality Gates

Important supporting artifacts:

- [`moveOrdering.test.ts`](./test/moveOrdering.test.ts)
- [`search.behavior.test.ts`](./test/search.behavior.test.ts)
- [`search.timeout.test.ts`](./test/search.timeout.test.ts)
- [`search.soak.test.ts`](./test/search.soak.test.ts)
- [`search.variety.test.ts`](./test/search.variety.test.ts)
- [`model.test.ts`](./test/model.test.ts)
- [`test/metrics.ts`](./test/metrics.ts)

These tests and tools validate:

- timeout fallbacks and search stability;
- ordering behavior and candidate shaping;
- long playout stability;
- policy masking and model fallback behavior;
- behavior diversity and repetition pressure.

Generated reports live under `output/` and are produced by:

- [`scripts/ai-variety.report.ts`](../../scripts/ai-variety.report.ts)
- [`scripts/ai-stage-variety.report.ts`](../../scripts/ai-stage-variety.report.ts)
- [`scripts/ai-crossplay.report.ts`](../../scripts/ai-crossplay.report.ts)
- [`scripts/ai-loop-benchmark.report.ts`](../../scripts/ai-loop-benchmark.report.ts)
- [`scripts/ai-position-buckets.report.ts`](../../scripts/ai-position-buckets.report.ts)
- [`scripts/ai-threat.report.ts`](../../scripts/ai-threat.report.ts)
- [`scripts/perf-report.mjs`](../../scripts/perf-report.mjs)
- [`scripts/perf-ab.mjs`](../../scripts/perf-ab.mjs)
- [`scripts/run-git-report-compare.mjs`](../../scripts/run-git-report-compare.mjs)

### Search and behavior tests

The search tests validate timeout handling, candidate shaping, and bounded-search correctness under browser-style constraints.

### Variety and quality metrics

The variety tooling checks that the engine remains strategically broad enough and does not collapse into a single deterministic style.

The trace layer also records `behaviorProfileId` and `riskMode` per ply, so later diagnostics can distinguish "the engine found a risky line" from "the engine happened to play differently for unrelated reasons."

That distinction matters even more away from the literal opening. The stage
report uses the same six scenarios as the current perf harness:

- `opening`;
- seeded realistic positions `midgame20` and `midgame40`;
- deterministic loop-pressure positions `loopPressure50` and
  `loopPressure100`;
- the sparse late loop position `lateSparse200`.

The seeded midgames preserve a typical amount of material and branching, while
the loop-derived fixtures deliberately exercise repetition, draw aversion, and
late-risk behavior. For continuation analysis, the stage harness keeps the six
most recent history records, rebuilds repetition counts from that retained
window, and resets terminal status. This is necessary because the shipped
threefold rule can otherwise make an imported loop fixture terminal before the
AI is evaluated. In practice, the report asks not just "is self-play varied in
general?" but "from a known realistic or loop-pressured stage, does risk mode
engage without collapsing participation and variety?"

The metric vocabulary in [`test/metrics.ts`](./test/metrics.ts) is intentionally broader than win rate alone:

| Metric                          | Meaning                                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `decisiveResultShare`           | share of games that end in a non-draw terminal result                                                                                       |
| `openingEntropy`                | entropy of the first-move distribution across self-play traces                                                                              |
| `openingSimpsonDiversity`       | complementary diversity score for the opening distribution; higher means openings are less concentrated                                     |
| `openingJsDivergence`           | Jensen-Shannon divergence against the checked-in baseline opening distribution                                                              |
| `uniqueOpeningLineShare`        | share of distinct first-ten-ply openings across traces                                                                                      |
| `sourceFamilyOpeningHhi`        | concentration of opening moves into the same checker family; lower means broader material usage                                             |
| `twoPlyUndoRate`                | rate of quiet self-undo behavior across plies                                                                                               |
| `repetitionPlyShare`            | share of plies that revisit an already seen full position                                                                                   |
| `stagnationWindowRate`          | share of sliding windows whose displacement, mobility, and progress stay too flat                                                           |
| `normalizedLempelZiv`           | normalized Lempel-Ziv complexity of move-kind sequences; higher means the trace keeps producing new symbolic motifs                         |
| `decompressionSlope`            | average slope of empty-cell growth over the opening window                                                                                  |
| `mobilityReleaseSlope`          | average slope of legal-move count growth over the same window                                                                               |
| `meanBoardDisplacement`         | average number of changed cells per ply                                                                                                     |
| `meanParticipationDelta`        | mean signed contribution of the chosen moves' participation profiles; preserves the actual heuristic signal, not merely move diversity      |
| `positiveParticipationPlyShare` | share of plies whose chosen move has `participationDelta > 0`; guards against broad averages hiding consistently non-positive participation |
| `drama`                         | legacy, uncalibrated mean absolute score swing between consecutive plies                                                                    |
| `tension`                       | legacy, uncalibrated average closeness of normalized scores to zero                                                                         |
| `compositeInterestingness`      | legacy, uncalibrated target-band proxy; useful for regression triage, not as an enjoyment claim or release gate                             |
| `behaviorSpaceCoverage`         | fraction of coarse behavior bins actually occupied by the trace set                                                                         |

The newer nonlinear metrics in [`test/advancedMetrics.ts`](./test/advancedMetrics.ts) answer a different question: not "did the engine vary?" but "what kind of dynamical system did the trace behave like?" Those metrics are used by the loop, threat, cross-play, and position-bucket reports:

| Advanced metric           | Meaning                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| `recurrenceRate`          | fraction of non-trivial revisit pairs in the visited-state sequence                              |
| `recurrenceDeterminism`   | share of recurrence points that lie on diagonal replay lines rather than isolated revisits       |
| `recurrenceLaminarity`    | share of recurrence points that lie on vertical dwell lines, which is a strong loop/stall signal |
| `trappingTime`            | average vertical dwell length inside recurrence plots                                            |
| `scoreSampleEntropy`      | irregularity of eligible evaluation-score series; `null` means no finite estimate, with an explicit trace count |
| `scorePermutationEntropy` | ordinal complexity of local score windows, insensitive to absolute scale                         |
| `positionLempelZiv`       | token-level symbolic complexity of the visited-position sequence, invariant to token spelling    |
| `loopEscapeRate8/16/24`   | share of loop-pressure-eligible traces that escape within 8, 16, or 24 plies; eligibility N is reported |
| `meanLoopEscapePly`       | average number of plies needed to escape once loop pressure becomes active                       |
| `pressureEventRate`       | share of plies that create freeze pressure, candidate-relative opponent-reply compression, or direct conversion pressure |
| `frontierCompressionRate` | mean positive log reduction of opponent replies versus the median legal root candidate; terminal/continuation plies are excluded |
| `riskProgressShare`       | share of risk-mode plies that satisfy the engine's certified progress test                       |

### Report comparison wrappers

Before interpreting any behavior report as evidence about a strategy change, run
the explicit-budget measurement layer. It distinguishes shipped wall-clock,
controlled wall-clock, fixed-depth, and fixed-node execution; asserts the actual
path taken; preserves raw candidates/diagnostics; and keeps search, outcomes,
behavior, spatial equivariance, and human experience as separate evidence
families. See [`docs/ai-measurement.md`](../../docs/ai-measurement.md) for the
contract and commands.

For branch-wide outcome comparisons, the Node-only `AiPolicy` layer runs the
current engine and the merge-base `LegacyPolicyV0` inside the same current match
harness. The legacy adapter executes immutable old AI sources against current,
fingerprinted domain rules; seeded sessions, fixed-node budgets, starting states,
horizons, adjudication, and color swaps therefore remain common. Older report
schemas are not used as the baseline implementation.

`npm run ai:policy-strength -- --profile=full` drives that boundary through the
versioned current-versus-legacy protocol. Fixed-horizon adjudicated color swaps
form pentanomial observations; sequential likelihood checks occur only at
complete frozen-allocation blocks and answer an explicitly selected
non-inferiority, equivalence, or superiority question. Natural resolution is
reported separately. The protocol and allocation manifests live beside the AI
measurement fixtures and are included in provenance hashes.

`npm run ai:human-calibration -- --input=<observations.jsonl>` is the distinct
player-experience layer. It validates blinded full-game/replay observations,
keeps miniPXI constructs separate, fits a propensity-weighted regularized
mixed-effects Bradley–Terry approximation, and reports performance on held-out
participants. Counterbalanced public assignments and private policy mappings are
generated separately; uncertainty-based replay selection always retains a
random-exploration floor. Synthetic smoke data cannot satisfy the preregistered
48-participant confirmatory minimum.

The companion `ai:competence` command owns tactical correctness and equal-work
strength curves. It validates rule-derived unique wins/defenses under true
mirrors, searches each subject at increasing fixed-node budgets, and rescores
the chosen action against a complete deeper root. Its regret, catastrophic-error,
fallback, completed-root, partial-depth, and missing-oracle denominators remain separate from
the behavioral dashboards; confirmatory gates inspect only the largest measured
budget for each difficulty.

The game-level `ai:strength` protocol then evaluates retained revisions against
the same checksummed, deterministic opponent pool. Its raw unit is a seeded
color-swapped game pair; unfinished games remain censored. The paired file
comparator equal-weights fixture × reference strata, reports fixed-portfolio and
hierarchical bootstrap intervals, and requires both point-share and resolved-
pair-share non-inferiority. This is the long-horizon strength gate; it is still
not a substitute for human challenge, flow, or enjoyment evidence.

[`scripts/run-git-report-compare.mjs`](../../scripts/run-git-report-compare.mjs) is the generic compare entry point behind the `*:compare` npm scripts. It materializes the `before` and `after` snapshots, reruns the requested pipeline for each snapshot, flattens the numeric leaves of both JSON reports, and emits a Markdown diff under `output/`.

The wrappers accept `--before=<ref|working>` and `--after=<ref|working>`. In practice that supports:

- a committed baseline versus unstaged edits (`HEAD` vs `working`);
- one branch, tag, or commit versus another;
- repeated reruns of the same working tree with different flags.

The comparison layer is intentionally generic. It compares whatever numeric leaves the pipeline emits, so new report metrics start showing up in compare output automatically without requiring a second per-pipeline diff implementation.

### Performance reports

The performance tooling checks that browser-side search and domain operations stay within the intended latency envelope as heuristics evolve.

The report pipeline measures two complementary surfaces:

- domain microbenchmarks such as hashing, legal-action generation, and root-ordering reuse;
- shipped-browser interaction and AI timings, including hard-AI replies on the
  six `opening`, seeded-midgame, loop-pressure, and sparse-late fixtures from
  [`scripts/lateGamePerfFixtures.ts`](../../scripts/lateGamePerfFixtures.ts).

For a keep/reject decision between two implementations, use the separate immutable-revision A/B runner instead of comparing one-off report files:

```bash
pnpm perf:ab --baseline=main --candidate=<candidate-ref>
```

It counterbalances run order, validates build/test and workload identity for both revisions, and uses hard-mode nodes per second as the default decision metric while guarding legal-action fixtures and completed search depth. The full contract, bootstrap method, artifact layout, and limits of inference are documented in [`docs/performance-ab-testing.md`](../../docs/performance-ab-testing.md).

### Measured optimization ledger

The table below records the latest search/domain round so that implementation
status is not reconstructed from commit messages or remembered as stronger
than the evidence. Percentages are median paired changes in hard-mode nodes per
second; intervals are paired 95% bootstrap intervals. The runner's default
materiality boundary is `5%`, and its normal decision minimum is ten pairs.

| Workstream                                   | Revisions and pairs                       | Measured result                                                                        | Current status                                                                                                                                                                             |
| -------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| staged quiescence scoring                    | `f5226fc -> 78fbd1f`, 10 pairs            | `+72.3066%` (`+70.5932%..+74.0097%`)                                                   | independently confirmed; retained                                                                                                                                                          |
| direct quiescence action scan                | `78fbd1f -> 625bdee`, 4 exploratory pairs | `-2.1913%` (`-3.2388%..+0.1108%`)                                                      | no evidence of benefit; reverted by `97c141e`                                                                                                                                              |
| sibling feature-invariant hoist              | `97c141e -> 1fe9439`, 4 exploratory pairs | `+0.4879%` (`-1.1908%..+2.5282%`)                                                      | noise-dominated; reverted by `5ab2e62`                                                                                                                                                     |
| generated-transition and victory-hash reuse  | `5ab2e62 -> bc3fd58`, 10 pairs            | `+6.9857%` (`+5.3276%..+7.9961%`)                                                      | independently confirmed; retained                                                                                                                                                          |
| incremental rolling participation update     | `bc3fd58 -> 9568b65`, 4 exploratory pairs | `-1.4092%` (`-2.0734%..+0.4694%`)                                                      | no evidence of benefit; reverted by `7192f8d`                                                                                                                                              |
| persistent repetition overlay alone          | `66c41b8 -> 5fcfbee`, 4 exploratory pairs | `+3.3784%` (`+2.1347%..+4.1613%`)                                                      | positive exploratory signal below materiality; retained and re-tested only as part of the combined bundle                                                                                  |
| existence-only legality alone                | `7192f8d -> 1af2b07`, 4 exploratory pairs | `+2.5103%` (`+1.9624%..+3.7365%`)                                                      | positive exploratory signal below materiality; first reverted, then restored in the combined bundle                                                                                        |
| repetition overlay + existence-only legality | `66c41b8 -> e39a408`, 10 pairs            | `+5.9320%` (`+4.5715%..+6.8268%`)                                                      | interval excludes regression but crosses the `5%` decision boundary; runner verdict `inconclusive`, retained under the documented smaller-positive policy after equivalence/quality checks |
| direct participation quality observability   | commit `a18e6f8`                          | adds `meanParticipationDelta` and `positiveParticipationPlyShare`; no throughput claim | retained test/report infrastructure                                                                                                                                                        |
| fused victory checker counting               | `a18e6f8 -> d898ab1`, 10 pairs            | `+2.0350%` (`+0.8185%..+2.8840%`)                                                      | runner verdict `null-result`; retained as a small positive, low-complexity change after equivalence/quality checks                                                                         |
| cumulative retained round                    | `f5226fc -> d898ab1`, 10 pairs            | `1783.81 -> 3526.52` nodes/s; `+97.7212%` (`+83.2119%..+99.5551%`)                     | confirmed for `domain-ai-v1`; legal fixtures and completed depth passed all pairs                                                                                                          |

Raw `output/perf-ab/` runs are intentionally ignored by Git because each run
contains worktrees' logs and per-pair JSON. The immutable commit ids, workload,
and procedure above are the durable rerun coordinates; the exact artifact
layout and interpretation rules live in
[`docs/performance-ab-testing.md`](../../docs/performance-ab-testing.md).

The final retained set was also compared with the instrumented aggregate
variety suite and the six stage fixtures. Those comparisons include opening
entropy, persona coverage, repetition/undo rates, composite interestingness,
`meanParticipationDelta`, and `positiveParticipationPlyShare`. A throughput
result is not considered a behavior-equivalence proof; those separate reports
are the reason the participation metrics were added explicitly.

### Ideas deliberately not shipped

- A direct quiescence scanner, sibling-invariant hoist, and incremental rolling
  participation updater were implemented as isolated experiments and reverted
  after the measurements above.
- A changed-cell/dependency-halo incremental evaluator was considered but was
  not implemented in the current tree and has no committed A/B result. The
  current implementation continues to use whole-position analysis plus keyed
  reuse. Any future attempt needs a versioned dependency map and an exact
  whole-position oracle before it can make a performance claim.
- These null, inconclusive, and deferred outcomes are retained here because
  they narrow future research. They must not be described as shipped
  optimizations or folded into the cumulative result.

## File-by-File Summary

| File                                             | Role                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| [`behavior.ts`](./behavior.ts)                   | hidden persona generation and persona-specific action/state bias |
| [`evaluation.ts`](./evaluation.ts)               | quiet leaf scoring                                               |
| [`moveOrdering.ts`](./moveOrdering.ts)           | static and dynamic move ranking                                  |
| [`strategy.ts`](./strategy.ts)                   | structural interpretation and semantic tagging                   |
| [`participation.ts`](./participation.ts)         | anti-oscillation and material-breadth scoring                    |
| [`risk.ts`](./risk.ts)                           | stagnation detection, draw utility, and live risk-mode shaping   |
| [`search/rootSearch.ts`](./search/rootSearch.ts) | top-level orchestration and fallbacks                            |
| [`search/negamax.ts`](./search/negamax.ts)       | recursive alpha-beta core                                        |
| [`search/quiescence.ts`](./search/quiescence.ts) | forcing-leaf stabilization                                       |
| [`search/result.ts`](./search/result.ts)         | result shaping and candidate selection                           |
| [`model/actionSpace.ts`](./model/actionSpace.ts) | action-index contract                                            |
| [`model/encoding.ts`](./model/encoding.ts)       | state-to-tensor bridge                                           |
| [`model/guidance.ts`](./model/guidance.ts)       | runtime ONNX inference bridge                                    |
| [`worker/ai.worker.ts`](./worker/ai.worker.ts)   | browser worker boundary                                          |

## Intentional Non-Goals

This AI is intentionally not trying to be:

- a server-side engine;
- a model-only policy picker;
- a literal AlphaZero clone;
- a full theorem-proving search with no product constraints on time, memory, or responsiveness.

The design target is a strong, explainable, bounded browser opponent.

## Algorithmic Lineage

The repository is not a direct reproduction of any single paper. The table below maps visibly implemented techniques to the closest primary references and the files where they appear.

| Implemented technique                                                                                                      | Repo surface                                                                                                                               | Reference                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alpha-beta / negamax zero-sum search                                                                                       | [`search/negamax.ts`](./search/negamax.ts)                                                                                                 | Donald E. Knuth and Ronald W. Moore, "An Analysis of Alpha-Beta Pruning," _Artificial Intelligence_ 6(4), 1975. DOI: `10.1016/0004-3702(75)90019-3`                                                                                                                                                                                    |
| Iterative deepening under fixed budgets                                                                                    | [`search/rootSearch.ts`](./search/rootSearch.ts)                                                                                           | Richard E. Korf, "Depth-first Iterative-Deepening: An Optimal Admissible Tree Search," _Artificial Intelligence_ 27(1), 1985. DOI: `10.1016/0004-3702(85)90084-0`                                                                                                                                                                      |
| Principal variation / null-window re-search                                                                                | [`search/negamax.ts`](./search/negamax.ts), [`search/rootSearch.ts`](./search/rootSearch.ts)                                               | Murray Campbell and Tony Marsland, "A Comparison of Minimax Tree Search Algorithms," _Artificial Intelligence_ 20(4), 1983. DOI: `10.1016/0004-3702(83)90037-5`                                                                                                                                                                        |
| Quiescence search                                                                                                          | [`search/quiescence.ts`](./search/quiescence.ts)                                                                                           | Larry Harris, "The Heuristic Search and the Game of Chess: A Study of Quiescence, Sacrifices, and Plan Oriented Play," _IJCAI 1975_                                                                                                                                                                                                    |
| History heuristic family                                                                                                   | [`search/heuristics.ts`](./search/heuristics.ts)                                                                                           | Jonathan Schaeffer, "The History Heuristic and Alpha-Beta Search Enhancements in Practice," _IEEE TPAMI_ 11(11), 1989. DOI: `10.1109/34.42858`; YOUI's exact divide-by-four aging schedule is implementation-specific                                                                                                                  |
| Search-local repetition overlays; conceptual persistent-version lineage, not a reproduction of the paper's data structures | [`moveOrdering.ts`](./moveOrdering.ts), [`../domain/reducers/engineTransition.ts`](../domain/reducers/engineTransition.ts)                 | James R. Driscoll, Neil Sarnak, Daniel D. Sleator, and Robert E. Tarjan, "Making Data Structures Persistent," _Journal of Computer and System Sciences_ 38(1), 1989. DOI: `10.1016/0022-0000(89)90034-2`                                                                                                                               |
| Paired repeated-run measurement with uncertainty rather than best-of-N timing                                              | [`../../scripts/perf-ab.mjs`](../../scripts/perf-ab.mjs), [`../../scripts/perf-ab-core.mjs`](../../scripts/perf-ab-core.mjs)               | Andy Georges, Dries Buytaert, and Lieven Eeckhout, "Statistically Rigorous Java Performance Evaluation," _OOPSLA 2007_. DOI: `10.1145/1297105.1297033`; the repository adapts the repeated-run principle to its Node/browser workload rather than claiming to reproduce the paper's exact Java protocol                                |
| Residual network trunk for policy/value guidance                                                                           | [`training/train_policy_value.py`](../../training/train_policy_value.py)                                                                   | Kaiming He et al., "Deep Residual Learning for Image Recognition," _CVPR 2016_                                                                                                                                                                                                                                                         |
| Self-play policy/value conceptual lineage                                                                                  | [`scripts/ai-selfplay-dataset.ts`](../../scripts/ai-selfplay-dataset.ts), [`model/guidance.ts`](./model/guidance.ts)                       | David Silver et al., "Mastering the game of Go without human knowledge," _Nature_ 550, 2017. DOI: `10.1038/nature24270`                                                                                                                                                                                                                |
| Recurrence plots and recurrence quantification for loop/stall analysis                                                     | [`test/advancedMetrics.ts`](./test/advancedMetrics.ts), [`scripts/ai-loop-benchmark.report.ts`](../../scripts/ai-loop-benchmark.report.ts) | J.-P. Eckmann, S. O. Kamphorst, and D. Ruelle, "Recurrence Plots of Dynamical Systems," _Europhysics Letters_ 4(9), 1987. DOI: `10.1209/0295-5075/4/9/004`; Charles L. Webber Jr. and Joseph P. Zbilut, "Dynamical assessment of physiological systems and states using recurrence plot strategies," _J. Appl. Physiology_ 76(2), 1994 |
| Sample entropy for score-series irregularity                                                                               | [`test/advancedMetrics.ts`](./test/advancedMetrics.ts)                                                                                     | Joshua S. Richman and J. Randall Moorman, "Physiological time-series analysis using approximate entropy and sample entropy," _AJP Heart and Circulatory Physiology_ 278(6), 2000. DOI: `10.1152/ajpheart.2000.278.6.H2039`                                                                                                             |
| Permutation entropy for ordinal score complexity                                                                           | [`test/advancedMetrics.ts`](./test/advancedMetrics.ts)                                                                                     | Christoph Bandt and Bernd Pompe, "Permutation entropy: a natural complexity measure for time series," _Physical Review Letters_ 88(17), 2002. DOI: `10.1103/PhysRevLett.88.174102`                                                                                                                                                     |
| Procedural personas / diverse competitive play-styles as the design basis for hidden personas and cross-play               | [`behavior.ts`](./behavior.ts), [`scripts/ai-crossplay.report.ts`](../../scripts/ai-crossplay.report.ts)                                   | Antonios Liapis, Julian Togelius, and Georgios N. Yannakakis, "Procedural Personas as Critics for Dungeon Generation," _EvoApplications 2015_; Diego Perez-Liebana et al., "Generating Diverse and Competitive Play-Styles for Strategy Games," 2021                                                                                   |

## References

- [Knuth and Moore 1975](https://charlesames.net/references/DonaldKnuth/alpha-beta.html)
- [Korf 1985](https://doi.org/10.1016/0004-3702%2885%2990084-0)
- [Campbell and Marsland 1983](https://doi.org/10.1016/0004-3702%2883%2990037-5)
- [Harris 1975](https://www.ijcai.org/Proceedings/75/Papers/048.pdf)
- [Schaeffer 1989](https://doi.org/10.1109/34.42858)
- [Driscoll et al. 1989](https://doi.org/10.1016/0022-0000%2889%2990034-2)
- [Georges, Buytaert, and Eeckhout 2007](https://doi.org/10.1145/1297105.1297033)
- [Silver et al. 2017](https://www.nature.com/articles/nature24270)
- [He et al. 2016](https://www.cv-foundation.org/openaccess/content_cvpr_2016/html/He_Deep_Residual_Learning_CVPR_2016_paper.html)
- [Eckmann et al. 1987](https://doi.org/10.1209/0295-5075/4/9/004)
- [Webber and Zbilut 1994](https://journals.physiology.org/doi/abs/10.1152/jappl.1994.76.2.965)
- [Richman and Moorman 2000](https://pubmed.ncbi.nlm.nih.gov/10843903/)
- [Bandt and Pompe 2002](https://doi.org/10.1103/PhysRevLett.88.174102)
- [Liapis et al. 2015](https://antoniosliapis.com/research/pubs/liapis_evoapps15.pdf)
- [Perez-Liebana et al. 2021](https://arxiv.org/abs/2104.08641)

## Boundary Of This Document

This README explains architecture, runtime flow, and lineage. Exact heuristic coefficients and formulas live in [`HEURISTICS.md`](./HEURISTICS.md). Exact rule semantics live in [`../domain/README.md`](../domain/README.md). Cross-layer algorithm walkthroughs live in [`../../docs/ALGORITHMS.md`](../../docs/ALGORITHMS.md).
