---
estimated_steps: 3
estimated_files: 2
skills_used: []
---

# T02: Fix `else if` chain codegen to produce correct branch values

**Slice:** S01 — Parser & Codegen Fixes
**Milestone:** M031

## Description

`else if` chains compile without error but return wrong values at runtime — garbage integers for Int branches, misaligned pointer crashes for String branches. The root cause: `infer_if` (line 6976 in `compiler/mesh-typeck/src/infer.rs`) recursively calls itself at line 7014 for `else if` chains, bypassing `infer_expr`. Since `infer_expr` is the function that stores resolved types in the `types` map (line 5986), the inner if-expression's type is never stored. The codegen's `lower_if_expr` calls `self.resolve_range(if_.syntax().text_range())` which finds nothing and falls back to `MirType::Unit`, causing type mismatches at runtime.

Fix: add `types.insert(if_.syntax().text_range(), resolved_result)` in `infer_if` before returning, matching what `infer_expr` does for all other expression types.

## Steps

1. In `compiler/mesh-typeck/src/infer.rs`, in the `infer_if` function (line 6976), before both `Ok(then_ty)` return points, insert a `types.insert` call that stores the resolved type for the if-expression's text range. The resolved type should use `ctx.resolve(then_ty.clone())`. Be careful to insert it in both the `if let Some(else_branch)` path and the bare `else` (no else branch) path.
2. Add e2e tests to `compiler/meshc/tests/e2e.rs` covering:
   - `else if` chain returning Int values (3 branches, verify correct branch picked)
   - `else if` chain returning String values (verify no crash)
   - `else if` chain returning Bool values
   - 3-level `else if` chain (if/else if/else if/else)
   - `else if` result used in a `let` binding
3. Run the full e2e test suite to confirm no regressions.

## Must-Haves

- [ ] `types.insert` added in `infer_if` for the if-expression's text range before returning
- [ ] Both return paths in `infer_if` store the type (with-else and without-else)
- [ ] E2e tests for `else if` chains with Int, String, Bool return types
- [ ] E2e test for 3-level `else if` chain
- [ ] E2e test for `else if` result in `let` binding
- [ ] All 303 existing e2e tests pass

## Verification

- `cargo test -p meshc --test e2e` — all 303+ tests pass
- `cargo test -p meshc --test e2e else_if` — new tests pass
- The String-return test does not crash (previously caused misaligned pointer dereference)
- The Int-return test produces the correct branch value (not garbage)

## Inputs

- `compiler/mesh-typeck/src/infer.rs` — `infer_if` function (line 6976), `infer_expr` type storage pattern (line 5986)
- `compiler/meshc/tests/e2e.rs` — existing e2e test harness with `compile_and_run()` helper

## Expected Output

- `compiler/mesh-typeck/src/infer.rs` — `infer_if` stores resolved type in `types` map before returning
- `compiler/meshc/tests/e2e.rs` — new e2e tests for `else if` chain value correctness
