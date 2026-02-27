---
phase: 127-type-aliases
plan: 03
subsystem: compiler/type-checker/e2e-tests
tags: [type-aliases, cross-module, e2e, ALIAS-03, infer, typeck]
dependency_graph:
  requires: [127-02]
  provides: [ALIAS-03-verified]
  affects: [compiler/mesh-typeck/src/infer.rs, compiler/meshc/tests/e2e.rs]
tech_stack:
  added: []
  patterns: [compile_multifile_and_run, qualified-type-annotation-parsing]
key_files:
  created: []
  modified:
    - compiler/meshc/tests/e2e.rs
    - compiler/mesh-typeck/src/infer.rs
    - tests/e2e/type_alias_pub.mpl
decisions:
  - "Added fn main() wrapper in cross-module fixture — module-level println hits a pre-existing binop limitation, all other cross-module tests use fn main() pattern"
  - "Register imported aliases under both short name (UserId) and qualified name (Types.UserId) to support both annotation styles"
  - "Added DOT to collect_annotation_tokens and qualified name joining in parse_type_tokens to enable Types.UserId type annotation resolution"
metrics:
  duration: "~20m"
  completed: "2026-02-27"
  tasks_completed: 1
  files_modified: 3
---

# Phase 127 Plan 03: Cross-Module pub type Alias E2E Coverage Summary

Cross-module pub type alias pipeline fully verified: `collect_exports` -> `build_import_context` -> `infer_with_imports` pre-registration pipeline tested end-to-end with `compile_multifile_and_run` and qualified type annotation parsing fixed to support `Types.UserId` syntax.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Replace e2e_type_alias_pub with compile_multifile_and_run cross-module test | ea62b68d | compiler/meshc/tests/e2e.rs, compiler/mesh-typeck/src/infer.rs, tests/e2e/type_alias_pub.mpl |

## What Was Built

### e2e_type_alias_pub (ALIAS-03 positive test)
Replaced the old single-file `compile_and_run` test with a genuine two-file cross-module test:
- `types.mpl`: exports `pub type UserId = Int` and `pub type Email = String`
- `main.mpl`: imports Types, uses `Types.UserId` and `Types.Email` in function signatures and let bindings inside `fn main()`
- Confirms output `"user@example.com\n"` — alias resolves transparently across module boundary

### e2e_type_alias_private_not_exported (ALIAS-03 negative test)
Added negative test confirming private type aliases cannot be used in importing modules:
- `internals.mpl`: defines `type InternalId = Int` (no `pub`)
- `main.mpl`: tries to use `Internals.InternalId` — produces type error
- Uses `compile_multifile_expect_error` — confirms non-empty error output

### Qualified type annotation parsing fix (3 components)
1. **`collect_annotation_tokens`**: Added `SyntaxKind::DOT` to the token filter so `Types.UserId` yields `[IDENT("Types"), DOT("."), IDENT("UserId")]`
2. **`parse_type_tokens`**: After reading the first IDENT, check for `DOT IDENT` pattern and join into `"Types.UserId"` as the lookup key
3. **`infer_with_imports` pre-registration**: Register imported aliases under both short name (`"UserId"`) and qualified name (`"Types.UserId"`) so both annotation styles resolve correctly

### tests/e2e/type_alias_pub.mpl
Reduced to the canonical module-level snippet (`pub type UserId = Int` / `pub type Email = String`) since the test logic is now inline in e2e.rs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Module-level println hits pre-existing binop limitation in multi-file builds**
- **Found during:** Task 1 (first test run)
- **Issue:** The plan's fixture used top-level `let` and `println` (no `fn main()` wrapper). Multi-file builds that invoke module-level code with string values trigger a pre-existing "Unsupported binop type: String" error in codegen when not inside a function
- **Fix:** Wrapped all test code inside `fn main() do ... end`, matching the pattern used by all other 20+ `compile_multifile_and_run` tests in e2e.rs
- **Files modified:** compiler/meshc/tests/e2e.rs
- **Commit:** ea62b68d (same commit)

**2. [Rule 1 - Bug] DOT missing from collect_annotation_tokens — qualified type names not parseable**
- **Found during:** Task 1 (first test run after writing test)
- **Issue:** `collect_annotation_tokens` filtered out DOT tokens, so `Types.UserId` was collected as `[IDENT("Types"), IDENT("UserId")]` and only `Types` was read as the type name
- **Fix:** Added `SyntaxKind::DOT` to the token filter and IDENT DOT IDENT joining logic in `parse_type_tokens`
- **Files modified:** compiler/mesh-typeck/src/infer.rs
- **Commit:** ea62b68d (same commit)

**3. [Rule 2 - Missing functionality] Qualified alias registration missing from pre-registration**
- **Found during:** Task 1 (needed to complete the annotation-to-alias lookup chain)
- **Issue:** Imported aliases were only registered under their short name (`"UserId"`), but the annotation parser (after the DOT fix) produces the qualified key `"Types.UserId"` for lookup
- **Fix:** Register each imported alias under both the short name and the qualified `"ModuleName.AliasName"` key
- **Files modified:** compiler/mesh-typeck/src/infer.rs
- **Commit:** ea62b68d (same commit)

### Out-of-scope pre-existing failures

`e2e_service_bool_return` was already failing before this plan. Documented in git stash verification. Not caused by these changes.

## Verification Results

```
cargo test -p meshc e2e_type_alias
  test e2e_type_alias_basic ... ok
  test e2e_type_alias_pub ... ok
  test e2e_type_alias_private_not_exported ... ok
  test result: ok. 3 passed; 0 failed
```

All other tests pass — no regressions introduced.

## Self-Check: PASSED

Files verified:
- FOUND: compiler/meshc/tests/e2e.rs (contains compile_multifile_and_run at line 5408)
- FOUND: compiler/mesh-typeck/src/infer.rs (contains DOT fix at line ~8455)
- FOUND: tests/e2e/type_alias_pub.mpl (2-line canonical form)
- FOUND: commit ea62b68d
