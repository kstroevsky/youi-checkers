# AI Interestingness Protocol — Research and Feasibility Verification

This document verifies the method lineage and implementation boundary of
[`ai-interestingness-recovery-plan.md`](./ai-interestingness-recovery-plan.md).
It does not amend the frozen normative requirements. The attached source was
copied byte-for-byte and has SHA-256
`7def9ea600b5e03544aefe65e428ed431b18f1f6c257885206cfe878e68d4243`.

## Review conclusion

The protocol is methodologically coherent for a staged, pre-registered program:

- it separates product strength from behavioral selection;
- it uses fixture lineage rather than turns as the gameplay inferential unit;
- it pairs treatments with common random numbers and mirrored/color variants;
- it treats automated diversity as a behavioral observable rather than proof of
  enjoyment;
- it requires a single frozen candidate before sealed validation;
- it keeps operational telemetry separate from efficacy evidence;
- it requires human preference/enjoyment confirmation before shipping.

The academic methods support those broad choices. They do **not** independently
validate YOUI-specific coefficients, thresholds, fixture counts, semantic
classes, solver budgets, SESOIs, or launch criteria. Those values are frozen
engineering/statistical design decisions that must pass the protocol's own
simulation, adequacy, performance, and human gates.

## Primary method lineage

| Protocol method                                                | Primary source                                                                                                                                                                                               | Supported claim boundary                                                                                                                                                                                                                     |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hill-number/effective diversity, including (D_1=e^H)           | Hill (1973), [“Diversity and Evenness: A Unifying Notation and Its Consequences”](https://doi.org/10.2307/1934352); Jost (2006), [“Entropy and diversity”](https://doi.org/10.1111/j.2006.0030-1299.14714.x) | Converting entropy to an effective number gives an interpretable diversity scale. It does not establish that behavioral diversity is enjoyable.                                                                                              |
| Paired-comparison ties                                         | Davidson (1970), [“On Extending the Bradley-Terry Model to Accommodate Ties”](https://doi.org/10.1080/01621459.1970.10481082)                                                                                | A tie-capable Bradley–Terry extension is appropriate for win/preference/tie responses. The protocol's priors and launch thresholds are YOUI-specific.                                                                                        |
| Holm correction                                                | Holm (1979), [“A Simple Sequentially Rejective Multiple Test Procedure”](https://doi.org/10.2307/4615733)                                                                                                    | Step-down family-wise error control is valid for the four within-candidate benefit hypotheses.                                                                                                                                               |
| Sequential composite-hypothesis GLR                            | Lai (1988), [“Nearly Optimal Sequential Tests of Composite Hypotheses”](https://www.jstor.org/stable/2241761)                                                                                                | Sequential GLR tests have established asymptotic/frequentist lineage. YOUI's smoothed pentanomial model and boundaries still require local simulation calibration.                                                                           |
| Resampling/max-stat simultaneous inference                     | Westfall (2011), [“On Using the Bootstrap for Multiple Comparisons”](https://doi.org/10.1080/10543406.2011.607751)                                                                                           | Bootstrap maxT/max-stat methods support simultaneous multiple-comparison inference. Lineage-clustered resampling and worst-action calibration remain repository-specific.                                                                    |
| Common random numbers                                          | Heikes, Montgomery, and Rardin (1976), [“Using common random numbers in simulation experiments”](https://doi.org/10.1177/003754977602700301)                                                                 | Sharing random streams across alternatives can reduce variance in comparative simulation. Correct keying and transformation-orbit semantics must be tested locally.                                                                          |
| NUTS                                                           | Hoffman and Gelman (2014), [“The No-U-Turn Sampler”](https://www.jmlr.org/papers/v15/hoffman14a.html)                                                                                                        | NUTS is a suitable adaptive HMC algorithm for the hierarchical human model.                                                                                                                                                                  |
| Rank-normalized \\(\hat R\\), ESS, and convergence diagnostics | Vehtari et al. (2021), [“Rank-normalization, folding, and localization”](https://doi.org/10.1214/20-BA1221)                                                                                                  | Modern \\(\hat R\\)/ESS diagnostics support the protocol's convergence checks. Exact numerical cutoffs are conservative protocol choices.                                                                                                    |
| Autonomy/competence and game enjoyment                         | Ryan, Rigby, and Przybylski (2006), [“The Motivational Pull of Video Games”](https://doi.org/10.1007/s11031-006-9051-8)                                                                                      | Autonomy and competence are empirically related to enjoyment and continued play, supporting the human outcomes. Automated proxies cannot substitute for the study.                                                                           |
| Probability calibration diagnostics                            | Arrieta-Ibarra et al. (2022), [“Metrics of Calibration for Probabilistic Predictions”](https://www.jmlr.org/papers/v23/22-0658.html)                                                                         | Reliability/calibration diagnostics are necessary for predicted W/D/L probabilities. Fixed-bin ECE is sample- and bin-sensitive, so Brier improvement and visible per-class reliability evidence must remain co-primary acceptance evidence. |

## Required implementation cautions

### Threshold provenance

Every numerical gate not directly defined by a cited method is recorded as a
versioned YOUI protocol choice. Reports must not say that a paper established:

- 96 development lineages;
- 0.02 progress bands;
- 0.72/0.95 risk bands;
- 3-point non-inferiority margins;
- the 0.25 participation leaf coefficient;
- 10-million-state proof caps;
- rollout RMSE/class-agreement thresholds;
- the 24-person pilot or launch posterior thresholds.

### Computational feasibility

The pure reference oracle, proof query neighborhood, semantic rollouts, and
sealed joint power simulation can multiply work across lineages, actions,
replies, horizons, difficulties, treatments, and seeds. Before generating the
complete catalog, a deterministic pilot must record:

- root/action/reply multiplicities;
- states and wall time per depth/proof query;
- unknown/exhaustion rates;
- peak memory and artifact growth;
- a projected upper bound for the complete development and sealed workloads.

If the measured projection exceeds the frozen resource envelope, the plan's
documented infeasibility amendment process is triggered. Silent fixture or
treatment reduction is forbidden.

### Calibration uncertainty

Fixed-bin ECE can be biased or unstable in small samples. The frozen 15-bin
criterion remains executable, but reports also include bin counts, uncertainty,
classwise reliability plots/tables, and Brier comparison against the
training-fold prior. Empty or sparse bins cannot be silently interpreted as
good calibration.

### Human-study boundary

Repository implementation can provide assignment, blinding, data contracts,
simulation-based sample-size selection, analysis code, diagnostics, and
reproducibility tests. It cannot truthfully complete participant recruitment,
consent/ethics obligations, the 24-person pilot, or independent confirmation.
Those remain externally blocked until real participants and appropriate study
authority exist. No synthetic response data may satisfy a human launch gate.

### Telemetry and deployment boundary

Telemetry schema/client/worker changes may be implemented and tested locally.
Production deployment, canary enrollment, access-policy changes, and collection
of live player evidence require separate deployment authority. Historical or
synthetic telemetry cannot establish efficacy.

### Clean-baseline boundary

The audited worker contains measurement-only ablation code and is explicitly not
the clean-baseline denominator. The clean-baseline stage must physically remove
diagnostic treatment branches from the product bundle, prove default-behavior
equivalence, and record worker/tree hashes before the frozen shipping candidate
is evaluated.

## Verification disposition

- **Method architecture:** accepted for implementation.
- **Academic claim boundaries:** accepted with the qualifications above.
- **Numeric protocol choices:** accepted as frozen YOUI design choices pending
  their specified simulation/adequacy gates.
- **Complete local implementation:** authorized by the user request.
- **Large development/sealed runs:** executable only after their prerequisites
  and feasibility gates pass.
- **Production deployment and human confirmation:** externally gated; code can
  be completed, but outcomes cannot be fabricated or inferred.
