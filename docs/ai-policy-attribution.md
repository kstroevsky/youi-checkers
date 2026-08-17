# AI Policy Interestingness Attribution

## Decision contract

Question: which strategy-changing revision caused the measured reduction in
action/source variety, and which smallest intervention can recover variety and
participation without discarding the current policy's tactical identity?

The causal-screening workload uses the current domain and harness for every
historical policy, fixed holdout fixtures, identical candidate/baseline seed
schedules, current rule semantics, and fixed-node search. The primary diagnosis
metrics are action-kind diversity, same-player kind switching, exact-action
reuse, jump share, source-cell/family diversity, family reuse, productive
victory-readiness progress, completed depth, and fallback share. Strength point
share, legality, terminal safety, fixed-seed mirror equivalence, runtime, and
build/test results are guardrails.

The smoke profile is deliberately a causal screen: two base holdout fixtures
plus mirrors, one seed pair, 12 plies, and 128 nodes per decision. It is not a
release gate. Larger paired confirmation is required before adoption.

## Revision ladder result

The fixed-harness revision ladder reproduced one discontinuity:

| Transition                   | Main observed changes                                                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| merge-base through `d094f72` | No change on the smoke portfolio                                                                                                                   |
| `d094f72` → `9d8e884`        | action diversity −0.0845; kind switching −0.1024; jumps +0.0789; exact reuse +0.0625; source-family diversity −0.0496; productive progress −0.0536 |
| `9d8e884` through `9d06efe`  | No further change on the smoke portfolio                                                                                                           |

`9d8e884` intentionally removed persona, participation, geometry, and novelty
signals from adversarial leaf evaluation and deeper move ordering. On the first
matched divergence, the pre-change policy completed depth 1 and selected a
quiet climb; the post-change policy exhausted the same 128-node budget at depth
0 and used the ordered-root fallback to select a jump. Thus the behavior change
is accompanied by changed search coverage, not merely a different final style
sample.

The initial ranked hypotheses were resolved as follows:

| Hypothesis                                                                       | Smoke status            |
| -------------------------------------------------------------------------------- | ----------------------- |
| Strength-bounded root selection (`d094f72`) caused concentration                 | Rejected on this corpus |
| Style removal from deeper evaluation/ordering (`9d8e884`) caused concentration   | Supported               |
| Strategic intent hysteresis (`c46744c`) caused the drop                          | Rejected on this corpus |
| Hard opening-temperature change (`ac5e891`) materially changed the observed drop | Rejected on this corpus |
| Final-only style selection (`14e7111`) caused the drop                           | Rejected on this corpus |

## Signal-level ablation

Measurement-only switches reconstruct each removed signal while production
defaults remain unchanged. Smoke results relative to the production control:

| Reconstruction                            | Interpretation                                                                                                                |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Persona state bias at leaves              | No measurable effect                                                                                                          |
| Strategic-tag novelty in ordering         | No measurable effect                                                                                                          |
| Participation at leaves, full scale       | Restored the entire action-diversity, kind-switch, jump-balance, and productive-progress drop; partly restored family breadth |
| Participation in ordering                 | Partly restored action diversity and productive progress; restored more family breadth and reduced exact/family reuse         |
| Persona/geometry ordering                 | Improved variety/progress but increased depth-0 fallback; not an attractive isolated fix                                      |
| Stronger bounded final-root participation | No effect from 0.5× through 2× because selected regret remained zero and the eligible safe set was effectively one move       |

The internal `meanParticipationDelta` moved counterintuitively under some
restorations even while direct checker-family diversity and reuse improved.
This confirms that positive heuristic delta is not a sufficient human
participation metric; direct family coverage, repeats, response opportunities,
and productive progress should remain the controlling observables.

## Candidate tradeoff

The current best provisional candidate combines:

- quarter-scale policy-independent participation at quiet search leaves;
- participation-aware move ordering;
- no persona state value, geometry bias, or novelty term in adversarial values;
- unchanged terminal safety and Hard's 240-point final style-regret ceiling.

On the smoke portfolio this candidate:

- improves action diversity by 0.0361 and kind switching by 0.0667;
- reduces jump concentration by 0.0476 and exact-action reuse by 0.0313;
- restores source-family diversity by 0.0496 and reduces family repeats by
  0.0491;
- improves productive progress by 0.0536;
- keeps more of the current tactical profile than the full historical
  participation value.

This candidate is not yet adopted. It requires the larger fixed-node ablation,
tactical competence, short current/current and legacy/legacy counterfactuals,
one balanced full-game safety block, and a performance comparison. Temporary
ablation code must be removed from the shipped worker after the decision; the
diagnostic implementation increased the built worker by roughly 2.5 KB.

## Reproducible artifacts

- `output/ai/ai-policy-attribution-smoke.json`
- `output/ai/ai-policy-attribution-smoke.samples.jsonl`
- `output/ai/ai-policy-ablation-smoke.json`
- `output/ai/ai-policy-ablation-balanced-smoke.json`
- `output/ai/ai-policy-counterfactual-smoke.json`

Original/mirror decisions were exactly equivariant in the smoke fixture subset
when policy seeds were held fixed. This does not prove global equivariance, but
it shows why the old seed-confounded mirror-stratum gaps must not be attributed
to orientation alone.
