# YOUI AI Interestingness Recovery and Measurement Plan — DESIGN-FROZEN

## 1. Status, objective, and provenance

### 1.1 Freeze status

This standalone normative specification preserves the mature plan without introducing new architecture.

After `DESIGN-FROZEN`, amendments require:

- an implementation contradiction;
- a failing correctness/property test;
- measured runtime or resource infeasibility;
- failed statistical simulation;
- human-study evidence;
- production telemetry evidence.

Every amendment receives a new protocol version, rationale, affected-artifact list, and revalidation decision.

### 1.2 Audited baseline and run provenance

The immutable baseline manifest records:

- branch/HEAD: `8d45067e9c2487c50d155e7ae77d60c65b1a637a`;
- comparison base: `2bd9c455ec2537aa84b1fef38550ce13c53efd29`;
- ahead/behind: `55/0`;
- tree SHA: `f68085353ddacb31e4b91b5c58a7ad3d763c7cf4`;
- archive SHA-256: `8ccb230d1a467cd7792f9ecb2f28b73be3d331f5ecc746a9dbbcb29328214198`;
- local-status digest: `692f23ec4d8a42871ca84cc2c3a6189deb36eb50f92ca880219aa7748800e86e`;
- untracked-manifest digest: `8e19460cd4a7319d3ea40864a800e4ceb1469505d837030f9d5fe112bf281012`;
- audit timestamp: `2026-08-21T12:32:44+02:00`;
- provenance scope: local evidence, not CI;
- focused verification: 58 tests passed, one skipped, production build passed;
- audited diagnostic worker: 86.80 kB, not the clean-baseline denominator.

Every evaluation manifest records:

- exact command and complete argument vector;
- start, checkpoint, finalization, and completion timestamps;
- OS, Node/runtime, TypeScript/compiler, build-tool, browser, and sampler versions;
- CPU, physical/logical cores, memory, browser/device class;
- AC/battery state, low-power mode, and reported thermal/power mode;
- repository ref, HEAD, tree, archive, dirty-status, and untracked hashes;
- dependency-lock/tool hashes;
- raw, merged, report, and final decision hashes;
- oracle, metric, fixture, RNG, policy, proof, reranker, outcome, strength, performance, symmetry, human-analysis, and telemetry protocol versions.

### 1.3 Causal premise

> Under the fixed current-domain/current-harness revision ladder, the reproducible behavioral discontinuity occurs at `d094f72 → 9d8e884`. Signal ablations support removed participation—especially leaf participation and participation-aware ordering—as a major causal mechanism. At least one matched divergence also changed completed depth/fallback, so search-coverage mediation remains part of the causal model and must be controlled with fixed-depth as well as fixed-work experiments.

Existing attribution, ablation, counterfactual, and campaign artifacts remain immutable historical evidence.

### 1.4 Quality vector

\[
Q=(S,M,A,R,D,U,P)
\]

- \(S\): strength and safety;
- \(M\): meaningful future choice;
- \(A\): player agency/effective counterplay;
- \(R\): reward for player skill/thinking;
- \(D\): productive participation and diversity;
- \(U\): uncertainty, pacing, balance, and conversion;
- \(P\): persona coherence and identifiability.

No scalar fun score replaces this vector. Automated entropy is never interpreted as human enjoyment without human calibration.

Primary automated families:

1. lower `avoidableFamilyRepeatRate`;
2. higher on-policy `meaningfulFutureD1`;
3. higher on-policy `effectiveCounterplayD1`;
4. higher `rewardForThinking`.

Primary human outcomes are play-again preference and enjoyment. Fairness and frustration are confirmatory guardrails.

---

## 2. Reproducible evaluation infrastructure

### 2.1 Unified runner and atomic state

Implement one `ai:evaluate` runner producing a unique, non-overwriting run directory with:

- `manifest.json`;
- sharded decision and game JSONL;
- atomic progress/checkpoint state;
- atomic finalization state;
- worker completion and failure records;
- deterministic merged data;
- final reports and decision artifact.

Checkpoint and finalization writes use write-to-temporary plus atomic rename. A finalizer cannot expose a complete run until every required shard/block and hash has been verified.

Resume only at complete shard/block boundaries. Merge order is fixed by lineage, difficulty, treatment, mirror, color, persona, seed, game, and turn. Finalization rejects duplicate shards, incomplete blocks, incompatible schemas, and mismatched hashes.

The runner is a thin orchestrator over the existing measurement family (`ai:measure`, `ai:competence`, `ai:strength`, `ai:policy-strength`, attribution/ablation/counterfactual, `ai:crossplay`, `ai:human-calibration`, compare/merge/finalize/checkpoint). It must not create a second independent measurement semantics.

Every long campaign reports and checkpoints:

- planned and completed shard/block/sample counts;
- throughput and ETA;
- explicit `incomplete | failed | complete` run state;
- bounded worker failure summaries.

Long functional campaigns run detached/resumably. Performance campaigns are isolated from other workloads and may not share benchmark hosts with concurrent heavy jobs.

Worker count:

\[
\max\left(1,\min(\max(1,\text{availableParallelism})-1,8)\right)
\]

with one worker when parallelism is unavailable.

Vitest excludes `.claude/worktrees/**`, `dist/**`, `output/**`, and `graphify-out/**`.

### 2.2 Statistical unit

Fixture lineage is the gameplay unit. Turns, colors, mirrors, personas, seeds, horizons, and repeated games are nested.

- Aggregate within lineage or use a preregistered clustered model.
- Resample each lineage’s complete endpoint/difficulty vector jointly.
- Gameplay: one-sided 95% lineage-clustered bounds.
- Performance: paired run/session-block bounds.
- Humans: crossed participant/fixture posterior or model intervals.
- Telemetry: operational alarms, never efficacy evidence.

### 2.3 Treatment-independent fixtures

`FixtureGeneratorV1` generates 96 independent development lineages with treatment-independent marginal stratification across:

- phase: opening, transport, conversion, finishing;
- topology: congested, open, asymmetric, frozen, low-active-mobility;
- tactics: quiet, threat, forced defence, jump chain, rescue;
- plan: home, hybrid, six-stack, credible switch;
- advantage: winning, approximately equal, losing;
- history pressure: clean, family repetition, region repetition, self-undo;
- origin: hand-authored, random, self-play, adversarial, historical incident, consented pilot.

Marginal quotas are balanced within one lineage where compatible. Impossible intersections are declared before generation.

History-dependent fixtures must provide valid `AiRootContextV1`. Colors, transforms, personas, seeds, horizons, and repeated games are nested variants, not independent samples.

The sealed catalog uses the same frozen generator family with new lineage IDs and RNG keys. No sealed lineage may be manually inspected, replaced, or cherry-picked.

### 2.4 Frozen execution order

1. Freeze rules, `NamedRngV1`, `ReferenceStrengthOracleV1`, `WdlProofProtocolV1`, `OutcomeContinuationPolicyV1`, and `FixtureGeneratorV1`.
2. Generate/hash the 96-lineage development catalog.
3. Generate `WdlProofQuerySetV1(devCatalogHash)`.
4. Run/freeze `WdlEvidenceSnapshotV1(devCatalogHash)`.
5. Calibrate global reference and player-reply tolerances.
6. Freeze semantic classes, policies, thresholds, and outcome-class rules.
7. Build, validate, and freeze `OutcomeCalibrationCorpusV1` and `OutcomeCalibrationV1`.
8. Calibrate/freeze semantic-rollout count against 64 rollouts.
9. Run development adequacy.
10. Freeze reranker preprocessing and utilities.
11. Run complete Stage A/B/C development.
12. Form the eligible Easy×Medium×Hard tuple covariance envelope without selecting the final candidate.
13. Power-size sealed validation.
14. Automatically generate/hash the sealed catalog.
15. Generate the sealed proof query set and proof snapshot behind the sealed firewall.
16. Apply deterministic development selection and freeze `DevelopmentCandidateSelectionV1`.
17. Implement the selected candidate.
18. Build/hash `CleanCurrentBaselineV1`.
19. Freeze `ShippingCandidateManifestV1`.
20. Unlock sealed proof/data only for the matching shipping-manifest hash.
21. Validate the single frozen candidate once on sealed data.
22. Run final strength, performance, and symmetry campaigns.
23. Run operational canary/shadow.
24. Run the 24-person pilot, freeze nuisance parameters and confirmation \(N\), recruit new participants, and run powered confirmation.

Catalog inadequacy discards the complete catalog version and every derived proof, tolerance, normalization, outcome model, rollout count, and empirical threshold.

---

## 3. Strength, proof, state, and safety

### 3.1 Product versus selection utility

`ProductSearchUtilityV1` is the production adversarial score used for best score and regret. Persona/style/reranker terms remain separate in `RootSelectionUtilityV1`.

\[
O_{\text{product-safe}}(s)=
\left\{
a:
\begin{array}{l}
a\text{ is terminal-safe, and}\\
bestProductScore-ProductScore(a)\le T_{\text{product},d}
\end{array}
\right\}
\]

with:

- Easy: 960;
- Medium: 480;
- Hard: 240.

\[
O_{\text{product-behavior}}(s)
\subseteq O_{\text{product-safe}}(s)
\]

may additionally filter repetition, self-undo, and draw risk.

Each additive leaf-participation arm receives a distinct `ProductSearchUtility` version/configuration. Scores from different evaluator versions are not interchangeable.

### 3.2 Score provenance

```ts
type ScoreEvidenceSourceV1 =
  | 'referenceStrengthV1'
  | 'productCompletedDepth'
  | 'productPartialDepth';

type ScoreEvidenceV1 = {
  source: ScoreEvidenceSourceV1;
  score: number | null;
  bound: 'exact' | 'lowerBound' | 'upperBound' | 'unknown';
  depth: number | null;
  completedRootMoves: number;
  legalRootMoves: number;
};

type RootActionEvidenceV1 = {
  actionKey: string;
  referenceScoreEvidence: ScoreEvidenceV1 | null;
  productScoreEvidence: ScoreEvidenceV1 | null;
  wdlBounds: WdlBoundsV1;
  wdlSource: 'terminal' | 'solver' | 'tablebase' | 'unknown';
  proofCertificateId: string | null;
};
```

Completed- and partial-depth evidence are never conflated.

### 3.3 Pure reference oracle

`ReferenceStrengthOracleV1` uses:

- fixed full depth 4;
- `preset=null`;
- `riskMode='normal'`;
- no participation, persona, novelty, root style, or ONNX;
- `getMovePenalty=0`;
- no risk-driven selective extensions;
- no quiescence or selective leaf substitution;
- all legal moves;
- full-window search of every legal root action;
- only semantically exact alpha-beta/PVS pruning inside each root subtree;
- no selective pruning, reductions, probabilistic pruning, or incomplete-root shortcut;
- immediate-win shortcut disabled;
- canonical traversal;
- real win/loss/draw/stalemate, retained-turn, pending-jump, and threefold rules.

It runs out-of-band on a cloned root context. It never mutates the product search context or consumes the candidate policy’s node/time/worker budget.

Every \(V_{\text{ref}}(a)\) is in the parent actor’s perspective.

`RootCoverageEvidenceV1` records legal count, exact-reference count, bounds/unknowns, common depth, interruptions, shortcut bypass, node count, and source.

`referenceOnly` requires exact depth-4 scores for every legal action, common depth, no interruption, and complete shortcut-bypassed coverage.

### 3.4 WDL perspective and resolution

State WDL is relative to `state.currentPlayer`. Root-action WDL is converted to the parent actor. Win/loss is inverted only when control changes. Terminal perspective derives from the winner.

```ts
type WdlBoundsV1 = {
  lower: 'loss' | 'draw' | 'win';
  upper: 'loss' | 'draw' | 'win';
};
```

Only terminal rules, exhaustive proof, or exact solving narrow bounds.

\[
L^*=\max_a lower(a),\qquad U^*=\max_a upper(a)
\]

The best class is established iff \(L^*=U^*=B\).

- All `[loss,win]`: reference-only.
- \(L^*=U^*=B\): known/partial resolution.
- Narrowed evidence with \(L^*\ne U^*\): unknown.
- Heuristic evidence never erases or contradicts proof.

### 3.5 Reference key and canonical states

Terminal evaluation occurs before reference TT lookup/store. Terminal states are never stored.

`ReferenceOracleStateKeyV1` uses full deterministic serialization, not a 64-bit-hash-only identity:

- full `hashPosition(state)` serialization;
- rule/configuration ID;
- full sorted canonical repetition-context serialization with counts capped at `min(count,2)`.

It is defined only for active nonterminal states. Ordinary checker IDs are canonicalized; pending-jump-referenced identities remain distinct.

Property tests prove that equal board/side/pending-jump states with materially different repetition contexts cannot share reference state identity.

### 3.6 Root history

```ts
type AiRootContextV1 = {
  state: EngineState;
  historyPrelude: readonly TurnRecord[] | null;
  positionCountsBeforePrelude: Readonly<Record<string, 1 | 2>> | null;
  historyStatus:
    | 'completeForParticipationWindow'
    | 'truncated'
    | 'unavailable';
  repetitionStatus: 'reconstructible' | 'unavailable';
};
```

`completeForParticipationWindow` means:

- if a player has at least ten lifetime committed actions, retain the latest ten same-player actions;
- if fewer than ten exist, retain every same-player action since game start;
- include all intervening retained-turn records needed to reconstruct source-family/region reuse.

Replaying the repetition baseline and prelude must reproduce board, side, pending jump, and capped repetition counts. Symmetry/replay tests enforce this.

### 3.7 Proof protocol and query neighborhood

`WdlProofProtocolV1` freezes deterministic traversal, repetition/cycle/SCC semantics, terminal-before-cache, canonicalization, certificates/replay validation, and `unknown` on exhaustion.

Per query:

- 30 minutes;
- 8 GB peak memory;
- 10 million canonical states/nodes.

`WdlProofQuerySetV1` contains:

- every catalog root;
- every legal root action;
- every legal root-action successor state;
- every potentially reference-safe action and successor;
- every reachable `NextOpponentDecisionBoundaryV1`;
- every legal reply required by tolerance/counterplay;
- every required reply successor state.

Continuation enumeration uses canonical visited-state detection, terminal stopping, at most eight additional committed actions, and `unknown` on depth/cycle overflow.

```text
WdlEvidenceSnapshotV1 =
(
  catalogHash,
  proofQuerySetHash,
  proofProtocolHash,
  resultRecords,
  proofCertificates,
  verificationReport,
  artifactHash
)
```

Development and sealed snapshots use separate paths/keys. Before `ShippingCandidateManifestV1`, sealed tooling exposes only hashes and completion/unknown counts. Analysis refuses access without the matching shipping-manifest hash.

No dynamic proof invocation is allowed during search, continuation, or semantic rollout.

### 3.8 Reference-safe sets

```ts
type ReferenceSafetyStatus =
  | 'referenceOnly'
  | 'known'
  | 'partial'
  | 'unknown';
```

Primary use permits `referenceOnly | known`.

Without narrowed WDL:

\[
r(a)=\max_bV_{\text{ref}}(b)-V_{\text{ref}}(a)
\]

\[
O_{\text{reference-safe}}
=\{a:r(a)\le T_{\text{reference}}\}.
\]

This requires complete exact reference coverage.

With exact best class \(B\):

\[
V_{\text{best}}^B=
\max_{b:WDL(b)=[B,B]}V_{\text{ref}}(b)
\]

\[
r_B(a)=V_{\text{best}}^B-V_{\text{ref}}(a).
\]

Only proved `[B,B]` actions within tolerance are safe.

- All best-containing actions resolved/reference-valued: `known`.
- Unresolved actions can still belong to \(B\): `partial`.
- Best class unestablished: `unknown`.
- Proved lower-class actions are never safe.

Report exact-WDL downgrade, reference regret, known product/reference violation, unknown judgment, and all denominators.

### 3.9 Tolerance calibration

Use one global `ReferenceToleranceV1`.

Grid:

- `{0}` if there are no positive regrets;
- otherwise `0` plus unique 25/50/75/90/95 percentiles.

For each cutoff:

1. At each eligible root, identify every action admitted by the cutoff.
2. Evaluate the worst admitted action at that root against the reference-best action.
3. Force that worst action as ply 1.
4. Use identical `OutcomeContinuationPolicyV1`, named CRN, and fixed-160 adjudication.
5. Compute the root-level paired loss.
6. Aggregate root losses within each lineage.
7. Use lineage as the inferential/resampling unit.

Use 10,000 lineage max-stat bootstrap resamples and simultaneous one-sided bounds. Select the largest cutoff with upper point-share loss ≤3 pp and zero exact-WDL downgrade; otherwise use zero.

Use only `referenceOnly` or fully `known` roots. Apply the same worst-admitted-action rule when calibrating global `PlayerReplyToleranceV1`.

Player-reply sensitivity at \(0.5T,T,2T\) must retain direction and standardized spread ≤0.20, or counterplay cannot be the sole selector/lead.

Freeze:

\[
C_{\text{ref},d}
=
\max\left(4T_{\text{reference}},
Q_{0.99}(r_{\text{baseline},d})\right)
\]

over usable baseline judgments.

### 3.10 Outcome continuation

`OutcomeContinuationPolicyV1`:

- uses snapshot-proved exact-best WDL actions when sufficient;
- canonical action-key tie-breaking;
- otherwise fixed-depth-2 reference;
- never invokes proof dynamically;
- counts the forced action as ply 1;
- uses fixed-160 adjudication.

### 3.11 Next opponent boundary

`NextOpponentDecisionBoundaryV1`:

1. Apply the initial AI action.
2. Terminal → `terminal`, excluded from counterplay.
3. Opponent controls and has a legal decision → boundary.
4. AI retains control:
   - actual measurement follows the actual continuation;
   - counterfactual projection uses `OutcomeContinuationPolicyV1`.
5. Stop at the first genuine opponent decision.
6. Apply canonical cycle detection and the frozen continuation bound.
7. Overflow → `unknown`.

---

## 4. RNG, policies, semantics, and diagnostics

### 4.1 Named RNG

Base key:

```text
(runSeed, lineageId, purpose, replicate, turn, step)
```

Purpose fields:

- fixture generation adds `structuralStratum`;
- independent games add orientation/color;
- semantic/symmetry CRN share `orbitId` and omit transformed orientation/color;
- persona adds persona ID, persona seed, policy slot;
- human assignment adds participant, pair, period.

Algorithm, purpose registry, key schedule, and implementation hash are frozen.

### 4.2 Competence policies

`YOUIRandomV1`: uniform legal action, canonical order, named RNG.

Depth-2/4/6: pure-reference fixed-depth policies with canonical exact-best ties.

Frozen pool:

- `canonical-legal-v1`: first canonical legal action;
- `seeded-legal-v1`: uniform via named RNG;
- `tactical-greedy-v1`:
  1. immediate win;
  2. eliminate moves allowing an immediate opponent win when alternatives exist;
  3. maximize frozen static heuristic;
  4. canonical tie-break.

Pool algorithms/hashes are frozen. Competence uses equal-weighted paired/color-swapped fixed-160 games. Skill response uses measured competence, not nominal depth. If Random → Intuitive → d2 → d4 → d6 is non-monotonic in measured competence, do not report an ordinal tier-index slope.

Mandatory competence diagnostics report:

- adjudicated point share for Random, Intuitive, depth 2, depth 4, and depth 6;
- Intuitive-minus-Random advantage;
- adjacent measured-competence gains;
- monotonicity violations;
- normalized skill-response AUC on the measured-competence x-axis;
- natural-completion versions as secondary diagnostics only.

### 4.3 `YOUIIntuitiveV1`

\[
\Delta_{\text{own}}=R_{\text{own}}(s')-R_{\text{own}}(s),
\qquad
\Delta_{\text{opp}}=R_{\text{opp}}(s')-R_{\text{opp}}(s)
\]

where \(R=\max(homeReadiness,sixStackReadiness)\).

\[
z(x)=clip\left(
\frac{x-median_{\text{dev}}}
{\max(IQR_{\text{dev}},10^{-6})},
-3,3\right).
\]

\[
U_I(a)=
1.00z(\Delta_{\text{own}})
-
0.75z(\Delta_{\text{opp}})
+
10I(\text{actor wins})
-
10I(\text{actor loses}).
\]

Draws receive no terminal term. Sample with canonical-action softmax \(\tau=1\).

Intuitive deltas are one-step; semantic horizon deltas remain relative to the original root.

### 4.4 Semantic rollout

`SemanticRolloutPolicyV1`:

- force each root action;
- then use `YOUIIntuitiveV1` for both players;
- report H1/H4/H8 committed-action horizons;
- canonical action CDF;
- common exogenous uniforms by orbit/rollout/step;
- overflow → unknown.

A terminal trajectory stops generating actions, but its terminal state and outcome carry forward unchanged to every remaining requested horizon. Later horizons are not marked absent or unknown merely because termination occurred early.

Calibrate \(N\in\{8,16,32\}\) against 64 at all horizons:

- class agreement ≥95%;
- RMSE ≤0.05 for  
  `[own readiness delta, opponent readiness delta, pWin, pDraw, pLoss, structural reply-class count / maximum]`;
- Hill-1 MAE ≤0.10.

Choose the smallest passing \(N\); otherwise 64.

H4 is primary. H1/H8 are diagnostic. A ≥0.10-floored-SD direction reversal prevents sole-lead use.

### 4.5 Semantic signature

Structural phase:

1. conversion if either player has home singles ≥8, front controlled height ≥7, or front full stacks ≥2;
2. otherwise opening if empty cells ≤4;
3. otherwise transport.

Components:

- own progress: regress `<−0.02`, neutral, advance `>0.02`;
- opponent effect: enable `<−0.02`, neutral, block `>0.02`;
- intent tie order: `home < hybrid < sixStack < unknown`;
- risk bitset: `repetition`, `selfUndo`, `highDrawTrap`;
- structural counterplay: `0`, `1`, `2`, `3+`;
- terminal/conversion;
- constrained outcome.

```text
SemanticFutureSignatureV1 =
ownProgressClass
× opponentEffectClass
× constrainedOutcomeClass
× structuralCounterplayClass
× strategicIntent
× repetitionRiskBitset
× terminalConversionClass
```

`PlayerReplySemanticClassV1` excludes counterplay.

Aggregation:

- progress/readiness: mean;
- outcome: mean vector, proof mask, renormalize, threshold;
- intent: mode with canonical tie order;
- risk bits: present in ≥25%;
- terminal class: strict majority;
- terminal mass without majority: `mixedTerminal`;
- no terminal mass and readiness ≥0.85: `nearConversion`;
- otherwise `nonterminal`;
- counterplay: median reduced-reply count, lower-band tie;
- terminal rollout reply count: zero;
- overflow: unknown.

At rollout states absent from the proof snapshot, use unconstrained `[loss,win]`; never invoke proof dynamically.

### 4.6 Outcome calibration

Target: fixed-160 adjudicated W/D/L under `OutcomeContinuationPolicyV1`, not theoretical WDL or candidate-policy outcome.

Corpus:

- root and plies 8/24/48/80/120;
- at most six states/lineage;
- equal lineage weight;
- states split lineage weight equally.

Model:

- multinomial logistic regression;
- three-df natural cubic spline of reference score;
- phase and side to move;
- training-fold standardization;
- L2 `{0.01,0.1,1,10}`;
- outer five-fold/inner four-fold lineage CV;
- inverse-frequency train-fold weights normalized to mean 1 and capped at 5;
- train-fold empirical prior;
- fixed seed/software;
- no model/hyperparameter search outside this contract.

Acceptance:

- improved Brier over train-fold prior;
- 15 equal-frequency bins/class;
- macro ECE ≤0.05;
- class ECE ≤0.075.

Classes:

- win/loss ≥0.60 with ≥0.15 margin;
- draw ≥0.50 with ≥0.10 margin;
- otherwise uncertain.

WDL-disallowed mass >0.25 → unknown; otherwise mask, renormalize, threshold.

`highDrawTrap`: draw risk/calibrated draw probability ≥0.72.

### 4.7 Opportunity, aggregation, and missingness

```text
forced:
  fewer than two reference-safe actions

choiceOpportunity:
  at least two reference-safe actions

meaningfulChoiceOpportunity:
  at least two safe semantic classes

unknownOpportunity:
  incomplete reference/proof evidence
```

A treatment-independent counterplay opportunity requires at least one safe AI action reaching a nonterminal opponent boundary with usable evidence and at least two admissible replies.

\[
Y_\ell=\frac{1}{N_\ell}\sum_{i\in eligible(\ell)}y_i.
\]

\(N_\ell=0\) is missing, never zero.

Report separately:

- candidate-only zero-opportunity rate;
- baseline-only zero-opportunity rate;
- candidate-minus-baseline differential zero-opportunity rate.

Paired inference uses lineages observed in both arms. One-arm missingness receives worst-case sensitivity:

- rates: `[0,1]`;
- Hill-1: `[1,D_{1,\max,\ell}]`.

Define:

\[
D_{1,\max,\ell}
=
\max_{i\in\ell}
\left(
\text{number of fully enumerated semantic or reply classes at decision }i
\right).
\]

Impute in the direction most adverse to candidate NI. Changed pass status, insufficient paired data, or undefined CI means inconclusive/baseline.

\[
N_{\text{paired}}\ge\max(32,\lceil0.8N_{\text{eval}}\rceil).
\]

### 4.8 Primary endpoints

**Participation**

Eligibility requires:

- usable reference safety;
- `historyStatus='completeForParticipationWindow'`;
- a previous same-player source family exists;
- at least two safe actions;
- at least one safe action avoids that previous family.

Numerator: selected action repeats the previous same-player family.

**Meaningful future D1**

\[
p_c=
\frac{\#\{a\in O_{\text{reference-safe}}:class(a)=c\}}
{|O_{\text{reference-safe}}|},
\qquad
D_1=\exp\left(-\sum_cp_c\log p_c\right).
\]

Primary estimand is the on-policy lineage average. Fixed-root D1 is diagnostic.

**Effective counterplay**

Follow the selected action through `NextOpponentDecisionBoundaryV1`; exclude terminal conversion. Enumerate replies, apply WDL/tolerance, require usable evidence, classify replies, use equal action mass, and compute Hill-1. Eligibility requires at least two admissible replies.

**Suppression**

\[
D_{\max}^{proj}(s)=
\max_{a\in O_{\text{reference-safe}}}
D_{\text{reply}}^{proj}(s,a)
\]

\[
R_{\text{supp}}(s)=
D_{\max}^{proj}(s)-
D_{\text{reply}}^{proj}(s,a_{\text{selected}}).
\]

Require at least two safe AI actions, complete comparable evidence, and a safe selected action. Suppression means \(R_{\text{supp}}\ge0.5\).

**Reward for thinking**

\[
R_C=
PS(\text{Intuitive vs candidate})
-
PS(\text{Random vs candidate})
\]

\[
R_B=
PS(\text{Intuitive vs baseline})
-
PS(\text{Random vs baseline})
\]

\[
E_{\text{rewardForThinking}}=R_C-R_B.
\]

Pair by lineage, color, transform, persona ID/seed, and RNG under fixed-160 adjudication.

### 4.9 Secondary diagnostics

Mandatory non-primary reports include:

- realized semantic D1 using actual selection probabilities, kept distinct from equal-safe-action opportunity D1;
- continuous semantic dispersion;
- avoidable region repetition;
- family/region exposure diversity;
- family/region contribution diversity;
- persistent contribution after 4 and 8 committed actions;
- retained-turn share;
- productive and regressive progress shares;
- exact-action reuse;
- action-kind and tag diversity;
- root style-selection rate and positive-regret selection share;
- exact recurrence interval and recurrence clustering;
- self-undo and feature-space near-cycle rates;
- readiness AUC;
- conversion regret;
- strategic switches;
- opponent counter-progress.

The historical 10–35% style-selection range may be shown descriptively but is never a hard gate. Raw reply counts, Lempel–Ziv complexity, sample entropy, permutation entropy, and any composite interestingness score remain exploratory only.

---

## 5. Treatments, reranker, and selection

### 5.1 Stage A

Per difficulty:

\[
leaf\in\{0,0.125,0.25,0.5\}
\times ordering\in\{0,1\}.
\]

\[
leafValue \mathrel{+}=round(participationScore\times leaf)
\]

\[
orderingScore \mathrel{+}=
clamp(round(participationDelta),-4000,4000)
\]

when enabled.

Run native 128/256/512 nodes, common 512 nodes, depths 2/3/4, and depths 5/6 for promoted finalists.

Parity gates:

- forced tactical correctness at every depth;
- disagreement increase ≤0.20 floored SD;
- regret oscillation increase ≤0.20 floored SD;
- reversal counted at ≥0.10 floored SD;
- reversal-share upper bound ≤25%;
- reversal-share increase ≤10 pp;
- no systematic sign reversal.

Development strength:

- depth-4 complete-root reference rescoring;
- zero exact-WDL downgrade;
- mean reference-regret increase ≤0.20 floored SD;
- no product-catastrophic-rate increase;
- 32 paired fixed-160 games/difficulty, descriptive only.

Development performance:

- five paired isolated repetitions;
- NPS point loss ≤15%;
- depth-0/fallback increase ≤1 pp.

Promotion:

- zero eligible → baseline;
- one → promote;
- multiple → best conservative improved-family lower bound, then simplest remaining Pareto candidate with another dominant family where possible.

### 5.2 Stage B/C

For every promoted Stage-A configuration:

```text
(stageAConfig, S0)
(stageAConfig, SE)
(stageAConfig, SR, τ)
```

with \(\tau\in\{0.25,0.5,1,2\}\). No `SE×SR`.

Treatment E:

- ordinary scalar product search;
- participation breaks only exact ties already proved by production search;
- evidence must be `productCompletedDepth`, exact, same depth, equal exact best;
- no unresolved bound from another legal root may exceed the tied best;
- no extra runtime search;
- ambiguity uses baseline behavior;
- no reordering before an old order-sensitive selector.

Treatment E must also report, per difficulty:

- exact-tie opportunity rate = exact Treatment-E-eligible tie roots / Treatment-E-evaluable roots;
- selection-change rate = roots where Treatment E changes the baseline selector / exact-tie opportunities;
- point share, regret, and primary-family effects conditional on exact-tie opportunities as diagnostics.

If exact ties are too rare for Treatment E to materially affect behavior, preserve and report that null result. Never manufacture additional opportunities by widening equality, adding search, or retuning the product scorer.

Stage C runs every eligible SR arm at the same \(\tau\), selected/adjacent leaf values, both ordering values, common/native work, and depths 2/3/4.

### 5.3 Duplicate-invariant reranker

Preprocessing uses treatment-independent development data and eligible baseline product-safe action rows per difficulty.

\[
z_d(x)=clip\left(
\frac{x-median_d(x)}
{\max(IQR_d(x),10^{-6})},
-3,3\right).
\]

Missing values use the median.

\[
U_a=
1.00z_{\text{strength}}
+0.30z_{\text{plan}}
+0.20z_{\text{persona}}
+0.25z_{\text{history}}
+0.25z_{\text{participation}}
+0.20z_{\text{progress}}
+0.50z_{\text{risk}}.
\]

Raw features:

- strength: negative product regret;
- plan: `1/0.25/−1`;
- persona: frozen tag/geometry bias;
- history:  
  `0.50×(1−tag Jaccard)+0.25×family difference+0.25×region difference`;
- participation: raw delta;
- progress: max home/six delta;
- risk: `1−drawTrapRisk`.

```text
RootStyleEquivalenceClassV1 =
(
  sourceFamily,
  actionKind,
  terminalClass,
  strategicIntent,
  sortedTags,
  tacticalFlag,
  progressBand,
  riskBand,
  participationBand
)
```

Bands:

- progress: `<−0.02`, `[-0.02,0.02]`, `>0.02`;
- risk: `<0.25`, `[0.25,0.72)`, `[0.72,0.95)`, `≥0.95`;
- participation-z: `<−0.5`, `[-0.5,0.5]`, `>0.5`.

\[
U_c=\max_{a\in c}U_a,\qquad U_f=\max_{c\in f}U_c
\]

\[
P(f)\propto e^{U_f/\tau_d},
\qquad
P(c\mid f)\propto e^{U_c/\tau_d}
\]

\[
P(a)=P(f)P(c\mid f)/|c|.
\]

### 5.4 Effects, floors, and multiplicity

\[
E_j=
\begin{cases}
C-B,&\text{higher better}\\
B-C,&\text{lower better}
\end{cases}
\]

SESOIs:

- repeat rate: 3 pp;
- meaningful/counterplay D1: \(\max(0.20s_{dev},0.10)\);
- reward for thinking: 3 pp.

\[
s_j^*=\max(s_{\text{baseline,dev}},s_{j,\min}).
\]

Floors:

- D1: 0.10;
- reference regret: \(\max(1,0.10T_{\text{reference}})\);
- suppression: 0.10 classes;
- bounded rates: 1 pp.

\[
Z_j=E_j/m_j.
\]

NI requires \(LB_{95}(Z_j)>-1\). Material benefit requires \(Z_j\ge1\) and Holm-adjusted one-sided superiority at 5%.

Holm adjusts four benefit hypotheses within candidate. No cross-candidate adjustment; the single sealed lead receives none.

### 5.5 Eligibility and artifacts

Eligibility:

1. correctness;
2. development strength;
3. development performance;
4. all NI gates;
5. opportunity/evidence gates;
6. at least one adjusted material benefit;
7. Pareto nondominance.

Tie-break:

1. purer strength/style separation;
2. fewer layers;
3. lower cost;
4. lower fixture/seed variance;
5. simpler coefficient/temperature;
6. lexical treatment ID.

No eligible change means baseline for that difficulty and exact \(Z_{j,d}=0\).

`DevelopmentCandidateSelectionV1` freezes treatment/configuration IDs, per-difficulty decisions, unchanged difficulties, lead family, evidence hashes, and selection-rule version.

`ShippingCandidateManifestV1` freezes implementation commit/tree, worker hash, configuration hash, clean-baseline hash, equivalence evidence, and all protocol dependencies.

### 5.6 Lead

\[
\bar Z_j=
\frac{Z_{j,E}+Z_{j,M}+Z_{j,H}}{3}.
\]

Lead is the eligible family with the largest conservative lower bound for \(\bar Z_j\), provided every difficulty passes that family’s NI gate.

Tie order:

1. `avoidableFamilyRepeat`;
2. `counterplayD1`;
3. `meaningfulFutureD1`;
4. `rewardForThinking`.

### 5.7 Adequacy and sealed rule

Development adequacy:

- ≥32/96 meaningful-choice lineages;
- meaningful-choice share ≥10%;
- counterplay-opportunity share ≥10%;
- unknown-opportunity share ≤20%.

Sealed sizing jointly resamples complete cross-endpoint/cross-difficulty vectors across all eligible assembled tuples/leads.

Minimum 48 complete-block lineages and:

- ≥80% complete-rule pass under zero harm, +1-SESOI lead, baseline guardrails;
- no-benefit false lead pass ≤5%;
- all NI-harm and guardrail boundaries simulated.

Runtime cannot reduce required \(N\).

Sealed NI requires twelve per-difficulty family gates:

\[
\forall j\in\{1,2,3,4\},
\forall d\in\{Easy,Medium,Hard\}:
LB_{95}(Z_{j,d})>-1.
\]

The frozen lead must also satisfy:

\[
\bar Z_{\text{lead}}\ge1,
\qquad
LB_{95}(\bar Z_{\text{lead}})>0.
\]

Additionally:

- every difficulty passes all guardrails;
- no exact-WDL downgrade;
- strength/performance/symmetry pass;
- no undefined endpoint/CI;
- no retuning.

Failure retains baseline.

### 5.8 Release guardrails

- meaningful-choice opportunity ≥−3 pp;
- counterplay opportunity ≥−3 pp;
- known evidence ≥−2 pp;
- unknown opportunity ≤+2 pp;
- suppression rate ≤+2 pp;
- suppression regret ≤+0.20 floored SD;
- natural completion ≥−3 pp;
- censoring ≤+3 pp;
- completed depth ≥−0.25 ply/difficulty;
- fixed-time reference-regret mean/p95 ≤+0.20 floored reference SD;
- fallback/watchdog ≤+0.5 pp;
- reference-catastrophic tail rate ≤+0.5 pp;
- persona classifier drop ≤0.05;
- persona reference-regret degradation ≤0.20 floored SD;
- persona point-share spread/change within ±3 pp.

---

## 6. Engineering, strength, and performance

### 6.1 Catastrophic regret

`ProductSearchCatastrophicRegretV1` uses depth-6 complete-root product rescoring, style/ONNX disabled, nonbinding budget, and a 5,000-point best-minus-selected threshold. It is not runtime `selectionRegret`.

### 6.2 Clean baseline and performance

`CleanCurrentBaselineV1` requires unchanged production behavior, experiment/diagnostic code physically absent, identical toolchain/build, tree/artifact hashes, and behavior equivalence. The 86.80-kB diagnostic worker is not its denominator.

Final A/B:

- randomized/interleaved;
- 20 repetitions;
- three isolated sessions;
- all difficulties;
- ONNX disabled/enabled;
- cold/warm worker/model/cache;
- paired block bootstrap;
- main-thread responsiveness.

The performance evidence package also reports paired micro measurements for:

- evaluator/leaf evaluation;
- participation scoring;
- move ordering;
- root reranker/root selection;
- root preparation;
- out-of-band reference observer overhead;
- nodes per second;
- completed depth and fallback/depth-zero behavior;
- allocations, peak/retained memory, and worker artifact size.

Browser evidence additionally reports:

- AI decision p50/p95;
- user-interaction/input latency while AI work is active;
- long-task count and duration;
- visible animation/frame disruption;
- watchdog/fallback behavior.

These extra measurements are diagnostics unless a numerical gate below explicitly references them.

Gates per difficulty:

- NPS lower ratio ≥0.90;
- decision p50/p95 ≤1.10×;
- root-preparation p95 ≤1.10×;
- worker size ≤1.02× clean baseline.

### 6.3 Product TT audit

At completed depths 2, 3, and 4 with nonbinding work, compare current TT, repetition-aware TT, and TT disabled on states with equal production identity but different repetition histories.

Require equal root values, actions, and terminal results when the same finite tree completes. Native-budget performance is separate.

Mismatch requires a separate correctness fix and complete rebaseline before candidate selection.

### 6.4 Symmetry

Transform board, owner/side, pending jump, repetition baselines/counts, history, identity registry, actions, and terminal state.

Identity transport uses `white-N ↔ black-N` with deterministic owner-local ordinal fallback.

Gates:

- deterministic logical equivalence;
- stochastic no-ONNX analytic tolerance \(10^{-12}\);
- synthetic Float32 tolerance \(10^{-6}\);
- sampled orbit-shared CRN;
- ONNX JSD increase upper bound ≤0.001;
- absolute ONNX JSD ≤0.01 only when baseline satisfies it, otherwise no worsening.

### 6.5 Sequential GLR

\[
H_0:p\le0.47,\qquad H_1:p=0.50.
\]

- fixed-160 pentanomial pair score;
- \(\alpha=0.05,\beta=0.20\);
- Jeffreys 0.5 smoothing;
- exponential tilt;
- fixed seed/version;
- minimum 2 blocks;
- maximum 100;
- no discretionary futility;
- max-block inconclusive → baseline;
- 12 pairs/24 games per block;
- original/mirror/color-swapped;
- equal allocation;
- native 128/256/512;
- Hard-2048 diagnostic.

\[
\log\frac{1-\beta}{\alpha},
\qquad
\log\frac{\beta}{1-\alpha}.
\]

### 6.6 Persona and pacing

Persona/stochasticity diagnostics decompose fixture/state, persona, policy seed, interactions, and residual variance **separately for semantic behavior and adjudicated outcomes**. Also report the grouped persona classifier by lineage, persona–behavior mutual information, pairwise action-distribution JSD, persona-specific reference regret, persona-specific adjudicated point share, strength/WDL leakage, and phase/fixture-conditioned summaries. Random outcome variance is not persona quality: semantic diversity is desirable; outcome lottery is not. Human persona recognition remains deferred.

After `OutcomeCalibrationV1` passes, report the full pacing/conversion diagnostic set without optimizing it directly:

- calibrated normalized outcome entropy;
- late uncertainty area;
- advantage permanence;
- recovery opportunities;
- decisive-tail onset;
- first-player point-share advantage;
- `sideBalance = clamp(1 - 2 * abs(firstPlayerPointShare - 0.5), 0, 1)`;
- natural decisive-result share;
- terminal-ply distribution;
- survival/completion curve;
- restricted mean game length through 160 plies;
- censoring share;
- home-readiness AUC;
- six-stack-readiness AUC;
- best-goal readiness AUC;
- maximum readiness reached;
- conversion regret versus the best reference-safe action;
- same-player strategic goal switches;
- plan dwell and coherence;
- opponent counter-progress;
- natural conversion rate;
- adjudicated conversion rate;
- terminal distance when exact evidence exists.

Estimated-outcome pacing components are `unknown` if `OutcomeCalibrationV1` fails. These are diagnostics/human predictors, not direct optimization targets.

---

## 7. Human validation

### 7.1 Study flow

Tutorial plus unscored practice.

- Novice: no YOUI and strategy-board games less than monthly.
- Experienced: monthly or more.

Pilot: 24 equally stratified participants, one pair/difficulty plus a fourth pair balanced as eight participants/difficulty, four novice/four experienced. Counterbalance pair sequence, baseline/candidate order, human side, and repeated difficulty across experience strata.

Within pair: same lineage, transform, side, persona/seed, rules, RNG, and adjudication. Use opaque `condition-1`/`condition-2` labels and participant blinding. The condition mapping remains private until exclusions and the preregistered analysis specification are locked.

The pilot cannot approve launch. It supplies nuisance parameters, burden/missingness information, and calibration inputs only; its treatment-effect estimate is not reused as the confirmation design effect.

Measures:

- play again: condition 1 / condition 2 / no preference;
- enjoyment, fairness, frustration: 1–7;
- strategic difference: 1–7;
- autonomy, competence, challenge, mastery, curiosity: 1–7.

After pilot, freeze nuisance estimates and confirmation \(N\), recruit new participants, exclude pilot outcomes, and use identical strata/counterbalancing/invariants. Confirmation \(N\) is a multiple of 24.

### 7.2 Davidson model

\[
\eta_i=
\Delta_H+X_i\beta+
u_{\text{participant}[i]}+
v_{\text{fixture}[i]}.
\]

\[
D_i=e^{\eta_i}+1+2\nu e^{\eta_i/2}.
\]

\[
P_i(C)=\frac{e^{\eta_i}}{D_i},
\quad
P_i(B)=\frac1{D_i},
\quad
P_i(tie)=\frac{2\nu e^{\eta_i/2}}{D_i}.
\]

\(X_i\): period, order, side, difficulty, persona, transform, experience.

Priors:

- \(\Delta_H,\beta\sim N(0,1)\);
- \(\log\nu\sim N(\log0.25,1)\);
- random SDs `HalfNormal(0,0.5)`.

Use non-centered effects, a fixed human-analysis seed, and a frozen sampler/software version.

NUTS:

- four chains;
- 2,000 warmup + 4,000 retained;
- target acceptance 0.95, preregistered rerun 0.99;
- \(\hat R<1.01\), ESS >1,000, no divergences, BFMI >0.3;
- persistent failure → inconclusive.

Missing pairwise preference is omitted only from Davidson; completed ratings remain.

### 7.3 Continuous outcomes and launch

Crossed models use the same fixed effects, non-centered effects, priors, seed, sampler, NUTS, diagnostics, and cumulative-link sensitivity.

Standardize using pilot-baseline within-person SD. Freeze exclusions before unblinding. Use MAR plus delta-adjusted MNAR. More than 10% missing primary outcomes is inconclusive.

\[
P(\Delta_E>-0.10)>0.95
\]

\[
P(\Delta_F>-0.20)>0.95
\]

\[
P(\Delta_{\text{frustration}}<0.20)>0.95
\]

\[
P(\Delta_H>0)>0.95,
\qquad
median(\Delta_H)\ge\log1.20.
\]

Use \(\delta_{\min}=\log1.20\), \(\delta_{\text{design}}=\log1.35\). Pilot estimates nuisance parameters only. Select the smallest 24-participant multiple with false launch ≤5% at zero and ≥80% complete-rule pass at \(\delta_{\text{design}}\); report pass probability at \(\delta_{\min}\). Cost, schedule, or recruitment convenience never reduces the statistically selected confirmation \(N\); infeasible recruitment makes the result inconclusive.

Held-out human descriptor/persona-prediction validation is **not part of this confirmatory study** because human persona recognition is deferred. It is explicitly deferred to a future blinded persona-recognition/descriptor-validation protocol rather than silently dropped.

---

## 8. Telemetry and canary

Telemetry is operational evidence only. It never runs a second AI, adds search/legal work, blocks gameplay, or sends per-turn requests.

Schema includes:

- normal turns;
- elapsed samples and total;
- watchdog/fallback;
- root samples/multi-candidate;
- family/region opportunities and repeats;
- retained/productive/regressive/nonzero-regret;
- `observed_reply_samples`;
- bounded reply total and maximum;
- completed games;
- telemetry/compacted batches;
- per-error-code occurrence/session-report counts.

Every rate/mean has a durable denominator.

Error enum:

```text
ai_worker_unavailable
ai_worker_watchdog_timeout
ai_worker_message_error
ai_worker_runtime_error
ai_worker_invalid_response
ai_worker_post_message_failure
```

Contract:

- strict allowlist;
- no coordinates/actions/IDs/hashes/traces/raw values/stable identity;
- 32-KiB batches;
- 30-day expiry;
- compaction;
- bounded outbox;
- retry/idempotency;
- opt-out clearing;
- runtime-overhead tests.

Worker-failure stop: new fatal code in two sessions, or same new code ≥3 times across ≥2 sessions.

Use day×difficulty×arm bins, 10,000-resample frozen bootstrap, and separately require 14 days, 1,000 turns, and 50 games per arm/difficulty.

Canary gates:

- productive progress lower bound ≥−3 pp;
- regressive progress upper bound ≤+3 pp;
- family repeat upper bound ≤+3 pp;
- watchdog upper bound ≤+0.5 pp;
- compaction upper bound ≤+1 pp;
- mean elapsed ratio ≤1.10.

Passing telemetry is not efficacy evidence. Telemetry does not migrate offline Hill-1/D1 semantics into production, and the existing anomaly-only finishing snapshot remains outside this metric family.

---

## 9. Post-sealed conversion and exclusions

Post-sealed conversion is offline-only. Shipping changes require a new candidate manifest and revalidation.

Limits:

- transition-closed;
- ≤10 million states;
- ≤2-GB artifact;
- ≤8-GB memory;
- ≤4 CPU-hours;
- exact cycles/repetition;
- deterministic traversal;
- certificates;
- unknown on exhaustion;
- ordinary checker IDs canonicalized/erased outside active pending-jump references;
- pending-jump-referenced identity distinctions preserved exactly;
- active nonterminal repetition counts capped with `min(count,2)` in canonical solver state.

Finishing search requires a canonical closed set, best-known path cost/reopening, goal-switch tracking, deterministic timeout fallback, and incomplete/unknown status on timeout.

Shortest-path claims require admissible A*/IDA*. Weighted A* claims bounded suboptimality only when justified; otherwise no optimality claim.

Potential shaping sums to zero around cycles and cannot reward move-away/back.

Deferred:

- MAP-Elites/persona QD;
- learned diversity embeddings;
- learned human-like policies;
- ONNX retraining;
- within-game adaptation;
- between-game adaptation;
- unproved shaping;
- production reference-oracle execution;
- production conversion/tablebases;
- new telemetry-persistence architecture;
- blinded human persona-recognition / held-out descriptor-prediction validation;
- epsilon-equivalence Treatment E.

Do not restore superseded legacy temperature scaling, early Bradley–Terry thresholds, old small fixtures, per-difficulty reference tolerances, pre-outcome-model effect-direction calibration, or discretionary Stage-B temperature selection.

---

## 10. Commit sequence

1. `Docs: Freeze AI interestingness recovery protocol`
2. `Testing: Unify resumable AI evaluation runs`
3. `Testing: Version AI root contexts and fixture catalogs`
4. `Testing: Build treatment-independent development fixtures`
5. `AI: Add pure reference strength oracle`
6. `Testing: Record exact root score provenance`
7. `Testing: Record exact root coverage evidence`
8. `AI: Make reference transpositions repetition-safe`
9. `Testing: Audit production transposition correctness`
10. `Testing: Add bounded WDL proof protocol`
11. `Testing: Freeze development WDL evidence`
12. `Testing: Calibrate reference safety tolerance`
13. `Testing: Calibrate player reply tolerance`
14. `Testing: Define calibrated continuation outcomes`
15. `Testing: Calibrate intuitive player competence`
16. `Testing: Measure semantic future choices`
17. `Testing: Calibrate semantic rollout stability`
18. `Testing: Validate fixture opportunity coverage`
19. `Testing: Measure counterplay and suppression`
20. `Testing: Restore participation diagnostics`
21. `Testing: Decompose persona and stochastic effects`
22. `Testing: Report pacing and conversion diagnostics`
23. `Testing: Screen participation coefficient grid`
24. `AI: Add exact root tie participation`
25. `AI: Add duplicate-invariant root reranker`
26. `Testing: Expand reranker coefficient neighborhoods`
27. `Testing: Capture complete development treatment evidence`
28. `Testing: Power sealed AI validation`
29. `Testing: Freeze sealed AI fixtures and proofs`
30. `Testing: Select one development AI candidate`
31. `AI: Recover participation within strength bounds`
32. `Testing: Build clean current AI baseline`
33. `Testing: Freeze shipping AI candidate manifest`
34. `Testing: Validate frozen AI policy candidate`
35. `Testing: Confirm AI policy strength sequentially`
36. `Performance: Validate AI worker and browser budgets`
37. `Testing: Strengthen AI symmetry coverage`
38. `Telemetry: Add privacy-bounded AI canary metrics`
39. `Testing: Validate AI telemetry operations`
40. `Testing: Pilot human AI calibration`
41. `Testing: Power human AI confirmation`
42. `Testing: Confirm human AI preference`
43. `Testing: Expand offline AI conversion evidence`
44. `Docs: Record final AI interestingness evidence`

Sealed fixtures/proofs are generated and firewalled before candidate selection. Clean baseline and shipping manifest are frozen before sealed unlock.

No shipping behavior is enabled unless correctness, sealed, strength, performance, symmetry, canary, and human gates pass. Inconclusive confirmation retains baseline.

## 11. Closed-set preservation ledger and verification

This section is normative bookkeeping for future edits. A requirement may leave the active specification only if it is explicitly classified here as **Superseded** or **Deferred**. Editorial compression may not remove executable semantics.

### 11.1 Active normative requirement families

The following mature requirement families are present in this document and remain active:

1. **PROV** — immutable audited baseline; exact command/arguments; timestamps; OS/runtime/compiler/browser/sampler; hardware/power; repo/tree/archive/dirty hashes; artifact/protocol hashes.
2. **RUN** — unique runs; deterministic shards/merge; canonical resume IDs; atomic checkpoints/finalization; planned/completed counts; throughput/ETA; explicit run states; detached long campaigns; isolated performance jobs.
3. **FIX** — treatment-independent 96-lineage development generator; frozen marginal strata; valid history contexts; nested variants; sealed generator family with new IDs/keys; no cherry-picking.
4. **ORDER** — frozen artifact/calibration/treatment/sealed/human execution order and complete-catalog restart rule.
5. **PRODUCT** — `ProductSearchUtilityV1` versus `RootSelectionUtilityV1`; 960/480/240 product ceilings; terminal-safe `O_product-safe`; behavior subset; utility-version isolation.
6. **SCORE** — completed-depth versus partial-depth score provenance; no conflation; exact-root coverage requirements.
7. **REF** — pure depth-4 reference oracle, normal risk mode, all legal moves, full-window roots, exact pruning only, no style/ONNX/quiescence/extensions, cloned out-of-band context, no product-budget use.
8. **WDL** — current-player perspective; retained-control edge orientation; terminal perspective; monotonic bounds; only terminal/exhaustive/tablebase proof narrows WDL.
9. **RTT** — terminal-before-TT; no terminal caching; collision-free full serialized repetition-aware active-state key; pending-jump identity preservation.
10. **ROOTCTX** — `AiRootContextV1`; exact short-game/ten-action completeness; retained-turn records; repetition replay; history exclusion semantics.
11. **PROOF** — treatment-independent query neighborhood including root/reply successors; eight-action continuation bound; 30 min/8 GB/10M; certificates/verifier; sealed storage/access firewall; no dynamic proof invocation.
12. **SAFE** — `referenceOnly|known|partial|unknown`; exact best-class regret; reference-safe and product-safe separation; unknown-evidence accounting.
13. **TOL** — global reference/player tolerances; percentile grid; worst-admitted-action per root; 10,000 max-stat bootstrap; ≤3 pp loss; zero exact-WDL downgrade; 0.5T/T/2T sensitivity.
14. **RNG** — counter-based named RNG; structural stratum, orientation/color, orbit, persona, and human fields; frozen registry/schedule/hash; no cross-purpose mutable state.
15. **COMP** — Random, pure d2/d4/d6, frozen competence pool; paired fixed-160 calibration; measured-competence x-axis; monotonicity/AUC diagnostics.
16. **INTUITIVE** — mature pooled-development median/IQR one-step readiness policy, +1.00 own / -0.75 opponent, ±10 terminal terms, τ=1; distinct root-relative semantic progress.
17. **SEMROLL** — H1/H4/H8 CRN rollout; terminal carry-forward; frozen count via 8/16/32 versus 64; class/RMSE/Hill-1 acceptance; H4 primary and reversal rule.
18. **SEMCLASS** — exact semantic tuple; structural phase; progress/effect thresholds; intent tie order; risk bits; counterplay bands; terminal aggregation; arbitrary-state proof masking.
19. **OUTCOME** — fixed-160 continuation target; treatment-independent weighted corpus; exact multinomial-logistic 3-df spline model; grouped nested CV; fixed L2/weights/prior; Brier/ECE gates; asymmetric draw rule.
20. **OPP** — forced/choice/meaningful/unknown opportunity states; treatment-independent counterplay opportunity; lineage aggregation; zero-opportunity reporting; paired minimum; worst-case missingness.
21. **PRIMARY** — avoidable prior-family repeat, on-policy meaningful D1, effective counterplay, suppression, and reward-for-thinking difference-in-differences with exact denominators/eligibility.
22. **SECONDARY** — realized D1, semantic dispersion, region/family diversity, contribution persistence, action/tag diversity, recurrence/self-undo/near-cycle, competence and pacing/conversion diagnostics.
23. **A** — full leaf 0/0.125/0.25/0.5 × ordering 0/1 grid; native/common work; fixed depths; parity; development strength/performance screens; deterministic promotion.
24. **E** — exact ordinary-product ties only; completed-depth exact evidence; no unresolved superior bound; no extra runtime search; no reorder; exact-tie opportunity/selection-change observability.
25. **SR** — treatment-independent robust-z preprocessing; fixed features/coefficients/classes/bands; dimensionless τ grid; duplicate-invariant family/class mass; full Stage B/C universe.
26. **EFFECT** — improvement-positive effects; SESOIs; generic metric floors; NI/material rules; Holm within candidate; no cross-candidate correction; statistical units.
27. **SELECT** — independent difficulty selection; deterministic ranking; exact unchanged-difficulty Z=0; fixed lead rule/tie order; frozen selection/shipping artifact payloads.
28. **SEALED** — joint tuple/lead covariance envelope; complete-rule power; ≥48; ≥80%; ≤5% null false lead; boundary simulations; twelve per-difficulty NI gates; frozen lead; no retuning.
29. **GUARD** — gameplay/evidence/opportunity/depth/fallback/reference-catastrophic/persona numerical release guardrails.
30. **CATA** — offline depth-6 product catastrophic regret diagnostic at 5,000, distinct from bounded runtime selection regret.
31. **CLEANPERF** — physically clean baseline; behavior equivalence; ONNX on/off; cold/warm; 20 paired repetitions; 3 isolated sessions; NPS/latency/root-prep/size gates; micro/browser diagnostics.
32. **PTT** — product TT audit at depths 2/3/4 with nonbinding work; TT/repetition-aware/disabled parity; separate correctness fix and full rebaseline on mismatch.
33. **SYM** — complete state/history/repetition/identity transform; `white-N ↔ black-N`/owner-local fallback; exact/1e-12/1e-6/ONNX-JSD gates.
34. **GLR** — fixed-160 pentanomial strength, H0≤0.47/H1=.50, α=.05/β=.20, Jeffreys smoothing, exponential tilt, Wald boundaries, 2–100 blocks, 12 pairs/block, no futility, baseline on inconclusive.
35. **PERSONA** — semantic/outcome variance decompositions separately; grouped classifier/MI/JSD/regret/point-share/leakage; numerical gates; outcome lottery not persona quality.
36. **PACING** — full entropy/balance/length/censoring/readiness/conversion/plan-dwell/terminal-distance diagnostic set, interpreted only after calibrated outcomes where applicable.
37. **HUMAN** — 24-person stratified pilot; private condition mapping; fixed pair invariants/counterbalancing; new confirmation participants; Davidson 2ν model; crossed continuous models; NUTS/priors/diagnostics; MAR/MNAR; fixed launch/guardrail rules; 24-person-block power; cost cannot reduce N.
38. **TEL** — aggregate-only per-difficulty/arm telemetry; durable denominators; finite error enum/session counts; privacy allowlist; 32 KiB/30-day/bounded outbox/idempotency/opt-out; no second AI/search/blocking/per-turn network; frozen bootstrap/floors/gates; telemetry not efficacy.
39. **CONV** — post-sealed offline firewall; canonical solver identity/repetition; 10M/2GB/8GB/4h limits; exact cycles; A*/IDA* shortest claims; qualified weighted A*; closed/best-cost/reopen/goal-switch/timeout behavior; cycle-neutral shaping.
40. **SHIP** — no behavior enabled unless correctness, sealed, strength, performance, symmetry, canary, and human gates pass; any inconclusive confirmatory result retains baseline.

### 11.2 Explicitly superseded definitions

These earlier definitions are intentionally **not** active and must not silently return:

- `varietyTemperature × 400` for the normalized z-score reranker;
- early Bradley–Terry/pilot launch thresholds;
- the original small `policy-validation-v1` fixture recipe;
- per-difficulty reference tolerances;
- pre-outcome-model rollout effect-direction calibration;
- discretionary Stage-B temperature selection;
- fixed nominal-depth skill-response x-axis when measured competence is available;
- any Treatment-E epsilon-equivalence or extra-search equality expansion.

### 11.3 Explicitly deferred scope

The following are preserved as deferred rather than silently removed:

- MAP-Elites/persona quality-diversity and learned diversity embeddings;
- learned human-like policies;
- ONNX retraining;
- within-game and between-game adaptation;
- unproved shaping;
- production `ReferenceStrengthOracleV1` execution;
- production conversion/tablebases/finishing changes from offline research;
- new telemetry-persistence architecture;
- blinded human persona-recognition and held-out descriptor-prediction validation;
- Treatment-E epsilon-equivalence widening.

### 11.4 Triple-check rule

Before accepting any future editorial revision, run three checks:

1. **Semantic check:** every active family in §11.1 still has the same thresholds, formulas, execution ordering, and treatment behavior.
2. **Presence check:** every active family is explicitly present or normatively referenced; every removed item appears in §11.2 or §11.3 with its disposition.
3. **Cross-interface check:** execution order, artifact hashes/firewalls, statistical units, denominators, missingness, and launch/rebaseline actions are mutually consistent.

A revision failing any of these checks is not `DESIGN-FROZEN` even if its prose says otherwise.

This specification is preservation-complete and `DESIGN-FROZEN`.
