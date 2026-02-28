---
phase: 129-map-collect-string-keys-and-code-quality
plan: 01
subsystem: compiler
tags: [mesh-codegen, mir-lowering, map-collect, string-keys, iter-zip, tdd]

# Dependency graph
requires:
  - phase: 128-tryfrom-tryinto
    provides: TryFrom/TryInto dispatch wiring — shows pattern for MIR dispatch patching
provides:
  - Fixed Map.collect string key dispatch for Iter.zip pattern
  - pipe_chain_has_string_keys now detects string list zip sources
  - New E2E test e2e_collect_map_string_keys_zip
affects:
  - 129-02 (code quality — other fixes in same phase)
  - 130-mesher-dogfooding (may use zip+collect patterns)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Zip key source detection: when pipe chain has Iter.zip step, check the LHS source type for List<String>"
    - "pipe_chain_has_string_keys extended with rhs_is_iter_zip + pipe_source_has_string_list helpers"

key-files:
  created:
    - tests/e2e/collect_map_string_keys_zip.mpl
  modified:
    - compiler/mesh-codegen/src/mir/lower.rs
    - compiler/meshc/tests/e2e.rs

key-decisions:
  - "Fix implemented in pipe_chain_has_string_keys (source-walk heuristic) NOT via result-type lookup: let-binding generalization prevents the resolved result type from unifying K=String at collect time"
  - "Plan's primary strategy (result-type check) was kept as an opportunistic check but does not fire due to HM let-generalization — the fallback chain-walk is the actual fix"
  - "rhs_is_iter_zip checks for Iter.zip callee via FieldAccess pattern on module name 'Iter' and field 'zip'"
  - "pipe_source_has_string_list walks recursively through nested pipes to find the deepest LHS and checks for List<String>"

patterns-established:
  - "To detect string-key zip sources: check if any intermediate pipe step has Iter.zip as RHS and its LHS traces back to List<String>"

requirements-completed: [MAPCOL-01]

# Metrics
duration: 11min
completed: 2026-02-28
---

# Phase 129 Plan 01: Map.collect String Keys Zip Summary

**Fixed silent integer-key collect bug for Iter.zip pattern by extending pipe_chain_has_string_keys to detect List<String> source in zip chains**

## Performance

- **Duration:** 11 min
- **Started:** 2026-02-28T00:23:35Z
- **Completed:** 2026-02-28T00:35:01Z
- **Tasks:** 2 (RED + GREEN, TDD)
- **Files modified:** 3

## Accomplishments
- `Map.get(m, "a")` now returns the correct value (1) when `m` was built via `zip+collect`, not 0
- `e2e_collect_map_string_keys_zip` passes: zip-then-collect with string keys works end-to-end
- `e2e_collect_map_string_keys` roundtrip test unaffected
- Zero new warnings introduced

## Task Commits

1. **Task 1 (RED): Failing test for zip+collect pattern** - `dad85fcd` (test)
2. **Task 2 (GREEN): Fix lower_pipe_expr + pipe_chain_has_string_keys** - `7d6a86d5` (feat)

## Files Created/Modified
- `tests/e2e/collect_map_string_keys_zip.mpl` - E2E fixture: zip string keys with int vals then Map.collect + Map.get
- `compiler/mesh-codegen/src/mir/lower.rs` - Extended pipe_chain_has_string_keys with Iter.zip detection; added rhs_is_iter_zip and pipe_source_has_string_list helpers
- `compiler/meshc/tests/e2e.rs` - Added e2e_collect_map_string_keys_zip test

## Decisions Made

- **Plan's primary strategy failed**: The plan proposed checking `self.types.get(&pipe.syntax().text_range())` to find `Map<String,V>` after HM final resolve. This does NOT work because Mesh uses let-generalization: `let m = ... |> Map.collect()` generalizes the fresh K type variable into a `forall` scheme. Downstream `Map.get(m, "a")` instantiates a FRESH K var, so the original collect pipe's K variable is never unified to String.

- **Actual fix**: Extended `pipe_chain_has_string_keys` to detect the pattern `<str_list> |> Iter.from() |> Iter.zip(val_iter)`. Added two helpers: `rhs_is_iter_zip` (checks if pipe RHS is an `Iter.zip` call) and `pipe_source_has_string_list` (walks back to root and checks for `List<String>` type). The primary result-type check is retained as opportunistic fallback.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan's primary fix strategy incorrect due to HM let-generalization**
- **Found during:** Task 2 (GREEN phase implementation)
- **Issue:** `self.types.get(&pipe.syntax().text_range())` returns `Map<TyVar(15), TyVar(16)>` (unresolved) because let-binding generalization prevents K from being unified to String at collect-pipe time
- **Fix:** Extended `pipe_chain_has_string_keys` with zip-source detection instead of relying on result-type lookup; plan's primary check kept for potential future edge cases but the zip chain-walk is what enables the test to pass
- **Files modified:** compiler/mesh-codegen/src/mir/lower.rs
- **Verification:** `e2e_collect_map_string_keys_zip` passes, `e2e_collect_map_string_keys` still passes
- **Committed in:** `7d6a86d5` (Task 2 feat commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in plan's fix strategy)
**Impact on plan:** The plan's code snippet for the fix was incorrect. The correct fix is a source-walk heuristic extension rather than a result-type check. Outcome (test passes, correct behavior) matches the plan's intent exactly.

## Issues Encountered
- HM type inference with let-generalization makes result-type checks at collect-pipe lowering time unreliable; K is only unified to String in a fresh instantiation context created for the `Map.get` call, not in the original collect pipe's context.

## Next Phase Readiness
- MAPCOL-01 complete; Map.collect correctly uses string-key variant for Iter.zip patterns
- Ready for 129-02 (code quality fixes)

---
*Phase: 129-map-collect-string-keys-and-code-quality*
*Completed: 2026-02-28*
