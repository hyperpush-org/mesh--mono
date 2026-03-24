---
id: S01
parent: M029
milestone: M029
provides:
  - `meshc fmt` preserves dotted module paths and parenthesized multiline imports instead of emitting `Api. Router`-style corruption
  - Exact-output formatter regressions at the walker, library, and CLI layers
  - `reference-backend/` repaired to canonical dotted imports and proven clean under `meshc fmt --check`
requires: []
affects:
  - S02
  - S03
key_files:
  - compiler/mesh-fmt/src/walker.rs
  - compiler/mesh-fmt/src/lib.rs
  - compiler/meshc/tests/e2e_fmt.rs
  - compiler/meshc/tests/e2e.rs
  - reference-backend/main.mpl
  - reference-backend/api/health.mpl
  - reference-backend/api/router.mpl
  - reference-backend/api/jobs.mpl
  - reference-backend/storage/jobs.mpl
  - reference-backend/jobs/worker.mpl
key_decisions:
  - "D036: route `SyntaxKind::PATH` through a dedicated dot-preserving walker instead of the generic inline spacer"
  - "D035: repair `reference-backend/` in S01 so the proof uses canonical source, not corrupted-but-idempotent output"
patterns_established:
  - Keep exact-output formatter tests when semantically wrong output can stabilize into an idempotent bad state
  - Prove dogfood formatter repairs with one real `meshc fmt <dir>` rewrite followed by `fmt --check` and a literal grep sweep
  - Treat parenthesized multiline import formatting at `IMPORT_LIST`, where the CST actually stores the parens
observability_surfaces:
  - "cargo test -q -p mesh-fmt --lib walk_path_preserves_dotted_import_and_impl_paths -- --nocapture"
  - "cargo test -q -p meshc --test e2e_fmt fmt_preserves_dotted_paths_exactly -- --nocapture"
  - "cargo run -q -p meshc -- fmt --check reference-backend"
  - "rg -n '^from .*\\. ' reference-backend -g '*.mpl'"
drill_down_paths:
  - .gsd/milestones/M029/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M029/slices/S01/tasks/T02-SUMMARY.md
  - .gsd/milestones/M029/slices/S01/tasks/T03-SUMMARY.md
duration: 1h30m
verification_result: passed
completed_at: 2026-03-24 02:00 EDT
---

# S01: Formatter dot-path and multiline import fix

**Shipped a truthful formatter repair: dotted paths stay canonical, parenthesized multiline imports survive round-trip formatting, and `reference-backend/` is back on clean formatter footing.**

## What Happened

S01 fixed the shared root cause behind the `Api. Router` corruption by routing `SyntaxKind::PATH` through a dedicated `walk_path(...)` formatter in `compiler/mesh-fmt/src/walker.rs`. That localized the change to path-like CST nodes used by dotted imports and qualified impl headers instead of broadening the generic inline spacing rules.

On top of the walker change, the slice added the proof surfaces that were missing before. `compiler/mesh-fmt/src/lib.rs` now has dotted-import idempotency and snapshot coverage, and `compiler/meshc/tests/e2e_fmt.rs` now has a CLI-level exact-output regression (`fmt_preserves_dotted_paths_exactly`) that exercises the real `meshc fmt` binary against three cases: a dotted single-line `from` import, a parenthesized multiline dotted import, and a qualified impl header. This matters because the old bug could corrupt a file into output that was still parseable and eventually idempotent, so `fmt --check` alone was not an honest regression surface.

The slice then repaired the real dogfood target. `reference-backend/main.mpl`, `api/health.mpl`, `api/router.mpl`, `api/jobs.mpl`, `storage/jobs.mpl`, and `jobs/worker.mpl` were restored to canonical dotted imports, formatted once with the fixed formatter, and proven stable on a second `fmt --check` pass. The multiline parenthesized import in `reference-backend/api/health.mpl` remained multiline after formatting, which is the slice’s concrete smoke target for the multiline-import contract.

## Verification

All slice-plan verification checks passed:

- `cargo test -q -p mesh-fmt --lib`
- `cargo test -q -p meshc --test e2e_fmt -- --nocapture`
- `cargo test -q -p meshc --test e2e_fmt fmt_preserves_dotted_paths_exactly -- --nocapture`
- `cargo test -q -p meshc --test e2e e2e_multiline_import_paren -- --nocapture`
- `cargo run -q -p meshc -- fmt --check reference-backend`
- `rg -n '^from .*\. ' reference-backend -g '*.mpl'` returned no matches
- `cargo test -q -p mesh-fmt --lib walk_path_preserves_dotted_import_and_impl_paths -- --nocapture`

The observability surfaces also behaved as intended:

- the walker-level test is the cheapest exact-output signal for `PATH` formatting regressions
- the CLI exact-output test proves the real formatter binary still emits canonical dotted paths and preserves parenthesized multiline imports
- the backend `fmt --check` + grep sweep proves the dogfood source is not merely stable, but clean

## Requirements Advanced

- R024 — removed the formatter blocker for mesher’s multiline-import cleanup; S02/S03 can now apply multiline imports without fighting `meshc fmt`
- R011 — this was direct DX work driven by dogfood friction in `reference-backend/` and mesher, not speculative language expansion

## Requirements Validated

- R026 — validated by the formatter walker/library/CLI proofs plus the multiline-import compiler e2e staying green
- R027 — validated by repairing the six affected `reference-backend/` files and proving `meshc fmt --check reference-backend` plus the stale-import grep sweep pass cleanly

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- R027 — re-scoped from M029/S03 to M029/S01 because check-only proof on already-corrupted dogfood source was not honest enough

## Deviations

The slice-level implementation stayed inside scope, but two milestone-level assumptions changed during execution:

- `reference-backend/api/health.mpl` had to be repaired in T01 instead of waiting for T03 because the `mesh-fmt` library suite vendors it as a canonical fixture
- the broader roadmap had implied that `reference-backend/` import repair could wait for S03; in practice S01 had to leave the backend on canonical source or the formatter proof would have remained misleading

## Known Limitations

S01 does not finish M029. Mesher still needs the S02 cleanup (`json {}` / interpolation / pipe conversions) and the S03 broad multiline-import rollout plus final `meshc fmt --check mesher` proof. This slice only closes the formatter correctness prerequisite and the `reference-backend/` round-trip repair.

## Follow-ups

- S02: replace the remaining mesher JSON serializer `<>` chains with `json {}` or interpolation and finish the pipe cleanup
- S03: convert long mesher imports to parenthesized multiline form, then rerun the formatter/build gates across mesher
- Do not remove the exact-output formatter regressions while doing mesher cleanup; they are now part of the truthful proof surface for this bug class

## Files Created/Modified

- `compiler/mesh-fmt/src/walker.rs` — added `walk_path(...)`, kept parenthesized import formatting at `IMPORT_LIST`, and added walker-level exact-output regression coverage
- `compiler/mesh-fmt/src/lib.rs` — added dotted-import idempotency and snapshot coverage
- `compiler/meshc/tests/e2e_fmt.rs` — added CLI exact-output formatter coverage for dotted imports, multiline imports, and qualified impl headers
- `compiler/meshc/tests/e2e.rs` — existing multiline import e2e remained the parser/compiler truth surface for round-trip compilation
- `reference-backend/main.mpl` — restored canonical dotted imports for `Api.Router`, `Runtime.Registry`, and `Jobs.Worker`
- `reference-backend/api/health.mpl` — preserved the parenthesized multiline `Jobs.Worker` import as the backend smoke target
- `reference-backend/api/router.mpl` — restored canonical dotted imports for `Api.Health` and `Api.Jobs`
- `reference-backend/api/jobs.mpl` — restored canonical dotted imports for `Types.Job`, `Storage.Jobs`, and `Runtime.Registry`
- `reference-backend/storage/jobs.mpl` — restored canonical dotted import for `Types.Job`
- `reference-backend/jobs/worker.mpl` — restored canonical dotted imports for `Types.Job` and `Storage.Jobs`

## Forward Intelligence

### What the next slice should know
- The formatter prerequisite is genuinely closed. S02 and S03 should assume dotted paths and parenthesized multiline imports are safe to use, and they no longer need to spend time repairing `reference-backend/` imports.
- `reference-backend/api/health.mpl` is the fastest real-file smoke target for multiline import preservation because it is both dogfood code and a vendored formatter fixture.

### What's fragile
- Generic spacing changes around `PATH` or import formatting can silently reintroduce semantic corruption while still producing parseable output. This bug class is subtle because bad output can become idempotent after one rewrite.

### Authoritative diagnostics
- `compiler/meshc/tests/e2e_fmt.rs::fmt_preserves_dotted_paths_exactly` — authoritative CLI proof that the real formatter binary still emits canonical dotted paths and preserves multiline imports
- `cargo run -q -p meshc -- fmt --check reference-backend` + `rg -n '^from .*\. ' reference-backend -g '*.mpl'` — authoritative dogfood proof that the backend source is both stable and clean
- `compiler/mesh-fmt/src/walker.rs::walk_path_preserves_dotted_import_and_impl_paths` — authoritative low-cost signal when debugging formatter internals

### What assumptions changed
- “`fmt --check` is enough to catch formatter regressions” — false for this bug class; exact-output tests are required
- “`reference-backend/` import repair can wait until S03” — false; S01 needed to leave dogfood source canonical for the proof to be trustworthy
