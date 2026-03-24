---
id: S05
parent: M031
milestone: M031
provides:
  - 5 new e2e tests covering bare expression statements, not-fn-call conditions, and struct update in service handlers
  - R025 test coverage now spans all 12 listed pattern categories
requires:
  - slice: S01
    provides: parser/codegen fixes enabling bare expressions, not-fn-call, else-if chains
  - slice: S02
    provides: trailing-comma and multiline-import support
  - slice: S03
    provides: idiomatic reference-backend code serving as pattern oracle
  - slice: S04
    provides: idiomatic mesher code serving as additional pattern oracle
affects: []
key_files:
  - compiler/meshc/tests/e2e.rs
key_decisions:
  - Mesh has no mutable variables, so the while-not-fn-call test uses break instead of a counter loop
  - Bare expression block test uses if/else branches instead of do..end block-as-expression (unsupported in let binding)
patterns_established:
  - e2e test naming: e2e_<category>_<detail> for pattern-gap coverage tests
  - compile_multifile_and_run for service-level integration tests requiring multiple Mesh source files
observability_surfaces:
  - cargo test -p meshc --test e2e <test_name> -- --nocapture for full compiler/runtime output per test
drill_down_paths:
  - .gsd/milestones/M031/slices/S05/tasks/T01-SUMMARY.md
duration: 15m
verification_result: passed
completed_at: 2026-03-24
---

# S05: Language Test Expansion

**5 new e2e tests covering the three remaining R025 pattern gaps — bare expression side-effects, `not fn_call()` in conditions, and struct update in service handlers — bringing the full suite to 328 tests with zero new failures.**

## What Happened

S01–S04 fixed parser/codegen bugs and cleaned both dogfood codebases, but three pattern categories from R025 had no isolated regression tests: bare expression statements (side-effect calls without `let _ =`), `not fn_call()` in control-flow conditions, and struct update syntax inside service handlers.

T01 added 5 tests to `compiler/meshc/tests/e2e.rs`:

1. **`e2e_bare_expression_side_effects`** — multiple bare `println()` and helper calls without `let _ =` bindings
2. **`e2e_bare_expression_in_block`** — bare expressions used in if/else branches for control flow
3. **`e2e_not_fn_call_if_condition`** — `if not is_empty(count)` with function-call negation
4. **`e2e_not_fn_call_while_condition`** — `while not always_true()` (skip) and `while not always_false()` (enter then break)
5. **`e2e_struct_update_in_service_call`** — multifile service using `%{state | count: state.count + 1}` in `call` and `%{state | label: new_label}` in `cast`

Two initial design adjustments were needed: `let x = do...end` block-as-expression is not valid Mesh syntax in let bindings (replaced with if/else branches), and `let mut` does not exist in Mesh (replaced counter loop with break-based control).

## Verification

All 5 new tests pass individually. Full e2e suite: 328 total, 318 passed, 10 pre-existing `try_*` failures, 0 new failures.

| Check | Command | Result |
|-------|---------|--------|
| Bare expression tests | `cargo test -p meshc --test e2e bare_expression` | 2 pass |
| Not-fn-call tests | `cargo test -p meshc --test e2e not_fn_call` | 2 pass |
| Struct update service test | `cargo test -p meshc --test e2e struct_update_in_service` | 1 pass |
| Full suite regression | `cargo test -p meshc --test e2e` | 318 pass, 10 pre-existing fail |

## New Requirements Surfaced

- none

## Deviations

- `do...end` block-as-expression syntax is not supported in `let` bindings — used if/else branches instead for the bare-expression-in-block test.
- Mesh has no mutable variables — used break-based loop control instead of a counter for the while-not test.

## Known Limitations

- `do...end` blocks cannot be used as values in `let` bindings. This limits how bare expressions can be tested in block contexts, but doesn't affect real-world usage (if/else and case arms serve the same purpose).
- The 10 `try_*`/`from_try_*` e2e failures are pre-existing and unrelated to M031 work.

## Follow-ups

- none

## Files Created/Modified

- `compiler/meshc/tests/e2e.rs` — appended 5 new test functions covering bare expressions, not-fn-call conditions, and struct update in service handlers

## Forward Intelligence

### What the next slice should know
- R025 is now fully covered. All 12 pattern categories listed in the requirement have at least one dedicated e2e test. The full test suite is at 328 tests.

### What's fragile
- The 10 `try_*` test failures are pre-existing runtime crashes (exit code None) that have persisted across M028 and M031. They are not related to any M031 work but will need attention when `try`/`Result` runtime support is hardened.

### Authoritative diagnostics
- `cargo test -p meshc --test e2e` with the full unfiltered run is the authoritative signal. Individual pattern groups can be checked with name filters (`bare_expression`, `not_fn_call`, `struct_update_in_service`).

### What assumptions changed
- Original plan estimated 5–6 tests; 5 was sufficient to cover all three pattern gaps without redundancy.
