Original prompt: PLEASE IMPLEMENT THIS PLAN:

# Long-Horizon AI Upgrade for YOUI

## Summary

- Treat this game as a logistics-and-conversion game, not a capture game. Good play means: create space from the full starting board, use stacks as temporary transport/control tools, freeze only when it blocks key lanes, and commit to either `homeField` dispersion or `sixStacks` conversion instead of mixing both every turn.
- Keep alpha-beta as the main search. In the current repo, local perf output already shows `hard` often ends opening searches at `completedDepth: 0`, so the next gain is not “more brute force” but `better node quality + better throughput + better long-range evaluation`.
- Use a staged hybrid. Phase 1 makes the current engine strategically competent and less loop-prone. Phase 2 adds an offline-trained policy/value model to give the engine a longer-horizon sense of which structures actually lead to wins.

## Phase 1: Strategic Alpha-Beta

- Normalize search scores to `side to move`, keep TT scores in the same orientation, and add `PVS + aspiration windows + quiescence`. Quiescence must resolve jump continuations, freeze/unfreeze swings, immediate `homeField` completions, immediate `sixStacks` completions, and forced rescue moves before static evaluation.
- Remove exact `getLegalActions()` mobility calls from every leaf. Replace them with one cached board-feature pass per hash; exact move generation stays at the root, in quiescence triggers, and in terminal-threat checks only.
- Replace the current flat evaluator with a phase-aware dual-plan evaluator. Compute `homePlanPotential`, `stackPlanPotential`, `laneOpenness`, `freezeTempo`, `transportValue`, `buriedOwnDebt`, and `conversionReadiness`, then choose `intent = home | sixStack | hybrid` from the board plus the last two own moves in history.
- Fix the current structural bias explicitly: a full owned height-3 stack gets the big completion bonus only on the actual front home row, never elsewhere; progress-to-home terms count every checker in a stack, not only the top checker.
- Tag every move with strategic families: `openLane`, `advanceMass`, `freezeBlock`, `rescue`, `frontBuild`, `captureControl`, `decompress`. Move ordering becomes `TT/PV > forced tactic > tactical > high plan score > history/killer > quiet`.
- Add anti-loop scoring: repetition penalty from `positionCounts`, self-undo penalty for restoring the same local pattern within 2 plies, and a novelty penalty when the AI repeats the same regional motif while a near-equal alternative exists.
- Hard mode becomes `strategic variety`. After search, keep up to 3 root moves within `max(60, 1.5% of |bestScore|)` of the best score, reject anything that fails a forced tactic, prefer candidates with different strategic tags, then sample with temperature `0.15`. Forced wins, only-move defenses, and losing-save draws stay deterministic.

## Phase 2: Learned Guidance

- Add an offline Python + PyTorch training pipeline and keep browser inference local through `onnxruntime-web`. If the model is missing or fails to load, the worker falls back to the phase-1 engine.
- Generate self-play data from the phase-1 engine with stochastic root choice for the first 8 plies, horizontal mirroring, and player-perspective normalization. Store `(state, maskedPolicyTarget, outcomeValue, strategicIntent)`.
- Encode each position as 16 planes on `6x6`: own active singles, own frozen singles, own top-on-height-2, own top-on-height-3, own buried depth-1, own buried depth-2, the same 6 planes for the opponent, plus `empty`, `own-home-mask`, `own-front-row-mask`, and `pending-jump-source`.
- Use a small residual CNN: 4 residual blocks, 32 channels, one policy head and one value head. The policy head outputs a fixed masked action space of `2736` logits: `36 manual-unfreeze`, `288 jump-direction`, `1152 adjacent-action`, `1260 friendly-transfer`. The value head outputs `[-1, 1]`.
- Use the model only as guidance: policy logits become move-order priors and root widening priors; value replaces the deepest quiet eval as a blend of `0.7 model / 0.3 heuristic` after quiescence.
- Re-run self-play after integration and iterate training twice. Do not switch to MCTS in this plan unless guided alpha-beta fails the opening-depth and self-play benchmarks.

## Public Interfaces

- Extend `AiDifficultyPreset` with `repetitionPenalty`, `selfUndoPenalty`, `varietyTopCount`, `varietyThreshold`, `varietyTemperature`, and `policyPriorWeight`.
- Extend `AiSearchResult` with `principalVariation`, `rootCandidates`, `diagnostics`, and `strategicIntent`.
- Each root candidate records `action`, `score`, `policyPrior`, `tags`, `intentDelta`, and `forced`.
- Keep the worker request shape unchanged except for the richer `AiSearchResult`; no new user-facing toggles in v1.

## Test Plan

- Add regression fixtures for the user’s loop patterns and assert the AI chooses a non-looping equal-or-better move.
- Add phase tests: opening positions must prefer decongestion; clear `homeField` positions must prefer dispersion over local stack churn; clear `sixStacks` positions must prefer front-row scaffolds and completion.
- Add parity and stability tests: odd/even depth agreement, timeout fallback, quiescence boundaries, TT reuse, repetition avoidance, and self-undo rejection.
- Add creativity tests: in stable non-tactical roots, hard mode must produce at least 2 distinct openings across repeated runs without dropping below the near-equal threshold; in forced tactical roots, hard mode stays deterministic.
- Add learned-model tests: legal-action masking, worker fallback when ONNX is unavailable, single-load model caching, and no main-thread regression.
- Acceptance targets: hard mode completes at least depth `1` on the current `initialState` and `afterOpening` perf fixtures, cuts voluntary two-ply repeats by at least `75%`, and scores at least `+15%` more wins than the current hard engine over a 200-game mirrored gauntlet.

## Assumptions And References

- Defaults chosen: browser-local inference, offline Python training allowed, hard mode favors strategic and human-like variety, and plan-switching is allowed only when the new intent clearly beats the old one.
- Best-practice conclusion: use variable-depth/quiescence before deeper brute force, use game-specific phase/intention features before adding randomness, and use self-play policy/value learning once terminal rewards are too far away for hand-tuned eval to stay reliable.
- References: [Kaindl 1983](https://www.ijcai.org/Proceedings/83-2/Papers/039.pdf), [Browne et al. 2012](https://repository.essex.ac.uk/4117/1/MCTS-Survey.pdf), [Chaslot et al. 2008](https://cris.maastrichtuniversity.nl/en/publications/progressive-strategies-for-monte-carlo-tree-search/), [Lanctot et al. 2014](https://arxiv.org/abs/1406.0486), [Tesauro 1992](https://research.ibm.com/publications/temporal-difference-learning-of-backgammon-strategy), [Tesauro 2002](https://bkgm.com/articles/tesauro/ProgrammingBackgammon.pdf), [Silver et al. 2017](https://arxiv.org/abs/1712.01815).

Notes:

- Current repo already has partial phase-1 work: quiescence, repetition/self-undo penalties, root candidate diagnostics, and default threefold draws in computer matches.
- Remaining implementation work is focused on richer strategic evaluation, strategic move tags/variety, learned-guidance scaffolding, and broader regression coverage.

Update 2026-03-28 (risk-aware, draw-averse, persona-based computer opponent):

- Added hidden per-match AI personas in `src/ai/behavior.ts` and persisted them through session `v4` (`aiBehaviorProfile`) so resumed computer games keep the same behavioral flavor.
- Added `src/ai/risk.ts` with stagnation detection, late-game escalation at `moveNumber >= 70`, and dynamic draw utility so equal-or-better draws are treated as undesirable while losing draws can still be acceptable.
- Wired personas and risk modes through the worker/store/search pipeline:
  - worker requests now carry `behaviorProfile`
  - `AiSearchResult` now exposes `behaviorProfileId`, `riskMode`, and expanded diagnostics for draw aversion and risk triggers
  - root candidate selection now reranks only inside the near-best band, so riskier play never overrides forced tactics.
- Updated self-play/reporting/training surfaces so generated behavior data reflects the shipped runtime:
  - `src/ai/test/metrics.ts` traces now record `behaviorProfileId` and `riskMode`
  - `scripts/ai-variety.report.ts` now foregrounds `decisiveResultShare`
  - `scripts/ai-stage-variety.report.ts` now breaks the same behavior metrics out across `opening`, `turn50`, `turn100`, and `turn200`, with explicit `riskMode` activation shares so late-game regressions can be judged against actual behavior changes
  - `scripts/ai-selfplay-dataset.ts` now assigns deterministic personas to both sides.
- Extended regression coverage for:
  - session migration to canonical `v4`
  - persisted/rehydrated behavior profiles
  - draw-aversion evaluation
  - late-risk metadata in search results.

Update 2026-03-28 (opening variety + tactical anti-loop follow-up):

- Strengthened the hidden-persona system so it now affects the shipped opening, not only equal quiet leaves:
  - `src/ai/behavior.ts` now adds seeded source-geometry bias (`center` vs `inner` vs `edge`) on top of semantic tag bias
  - `src/ai/moveOrdering.ts` applies that geometry bonus during the first six plies
  - `src/ai/search/rootSearch.ts` attenuates root policy-prior weight in those opening plies so the persona can break ties inside a safe band instead of being drowned by one policy-favored move
- Tightened low-confidence root selection:
  - `src/ai/search/result.ts` now widens the candidate band in openings and timeout/fallback risk roots
  - score gaps inside that boosted band are compressed and the best adjusted candidate is chosen deterministically
  - this was necessary because the old weighted sampling still collapsed back to one opener in stable self-play traces
- Tightened anti-loop handling for non-forced tactical lines:
  - non-forced tactical candidates are no longer exempt from self-undo and repetition pressure
  - risk-mode reranking now evaluates non-forced tactical candidates instead of only quiet ones
  - root-level risk probing no longer discards tactical candidates that show certified progress
- Measured outcome from the regenerated reports:
  - aggregate opening entropy moved from `0` to about `1.58`
  - aggregate source-family opening concentration fell from about `0.40` to about `0.30`
  - the stage `turn50` continuation no longer exhibits the previous heavy loop profile; hard-mode repetition dropped from about `0.41` to about `0.025` in the normalized continuation report
  - decisive/tension metrics are still the main remaining weak spot, but the persona/risk system is now visibly active in both opening and late-midgame reports

Update 2026-03-12:

- Implemented a cached strategic analysis layer in `src/ai/strategy.ts` and rewrote `src/ai/evaluation.ts` to score `home` / `sixStack` / `hybrid` plans instead of exact leaf mobility.
- Extended move ordering with strategic tags, intent deltas, novelty penalties, and optional policy priors.
- Added PVS, aspiration re-search accounting, richer diagnostics, and strategic-intent/root-candidate reporting in the alpha-beta search.
- Added optional ONNX guidance plumbing:
  - TS action-space and board encoders in `src/ai/model/`
  - worker-side optional model loading with cheap asset probing before importing ONNX runtime
  - offline self-play dataset export script in `scripts/ai-selfplay-dataset.ts`
  - Python/PyTorch training scaffold in `training/`
- Added/updated regression coverage for:
  - strategic intent and richer preset/result contracts
  - model encoding/action mapping/fallback
  - hard-mode variety selection
  - existing AI/store integration and soak behavior

Verification:

- `npm run build`
- `npm run test:run -- src/ai/model.test.ts src/ai/search.behavior.test.ts src/ai/search.timeout.test.ts src/app/store/createGameStore.ai.test.ts`
- `npm run test:run -- src/ai/search.soak.test.ts`
- `npm run ai:selfplay -- --games=1 --max-turns=2 --out=output/training/test.jsonl`
- Browser smoke via local Playwright against `npm run preview -- --host 127.0.0.1 --port 4177`

Known limitation:

- The optional learned-guidance path is integrated as root policy guidance in the browser worker. The recursive search remains synchronous, so the ONNX value head is loaded and exposed in guidance results but is not yet queried at deep leaf nodes inside negamax/quiescence.

Update 2026-03-13:

- Implemented the checker-participation / anti-concentration pass:
  - new `src/ai/participation.ts` model rebuilt from recent same-side turns
  - participation-aware eval bonuses/penalties for fresh activation, wider frontier, idle-reserve release, and source-family reuse
  - participation deltas threaded through move ordering, negamax, quiescence, root candidates, and ordered timeout fallback
  - root variety now buckets near-equal candidates by `sourceFamily` before sampling
- Extended AI contracts and presets with participation knobs and diagnostics:
  - `participationBias`, `participationWindow`, `sourceReusePenalty`, `frontierWidthWeight`, `familyVarietyWeight`
  - result diagnostics now include `orderedFallbacks`, `participationPenalties`, and `sourceFamilyCollisions`
- Added/updated regression coverage:
  - `src/ai/search.behavior.test.ts`
  - `src/ai/search.timeout.test.ts`
  - `src/ai/search.variety.test.ts`
  - `src/app/store/createGameStore.ai.test.ts`
  - helper/report updates in `src/ai/test/metrics.ts` and `scripts/ai-variety.report.ts`

Verification 2026-03-13:

- `npm run build`
- `npm run test:run -- src/ai/search.behavior.test.ts src/ai/search.variety.test.ts src/ai/search.timeout.test.ts src/ai/model.test.ts src/app/store/createGameStore.ai.test.ts`
- Browser smoke on built preview (`vite preview`): computer game starts, first human move triggers a valid computer reply, and the worker returns `orderedRoot` fallback with diversified root candidates instead of failing

Current note:

- `npm run ai:variety -- --pairs=2 --max-turns=40` still exits non-zero because the checked-in baseline/target thresholds flag older variety issues (`stagnationWindowRate`, `decompressionSlope`, `twoPlyUndoRate`), but the new checker-concentration metrics are now present in the report:
  - easy: `sameFamilyQuietRepeatRate=0`, `sourceFamilyOpeningHhi=0.421875`
  - medium: `sameFamilyQuietRepeatRate=0.333333`, `sourceFamilyOpeningHhi=0.296875`
  - hard: `sameFamilyQuietRepeatRate=0.4`, `sourceFamilyOpeningHhi=0.296875`

Update 2026-03-13 (multijump follow-up, in progress):

- Implementing the rules change where a jump with further continuation keeps the same player on move until they switch to a non-jump move or the latest jump runs out of continuations.
- Plan is to keep `pendingJump` serialized as-is for compatibility, but reinterpret it as optional follow-up context and replace the store's forced jump preselection with a neutral follow-up interaction state.

Update 2026-03-13 (multijump follow-up, complete):

- Domain:
  - `pendingJump` now means an optional same-player follow-up window after a jump, not a forced same-source lock.
  - move generation and validation now allow any legal continued action during that window; only same-source continuation jumps reuse the stored visited jump-state keys.
  - a non-jump follow-up clears `pendingJump`, while a jump that still has continuation reopens it with the new landing source.
- Store/UI:
  - added neutral `jumpFollowUp` interaction copy/state instead of auto-selecting the jumper after the first jump.
  - cancel/rehydrate/boot now restore that neutral follow-up state, while `buildingJumpChain` remains only for picking the landing of the currently selected jump.
- Docs/help text:
  - updated rulebook, technical docs, glossary text, and AI/domain readmes to describe the continued-jump follow-up rule.
- Regression coverage:
  - domain tests now cover alternate-piece follow-up moves, continued jump chains beyond two jumps, and immediate win-on-jump behavior.
  - store tests now cover neutral follow-up state, pass only after switching away from jumps or exhausting them, hydration of saved `pendingJump` sessions, and AI auto-scheduling of repeated jump follow-ups.

Verification 2026-03-13:

- `npm run build`
- `npm run test:run -- src/domain/rules/gameEngine.moves.test.ts src/domain/rules/gameEngine.actions.test.ts src/domain/rules/gameEngine.session.test.ts src/app/store/createGameStore.history.test.ts src/app/store/createGameStore.ai.test.ts src/app/App.test.tsx src/app/rendering.test.tsx src/ui/tabs/GameTab/GameTab.test.tsx`
- Manual Playwright smoke on `vite preview -- --host 127.0.0.1 --port 4177`:
  - imported a valid saved session with an active `pendingJump`
  - UI showed the new neutral follow-up prompt (`jumpFollowUp`)
  - selected another checker, performed a non-jump follow-up move, and confirmed the turn handed off only after that second action
  - browser console showed only the pre-existing missing `favicon.ico` 404 on load

Correction 2026-03-13:

- The first multijump follow-up implementation still capped jump chaining after the second action because `applyValidatedAction()` only reopened `pendingJump` when no follow-up was already active.
- Fixed the reducer so every jump that lands with further continuation reopens `pendingJump`, even when the move already happened during a follow-up window.
- Updated docs and regressions to match the actual intended rule: the same player may keep jumping indefinitely while each latest jump still has continuations, and the turn ends only after a non-jump move or a jump with no continuation.

Verification 2026-03-13 (correction):

- `npm run build`
- `npm run test:run -- src/domain/rules/gameEngine.moves.test.ts src/app/store/createGameStore.history.test.ts src/app/store/createGameStore.ai.test.ts`
- Fixed a follow-up TypeScript issue in `src/app/store/createGameStore.history.test.ts` where repeated `store.getState()` calls prevented narrowing `interaction` to `jumpFollowUp`; this was breaking `tsc --noEmit` while Vitest still passed.
- Browser smoke on `vite preview -- --host 127.0.0.1 --port 4177`:
  - loaded a valid full-checker hot-seat session tailored to the repeated-jump scenario
  - executed `White: Jump A1 -> C3`, then `White: Jump A3 -> C5`
  - confirmed the UI still showed the neutral follow-up prompt and kept White on move after the second jump
  - executed the third jump `White: Jump C5 -> E3` and confirmed the turn only passed after that jump exhausted its continuations
  - the bundled `develop-web-game` Playwright client still cannot import `playwright` from its skill directory in this repo layout, so browser verification used the built-in Playwright MCP instead

Update 2026-03-13 (AI cold start + false ONNX detection):

- Tightened `src/ai/model/guidance.ts` so the optional model probe uses a ranged `GET`, rejects app-shell HTML responses by content type or prefix, and skips importing `onnxruntime-web` when the model asset is effectively missing.
- Added a per-worker cold-start watchdog buffer in `src/app/store/createGameStore/aiController.ts` so the first AI request can survive runtime/bootstrap latency while warm follow-up requests keep the shorter timeout.
- Added regression coverage in:
  - `src/ai/model.test.ts`
  - `src/app/store/createGameStore.ai.test.ts`

Verification 2026-03-13 (AI cold start + false ONNX detection):

- `npm run test:run -- src/ai/model.test.ts src/app/store/createGameStore.ai.test.ts`
- `npm run build`
- Browser smoke on `vite preview -- --host 127.0.0.1 --port 4177`:
  - started a fresh `Play vs computer` game as Black on `Easy`
  - confirmed the first computer move completed and history advanced to `Total: 1`
  - confirmed no `/assets/ort.bundle...` or `/assets/ort-wasm...` requests were made when the model path resolved to the app shell instead of a real ONNX file
- Live deploy note:
  - `https://youi.ks7-1498.workers.dev` still serves the pre-fix bundle, so the old failure mode remains there until redeploy

Update 2026-03-19 (Frozen jumps / AI pacing / follow-up UX):

- Domain and UI changes completed:
  - frozen singles can now always be jumped, and the jumped checker thaws regardless of owner
  - AI move chains now pause for `AI_MOVE_REVEAL_MS = 550` before scheduling the next computer request
  - the jump follow-up UI now uses a source highlight plus a dedicated callout instead of forced preselection
- Verification:
  - `npm run build`
  - `npm run lint`
  - `npm run test:run -- src/domain/rules/gameEngine.moves.test.ts src/domain/rules/gameEngine.actions.test.ts src/app/store/createGameStore.ai.test.ts src/app/App.test.tsx src/app/rendering.test.tsx src/ui/tabs/GameTab/GameTab.test.tsx src/ai/search.behavior.test.ts`
  - Browser smoke on `vite preview -- --host 127.0.0.1 --port 4177`:
    - desktop hot-seat smoke proved `A1 -> C3 -> E5` can jump over frozen enemy singles and thaw them
    - compact computer smoke used a fake worker to prove the reveal pause between AI jump segments and captured the source-highlight follow-up state
- Notes:
  - the repo still contains legacy documentation note files in `docs/Documentation.md` and `docs/technical-spec.md`; they were left untouched by this change
  - no open follow-up tasks remain for the requested rule/UI update

Update 2026-03-23 (Perf harness late-game AI states):

- Added deterministic imported-session perf fixtures for `opening`, `turn50`, `turn100`, and `turn200`.
- `scripts/perf-report.mjs` now measures hard-AI replies on those imported states under the same mobile CPU profiles (`1x`, `4x`, `6x`) used by the weak-device harness.
- Updated `README.md` and `src/ai/README.md` so docs now mention root ordering precompute/rescore reuse plus the expanded perf-report coverage.

Update 2026-03-24 (nextPositionKey reuse):

- Ordered move entries now carry both `serializedAction` and `nextPositionKey` from `moveOrdering.ts`.
- `search/rootSearch.ts`, `search/negamax.ts`, `search/quiescence.ts`, and `search/heuristics.ts` now reuse those carried values instead of re-running `actionKey()` / `hashPosition()` on the same child move/state.
- Verified exactness with:
  - `npm run test:run -- src/ai/moveOrdering.test.ts src/ai/search.behavior.test.ts src/ai/search.timeout.test.ts src/ai/search.variety.test.ts src/ai/search.soak.test.ts`
  - `npm run build`
- Perf validation:
  - conservative whole-search A/B benchmark against a temporary baseline copy (consumer-side reuse reverted only): `avgNodesPerMs` improved from `0.4214` to `0.4313` (`+2.35%`), total evaluated nodes from `21070.4` to `21572` (`+2.38%`) under the same fixed benchmark setup
  - isolated hot-path benchmark of repeated child key reuse on representative ordered move sets: recompute path `8004.27ms`, reuse path `7.96ms`, same checksum

Update 2026-03-24 (Multi-jump revisit restriction):

- Replaced the old jump-loop guard that keyed on `(landing coord, board hash)` with explicit visited-landing tracking for the active jump chain.
- New rule behavior: during a multi-jump, a jumping piece may not land on any coordinate it has already occupied earlier in that same chain, even if the intervening jumps changed frozen states elsewhere on the board.
- `pendingJump` now stores `visitedCoords` for live/search states, while session guards still accept legacy `visitedStateKeys` payloads so older saves remain readable.

Update 2026-03-28 (advanced AI evaluation pipelines + git compare tooling):

- Added nonlinear and symbolic trace analytics in `src/ai/test/advancedMetrics.ts`:
  - recurrence quantification analysis (`recurrenceRate`, `determinism`, `laminarity`, `trappingTime`)
  - score-series sample entropy
  - score-series permutation entropy
  - normalized symbolic Lempel-Ziv complexity over visited-position sequences
  - loop-escape latency detection after repetition/risk activation
- Extended `src/ai/test/metrics.ts` traces so report scripts can inspect selected-move structure directly:
  - persisted per-ply `afterPositionKey`
  - root-candidate deltas for empty cells, mobility, freeze swing, home-field progress, and six-stack progress
  - `isRiskProgressCertified`
  - per-side difficulty and persona metadata in each trace
- Added focused AI report pipelines:
  - `scripts/ai-crossplay.report.ts`
  - `scripts/ai-loop-benchmark.report.ts`
  - `scripts/ai-position-buckets.report.ts`
  - `scripts/ai-threat.report.ts`
  - shared scenario bucketing in `scripts/aiScenarioCatalog.ts`
- Added a generic git-aware compare wrapper:
  - `scripts/report-compare-utils.mjs`
  - `scripts/run-git-report-compare.mjs`
  - npm wrappers for `ai:variety`, `ai:stage-variety`, `ai:crossplay`, `ai:loop-benchmark`, `ai:position-buckets`, `ai:threat`, and `perf:report`
- Updated docs so the report family, complex metrics, and compare workflow are documented in:
  - `README.md`
  - `src/ai/README.md`
  - `docs/INFRASTRUCTURE.md`

Verification 2026-03-28 (advanced evaluation tooling):

- `npm run build`
- `npm run test:run -- src/ai/test/advancedMetrics.test.ts`
- `npm run ai:crossplay -- --pairs=1 --max-turns=20`
- `npm run ai:loop-benchmark -- --pairs=2 --max-turns=20`
- `npm run ai:position-buckets -- --pairs=1 --max-turns=20`
- `npm run ai:threat -- --pairs=2 --max-turns=20`
- `npm run ai:variety:compare -- --before=HEAD --after=working --pairs=1 --max-turns=12`
- `npm run ai:loop-benchmark:compare -- --before=working --after=working --pairs=1 --max-turns=8`

Update 2026-03-26 (Pending-jump restriction boundary + continuation search semantics):

- Centralized the pending-jump acting-source restriction in move discovery/validation:
  - added `src/domain/rules/moveGeneration/turnConstraint.ts`
  - `getLegalActions()` now short-circuits directly to the forced source during a live continuation
  - `validateAction()` now rejects off-source actions, including `manualUnfreeze`, before type-specific validation
- Reworked AI continuation search semantics:
  - search ancestry now uses actor-aware line entries instead of ply-parity lookups for previous same-side move/position
  - negamax/root/quiescence now treat same-player continuation plies as maximizing nodes instead of negating them like opponent turns
- Stabilized perf fixtures:
  - added `scripts/lateGamePerfFixtures.ts`
  - domain/browser perf scenarios for `turn50/turn100/turn200` now replay fixed legal traces instead of regenerating states from `getLegalActions()[0]`

Verification 2026-03-26:

- `pnpm build`
- `npm run perf:report`
- Fixed-state perf comparison vs stored pre-change baseline (`output/playwright/domain-perf.before.json` -> `output/playwright/domain-perf.json`):
  - `jumpContinuation` hard search improved: `2417 -> 1743` evaluated nodes, `46 -> 25` PVS researches, `1203.56ms -> 1005.56ms`
  - `threatState` hard search changed shape: `1251 -> 1896` evaluated nodes, but PVS remained near-flat `2 -> 3`, source-family collisions improved `307 -> 121`, and wall time stayed budget-flat `1200.18ms -> 1200.2ms`
  - average AI wall time: easy `101.8 -> 102.85`, medium `350.59 -> 348.4`, hard `1201.08 -> 1151.59`
- Domain microbenchmarks after the rule-boundary cleanup:
  - `getLegalActions`: `0.0998ms -> 0.1146ms`
  - `getLegalActionsForCell`: unchanged at `0.0002ms`
  - `selectableCoordsScan`: `0.0959ms -> 0.1089ms`
  - `advanceEngineState`: `0.1054ms -> 0.1209ms`

Open verification note:

- `vitest` still reproduces an unrelated existing failure in `src/app/App.test.tsx` (`switches the interface language globally, including lazy-loaded tabs`); the DOM snapshot shows the app landing on the score/settings surface instead of the expected game copy after toggling English. This failure is outside the domain/AI files changed in this update.
- Added a domain regression where a four-segment loop could previously revisit `C3` through a different route after changing other board cells; that revisit is now excluded while fresh continuation targets remain legal.

Verification 2026-03-24 (Multi-jump revisit restriction):

- `npm run test:run -- src/domain/rules/gameEngine.moves.test.ts src/domain/rules/gameEngine.actions.test.ts src/domain/rules/gameEngine.session.test.ts src/app/store/createGameStore.ai.test.ts`
- `npm run test:run`
- `npm run build`
- Browser smoke on `vite preview -- --host 127.0.0.1 --port 4177`:
  - verified the app shell, board, history, and move sidebar render successfully after the rule change
  - browser console reported no errors

Update 2026-03-25 (Event-driven engine control point, compatibility-safe):

- Added a new internal engine transition pipeline in `src/domain/reducers/engineTransition.ts`:
  - `runEngineCommand()` now executes the authoritative command -> state transition for domain actions.
  - `runGameCommand()` wraps that pipeline with history append for the app-facing reducer path.
  - the pipeline emits domain events such as `jumpContinuationOpened`, `turnChanged`, `autoPass`, `gameOver`, and `positionCountUpdated`.
- Kept public compatibility:
  - `advanceEngineState()` and `applyAction()` still exist and now delegate to the new transition pipeline.
  - session format compatibility remains intact; no saved-session version bump was introduced.
- Added a centralized pending-jump helper in `src/domain/model/pendingJump.ts` so hashing and state validation stop duplicating fallback logic across `jumpedCheckerIds`, `visitedCoords`, and `visitedStateKeys`.
- Introduced canonical action handlers in `src/domain/rules/moveGeneration/actionHandlers.ts` so move generation and validated application share one ordered rule registry instead of parallel hand-written switches.
- Store integration:
  - `src/app/store/createGameStore/transitions.ts` now consumes `runGameCommand()` and uses emitted domain events for jump-follow-up detection before falling back to reconstructed state.

Verification 2026-03-25 (Event-driven engine control point):

- `npm run test:run -- src/domain/reducers/engineTransition.test.ts src/domain/rules/gameEngine.moves.test.ts src/domain/rules/gameEngine.actions.test.ts src/app/store/createGameStore.history.test.ts src/app/store/createGameStore.ai.test.ts`
- `npm run build`
- `npm run test:run`
- Browser smoke on `vite preview -- --host 127.0.0.1 --port 4177`:
  - verified the built app still exposes the game board, 36 board cells, and an active turn panel
  - browser console reported no errors

Update 2026-03-25 (Before/after fullscale perf check):

- Ran full harness on baseline (`HEAD`) in a detached worktree and copied artifacts to:
  - `output/playwright/perf-report.before.json`
  - `output/playwright/perf-report.before.md`
  - `output/playwright/domain-perf.before.json`
- Ran full harness on current working tree:
  - `npm run perf:report` -> `output/playwright/perf-report.json`
- Generated full before/after delta table:
  - `output/playwright/perf-report.before-after.md`
- Outcome:
  - measurable regressions are present in several engine hot-path and UI timings (for example `domain.getLegalActions`, `domain.advanceEngineState`, and open-move-dialog latency), plus one large late-game AI outlier in the `4x` throttled profile.
  - some metrics improved (for example FCP and mobile hard-AI opening), but this run does **not** support a strict "nothing got worse" conclusion.

Correction 2026-03-24 (Multi-jump loop rule):

- Replaced the just-added visited-landing restriction with the intended rule: a multi-jump may revisit earlier landing cells, including the start, but it may not jump over the same checker twice in the same chain.
- `pendingJump` now stores `jumpedCheckerIds` as the live/search continuation payload.
- Legacy `visitedCoords` / `visitedStateKeys` payloads remain readable, and the jump helper reconstructs jumped-checker history from legacy landing sequences or from committed history when needed.
- Added regressions for:
  - returning to the initial cell through a different jumped checker;
  - revisiting an earlier landing through a different checker while still rejecting continuations that reuse an already-jumped checker.

Verification 2026-03-24 (Multi-jump checker-repeat rule):

- `npm run test:run -- src/domain/rules/gameEngine.moves.test.ts src/domain/rules/gameEngine.actions.test.ts src/domain/rules/gameEngine.session.test.ts src/app/store/createGameStore.ai.test.ts`
- `npm run build`
- Browser smoke on `vite preview -- --host 127.0.0.1 --port 4177`:
  - the bundled `develop-web-game` Playwright client still cannot import `playwright` from its skill directory in this repo layout, so browser verification used Playwright MCP instead
  - verified the preview renders the board, selecting `Cell A3` updates the move sidebar, and browser console output remains clean

Update 2026-03-25 (Refactor perf recovery):

- Kept the event-driven engine control point, but restored fast paths in the hot loops:
  - `runEngineCommand()` now supports `emitEvents: false`, and `advanceEngineState()` uses that state-only path so AI/search callers no longer pay for event construction and `structuredClone()` work they never read.
  - move generation now bails out immediately for empty/opponent cells before touching per-action generation, resolves the rule config once per whole-board scan, and uses cheaper adjacent-target loops instead of layered `flatMap()` allocations.
  - jump continuation target discovery now filters one-step candidates directly from the current board + jumped-checker set instead of cloning/resolving a whole board for every immediate jump candidate.
- Compatibility kept intact:
  - `advanceEngineState()` / `applyAction()` public behavior is unchanged.
  - `runEngineCommand()` and `runGameCommand()` still return the same shapes by default; events are only skipped when explicitly requested by engine-only callers.
  - saved-session compatibility and current jump rules were not changed by this perf pass.

Verification 2026-03-25 (Refactor perf recovery):

- Targeted correctness:
  - `npm run test:run -- src/domain/reducers/engineTransition.test.ts src/domain/rules/gameEngine.moves.test.ts src/domain/rules/gameEngine.actions.test.ts src/domain/performanceHelpers.test.ts`
  - `npm run test:run -- src/domain/rules/gameEngine.moves.test.ts src/domain/rules/gameEngine.actions.test.ts src/domain/reducers/engineTransition.test.ts`
- Project checks:
  - `npm run build`
  - `npm run lint`
- Browser smoke on `vite preview -- --host 127.0.0.1 --port 4177` via Playwright MCP:
  - verified the built app loads, the board renders, selecting `Cell A3` opens the move dialog, and browser console output remains clean
- Full before/after perf report:
  - `npm run perf:report`
  - refreshed `output/playwright/perf-report.before-after.md`
  - final domain deltas versus the saved baseline:
    - `getLegalActions avg`: `0.1189ms -> 0.1003ms` (`-15.64%`)
    - `advanceEngineState avg`: `0.1410ms -> 0.1109ms` (`-21.35%`)
    - `selectableCoordsScan avg`: `0.1135ms -> 0.0966ms` (`-14.89%`)
    - `hasLegalActionCheck avg`: `0.0232ms -> 0.0123ms` (`-46.98%`)
    - `getLegalActionsForCell total`: `0.32ms -> 0.28ms` (`-12.5%`)
- Remaining note:
  - some browser-side UI timings still move by a few percent run-to-run (`openMoveDialog` is the main example), but the refactor-driven engine regressions are no longer present in the final perf output

Update 2026-07-08 (Match UI cleanup):

- Simplified match setup so single-game setup no longer shows a `Game format` selector or disabled `Points to win` input.
- Replaced the old setup format radio group with a compact match toggle; `Points to win` appears only when the match toggle is enabled, and the checked state reads `Match enabled`.
- Moved live single/match switching into a dedicated mode card in the turn summary instead of mixing it into loose metadata rows.
- Updated App/GameTab unit coverage and the multi-game e2e setup flow for the new controls.

Verification 2026-07-08 (Match UI cleanup):

- `npm run test:run -- src/shared/i18n/catalog.test.ts src/app/App.test.tsx src/ui/tabs/GameTab/GameTab.test.tsx`
- `npm run build`
- `npx eslint scripts/multi-game.e2e.ts src/app/App.test.tsx src/ui/tabs/GameTab/GameTab.test.tsx src/ui/panels/MatchSetupPanel/MatchSetupPanel.tsx src/ui/panels/StatusSection/TurnSummaryStrip.tsx src/shared/i18n/catalog/text.ts`
- `npm run e2e:multi`
- Screenshots reviewed at `/tmp/youi-multi-game-e2e/{desktop,tablet,mobile}.png`.

Update 2026-07-08 (Single match-enable control):

- Removed the duplicate match enable toggle from `MatchSetupPanel`; the only enable/disable match control is now the live mode card in the turn summary.
- Synced `setupMatchSettings.gameFormat` when the live mode switch changes so the new-game setup follows the one visible switch.
- Kept `Points to win` hidden in single mode and visible only after match mode is enabled.

Verification 2026-07-08 (Single match-enable control):

- `npm run test:run -- src/app/store/createGameStore.series.test.ts src/shared/i18n/catalog.test.ts src/app/App.test.tsx src/ui/tabs/GameTab/GameTab.test.tsx`
- `npm run build`
- `npx eslint scripts/multi-game.e2e.ts src/app/App.test.tsx src/ui/tabs/GameTab/GameTab.test.tsx src/app/store/createGameStore.series.test.ts src/app/store/createGameStore/sessionActions.ts src/ui/panels/MatchSetupPanel/MatchSetupPanel.tsx src/ui/panels/StatusSection/TurnSummaryStrip.tsx src/shared/i18n/catalog/text.ts`
- `npm run e2e:multi`
- Default mobile browser check: `{ enableButtons: 1, enableCheckboxes: 0, targetInputs: 0 }`.

Update 2026-07-10 (authoritative multiplayer implementation):

- Added a shared history-free multiplayer reducer and canonical SHA-256 state hashing under `src/shared/multiplayer/`; parity tests run the same commands through the existing domain engine.
- Added one SQLite-backed `MatchRoom` Durable Object per match with one-time 256-bit capabilities, scoped HttpOnly session cookies, atomic state/command writes, idempotent command ids, hibernatable WebSockets, bounded reconnect replay, expiry alarms, and one-way repetition-count sharding.
- Added the browser `MultiplayerClient` with optimistic local projection, one-command backpressure, independent hash validation, reconnect/checkpoint recovery, and an optional performance-gated STUN-only WebRTC proposal path. WebSocket remains canonical.
- Added online create/join/invite/leave UI and locked undo, restart, import/export mutation, format changes, and rule changes while an online match is active.
- Added payload-efficiency regression tests, route security tests, online store safety tests, architecture/infrastructure documentation, and ADR 0001.
- Verified real local Worker flow through Wrangler: create room, consume capability, receive a scoped cookie, reject capability reuse, upgrade the authenticated socket, and receive `ready` plus a history-free snapshot.

Verification 2026-07-10 (authoritative multiplayer):

- `pnpm test:run` — 43 files, 267 passing tests, one intentional skip.
- `pnpm build` and `pnpm lint`.
- `pnpm exec wrangler deploy --dry-run` — `MatchRoom`, D1, both rate limiters, and static assets bundled successfully.
- Real local Wrangler smoke: match creation, one-time capability exchange, scoped cookie, capability-reuse rejection, WebSocket upgrade, `ready`, and snapshot.
- `pnpm e2e:multiplayer` — two isolated browser contexts created and joined a room, negotiated the optional direct path, committed `A1 -> B2`, converged at revision 1, and switched legal input to Player 2 with no console errors.
- Inspected desktop/mobile screenshots under `output/playwright/multiplayer/`, including connected and post-move states.

Production rollout TODO:

- Deploy the `v1` SQLite Durable Object migration and monitor direct-path success before deciding whether authenticated TURN is justified.

Update 2026-07-17 (production finishing-loop investigation):

- Correlated the player screenshot with the production D1 telemetry session: Chromium on Android, compact viewport, Easy computer match, release `0.3.3+da30795`, active around the screenshot's 08:06 phone time.
- The session persisted 170 committed moves across two gameplay batches and 40 `ai_slow` incidents, with no AI watchdog timeout or worker error.
- The trace shows normal human/computer alternation switching into consecutive computer-only `moveSingleToEmpty` actions during the match finishing phase.
- Reconstructed the screenshot board and reproduced the exact deterministic loop with the shipped finishing search: `A1 -> B1`, `B1 -> A1`, indefinitely, while Black remains at 6 home-field singles and 4 completed front-row stacks.
- Root cause: `finishingSearch.ts` scores only coarse completed progress, so both halves of the undo pair tie; its per-search `visited` set resets on every worker request and ignores historical `positionCounts`, so the separate finishing path does not inherit the normal AI repetition/self-undo protections.
- Coverage gap: CodeGraph reports no test covering `chooseFinishingAction`.

Recommended follow-up:

- Add a regression fixture from this board, make finishing search reject/penalize historical repeats and two-ply self-undo, and add checker-level conversion/distance progress so multi-move building plans outrank score-flat shuffling.
- Add a targeted `finishing_loop_detected` telemetry incident with match phase, move number, pending points, compact position fingerprint/snapshot, repetition count, no-progress streak, finishing progress metrics, action kind, and AI search outcome; flush it immediately. Ordinary context events are currently persisted only when another incident happens.

Update 2026-07-17 (telemetry hardening, in progress):

- Kept every AI search-budget exhaustion visible through the new `ai_search_budget_exhaustions` counter and richer `ai_completed` context.
- Restricted `ai_slow` incidents to genuinely degraded searches (zero completed depth or a 1.5x budget overrun) and rate-limited them to one per store runtime, preventing expected iterative-deepening timeouts from filling the incident cap.
- Added `searchMode`, move number, action kind, search depth/fallback, candidate/PV counts, and repetition/self-undo diagnostics to the AI lifecycle context.
- TDD verification: `pnpm exec vitest run src/app/store/createGameStore.telemetry.test.ts`.

Update 2026-07-17 (telemetry hardening, implementation complete):

- Added a finishing telemetry tracker that records start/move/completion counters and rolling context without checker IDs or raw move coordinates.
- Added deterministic position fingerprints, a compact anomaly-only board snapshot, progress/no-progress metrics, position-repeat counts, and two-ply undo detection.
- Added one rate-limited `finishing_loop_detected` incident for threefold positions, repeated two-ply undo, or eight finishing moves without progress.
- Added `flushCritical()` across the telemetry sink, buffered bootstrap proxy, and client; critical incidents now enqueue and deliver immediately using the existing schema and D1 tables.
- Regression coverage replays the production `A1 -> B1 -> A1 -> B1` loop through the public store and also verifies a healthy one-move finishing completion does not raise a loop incident.

Verification 2026-07-17 (telemetry hardening):

- `pnpm exec vitest run src/app/store/createGameStore.telemetry.test.ts src/app/store/createGameStore.series.test.ts src/app/store/createGameStore.ai.test.ts src/shared/telemetry/accumulator.test.ts src/shared/telemetry/bootstrap.test.ts src/shared/telemetry/client.test.ts worker/telemetry.test.ts worker/index.test.ts` — 45 passing tests.
- `pnpm test:run` — 55 files, 310 passing tests, one intentional skip.
- `pnpm build`.
- `pnpm lint`.
- `WRANGLER_LOG_PATH=/tmp/youi-wrangler.log pnpm exec wrangler deploy --dry-run` — assets, `MatchRoom`, D1, and both rate limiters bundled successfully.
- Bundled Playwright client smoke-tested the production build with no console errors; reviewed `/tmp/youi-browser-smoke/shot-0.png` and its rendered game state.

Previously remaining product work (completed below):

- This patch observes the finishing-mode AI loop but intentionally does not change AI move selection. The mechanics fix still needs historical-repeat/self-undo penalties plus a continuous finishing-progress evaluator and the screenshot-board regression at the search layer.

Update 2026-07-17 (after-win finishing AI liveness repair):

- Kept normal-game rules and normal alpha-beta search unchanged; the repair is confined to `searchMode: 'finishing'` and the pure finishing-progress read model.
- Added canonical `getFinishingProgress()` domain analysis shared by finishing search and telemetry. It measures the real victory requirements: home singles/mass/travel/stack debt and pure owned front-row stack completion/fill/travel.
- Finishing search now locks one completion goal per request, prefers unseen legal positions whenever one exists, and falls back to the least-repeated position only when every legal continuation has already appeared.
- The production screenshot board is now a search-level regression: Easy mode completes it within 40 after-win moves without revisiting a position. A separate test verifies the same repetition policy remains active when the 120 ms Easy budget forces an immediate fallback.
- Added domain coverage proving a mixed, merely controlled height-three front stack is not mistaken for a completed all-owned victory stack.

Verification 2026-07-17 (after-win finishing AI liveness repair):

- `pnpm test:run` — 56 files, 313 passing tests, one intentional skip.
- `pnpm build` and `pnpm lint`.
- `pnpm e2e:multi` — responsive setup, live mode switching, completion phase, next-game color choice, draw interstitial, and match completion passed without browser errors.
- The multi-game E2E harness now disables diagnostics in its isolated Vite contexts so expected missing Worker telemetry routes do not become unrelated 404 console failures.
- `WRANGLER_LOG_PATH=/tmp/youi-wrangler.log pnpm exec wrangler deploy --dry-run` — assets, `MatchRoom`, D1, and both rate limiters bundled successfully.
- Bundled web-game Playwright client selected computer mode against the production build; reviewed `/tmp/youi-after-win-client-4/shot-0.png` and `state-0.json` with no console error artifact.

Update 2026-07-17 (AI move reveal and board highlights, implementation):

- Replaced the generic post-AI reveal delay with `AI_JUMP_STEP_REVEAL_MS`; the 300 ms pause is now scheduled only when the committed AI jump leaves a forced continuation.
- Ordinary consecutive AI moves, including after-win finishing moves, schedule the next search immediately. Search computation remains asynchronous in the worker and still locks player input during a computer turn.
- Added canonical turn-action endpoint projection for regular moves, jump sequences, and manual unfreezes.
- The board now derives the last committed action from the current history cursor and marks its source and final destination with restrained olive overlays; the destination is slightly stronger, matching the supplied chess reference without obscuring checkers or legal-target feedback.
- Added the same endpoint projection to `render_game_to_text` as `lastMove`, and disabled the cell transition under reduced-motion preferences.
- TDD coverage confirms ordinary finishing follow-ups are immediate, jump continuations retain the pause, and jump source/destination cells expose the expected highlight state.

Verification 2026-07-17 (AI move reveal and board highlights):

- `pnpm test:run` — 57 files, 315 passing tests, one intentional skip.
- `pnpm build` and `pnpm lint`.
- `pnpm e2e:multi` — the multi-game browser scenario passed.
- `WRANGLER_LOG_PATH=/tmp/youi-wrangler.log pnpm exec wrangler deploy --dry-run` — assets, `MatchRoom`, D1, and both rate limiters bundled successfully.
- The bundled web-game Playwright client rendered the production preview without console errors. A follow-up browser move A1 -> B2 confirmed the two cell overlays and `lastMove` text state in `/tmp/youi-last-move-final.png`.
- `git diff --check` passed. The repository-wide Prettier check still reports the existing formatting backlog across 111 files; no unrelated files were reformatted.

Update 2026-07-17 (one-shot finishing plan and larger AI budgets):

- Raised the normal AI search budgets to Easy 250 ms, Medium 800 ms, and Hard 2000 ms. Watchdog deadlines continue to derive from the selected preset plus the existing warm/cold-device buffers.
- Replaced per-move finishing searches with a bounded breadth-first beam planner. It searches up to 120 finishing actions and returns the first complete line found at the shallowest explored depth, prioritized by the canonical finishing-progress score and repetition avoidance.
- Added the optional `completionPlan` result contract. A complete line is cached inside the store controller, validated against the live state before every step, and replayed without additional worker searches.
- Generalized the 300 ms sequence reveal timer: it now separates both forced multi-jump landings and cached after-win actions. Normal AI moves still have no artificial reveal delay.
- Invalid/stale cached steps are never applied: the plan is discarded, a replan counter/context event is emitted, and a fresh finishing request is made.
- `ai_completed` telemetry now includes `completionPlanLength`; invalidated plans record `ai_finishing_plan_replans` and `ai_finishing_plan_invalidated`.
- TDD coverage proves the reported board is solved from one Easy planning request, a two-step store plan is replayed with the reveal pause and no second worker request, invalid cached actions replan safely, and the exact difficulty budgets remain stable.

Verification 2026-07-17 (one-shot finishing plan and larger AI budgets):

- `pnpm test:run` — 57 files, 316 passing tests, one intentional skip.
- `pnpm build` and `pnpm lint`.
- `pnpm e2e:multi` — added and passed a real browser scenario where the computer computes and replays a two-action after-win line; inspected both `/tmp/youi-multi-game-e2e/computer-finishing-step.png` and `computer-finishing-complete.png`.
- The bundled web-game Playwright client smoke-tested the production preview; reviewed `/tmp/youi-finishing-plan-client/shot-0.png` and `state-0.json` with no console error artifact.
- `WRANGLER_LOG_PATH=/tmp/youi-finishing-plan-wrangler.log pnpm exec wrangler deploy --dry-run` — production assets, `MatchRoom`, D1, and both rate limiters bundled successfully.
- The focused Prettier check passes for all touched files except the already-unformatted `src/ai/presets.ts` and `src/ai/test/search.behavior.test.ts`; only their numeric budget literals changed, and `git diff --check` remains clean.

Update 2026-07-17 (full-scale AI measurement foundation):

- Added explicit optional search contracts for shipped preset time, controlled wall-clock time, fixed depth, and fixed evaluated nodes. Omitted budgets remain product-compatible; every result now records the resolved limits and whether time or nodes exhausted the search.
- Propagated the node/time budget guard through root, negamax, and quiescence search while preserving the existing legal timeout fallback semantics.
- Expanded self-play traces with completed root coverage, elapsed time, evaluated nodes, quiescence diagnostics, reported root candidates, root-score regret, and budget metadata.
- Added a lossless schema-versioned `ai:measure` pipeline with scenario-stratified decisions, true horizontal mirrors under the same seed/persona, paired seeded self-play, raw JSONL traces, fixture/raw checksums, environment/Git provenance, and non-zero path-assertion failures.
- Kept evidence families separate: search execution; normal/tiebreak/draw/unfinished outcomes; behavioral diversity, participation, movement, repetition, and self-undo; and spatial equivariance.
- Added bootstrap mean/median intervals, Wilson proportion intervals, Miller-Madow entropy, Hill q0/q1/q2 effective behavior counts, and an uncertainty-aware raw-file comparator with workload identity checks and practical-difference thresholds.
- Documented the measurement contract, command profiles, interpretation rules, player-experience boundary, and academic lineage in `docs/ai-measurement.md`.

Verification 2026-07-17 (full-scale AI measurement foundation):

- `pnpm test:run` — 60 files, 325 passing tests, one intentional skip.
- `pnpm build` and `pnpm lint`.
- `pnpm docs:check-links` — 29 Markdown files, no broken relative links.
- Deterministic fixed-depth smoke: eight scenario decisions and four game plies all completed depth one with zero fallback and zero path-assertion failures; unfinished games remained censored rather than counted as draws.
- Deliberately under-budget fixed-node smoke exposed node exhaustion, depth-zero fallback, and fallback share instead of treating those samples as normal search.
- Identity paired-compare smoke returned zero deltas and `inconclusive`, confirming that the comparator does not manufacture an improvement from identical artifacts.
- Bundled web-game Playwright client smoke-tested the production preview; visually reviewed `/tmp/youi-ai-measurement-smoke/shot-0.png` and the initial-state JSON with no console-error artifact.
- `git diff --check` passed.

Update 2026-07-19 (multiplayer connection diagnosis):

- Reproduced the current failure with the real local Worker and the existing two-context multiplayer E2E: room creation and both capability exchanges returned success, and both WebSockets upgraded with `101`, but the creator remained `waiting` while the invited client reported `connected`; the E2E timed out at revision 0.
- Correlated production D1 telemetry from release `0.3.3+859128a`: macOS and iOS online sessions repeatedly emitted the same `unhandled_rejection` fingerprint `07baeef5` with error name `InvalidAccessError`.
- Root cause is the protocol-hardening change in `92f6c03`: `ServerMessage` includes `peerPresence`, and `MatchRoom` sends it when the second socket connects, but `decodeServerMessage()` has no `peerPresence` branch. The client therefore treats the valid frame as invalid.
- The fallback error path then calls browser `WebSocket.close(1008, ...)`. Browser clients may send only code `1000` or application codes `3000..4999`, so that close itself throws the observed `InvalidAccessError` and leaves the two clients in inconsistent connection states.
- Minimal codec reproduction confirms `decodeServerMessage({ type: 'peerPresence', connected: true }) === null`. CodeGraph reports no covering test for `decodeServerMessage`; the codec tests cover malformed frames and snapshots but not every `ServerMessage` variant.
- No application fix was made in this diagnosis. Recommended repair: accept boolean `peerPresence`, replace browser-originated reserved close codes with an application code (for example `4008`) or bare `close()`, add exhaustive codec coverage for every union variant, and rerun `pnpm e2e:multiplayer` against local Worker and production preview.

Update 2026-07-19 (multiplayer connection repair, implementation):

- Added strict `peerPresence` decoding so the valid room lifecycle frame reaches `MultiplayerClient` instead of being rejected.
- Replaced browser-originated reserved WebSocket close codes `1008` and `1013` with application codes `4008` and `4013`; this removes the production `InvalidAccessError` path while preserving close reasons.
- Contained optional WebRTC offer failures so the canonical WebSocket path remains usable without an unhandled rejection.
- Added regressions for boolean/malformed presence frames, end-to-end client presence handling, invalid-message close codes, and socket-backpressure close codes.
- Red/green verification: the new focused suite failed in all four expected places before the fix and now passes all 8 tests across `codec.test.ts` and `MultiplayerClient.test.ts`.

Verification 2026-07-19 (multiplayer connection repair, pre-deployment):

- `pnpm lint` and `pnpm build` pass; `git diff --check` is clean.
- `pnpm e2e:multiplayer` passes against the real local Worker: both browser contexts connect, negotiate the direct WebRTC path, commit Player 1's A1 -> B2 move, converge at revision 1, and transfer input to Player 2 without browser errors.
- Visually reviewed the connected and post-move desktop/mobile screenshots plus the serialized state; both clients show the same board, revision, player, and connection state.
- The bundled web-game Playwright client created a room successfully against the local Worker; the waiting-room screenshot and exported state contain a valid invite and no console-error artifact.
- The repository-wide Vitest run completed 328 passing tests and one skip; two unrelated resource-sensitive tests failed while the benchmark suite saturated the runner. Rerunning those exact AI/UI files in isolation passed all 21 tests. The focused multiplayer suite remains 8/8 green.

Deployment 2026-07-19 (multiplayer connection repair):

- `pnpm cf:deploy` completed successfully: the production build passed again, D1 reported no pending migrations, 13 changed assets uploaded, and the Worker deployed with its Durable Object, D1, and rate-limiter bindings intact.
- Production URL: `https://youi.kstroevsky.workers.dev`; Worker version: `c507330a-b9c2-419e-84f0-903af5cc928f`.
- `YOUI_E2E_BASE_URL=https://youi.kstroevsky.workers.dev pnpm e2e:multiplayer` passed against two fresh browser contexts. Both clients showed `Connected` and `Direct fast path`, converged at revision 1 after A1 -> B2, and transferred the turn to Player 2.
- Visually reviewed the post-deployment desktop and mobile connected/post-move screenshots; connection badges, board state, score, revision, and turn ownership are consistent.
- A read-only production D1 check covering the 15 minutes around deployment and the public acceptance test returned no new telemetry incidents, including no `InvalidAccessError`/`unhandled_rejection` recurrence.

Update 2026-07-19 (multiplayer history and input follow-up, diagnosis):

- The online projection in `stateCreator.ts` resets `gameState.history`, `turnLog`, and `historyCursor` to empty values on every authoritative or speculative projection. That is the shared root cause of both an empty History panel and missing last-move source/target highlights.
- `BoardCell` invokes `onSelectCell` for every square regardless of `isSelectable`, while `createGameplayActions` only blocks pass-device and computer turns. During an online opponent turn, the engine correctly considers the opponent's pieces actionable, so the local spectator can open a move dialog for them even though the room would reject submission.
- The selected `allowNonAdjacentFriendlyStackTransfer` value is already included in match creation, authoritative state, derivation-cache keys, and room validation. The remaining work is to exercise its complete browser path and protect it with a multiplayer regression rather than changing the domain rule speculatively.
- Planned repair keeps the backend history-free: build display-only `TurnRecord`s from accepted client commits, project them into the store, lock their navigation online, and use the same log for board highlights and `render_game_to_text`.

Update 2026-07-19 (multiplayer history and input follow-up, implementation):

- Added lightweight turn metadata to the shared reducer result and used it only in the browser client to build canonical display `TurnRecord`s from accepted commits. Durable Object state and wire snapshots remain history-free.
- Online projections now retain the client turn log in `gameState.history`, `turnLog`, and `historyCursor`; History renders normally but its entries and undo/redo navigation remain locked by the existing online policy.
- BoardStage and `render_game_to_text` now derive the last move from that projected online log, restoring source/target highlights consistently for both participants.
- Added an online ownership gate covering connection state, pending commands, participant/color mapping, and series color changes. Public selection/action methods enforce it even when invoked outside the UI.
- Board cells that are neither selectable sources nor legal targets now use native disabled-button semantics, so an inactive participant cannot open a move dialog for the opponent's checker.
- Extended the two-browser scenario to assert read-only history, source/target state, inactive-seat click locking, and a five-ply sequence ending in the configured non-adjacent B2 -> D2 friendly transfer.
- Red/green focused verification: the new history, opponent-selection, and disabled-cell regressions failed before the repair; all 17 focused multiplayer/rendering/reducer tests now pass, including the authoritative transfer case.

Verification 2026-07-19 (multiplayer history and input follow-up):

- `pnpm lint` and `pnpm build` pass.
- The expanded multiplayer-focused suite passes 29/29 tests across client, store policy, reducer, codec, performance, Worker room/route, and rendering coverage; the added direct online-input policy case also passes.
- `YOUI_E2E_BASE_URL=http://127.0.0.1:8787 pnpm e2e:multiplayer` passes through five live revisions and a negotiated direct path. Both clients converge with five history entries, null selection, B2 -> D2 last-move endpoints, one checker at B2, three at D2, and identical boards.
- Visually reviewed desktop/mobile screenshots after the first move and after the friendly transfer. History is readable and scrollable but non-clickable; the source/target olive tones are visible; disabled opponent-turn cells retain the normal board appearance.
- The required bundled web-game Playwright client created a waiting room from the production build and exported the expanded state (`historyLength`, `lastMove`, rule selection, selection state) without a console-error artifact; reviewed `/tmp/youi-multiplayer-followup/shot-0.png` and `state-0.json`.
- The repository-wide run completed 324 passing tests and one intentional skip; the known resource-sensitive finishing-plan test failed while the 63-second benchmark saturated the runner, then passed all 3 tests immediately in isolation.
- `git diff --check` passes. No production deployment was attempted from this branch because local `main` contains the previously deployed but still-unpushed AI measurement commit, while this review branch intentionally excludes it.

Update 2026-08-04 (AI measurement semantic contract, Phase 1A):

- Split terminality from utility in ordered/root candidates. Every candidate now reports `isTerminal` plus actor-relative `terminalUtility`; `isForced` is deliberately restricted to immediate actor wins, so terminal draws/losses no longer bypass safety, novelty, repetition, or draw-risk policy.
- Made final decision score ownership explicit. Search results now report `bestSearchAction`/`bestSearchScore`, `selectedActionScore`, and `selectionRegret`; legacy `score` is a documented alias of the selected action's score. The fields are derived from the full internal root ranking before diagnostic candidate truncation.
- Replaced heterogeneous mobility subtraction with an actor-aware transition record: actor branching before, same-player continuation branching, opponent reply branching, whether the post-state count was measured, and whether the actor kept the turn. Compatibility `mobilityDelta` is now same-actor-only and is zero across turn changes.
- Traces now preserve the decision score contract and actor-aware mobility. Root regret is sourced from the search result instead of being reconstructed from the possibly truncated/diversified public root-candidate list.
- Intent switching now compares each player with that player's previous decision; its denominator is the number of valid same-player comparisons rather than adjacent, usually opposing-player plies.
- Repaired long scenario construction in `ai:measure`: cyclic late-game replay fixtures are built with draw termination disabled, then normalized into active continuation states. This prevents the threefold measurement rule from terminating fixture construction before the scenario can be sampled.
- Made the long finishing-plan correctness replay use a deterministic clock; budget-exhaustion behavior remains covered by its dedicated test.

Verification 2026-08-04 (AI measurement semantic contract, Phase 1A):

- Red/green focused regressions cover neutral threefold terminal classification, selected-vs-best score ownership, actor-explicit mobility, and same-player intent transitions.
- `tsc --noEmit`, changed-file ESLint, and production `vite build` pass.
- Focused AI verification passes 42 tests with one intentional skip across behavior, variety, quiescence, and finishing search.
- A fixed-node `ai:measure` smoke traversed all nine scenario buckets, including cyclic turn-25 through turn-200 fixtures, and emitted raw JSONL/report artifacts without path-construction failures. Sampled decisions satisfy `score === selectedActionScore` and contain explicit score/mobility/terminal fields.
- Production preview browser acceptance passed: after starting an Easy computer match, White played A1 -> B2 and the AI replied C4 -> B3; exported state showed move 3, White to act, two history entries, no selection, and an active game. The final board screenshot was visually reviewed. The only console error was the expected local-preview 404 for the Worker-only telemetry endpoint.
- Repository-wide Vitest reached 330 passing tests and one skip; nine unrelated UI tests failed under benchmark/soak saturation. Rerunning the two affected UI files reduced this to one pre-existing lazy-game-tab order-sensitive failure; that test also fails alone before any AI path is exercised.

Update 2026-08-04 (advanced interestingness estimators, Phase 1B):

- Sample entropy now returns `null` for short/no-match series instead of conflating insufficient evidence with perfectly regular zero entropy. Advanced summaries average only finite estimates and publish the contributing trace count.
- Replaced character-substring Lempel-Ziv parsing with token-level phrase parsing and reused the same implementation in both core variety and advanced reports. The metric is now invariant under bijective renaming or different-length spellings of action/position tokens.
- Loop-escape rates now condition on traces that actually entered risk/repetition/self-undo pressure. Reports publish eligible and observed-escape counts; no eligible traces produce `null`, not a manufactured zero.
- Frontier compression now uses only measured same-player continuation transitions and publishes its sample count. It no longer interprets opponent reply branching as compression of the actor's action space.
- Added evidence-count columns to loop and position-bucket Markdown reports and documented missingness/conditioning rules. Bumped the lossless `ai:measure` schema to version 2 so old/new raw contracts cannot be paired silently.

Verification 2026-08-04 (advanced interestingness estimators, Phase 1B):

- Red/green regressions cover sample-entropy insufficiency, Lempel-Ziv token-label invariance, loop-pressure denominator conditioning, and missing frontier-compression evidence.
- Advanced plus core AI focused verification passes 50 tests with one intentional skip; `tsc --noEmit` and changed-file ESLint pass.
- A one-pair/four-ply loop-report smoke emitted explicit `null` estimates and evidence counts, while loop-pressure buckets produced conditioned escape rates. The tracked baseline artifacts were restored after inspection.

Update 2026-08-09 (competence and fixed-node oracle foundation, Phase 2A):

- Added a rule-derived tactical catalog for unique home-field wins, unique six-stack wins, and unique immediate defenses. Every fixture has a true geometric mirror, and catalog construction fails unless both variants have exactly one correct action.
- Added a measurement-only root-candidate limit override. Production presets remain unchanged, while a deeper fixed-depth oracle can expose every searched root score needed to rescore a subject action.
- Added fixed-node regret curves across difficulty and work budgets, with oracle agreement, unique-win/defense accuracy, p95 regret, catastrophic-regret rate, root coverage, fallback, zero-depth, and explicit oracle-missing denominators.
- Added largest-budget confirmatory gates with difficulty-specific regret tolerances. Smoke curves remain exploratory unless `--enforce-gates=true` is requested.
- Added lossless raw JSONL, checksummed fixture manifests, complete settings, Git/runtime provenance, a Markdown review surface, and the authoritative `ai:competence` command.

Update 2026-08-09 (completed versus partial search evidence, Phase 2B):

- Stopped overwriting `completedRootMoves` when the next iterative-deepening pass is interrupted. It now remains owned by `completedDepth`.
- Added explicit nullable `partialDepth` and `partialRootMoves` to every search result and AI trace. No interrupted root evidence produces `null` plus zero moves rather than being conflated with completed work.
- Added partial-depth distributions and shares to the authoritative measurement report, paired comparison guardrails, and competence curves. Immediate unique-win proofs count as completed-root coverage without pretending all losing root moves were searched.
- Added completed root-preparation transition counts to search diagnostics, the general measurement summaries, and fixed-node competence curves so equal-node results also expose mandatory root work.
- Bumped lossless `ai:measure` artifacts to schema version 3 so the corrected search-path semantics cannot be silently compared with earlier traces.

Update 2026-08-09 (frozen-reference strength and non-inferiority, Phase 2C):

- Added a versioned deterministic opponent pool with canonical, seeded-uniform, and tactical-greedy policies. Pool and fixture checksums prevent silent comparison across workload changes.
- Added `ai:strength`, which runs fixed-node candidate search in seeded color-swapped pairs across development/holdout scenario strata and retains lossless per-ply game/search evidence.
- Unfinished games are censored rather than scored as draws; a pair score exists only when both colors resolve.
- Added `ai:strength:compare-files` with stable pair matching, equal fixture × reference weighting, fixed-portfolio and hierarchical paired bootstrap intervals, a predeclared score non-inferiority margin, a separate resolution/censoring guardrail, and fixture/seed variance components.
- Added deterministic policy and statistical-contract regressions. Product AI presets and move-selection policy remain unchanged.

Verification 2026-08-09 (Phase 2C):

- `npm run test:run -- src/ai/test/frozenReferencePool.test.ts src/ai/test/referenceStrengthStats.test.ts`
- focused ESLint and TypeScript checks passed for the new runner, comparator, policies, and tests.
- A minimal strength/report/identical-artifact comparator smoke emitted valid artifacts; because the eight-ply opening had no resolved pair, the score gate correctly returned `inconclusive` instead of manufacturing a draw or passing zero evidence.
- A 160-ply holdout slice resolved both color assignments; its identical-artifact comparison passed the score and resolution gates. The default six-stratum smoke, full build, lint, and documentation link checks also passed.
- The full test suite reached 354 passing tests and one intentional skip; the existing App tab-state test timed out at its five-second limit both in the concurrent suite and alone. No production/UI code changed in this phase.

Update 2026-08-09 (resumable strength campaigns and strength/style separation):

- Added deterministic strength job ids, modulo sharding, atomic per-pair checkpoints, resume validation, and strict shard merging. Campaign identity includes schema, settings, fixture/reference/domain hashes, and production-AI source identity.
- Added immutable Git strength comparisons and retained paired measurement comparisons. Reports now include censoring incidence, terminal-ply distributions, power diagnostics when pilot variance supports them, and candidate style-regret budget violations.
- The 18-pair/36-game, 160-ply holdout pilot exposed 72.2% game censoring and only 3 naturally resolved pairs. Schema-v2 strength artifacts therefore keep natural outcomes untouched while adding a distinct fixed-horizon domain-tiebreak endpoint.
- Root selection is now staged: terminal safety first, then an explicit maximum strength-regret band (Easy 960, Medium 480, Hard 240), then plan/persona/participation/novelty shaping. Immediate wins are preserved and avoidable terminal losses cannot be selected for style.
- Removed persona, participation, and novelty from adversarial leaf evaluation and move-order scores. Persona-conditioned strength rankings are now identical; style is applied only after the strength gate.
- Added strategic-plan hysteresis. The prior computer plan is carried into the next worker decision and into self-play/reference harnesses; hybrid ambiguity preserves commitment, a home↔six-stack switch requires a 1,400-point potential advantage, and the committed plan breaks safe-band root ties.
- Strength/measurement CLIs now reject unknown arguments after a misspelled holdout option was caught during confirmation, preventing a silently wrong portfolio from producing apparently valid evidence.

Verification 2026-08-09 (strength/style and plan-coherence tranche):

- Focused tactical competence smoke passes its enforced largest-budget gates with zero failures.
- Direct selection, evaluation, quiescence, strategic-plan, worker/store propagation, and frozen-reference regressions pass; TypeScript, changed-file ESLint, Prettier, and `git diff --check` pass.
- The retained paired `ai:measure:compare` smoke reports zero style-budget violations and preserves raw baseline/candidate artifacts.
- The full 18-pair holdout screening campaign was retained under `output/ai/strength-candidate-holdout/`. Fixed-horizon point share was 0.666667 versus 0.736111 at the baseline (paired delta -0.069444, fixed-portfolio 95% CI -0.166667 to 0.027778); natural resolution was 2/18 versus 3/18. Both gates correctly remain `inconclusive`. The observed variance implies about 67 pairs per stratum for 80% power at the declared 0.03 margin, so this pilot does not establish non-inferiority or regression.

Update 2026-08-09 (strength portfolio expansion):

- Expanded the shared position catalog from nine to eighteen deterministic scenarios, adding seeded legal-play early, middle, and later positions so the historical loop trace no longer dominates coverage.
- Replaced index-derived development/holdout assignment with explicit immutable catalog membership. Six scenarios now form the holdout, balanced across realistic legal play and loop/conversion sentinels.
- The strength runner now evaluates each scenario together with its true horizontal board mirror and records fixture origin/mirror provenance in raw pairs. Schema v3 intentionally prevents comparison with the narrower schema-v2 pilot.
- Added diagnostic logistic Elo differences with transformed uncertainty intervals against the frozen reference pool. Point-share non-inferiority remains the release gate; the rating is an interpretable secondary scale.

Verification 2026-08-09 (final AI measurement and strategy tranche):

- The clean serial correctness suite passed 67 files and 351 tests with one intentional skip. The dedicated performance benchmark passed all 22 tests, and the 200/500-turn search soak passed all 6 tests on Easy, Medium, and Hard.
- TypeScript, repository-scoped ESLint, documentation link checks, the production build, tactical competence gates, focused selection/strategy/timeout suites, and the schema-v3 six-pair smoke all pass. The top-level lint command still discovers the unrelated nested `.claude/worktrees/zealous-lalande-46eeb8` checkout, whose files are outside this change and use a different parser root.
- Browser verification rendered the real board, selected A1, opened the localized move dialog, and exposed the expected `pieceSelected` game state without a console-error artifact. The multi-game browser E2E then imported a finishing position, accepted the human move, exercised the worker-backed computer reply, and reached the completed finishing result.
- The regenerated 64-game-per-difficulty variety corpus reports strategic-intent switch rates of 0.047476 (Easy), 0.047877 (Medium), and 0.036258 (Hard), down 80.35%, 75.13%, and 81.79% from commit `69872da`. Repetition ply share remains 0.003711, 0.004492, and 0.006445 respectively.
- The same corpus remains entirely horizon-censored at 80 plies and still violates several historical absolute target bands. Its composite score must therefore not be treated as evidence of real-player enjoyment or strength. The fresh schema-v3 paired holdout campaign and blinded human study remain the required promotion evidence.

Update 2026-08-09 (measurement-validity corrections):

- Final style selection now runs once, after iterative deepening has finished or stopped. The strength-best root action—not a persona/RNG-selected action—seeds the next principal variation, so fixed-work search evidence is invariant to final style sampling.
- Removed the policy prior from final behavioral reranking. It remains a search-ordering signal but is no longer counted twice when choosing within the explicit strength-regret band.
- Replaced the ambiguous same-player mobility proxy for frontier pressure with candidate-relative opponent-reply compression. Each eligible ply compares the selected move's opponent reply count with the median legal root candidate; terminal moves and same-player continuations produce missing evidence rather than a synthetic zero.
- Root-preparation diagnostics now increment after every generated root transition, including the completed prefix when a deadline interrupts preparation. Fixed-node results therefore expose mandatory work outside the evaluated-node counter without pretending both counters are equivalent.
- Renamed the generated variety summary in-place as a legacy behavior-regression dashboard. Compatibility commands and artifact paths remain stable, while drama, tension, and composite-interestingness are explicitly documented as uncalibrated trace proxies rather than enjoyment measures or release gates.

Verification 2026-08-09 (measurement-validity corrections):

- Added regressions proving fixed-node candidates/scores/depth evidence do not change with style RNG, policy priors do not affect final behavioral sampling, continuation mobility is not mislabeled as opponent pressure, and root-preparation counts remain deterministic across wall-clock implementations.
- Focused selection, behavior, variety, timeout, budget, move-ordering, advanced-metric, and measurement suites pass; TypeScript and changed-file ESLint pass.
- A one-pair/two-ply legacy-report smoke generated the new report kind, heading, and calibration warning. Its expected non-zero exit reflected deliberately tiny-sample baseline regressions; generated tracked artifacts were restored after inspection.

Update 2026-08-09 (same-harness legacy policy boundary):

- Added a first-class asynchronous `AiPolicy` contract with seeded per-game sessions, immutable policy ids/source hashes, a common decision request, optional policy-specific diagnostics, and explicit disposal.
- Pinned `LegacyPolicyV0` to `2bd9c455ec2537aa84b1fef38550ce13c53efd29`, the structural feature-branch merge-base and parent of the first production-semantic commit. The adapter materializes that revision's production AI sources into an isolated process but links the current domain/shared implementation, so policy—not historical harness or domain code—is the experimental variable.
- Added the current-policy adapter and hashes that cover production AI source plus adapter source/version. The legacy hash covers the immutable revision source, adapter server source, and adapter version.
- Added a current-harness policy match runner with identical fixed-node decision contracts, starting fixtures, horizons, domain adjudication, and color-swapped games. Natural and fixed-horizon scores remain separate.
- Extracted the existing fixed-horizon outcome/adjudication functions into a shared versioned module so frozen-reference and policy-vs-policy experiments cannot silently implement different terminal scoring.

Verification 2026-08-09 (same-harness legacy policy boundary):

- A regression proves the pinned legacy revision is exactly the parent of the first feature policy commit.
- Both legacy and current policies returned legal moves for the same current state and fixed-node request, exposed distinct 64-character source hashes, and completed a current-harness two-game color swap.
- Existing frozen-reference strength tests continue to pass against the shared adjudication implementation; TypeScript, changed-file ESLint, and diff hygiene pass.

Update 2026-08-09 (fixed-horizon pentanomial sequential protocol):

- Added a preregistered current-versus-legacy strength command whose primary endpoint is the fixed-160-ply domain-adjudicated score of a color-swapped pair. Natural game resolution remains a separately reported secondary endpoint.
- Retained the five dependent pair outcomes as pentanomial counts. Sequential evidence uses Jeffreys-smoothed empirical shape plus hypothesis-specific exponential tilting, explicit Wald boundaries, and distinct non-inferiority, superiority, and two-one-sided equivalence modes.
- Stopping is eligible only at complete frozen-allocation blocks containing every selected holdout scenario and horizontal mirror. The frozen allocation remains equal because the retained 18-pair pilot produced too few natural resolutions for stable variance-optimal weights.
- Added a versioned protocol manifest fixing the primary endpoint, alpha/beta, 0.03 practical margin, Hard 2,048-node work contract, 160-ply horizon, holdout split, and balanced-block limits.
- Report provenance independently hashes current and legacy policies, current domain rules, harness, fixtures, protocol, allocation, raw pairs, fixed-node semantics, and adjudication version.

Verification 2026-08-09 (fixed-horizon pentanomial sequential protocol):

- Unit regressions cover all five pair outcomes, unequal/equal allocation blocks, favorable and harmful non-inferiority evidence, superiority, equivalence, and deterministic null-boundary Monte Carlo calibration.
- A two-pair current-versus-legacy smoke completed both geometric variants and both color assignments under the same current harness, emitted all JSON/Markdown/JSONL artifacts, and correctly stopped as `inconclusiveAtMaxPairs` rather than passing zero evidence.
- Protocol, policy-boundary, and existing frozen-reference tests pass; TypeScript and changed-file ESLint pass.

Update 2026-08-09 (human experience calibration infrastructure):

- Added a versioned human-study protocol for blinded, within-participant full-game crossover and paired replay preference collection. Public assignments expose only opaque condition labels; policy mappings remain separate and private until the analysis lock.
- Added strict observation validation, pseudonymous participant/scenario grouping, explicit left/right/tie preference, per-construct 1–7 miniPXI storage, and active-selection propensities. No personal details or free-form responses are required by the analysis schema.
- Added inverse-propensity-weighted regularized logistic fitting as an explicitly approximate mixed-effects Bradley–Terry model. Shrunk participant and scenario effects handle repeated judgments, policy contrasts and automated descriptor differences remain separate coefficients, and confirmatory metrics are calculated on held-out participants without fitted participant effects.
- Added uncertainty/information-based replay selection with under-sampling preference and a mandatory 20% random-exploration path. Propensity weights are capped in analysis to limit instability.
- Added `ai:human-calibration`, protocol/input hashes, separate miniPXI construct summaries, study-mode counts, and a hard false `confirmatoryReady` flag below 48 participants or without held-out-player evidence.

Verification 2026-08-09 (human experience calibration infrastructure):

- Regressions cover opaque counterbalancing, held-out-player isolation, recovery of a known synthetic descriptor preference, uncertainty selection, and exploration propensities.
- The synthetic five-participant/ten-observation smoke generated valid JSON and Markdown, held out one complete participant, recovered the planted productive-participation direction, and correctly reported `confirmatoryReady: false`.
- Human-calibration tests, TypeScript, changed-file ESLint, and report execution pass. The checked-in JSONL is explicitly synthetic infrastructure data, not human evidence.
