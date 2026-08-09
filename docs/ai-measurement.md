# AI Measurement Contract

## Purpose

`ai:measure` is the validity layer for broad AI-quality experiments, while
`ai:competence` is the tactical-oracle and equal-work strength layer. Together
they answer five different questions without collapsing them into one attractive
but ambiguous "interestingness" number:

1. Does the AI choose the uniquely winning or uniquely defensive move?
2. Did the requested search actually run?
3. What game outcomes resulted?
4. What observable kinds of play occurred?
5. Is a before/after difference larger than measurement uncertainty?

The existing variety, stage, loop, threat, bucket, and cross-play reports remain
useful specialized views. A quality claim should first pass `ai:measure`, because
behavior measured from depth-zero fallback or from an unintended clock model is
not evidence about the intended AI.

This infrastructure does not change the shipped difficulty presets or move
selection. A future strategy change needs a separate adoption decision.

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
- evaluated and quiescence nodes;
- elapsed time;
- fallback, timeout, and zero-depth shares;
- search-best and selected-action scores with explicit non-negative selection
  regret, derived before diagnostic root-candidate truncation;
- budget type and exhaustion distributions;
- hard assertions for missing or unexpected budget metadata.

This family is a prerequisite, not a proxy for fun.

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

Schema version 2 makes terminal utility, score ownership, selection regret, and
actor-aware mobility explicit. Version-1 and version-2 artifacts are intentionally
incompatible in the paired comparator rather than being silently mixed.

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

`ai:measure:compare` remains the convenient aggregate Git-ref comparison. Use
the raw-file comparator for an uncertainty-aware paired decision.

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

## Academic basis

- Edwin B. Wilson, “Probable Inference, the Law of Succession, and Statistical
  Inference,” _JASA_ 22(158), 1927. The implementation uses the Wilson score
  interval for proportions: <https://www.jstor.org/stable/2276774>.
- Bradley Efron, “Bootstrap Methods: Another Look at the Jackknife,” _The
  Annals of Statistics_ 7(1), 1979. DOI:
  <https://doi.org/10.1214/aos/1176344552>.
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
