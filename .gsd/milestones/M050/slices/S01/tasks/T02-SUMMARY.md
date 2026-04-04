---
id: T02
parent: S01
milestone: M050
provides: []
requires: []
affects: []
key_files: ["compiler/meshc/tests/e2e_m047_s04.rs", "compiler/meshc/tests/e2e_m047_s06.rs", "scripts/verify-m047-s04.sh", "scripts/verify-m047-s06.sh", "reference-backend/scripts/verify-production-proof-surface.sh", "website/docs/docs/production-backend-proof/index.md", ".gsd/DECISIONS.md", ".gsd/KNOWLEDGE.md"]
key_decisions: ["Keep the root README on public starter links and proof-page discoverability only; keep retained verifier command rails on Distributed Proof and the proof-specific docs surfaces.", "Retarget the production proof verifier to prove README/Get Started ordering plus exact runbook-link truth instead of treating the proof page as a first-contact step."]
patterns_established: []
drill_down_paths: []
observability_surfaces: []
duration: ""
verification_result: "Passed the cheap slice preflight (`node --test scripts/tests/verify-m050-s01-onboarding-graph.test.mjs`), syntax-checked the edited shell verifiers, passed both retained M047 docs-contract Rust targets, and passed the live production-proof surface verifier after fixing the stale GitHub runbook URL on the proof page."
completed_at: 2026-04-04T00:59:06.382Z
blocker_discovered: false
---

# T02: Retargeted the retained M047 and production-proof docs rails so README stays scaffold/examples-first while proof pages remain public-secondary.

> Retargeted the retained M047 and production-proof docs rails so README stays scaffold/examples-first while proof pages remain public-secondary.

## What Happened
---
id: T02
parent: S01
milestone: M050
key_files:
  - compiler/meshc/tests/e2e_m047_s04.rs
  - compiler/meshc/tests/e2e_m047_s06.rs
  - scripts/verify-m047-s04.sh
  - scripts/verify-m047-s06.sh
  - reference-backend/scripts/verify-production-proof-surface.sh
  - website/docs/docs/production-backend-proof/index.md
  - .gsd/DECISIONS.md
  - .gsd/KNOWLEDGE.md
key_decisions:
  - Keep the root README on public starter links and proof-page discoverability only; keep retained verifier command rails on Distributed Proof and the proof-specific docs surfaces.
  - Retarget the production proof verifier to prove README/Get Started ordering plus exact runbook-link truth instead of treating the proof page as a first-contact step.
duration: ""
verification_result: passed
completed_at: 2026-04-04T00:59:06.383Z
blocker_discovered: false
---

# T02: Retargeted the retained M047 and production-proof docs rails so README stays scaffold/examples-first while proof pages remain public-secondary.

**Retargeted the retained M047 and production-proof docs rails so README stays scaffold/examples-first while proof pages remain public-secondary.**

## What Happened

Retargeted the retained M047 docs-contract tests and shell verifiers so they stop treating the root README as a proof-rail map. The first `cargo test -p meshc --test e2e_m047_s04 -- --nocapture` replay failed because README no longer carried `verify-m047-*` command strings; that exposed the stale assumption directly. I split the contract in both Rust rails and both shell verifiers: README now proves only the public starter/readme routing plus proof-page discoverability, while `Distributed Proof`, `Clustered Example`, `Tooling`, and `Distributed Actors` keep the retained verifier-command discoverability checks. I also tightened the shell guards so the example/readme split is checked marker-by-marker instead of through permissive alternation regexes, and added explicit sidebar proof-group/footer-opt-out markers to the retained shell contracts. For the backend proof surface, I rewrote `reference-backend/scripts/verify-production-proof-surface.sh` to verify that README and Getting Started keep `Production Backend Proof` discoverable but secondary to the clustered onboarding path. That replay then exposed a real stale-doc issue: `website/docs/docs/production-backend-proof/index.md` still linked to an old `hyperpush-org/hyperpush-mono` GitHub URL for `reference-backend/README.md`. I corrected those links to the current `snowdamiz/mesh-lang` repo so the proof-surface verifier now passes for the right reason.

## Verification

Passed the cheap slice preflight (`node --test scripts/tests/verify-m050-s01-onboarding-graph.test.mjs`), syntax-checked the edited shell verifiers, passed both retained M047 docs-contract Rust targets, and passed the live production-proof surface verifier after fixing the stale GitHub runbook URL on the proof page.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `node --test scripts/tests/verify-m050-s01-onboarding-graph.test.mjs` | 0 | ✅ pass | 240ms |
| 2 | `bash -c 'bash -n scripts/verify-m047-s04.sh && bash -n scripts/verify-m047-s06.sh && bash -n reference-backend/scripts/verify-production-proof-surface.sh'` | 0 | ✅ pass | 18ms |
| 3 | `cargo test -p meshc --test e2e_m047_s04 -- --nocapture` | 0 | ✅ pass | 3403ms |
| 4 | `cargo test -p meshc --test e2e_m047_s06 m047_s06_ -- --nocapture` | 0 | ✅ pass | 2119ms |
| 5 | `bash reference-backend/scripts/verify-production-proof-surface.sh` | 0 | ✅ pass | 503ms |


## Deviations

The task plan did not list `website/docs/docs/production-backend-proof/index.md` as an output file, but the retargeted production-proof verifier surfaced a stale GitHub runbook URL there. I fixed that page in the same task because the verifier would otherwise stay red for a real public-surface mismatch.

## Known Issues

None.

## Files Created/Modified

- `compiler/meshc/tests/e2e_m047_s04.rs`
- `compiler/meshc/tests/e2e_m047_s06.rs`
- `scripts/verify-m047-s04.sh`
- `scripts/verify-m047-s06.sh`
- `reference-backend/scripts/verify-production-proof-surface.sh`
- `website/docs/docs/production-backend-proof/index.md`
- `.gsd/DECISIONS.md`
- `.gsd/KNOWLEDGE.md`


## Deviations
The task plan did not list `website/docs/docs/production-backend-proof/index.md` as an output file, but the retargeted production-proof verifier surfaced a stale GitHub runbook URL there. I fixed that page in the same task because the verifier would otherwise stay red for a real public-surface mismatch.

## Known Issues
None.
