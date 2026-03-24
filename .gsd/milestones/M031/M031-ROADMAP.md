# M031: Language DX Audit & Rough Edge Fixes

**Vision:** Fix syntax rough edges and bad DX patterns discovered through real backend dogfooding, then clean up both dogfood codebases to use idiomatic Mesh, and expand language tests to cover the fixed patterns.

## Success Criteria

- `if fn_call() do`, `while fn_call() do`, `case fn_call() do`, `for x in fn_call() do` all parse and compile correctly
- `else if` chains return correct values for Int, String, and Bool types
- Multiline function calls typecheck correctly when args span multiple lines
- `from Module import (\n  a,\n  b,\n  c\n)` parses and works
- Trailing commas accepted in function call arguments
- `reference-backend/` builds with zero `let _ =`, zero `== true`, struct update syntax throughout
- `mesher/` builds with zero `let _ =`, interpolation instead of `<>` where appropriate, pipes used idiomatically
- Trailing closures (`test("name") do ... end`) continue to work
- All existing e2e tests pass after changes
- New e2e tests cover every fixed pattern

## Key Risks / Unknowns

- Trailing-closure disambiguation may break existing test DSL usage if the heuristic is wrong — `test("name") do ... end` and `describe("name") do ... end` must keep working
- `else if` codegen fix may expose deeper type-resolution issues in chained expressions
- Multiline fn call typechecker bug may have a broader surface than just call expressions

## Proof Strategy

- Trailing-closure risk → retire in S01 by building the disambiguation, running all 216 existing e2e tests plus the 6 `.test.mpl` files, and adding explicit regression tests for both `if fn_call() do` and `test("name") do ... end`
- `else if` codegen risk → retire in S01 by fixing the lowering, testing with Int/String/Bool return types, and verifying no misaligned pointer crashes
- Multiline fn call risk → retire in S01 by tracing the typechecker span resolution and adding e2e tests for multiline calls

## Verification Classes

- Contract verification: `cargo test -p meshc --test e2e` for all language tests, `cargo test -p mesh-parser --lib` for parser unit tests, `cargo test -p mesh-codegen --lib` for codegen unit tests
- Integration verification: `cargo run -p meshc -- build reference-backend`, `cargo run -p meshc -- build mesher`, `cargo run -p meshc -- test reference-backend`, `cargo run -p meshc -- fmt --check reference-backend`
- Operational verification: none
- UAT / human verification: read the cleaned dogfood code and confirm it looks idiomatic

## Milestone Definition of Done

This milestone is complete only when all are true:

- All compiler fixes land and pass regression tests
- Both `reference-backend/` and `mesher/` build clean with idiomatic patterns
- All existing e2e tests (216+) pass
- New e2e tests cover: bare expressions, `else if` chains, `if fn_call() do`, multiline fn calls, multiline imports, trailing commas, struct update in services, pipe chains, `not fn_call()` in conditions
- `cargo run -p meshc -- fmt --check reference-backend` passes
- `cargo run -p meshc -- test reference-backend` passes
- Success criteria are re-checked against live builds, not just artifacts

## Requirement Coverage

- Covers: R015, R016, R017, R018, R019, R023, R024, R025
- Partially covers: R011 (DX-driven language work from real backend friction)
- Leaves for later: R007, R010, R012, R020, R021

## Slices

- [x] **S01: Parser & Codegen Fixes** `risk:high` `depends:[]`
  > After this: `if is_big(15) do ... end` compiles; `else if` chains return correct values; multiline fn calls typecheck; proven by new e2e tests.

- [x] **S02: Trailing Commas & Multiline Imports** `risk:medium` `depends:[S01]`
  > After this: `from Module import (\n  a,\n  b\n)` works; trailing commas in fn args accepted; proven by new e2e tests and formatter support.

- [x] **S03: Reference-Backend Dogfood Cleanup** `risk:low` `depends:[S01,S02]`
  > After this: `reference-backend/` builds with zero `let _ =`, zero `== true`, struct update syntax, idiomatic pipes; all existing e2e tests pass.

- [x] **S04: Mesher Dogfood Cleanup** `risk:low` `depends:[S01,S02]`
  > After this: `mesher/` builds with zero `let _ =`, interpolation replacing `<>`, multiline imports for long lines, pipe operators used where natural.

- [x] **S05: Language Test Expansion** `risk:low` `depends:[S01,S02,S03,S04]`
  > After this: new e2e test files cover all fixed patterns including edge cases discovered during dogfood cleanup; full test suite passes.

## Boundary Map

### S01 → S02

Produces:
- Parser: trailing-closure disambiguation in `expr_bp` postfix loop — `do` after `)` in control-flow condition context no longer triggers trailing closure
- Parser: `parse_if_expr`, `parse_while_expr`, `parse_case_expr`, `parse_for_in_expr` all handle fn-call conditions correctly
- Codegen: `lower_if_expr` produces correct MIR types for `else if` chains
- Typechecker: multiline fn call spans resolve to correct return types

Consumes:
- nothing (first slice)

### S01 → S03

Produces:
- All the S01 outputs above — enables writing `if fn_call() do`, `else if`, bare expressions without `let _ =`

Consumes:
- nothing (first slice)

### S02 → S03

Produces:
- Parser: `parse_from_import_decl` handles parenthesized multiline import groups
- Parser: `parse_arg_list` accepts trailing commas in multiline function calls
- Formatter: handles new multiline import and trailing comma syntax

Consumes from S01:
- Multiline fn call typechecker fix (trailing commas in multiline calls need correct type resolution)

### S02 → S04

Produces:
- Same as S02 → S03

Consumes from S01:
- Same as S02 → S03

### S03 → S05

Produces:
- Cleaned `reference-backend/` code using idiomatic patterns — serves as test oracle for pattern correctness

Consumes from S01:
- Parser and codegen fixes enabling idiomatic patterns

Consumes from S02:
- Trailing comma and multiline import support

### S04 → S05

Produces:
- Cleaned `mesher/` code using idiomatic patterns — serves as additional test oracle

Consumes from S01:
- Parser and codegen fixes

Consumes from S02:
- Multiline import support for 150-310 char import lines
