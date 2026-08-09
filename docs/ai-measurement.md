# AI Measurement Contract

## Purpose

`ai:measure` is the validity layer for broad AI-quality experiments, while
`ai:competence` is the tactical-oracle and equal-work decision layer, while
`ai:strength` measures game-level results against immutable reference policies.
Together they answer six different questions without collapsing them into one attractive
but ambiguous "interestingness" number:

1. Does the AI choose the uniquely winning or uniquely defensive move?
2. Did the requested search actually run?
3. What game outcomes resulted?
4. What observable kinds of play occurred?
5. Is a before/after difference larger than measurement uncertainty?
6. Is game-level strength non-inferior across a fixed opponent portfolio?

The existing variety command is retained as a legacy behavior-regression dashboard;
the stage, loop, threat, bucket, and cross-play reports remain useful specialized
views. Its drama, tension, and composite-interestingness values are uncalibrated
trace proxies, not enjoyment measures or release gates. A quality claim should first pass `ai:measure`, because
behavior measured from depth-zero fallback or from an unintended clock model is
not evidence about the intended AI.

This infrastructure does not change the shipped difficulty presets or move
selection. A future strategy change needs a separate adoption decision.

## Same-harness policy boundary

`AiPolicy` is the outcome-experiment boundary. It owns a stable id and source
hash, creates seeded per-game sessions, and returns a legal action plus optional
policy-specific diagnostics. The current engine and `LegacyPolicyV0` implement
the same interface; the match harness supplies both with identical current
domain states, rules, fixed-node budgets, horizons, and color-swapped seeds.

`LegacyPolicyV0` is pinned to `2bd9c455ec2537aa84b1fef38550ce13c53efd29`,
the parent of the branch's first production-semantic commit
`944e0f06d937d3a8bce6fba2f6063485a3266ecb`. At runtime its production AI
sources are materialized from that immutable Git object in an isolated process,
while `src/domain` and `src/shared` are linked from the current workspace. This
deliberately compares old policy versus current policy under one current harness
and one fingerprintable domain, instead of confounding policy changes with each
revision's historical report schema. Policy-source and adapter hashes are
separate from the domain, fixture, harness, budget-semantics, and adjudication
identities that the campaign layer records.

## Tactical competence and fixed-node regret

`ai:competence` measures the first Phase 2 strength contract. Its fixture catalog
contains rule-derived unique-win and unique-defense positions. Each source
fixture is paired with a true horizontal mirror, and construction fails unless
the domain rules find exactly one correct action in both variants. This prevents
stale handwritten action labels from becoming an oracle.

Every subject decision is repeated over a fixed-node curve. The default full
curve is 64, 128, 256, 512, 1024, and 2048 evaluated nodes. A complete
fixed-depth Hard search supplies the deeper reference root. The selected action
is looked up in that deeper root and receives:

- deeper-oracle regret and p95 regret;
- catastrophic-regret classification at a declared score threshold;
- oracle agreement;
- unique-win or unique-defense accuracy;
- oracle coverage, root coverage, fallback, and zero-depth denominators.

An action absent from the complete oracle root has `null` regret and increments
missing coverage. It never receives a convenient zero. Confirmatory gates apply
only to the largest measured node budget for each difficulty; smaller budgets
remain diagnostic curve points. `--enforce-gates=true` converts a failed final
gate into a non-zero command exit.

This oracle is deliberately internal and bounded: it is a stronger, complete
search under the same evaluator, not solved-game truth. The curated tactical
labels provide independent rule truth for immediate wins and defenses; future
portfolio work should add deeper generated and human-incident holdouts.

## Frozen-reference game strength

`ai:strength` closes the gap between tactical decisions and complete-game
outcomes. The candidate plays two games per statistical unit, once as White and
once as Black, against the same versioned reference policy with the same
candidate/reference seeds, fixture, fixed-node budget, rules, and horizon. The
reference pool is deliberately not another invocation of the mutable AI:

- `canonical-legal-v1` is a deterministic legal-order floor;
- `seeded-legal-v1` is a seeded uniform legal policy;
- `tactical-greedy-v1` takes immediate wins, avoids one-reply losses when
  possible, then applies a frozen score formula.

The pool implementation source, domain-rule source, and fixture positions are
checksummed. Changing any of them makes old and new runs incomparable. Scenario fixtures are preassigned to
`development` or `holdout`; the `full` profile defaults to holdout so tuning on
the same confirmatory positions is not the normal workflow.

A color-swapped pair receives a score only when both games terminate. A win is
1, an actual draw is 0.5, and a loss is 0. A horizon-limited game is `unfinished`
and censored, never converted into a draw. Every raw pair retains both complete
game traces, state hashes, reference candidate rankings, and candidate search
results.

`ai:strength:compare-files` joins baseline and candidate pairs by stable ID and
rejects schema, settings, fixture, pool, or stratum mismatches. It estimates
candidate-minus-baseline point-share change with equal weight per
fixture × reference stratum. Two deterministic bootstrap intervals are emitted:

- a fixed-portfolio interval resamples seeds within each declared stratum and
  drives the release gate;
- a hierarchical interval resamples strata and then seeds, exposing uncertainty
  when generalizing beyond the exact portfolio.

The default smallest practically important loss is three percentage points and
must be chosen before inspecting the candidate. Non-inferiority requires the
entire fixed-portfolio interval to remain above `-margin`. A separate resolved-
pair-share gate prevents a candidate from appearing stronger merely because
more unfavorable games became censored. Between-stratum and within-stratum
variance are reported independently so fixture sensitivity is visible.

## Search execution contracts

Normal-mode `chooseComputerAction()` accepts an optional explicit
`searchBudget`:

| Contract               | Meaning                                                                     | Appropriate use                                        |
| ---------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------ |
| omitted / `presetTime` | Shipped difficulty time budget and the real monotonic clock                 | Product-representative smoke and latency observation   |
| `wallClock`            | Explicit milliseconds, optionally capped by depth                           | Controlled time-budget experiments on one environment  |
| `fixedDepth`           | Complete exactly the requested iterative-deepening depth; no deadline       | Deterministic semantic regression fixtures             |
| `fixedNodes`           | Stop after an explicit evaluated-node allowance, optionally capped by depth | Reproducible comparisons across machines and revisions |

Every result reports the resolved budget type, limits, maximum depth, and
exhaustion cause (`none`, `nodes`, or `time`). Fixed-node exhaustion deliberately
uses the production legal-fallback semantics; the report then records that
fallback instead of pretending the requested depth completed.

Omitting the field is backward-compatible and preserves product behavior. The
separate after-win finishing planner always reports its shipped preset-time
contract; it rejects explicit normal-search budgets instead of silently ignoring
them.

## Workload design

The report combines two complementary workloads:

- **Decision portfolio:** stratified positions from the scenario catalog,
  evaluated at every requested difficulty. Every position has a true horizontal
  mirror with the same seed and behavior persona. This supports a metamorphic
  spatial-equivariance check even when the exact best action has no external
  oracle.
- **Paired seeded self-play:** color-swapped seed pairs exercise trajectories,
  terminal outcomes, repetition, participation, displacement, and opening/style
  diversity under the same explicit search contract.

`smoke` is for wiring and path validation. `full` increases scenario repetitions,
pair count, turn horizon, and default node allowance. Neither profile's defaults
are immutable product thresholds; the complete settings are embedded in the
report and must match before raw samples may be paired.

## Metric families

### Search path

- completed depth and completed root moves;
- interrupted depth and partial-root moves, kept separate from the last fully
  completed iteration;
- evaluated and quiescence nodes;
- completed root-preparation transitions, reported separately because fixed-node
  search budgets do not make root feature extraction free;
- elapsed time;
- fallback, timeout, and zero-depth shares;
- search-best and selected-action scores with explicit non-negative selection
  regret, derived before diagnostic root-candidate truncation;
- difficulty-specific style-regret budgets, utilization, positive-selection
  share, and a zero-tolerance budget-violation guardrail;
- budget type and exhaustion distributions;
- hard assertions for missing or unexpected budget metadata.

This family is a prerequisite, not a proxy for fun.

### Strength/style role contract

Root choice is intentionally staged rather than one blended scalar:

1. adversarial search produces strength scores without persona, participation,
   or novelty terms;
2. actor-relative terminal truth removes dominated losses/adverse draws and
   preserves immediate wins;
3. the difficulty preset admits only moves inside its absolute regret budget;
4. plan coherence, persona, productive participation, novelty, family coverage,
   and bounded sampling choose among the survivors.

Feature ownership is explicit:

| Role              | Features                                                                                         | May change adversarial value? |
| ----------------- | ------------------------------------------------------------------------------------------------ | ----------------------------- |
| Strength          | plan potential, control, transport, lanes, frozen debt, terminal/dynamic-draw value              | yes                           |
| Safety            | terminal utility, repetition/self-undo and draw-trap checks, regret budget                       | gate only                     |
| Search efficiency | TT/PV/killer/history/continuation ordering, policy prior                                         | ordering/coverage only        |
| Style             | persona tags/geometry, participation, novelty, source-family diversity, committed-plan tie-break | no                            |
| Diagnostic        | selected/best score, regret, mobility ownership, tags, fallback and budget path                  | no                            |

This contract prevents a style feature from helping define the score band that
is supposed to constrain that same feature.

### Outcomes

- normal goal wins (`homeField`, `sixStacks`);
- tiebreak wins;
- actual draws;
- unfinished games.

Turn-limit truncation is reported as unfinished. It is never counted as a draw.

### Behavior

- action-kind and strategic-intent diversity;
- opening action and source-family diversity;
- participation delta and positive-participation share;
- board displacement;
- actor-explicit mobility (same-player continuation and opponent reply counts
  are never subtracted from one another);
- repetition and two-ply self-undo shares;
- horizontal spatial equivariance.

Diversity uses Hill effective counts at orders 0, 1, and 2. Reporting effective
behavior counts makes "three equally common behaviors" interpretable as roughly
three, unlike raw entropy in nats. The Miller-Madow entropy correction is retained
beside the uncorrected estimate so small samples do not look more certain than
they are.

### Player experience boundary

Automated traces measure properties of play, not enjoyment itself. Challenge,
competence, flow, tension, autonomy, affect, and perceived variety require
counterbalanced human playtests and validated player-experience instruments.
They belong in the next measurement layer, joined to anonymous build, difficulty,
and session metadata—not inferred from self-play alone.

## Uncertainty and comparison

Numeric summaries retain count, range, median, p90, p95, and deterministic
bootstrap 95% intervals for mean and median. Binary shares use Wilson intervals,
so observing zero failures in a small smoke suite does not become a false claim
of zero underlying risk.

`ai:measure:compare-files` pairs decision samples by stable `sampleId`. It rejects
different schemas, settings, fixture hashes, or sample identities. Candidate
minus baseline differences are oriented so positive always means improvement.
A verdict is made only when the entire paired-bootstrap interval clears a
metric-specific practical threshold; otherwise the verdict is `inconclusive`.
Search-depth, root-coverage, and fallback regressions override latency gains.

The game-strength comparator uses the stricter one-sided non-inferiority
interpretation described above. An empty jointly resolved set is
`inconclusive`, including when comparing an artifact with itself; zero evidence
cannot pass a release gate.

The comparator deliberately calls its result a **search-execution verdict**, not
an AI-quality or enjoyment verdict. When many exploratory behavior metrics are
eventually promoted to hypothesis tests, use a declared primary endpoint and a
multiple-comparison policy rather than selecting whichever metric happens to
move favorably.

## Artifacts and provenance

Each run writes ignored, reproducible artifacts under `output/ai/`:

- `ai-measurement-report.json`: schema, contract, settings, provenance, and full
  summaries;
- `ai-measurement-report.md`: short review surface;
- `ai-measurement-samples.jsonl`: lossless decision results and complete game
  traces, including root candidates and diagnostics.
- `ai-reference-strength.{json,md}` and
  `ai-reference-strength.samples.jsonl`: frozen-pool workload, descriptive
  strength summary, and lossless color-swapped pairs;
- `ai-reference-strength-paired.{json,md}`: paired non-inferiority decision,
  censoring guardrail, stratum effects, and variance components.
- `git-measurement-compare/{baseline,candidate}`: immutable report/raw snapshots
  retained by `ai:measure:compare`, plus its paired uncertainty-aware verdict.

Schema version 3 makes terminal utility, score ownership, selection regret,
actor-aware mobility, and completed-versus-partial iterative-deepening evidence
explicit. Older artifacts are intentionally incompatible in the paired
comparator rather than being silently mixed.

Advanced loop/bucket reports preserve missingness: sample entropy is `null` when
no finite estimate is supported, and loop-escape rates are `null` when no trace
entered loop pressure. These conditional metrics publish their eligible sample
counts beside the estimate. Symbolic Lempel-Ziv complexity is computed over
tokens, so renaming a position/action token cannot change the value.

The summary records Git revision/dirty state, Node and package versions, OS,
architecture, CPU count, fixture hash, raw-sample hash, raw path, and sample
count. The JSONL checksum makes a summary/raw mismatch detectable.

## Commands

Fast deterministic path smoke:

```bash
pnpm ai:measure -- --profile=smoke --budget=fixedDepth --max-depth=1
```

Tactical-oracle and fixed-node curve smoke:

```bash
pnpm ai:competence -- --profile=smoke
```

Full confirmatory competence curve:

```bash
pnpm ai:competence -- --profile=full --enforce-gates=true
```

Frozen-reference wiring smoke:

```bash
pnpm ai:strength -- --profile=smoke
```

Run a retained revision on the confirmatory holdout portfolio:

```bash
pnpm ai:strength -- --profile=full --split=holdout --out=<artifact-dir>/strength
```

Long campaigns are deterministic, resumable, and shardable. Unknown CLI flags
are rejected so a misspelled split cannot silently run the wrong portfolio:

```bash
pnpm ai:strength -- --profile=full --split=holdout \
  --shard-count=4 --shard-index=0 --resume=true \
  --out=<artifact-dir>/shard-0
pnpm ai:strength:merge -- \
  --inputs=<artifact-dir>/shard-0,<artifact-dir>/shard-1,<artifact-dir>/shard-2,<artifact-dir>/shard-3 \
  --out=<artifact-dir>/strength
```

The natural completed-game endpoint remains primary evidence about actual game
resolution. Because the historical 18-pair, 160-ply schema-v2 pilot naturally
resolved only 3 pairs, the report also exposes a separate fixed-horizon endpoint
using the domain's own stalemate tiebreak. It never rewrites an unfinished game
as a natural draw or win; natural resolution and horizon adjudication are
reported side by side.

Schema v3 broadens the portfolio from nine scenarios to eighteen. Six scenarios
are explicitly assigned to the untouched holdout: four seeded legal-play
positions across early, middle, and later play, plus retained loop-pressure and
conversion sentinels. Split membership lives in the catalog rather
than being inferred from array position, so reordering cannot leak holdouts into
development. Every selected scenario expands into an original and a true
horizontal board mirror; raw pairs retain `origin` and `mirror` provenance.
Consequently, the default full holdout is 6 scenarios × 2 geometries × 3 frozen
references × 8 seeds = 288 color-swapped pairs.

Each strength report also transforms paired point share and its bootstrap
interval into a diagnostic logistic Elo difference against the frozen reference
pool. This is a readable relative-strength scale, not the release gate and not a
globally calibrated player rating. Exact 0/1 endpoints are reported as
unbounded instead of silently clamped.

Run and retain an immutable Git baseline/candidate strength comparison:

```bash
pnpm ai:strength:compare -- \
  --baseline=<baseline-ref> --candidate=<candidate-ref-or-working> \
  --profile=full --split=holdout --adjudicate-horizon=true
```

Compare two identically configured retained runs:

```bash
pnpm ai:strength:compare-files -- \
  --baseline-report=<baseline>/strength.json \
  --baseline-raw=<baseline>/strength.samples.jsonl \
  --candidate-report=<candidate>/strength.json \
  --candidate-raw=<candidate>/strength.samples.jsonl \
  --score-margin=0.03 --resolution-margin=0.03 --enforce-gate=true
```

Reproducible full suite:

```bash
pnpm ai:measure -- --profile=full --budget=fixedNodes --nodes=512 --max-depth=6
```

Product-clock validation:

```bash
pnpm ai:measure -- --profile=smoke --budget=presetTime
```

Pair two retained artifact sets:

```bash
pnpm ai:measure:compare-files -- \
  --baseline-report=<baseline>/ai-measurement-report.json \
  --baseline-raw=<baseline>/ai-measurement-samples.jsonl \
  --candidate-report=<candidate>/ai-measurement-report.json \
  --candidate-raw=<candidate>/ai-measurement-samples.jsonl
```

`ai:measure:compare` now retains both Git-ref reports and raw JSONL files and
automatically emits the paired uncertainty-aware decision under
`output/ai/git-measurement-compare/`. The aggregate diff remains useful for
exploration; the paired artifact is the adoption guardrail.

## Interpretation rules

1. Reject a run with path assertion failures before reading behavior metrics.
2. Treat zero-depth and fallback rates as execution failures for any claim about
   deeper strategy.
3. Keep normal wins, tiebreaks, draws, and unfinished games separate.
4. Read diversity with participation and repetition; random motion can be diverse
   while still being strategically empty.
5. Treat low equivariance as a localization signal for coordinate/order bias, not
   proof that every asymmetric choice is weak.
6. Require fixture-level and difficulty-level inspection before accepting an
   aggregate improvement.
7. Confirm player-experience claims with humans.
8. Predeclare the strength margin and holdout split; never tune them after
   reading the candidate interval.
9. Require enough resolved color-swapped pairs. An inconclusive censor-heavy
   run should be extended or redesigned, not reclassified as a draw-heavy pass.
10. Treat persona, participation, novelty, and plan preference as root-style
    terms. They may choose only after terminal safety and the declared strength
    budget; they must not define the adversarial scores policing that budget.
11. Compare only identical strength schemas and fixture hashes. The schema-v2
    pilot is historical power-planning evidence; schema-v3 needs a fresh paired
    baseline and candidate run before any promotion claim.

## Academic basis

- Edwin B. Wilson, “Probable Inference, the Law of Succession, and Statistical
  Inference,” _JASA_ 22(158), 1927. The implementation uses the Wilson score
  interval for proportions: <https://www.jstor.org/stable/2276774>.
- Bradley Efron, “Bootstrap Methods: Another Look at the Jackknife,” _The
  Annals of Statistics_ 7(1), 1979. DOI:
  <https://doi.org/10.1214/aos/1176344552>.
- Gilda Piaggio et al., “Reporting of Noninferiority and Equivalence Randomized
  Trials,” _JAMA_ 295(10), 2006. DOI:
  <https://doi.org/10.1001/jama.295.10.1152>. The protocol adapts the principle
  of a prespecified non-inferiority margin; it is not a clinical-trial analysis.
- M. O. Hill, “Diversity and Evenness: A Unifying Notation and Its
  Consequences,” _Ecology_ 54(2), 1973. DOI:
  <https://doi.org/10.2307/1934352>.
- George A. Miller, “Note on the Bias of Information Estimates,” in
  _Information Theory in Psychology II-B_, 1955. The small-sample entropy
  correction is used descriptively, not as a significance test.
- F. T. Chan, T. Y. Chen, S. C. Cheung, M. F. Lau, and S. M. Yiu,
  “Application of Metamorphic Testing in Numerical Analysis,” SE'98. The mirror
  workload adapts the metamorphic-test idea to a search problem without a simple
  action oracle: <https://hdl.handle.net/1783.1/70576>.
- W. A. IJsselsteijn, Y. A. W. de Kort, and K. Poels, _The Game Experience
  Questionnaire_. Its multidimensional structure motivates the explicit human
  player-experience boundary:
  <https://research.tue.nl/en/publications/the-game-experience-questionnaire/>.
- Yoav Benjamini and Yosef Hochberg, “Controlling the False Discovery Rate: A
  Practical and Powerful Approach to Multiple Testing,” _JRSS B_ 57(1), 1995.
  DOI: <https://doi.org/10.1111/j.2517-6161.1995.tb02031.x>.
