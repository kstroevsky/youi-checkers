# AI Interestingness Protocol Amendment 0001

## Status

Accepted implementation contradiction under the `DESIGN-FROZEN` amendment
rule. This amendment changes only `FixtureGeneratorV1`; all other normative
requirements remain active.

## Contradiction

The frozen execution order generates and seals development fixtures before the
human pilot. The fixture-origin marginal simultaneously requires balanced
`consentedPilot` lineages. No pre-existing approved pilot corpus exists in the
audited repository, and future pilot data cannot be used retroactively without
breaking catalog immutability, participant separation, and the sealed firewall.

Fabricating pilot-derived states or silently relabeling synthetic states as
participant data is prohibited.

## Versioned resolution

`FixtureGeneratorV2` supports two preregistered origin schedules:

1. `preexistingPilotAvailable`: six origins, exactly 16 lineages each. It is
   legal only when an approved, consented corpus and its immutable artifact hash
   are supplied before development catalog generation.
2. `noPreexistingPilot`: five admissible origins. The deterministic 96-slot
   schedule allocates 20 lineages to the first named-RNG-selected origin and 19
   to each remaining origin. `consentedPilot` remains supported but has required
   quota zero.

Human-pilot and confirmation data generated later in the protocol may never be
inserted into an already generated development or sealed catalog. A future
protocol may create a new catalog family from approved participant-derived
states, with new IDs, hashes, proofs, calibrations, and complete revalidation.

## Affected artifacts

- fixture generator protocol/version/hash;
- development and sealed catalog manifests;
- provenance and adequacy reports;
- proof query/snapshot dependencies;
- every downstream calibration or candidate artifact that includes the catalog
  hash.

## Revalidation decision

No prior catalog/proof artifact exists under this frozen plan, so no artifact is
invalidated. All future artifacts must record which origin schedule was used and
the pre-existing pilot corpus hash or explicit `null`.
