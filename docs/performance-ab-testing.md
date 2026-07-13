# Performance A/B Testing

Use `perf:ab` to compare two immutable Git revisions under the same workload,
dependencies, build settings, hardware, and counterbalanced run schedule.

## Experiment contract

- Decision: keep, reject, or investigate a performance change.
- Default decision metric: hard-mode AI nodes per second.
- Material improvement: the lower bound of the paired 95% bootstrap interval
  must be at least 5%.
- Correctness invariants: both revisions build and pass the non-benchmark test
  suite; fixture labels and legal-action counts must match.
- Quality guardrail: median completed search depth must not decrease for any
  recorded AI fixture.
- Artifact guardrails in the full pipeline: JavaScript bytes, layout shift, and
  long-task measurements must not regress.
- Selected moves are recorded but are not required to be identical. A faster
  time-budgeted search can legitimately finish more work and select a different
  legal move without changing game logic.

## Usage

Run a cheap validation of refs, dependency identity, and the paired schedule:

```bash
pnpm perf:ab --baseline=main --candidate=my-performance-branch --dry-run
```

Run the default AI/domain experiment with 20 paired samples:

```bash
pnpm perf:ab --baseline=main --candidate=my-performance-branch
```

Run the production browser pipeline, which adds UI, startup, mobile CPU
profiles, delivered bundle sizes, and worker-driven AI interactions:

```bash
pnpm perf:ab \
  --baseline=main \
  --candidate=my-performance-branch \
  --pipeline=full
```

Useful controls:

```text
--pairs=20                    paired sample count; minimum 2
--minimum-improvement=5       required paired improvement percentage
--bootstrap-samples=4000      deterministic bootstrap resamples
--root-order-iterations=24    work per root-ordering benchmark sample
--out=output/perf-ab          artifact parent directory
--skip-build                  local smoke testing only
--skip-validation             local smoke testing only
```

The runner deliberately rejects `working` as a target, aliases resolving to the
same commit, and revisions with different `pnpm-lock.yaml` contents. Those cases
would confound code effects with mutable source or dependency drift.

## Execution model

1. Resolve both refs to commit SHAs.
2. Verify identical lockfiles.
3. Create detached temporary worktrees and reuse the current dependency store.
4. Build and test both revisions once.
5. Run one unmeasured warmup per revision.
6. Alternate pair order as `A B`, `B A`, `A B`, `B A`, and so on.
7. Preserve every raw report and command log.
8. Calculate paired improvements and deterministic bootstrap intervals.
9. Emit `experiment.json` and a human-readable `report.md`.

Output is written under `output/perf-ab/<run-id>/` and ignored by Git because a
full run can produce many large raw artifacts.

## Interpretation

A result is one of:

- `confirmed-win`: every decision metric clears materiality and guardrails pass;
- `null-result`: the measured effect is confidently below materiality;
- `inconclusive`: the confidence interval overlaps the decision boundary;
- `regression`: a decision metric or guardrail becomes worse.

Micro and domain metrics explain mechanisms. Only the `full` pipeline provides
browser-level evidence. Neither pipeline generalizes beyond its recorded
hardware, revisions, fixtures, and runtime metadata.
