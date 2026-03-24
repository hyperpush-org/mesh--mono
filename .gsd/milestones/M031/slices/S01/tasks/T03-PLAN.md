---
estimated_steps: 4
estimated_files: 2
skills_used:
  - debug-like-expert
---

# T03: Fix multiline function call type resolution

**Slice:** S01 — Parser & Codegen Fixes
**Milestone:** M031

## Description

Function calls with arguments spanning multiple lines resolve to `()` instead of the correct return type. The parser produces a correct CST (confirmed by formatter round-trip and the existing `newlines_inside_parens_ignored` parser test). The problem is in the typechecker — either `infer_call` returns the wrong type for multiline calls, or the type storage/lookup uses mismatched `TextRange` keys between the typechecker and codegen.

This is the highest-uncertainty task in the slice. The exact failure point isn't fully traced in research — diagnosis is required before the fix.

## Steps

1. Write a minimal failing e2e test in `compiler/meshc/tests/e2e.rs`: a program with a user-defined `fn add(a, b) do a + b end` and a multiline call `add(\n  1,\n  2\n)` that should print the result. Confirm it fails (compiles but produces wrong output or crashes).
2. Diagnose the root cause. The most likely hypotheses, in priority order:
   - **Hypothesis A:** Same category as the `else if` bug — `infer_call` correctly resolves the type but `infer_expr` doesn't store it for multiline spans. Check if `text_range()` of a CST node spanning multiple lines matches between typechecker storage and codegen lookup. The `infer_call` function (line 6265 in `compiler/mesh-typeck/src/infer.rs`) returns the type but something about multiline `TextRange` differs.
   - **Hypothesis B:** The `infer_call` function's arg inference fails silently for multiline calls — `arg_list.args()` might not yield the correct args when `ARG_LIST` spans multiple lines.
   - **Hypothesis C:** The unification of the callee type with the expected function type doesn't resolve properly for multiline spans.
   - Use temporary `eprintln!` debug prints in `infer_call` and `infer_expr` to compare `TextRange` keys if needed. Remove them before committing.
3. Apply the fix in `compiler/mesh-typeck/src/infer.rs` (exact location depends on diagnosis). If it's the same `types.insert` gap as `else if`, the fix is small. If it's a `TextRange` mismatch, the fix may require normalizing the range or adding an explicit `types.insert` in `infer_call`.
4. Add e2e tests covering: multiline calls with Int and String return types, multiline calls with 2+ args on separate lines, mixed single-line and multiline calls in the same function, and a multiline call used in a `let` binding.

## Must-Haves

- [ ] Root cause diagnosed and documented in commit message
- [ ] Multiline function calls resolve to correct return type
- [ ] E2e tests for multiline calls with Int and String returns
- [ ] E2e test for multiline call with 3+ args
- [ ] E2e test for mixed single/multiline calls
- [ ] All 303 existing e2e tests pass

## Verification

- `cargo test -p meshc --test e2e` — all 303+ tests pass
- `cargo test -p meshc --test e2e multiline_call` — new tests pass
- A program using `add(\n  1,\n  2\n)` prints the correct sum (not `()` or garbage)

## Inputs

- `compiler/mesh-typeck/src/infer.rs` — `infer_call` (line 6265), `infer_expr` type storage (line 5986)
- `compiler/mesh-codegen/src/mir/lower.rs` — `resolve_range` fallback to `MirType::Unit` (line 453)
- `compiler/meshc/tests/e2e.rs` — existing e2e test harness

## Expected Output

- `compiler/mesh-typeck/src/infer.rs` — fix for multiline call type resolution
- `compiler/meshc/tests/e2e.rs` — new e2e tests for multiline function call correctness
