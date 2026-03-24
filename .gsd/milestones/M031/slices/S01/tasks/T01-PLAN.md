---
estimated_steps: 5
estimated_files: 3
skills_used: []
---

# T01: Fix trailing-closure disambiguation in control-flow conditions

**Slice:** S01 — Parser & Codegen Fixes
**Milestone:** M031

## Description

The Pratt parser's postfix loop eagerly parses a trailing closure when it sees `DO_KW` after a call expression's `)`. This is correct for `test("name") do ... end` but breaks `if fn_call() do ... end`, `while fn_call() do ... end`, `case fn_call() do ... end`, and `for x in fn_call() do ... end` — in those contexts, `do` is the block opener, not a trailing closure.

Fix: add a `suppress_trailing_closure: bool` field to `Parser`. Set it `true` before parsing the condition/scrutinee/iterable expression in the 4 control-flow forms. Guard the trailing-closure parse at the postfix `DO_KW` check. Add e2e regression tests for both the fix and the must-not-break trailing closure patterns.

## Steps

1. In `compiler/mesh-parser/src/parser/mod.rs`, add `suppress_trailing_closure: bool` to the `Parser` struct (initialized to `false` in `new()`). Add a getter method `pub(crate) fn suppress_trailing_closure(&self) -> bool`.
2. In `compiler/mesh-parser/src/parser/expressions.rs`, guard the trailing-closure parse at line 111: change `if p.at(SyntaxKind::DO_KW) {` to `if p.at(SyntaxKind::DO_KW) && !p.suppress_trailing_closure {`.
3. In each of the 4 control-flow parse functions, wrap the `expr(p)` call for the condition/scrutinee/iterable: set `p.suppress_trailing_closure = true` before, restore to `false` after. The 4 sites are:
   - `parse_if_expr` (line ~872): the `expr(p)` that parses the condition
   - `parse_while_expr` (line ~1468): the `expr(p)` that parses the condition
   - `parse_case_expr` (line ~919): the `expr(p)` that parses the scrutinee
   - `parse_for_in_expr` (line ~1554): the `expr(p)` that parses the iterable (after `IN_KW`)
4. Add e2e tests to `compiler/meshc/tests/e2e.rs` that compile and run programs using `if fn_call() do`, `while fn_call() do`, `case fn_call() do`, and `for x in fn_call() do`.
5. Add regression e2e tests confirming `test("name") do ... end` style trailing closures still work (a program that uses a trailing closure call and prints expected output).

## Must-Haves

- [ ] `suppress_trailing_closure` field added to `Parser`, initialized `false`
- [ ] Trailing-closure parse guarded by `!p.suppress_trailing_closure` in the postfix CALL_EXPR handler
- [ ] All 4 control-flow condition sites set the flag before `expr(p)` and restore after
- [ ] E2e tests for `if fn_call() do`, `while fn_call() do`, `case fn_call() do`, `for x in fn_call() do`
- [ ] Regression e2e test confirming trailing closures (`foo() do ... end`) still parse correctly
- [ ] All 303 existing e2e tests pass

## Verification

- `cargo test -p meshc --test e2e` — all 303+ tests pass
- `cargo test -p mesh-parser --lib` — all parser unit tests pass
- `cargo test -p meshc --test e2e trailing_closure` — new tests pass
- New tests exercise: a function call in an `if` condition with `do` block, and a trailing closure call in expression-statement position

## Inputs

- `compiler/mesh-parser/src/parser/mod.rs` — Parser struct definition (line ~89)
- `compiler/mesh-parser/src/parser/expressions.rs` — Pratt parser postfix loop (line ~111), `parse_if_expr` (line ~867), `parse_while_expr` (line ~1463), `parse_case_expr` (line ~915), `parse_for_in_expr` (line ~1512)
- `compiler/meshc/tests/e2e.rs` — existing e2e test harness with `compile_and_run()` helper

## Expected Output

- `compiler/mesh-parser/src/parser/mod.rs` — Parser struct has `suppress_trailing_closure: bool` field
- `compiler/mesh-parser/src/parser/expressions.rs` — trailing-closure guard + 4 condition-site flag wraps
- `compiler/meshc/tests/e2e.rs` — new e2e tests for control-flow fn-call conditions and trailing-closure regression
