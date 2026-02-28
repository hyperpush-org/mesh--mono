---
phase: 138-testing-framework
plan: 02
subsystem: testing
tags: [rust, runtime, llvm, test-framework, extern-c, catch-unwind]

# Dependency graph
requires:
  - phase: 137-http-client
    provides: "5-point compiler registration pattern (lib.rs, infer.rs, lower.rs, intrinsics.rs)"
provides:
  - "mesh_test_* extern C runtime functions in mesh-rt/src/test.rs"
  - "Test module registered at all 5 compiler points"
  - "FAIL_MESSAGES accumulation with Failures: reprint section in summary"
  - "mesh_test_assert_raises using catch_unwind + AssertUnwindSafe"
affects:
  - 138-testing-framework-plan-03

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "5-registration-point pattern: lib.rs pub mod + pub use, infer.rs STDLIB_MODULE_NAMES + stdlib_modules(), lower.rs STDLIB_MODULES + register_known_functions + map_builtin_name, intrinsics.rs LLVM declarations"
    - "thread_local! Cell/RefCell for per-process test state (PASS_COUNT, FAIL_COUNT, CURRENT_TEST, QUIET_MODE, FAIL_MESSAGES, MOCK_ACTOR_PIDS)"
    - "catch_unwind + AssertUnwindSafe for assert_raises closure invocation"
    - "Failure accumulation pattern: inline print + push to FAIL_MESSAGES for end-of-run Failures: reprint"

key-files:
  created:
    - compiler/mesh-rt/src/test.rs
  modified:
    - compiler/mesh-rt/src/lib.rs
    - compiler/mesh-typeck/src/infer.rs
    - compiler/mesh-codegen/src/mir/lower.rs
    - compiler/mesh-codegen/src/codegen/intrinsics.rs

key-decisions:
  - "Test module registered with empty HashMap in stdlib_modules() — mock_actor signature deferred to Plan 03 (needs assert_receive wiring)"
  - "assert_* helpers call fail_with() then panic!() to unwind — Plan 03 harness wraps each test body in catch_unwind to recover and continue"
  - "FAIL_MESSAGES thread_local accumulates formatted failure entries; mesh_test_summary reprints them in a Failures: section before the count line (user decision from research)"
  - "assert_raises: Ok(_) from catch_unwind = failure (no raise); Err(_) = pass (raised as expected)"
  - "mesh_test_cleanup_actors drains MOCK_ACTOR_PIDS via mesh_actor_exit — Plan 03 populates the list via register_mock_actor_pid()"

patterns-established:
  - "Test DSL builtins (assert/assert_eq/assert_ne/assert_raises) are lowercase test_ prefixed entries in map_builtin_name, not Test.* module calls — they are language-level builtins visible only in test mode"
  - "Test.mock_actor is a module-qualified function (Test.*) — goes in stdlib_modules() HashMap in Plan 03"

requirements-completed: [TEST-02, TEST-03, TEST-04, TEST-05]

# Metrics
duration: 10min
completed: 2026-02-28
---

# Phase 138 Plan 02: Test Runtime Functions Summary

**9 mesh_test_* extern "C" runtime functions with failure accumulation, catch_unwind assert_raises, and Failures: reprint section — wired through all 5 compiler registration points**

## Performance

- **Duration:** 10 min
- **Started:** 2026-02-28T21:09:56Z
- **Completed:** 2026-02-28T21:19:35Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Created `mesh-rt/src/test.rs` with all 9 `mesh_test_*` extern "C" functions: begin, pass, fail_msg, assert, assert_eq, assert_ne, assert_raises, summary, cleanup_actors
- Wired Test module through all 5 compiler registration points: lib.rs (pub mod + pub use), infer.rs (STDLIB_MODULE_NAMES + stdlib_modules), lower.rs (STDLIB_MODULES + known_functions + map_builtin_name), intrinsics.rs (LLVM external declarations)
- Implemented `FAIL_MESSAGES` accumulation with `Failures:` section reprint in `mesh_test_summary`, implementing the user decision from research that failures print inline then are reprinted at the bottom

## Task Commits

Each task was committed atomically:

1. **Task 1: Create mesh-rt/src/test.rs with assertion runtime functions** - `477192e6` (feat)
2. **Task 2: Wire test runtime through 5 compiler registration points** - `700f63a4` (feat)

Note: `e21c99c3` is an intermediate commit (lib.rs only) from a stash recovery event; `700f63a4` completes the full Task 2 wiring.

## Files Created/Modified

- `compiler/mesh-rt/src/test.rs` - All 9 mesh_test_* extern "C" functions with thread_local state management
- `compiler/mesh-rt/src/lib.rs` - Added `pub mod test;` and re-exports for all mesh_test_* functions
- `compiler/mesh-typeck/src/infer.rs` - Added "Test" to STDLIB_MODULE_NAMES and empty Test module to stdlib_modules()
- `compiler/mesh-codegen/src/mir/lower.rs` - Added "Test" to STDLIB_MODULES, all known_functions entries, test_* -> mesh_test_* map_builtin_name mappings
- `compiler/mesh-codegen/src/codegen/intrinsics.rs` - LLVM external declarations for all 9 mesh_test_* functions

## Decisions Made

- Test module registered with empty HashMap in `stdlib_modules()` — `mock_actor` signature is deferred to Plan 03 where assert_receive wiring is also added
- assert helpers call `fail_with()` (which calls `mesh_test_fail_msg`) then `panic!()` so Plan 03's `catch_unwind` wrapper around each test body can recover and continue to the next test
- `FAIL_MESSAGES` thread_local accumulates one formatted entry per failure; `mesh_test_summary` reprints all entries in a "Failures:" block before the final count line — per the user decision from research
- `assert_raises`: `Ok(_)` from `catch_unwind` means no panic occurred (test failure); `Err(_)` means panic occurred (test passes)
- `mesh_test_cleanup_actors` is a placeholder that drains `MOCK_ACTOR_PIDS` via `mesh_actor_exit` — Plan 03 will call `register_mock_actor_pid()` when `Test.mock_actor` creates a mock

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

During Task 2 verification, an intermediate `git stash` operation was used to check baseline test failures. The stash pop failed due to a Cargo.lock conflict, reverting the compiler files. All changes were re-applied identically. The fix for the unnecessary `unsafe` block in `mesh_test_cleanup_actors` (which `mesh_actor_exit` is safe to call from Rust) was incorporated into the final commit.

The 10 pre-existing e2e test failures (`e2e_cross_module_try_operator`, `e2e_err_binding_pattern`, etc.) are confirmed to be pre-existing and unrelated to Phase 138 work.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 9 `mesh_test_*` runtime functions are compiled into `libmesh_rt.a` and declared in LLVM IR
- Plan 03 can now lower the `assert`/`assert_eq`/`assert_ne`/`assert_raises` DSL keywords to `test_assert`/`test_assert_eq`/`test_assert_ne`/`test_assert_raises` builtin calls that route through `map_builtin_name` to the runtime
- Plan 03 must also lower the test harness main (begin/pass/fail_msg/summary/cleanup_actors calls) and add `Test.mock_actor` to `stdlib_modules()`
- No blockers for Plan 03

## Self-Check: PASSED

All files verified present. All commits verified in git log.

- FOUND: compiler/mesh-rt/src/test.rs
- FOUND: compiler/mesh-rt/src/lib.rs
- FOUND: compiler/mesh-typeck/src/infer.rs
- FOUND: compiler/mesh-codegen/src/mir/lower.rs
- FOUND: compiler/mesh-codegen/src/codegen/intrinsics.rs
- FOUND commit: 477192e6 (Task 1)
- FOUND commit: 700f63a4 (Task 2)

---
*Phase: 138-testing-framework*
*Completed: 2026-02-28*
