# S01: Formatter dot-path and multiline import fix — UAT

**Milestone:** M029
**Written:** 2026-03-24

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: this slice changes formatter/compiler behavior and dogfood source text, not a long-running runtime surface. The truthful acceptance gate is exact formatter output plus clean round-trip formatting on `reference-backend/`.

## Preconditions

- Run from the repo root (`/Users/sn0w/Documents/dev/mesh-lang`)
- Rust/Cargo toolchain is available
- No local edits are intentionally holding `reference-backend/` in an unformatted state

## Smoke Test

Run the CLI exact-output regression:

1. Execute `cargo test -q -p meshc --test e2e_fmt fmt_preserves_dotted_paths_exactly -- --nocapture`
2. **Expected:** the test exits 0 and reports `1 passed`; no case rewrites `Api.Router` to `Api. Router`, no parenthesized import collapses to single-line, and the qualified impl header stays `impl Foo.Bar for Baz.Qux do`.

## Test Cases

### 1. Walker-level dotted-path contract

1. Execute `cargo test -q -p mesh-fmt --lib walk_path_preserves_dotted_import_and_impl_paths -- --nocapture`
2. Review the output for a clean pass.
3. **Expected:** the test exits 0 and proves these exact texts:
   - `from Api.Router import build_router`
   - `from Api.Router import (` with `build_router` and `health_router` on separate indented lines
   - `impl Foo.Bar for Baz.Qux do`

### 2. Formatter library suite stays green after the localized fix

1. Execute `cargo test -q -p mesh-fmt --lib`
2. **Expected:** the suite exits 0 and reports the full library test pass count (currently 124 tests). This confirms the PATH/import fix did not regress other formatter behavior.

### 3. CLI exact-output regression catches real formatter output

1. Execute `cargo test -q -p meshc --test e2e_fmt -- --nocapture`
2. **Expected:** the suite exits 0 and reports all 8 tests passing, including `fmt_preserves_dotted_paths_exactly` and `fmt_check_reference_backend_directory_succeeds`.

### 4. Parenthesized multiline imports still compile end-to-end

1. Execute `cargo test -q -p meshc --test e2e e2e_multiline_import_paren -- --nocapture`
2. **Expected:** the suite exits 0 and reports `3 passed`; parser/compiler behavior for parenthesized imports still works after the formatter changes.

### 5. `reference-backend/` round-trips cleanly under the fixed formatter

1. Execute `cargo run -q -p meshc -- fmt --check reference-backend`
2. **Expected:** exit code 0 with `11 file(s) already formatted` or equivalent success output; no diffs are emitted.
3. Execute `rg -n '^from .*\. ' reference-backend -g '*.mpl'`
4. **Expected:** no matches. There should be no spaced dotted imports left in the backend source.

## Edge Cases

### Multiline import smoke target in real dogfood code

1. Open `reference-backend/api/health.mpl`.
2. Confirm the file still starts with:
   - `from Jobs.Worker import (`
   - one imported name per indented line
   - closing `)` on its own line
3. Re-run `cargo run -q -p meshc -- fmt --check reference-backend`.
4. **Expected:** the import remains parenthesized and multiline after formatter verification.

### Qualified impl headers with dotted paths

1. Re-run `cargo test -q -p meshc --test e2e_fmt fmt_preserves_dotted_paths_exactly -- --nocapture`.
2. **Expected:** the `qualified impl header` case stays exact as `impl Foo.Bar for Baz.Qux do`; any `Foo. Bar` / `Baz. Qux` output is a regression.

### Idempotent-bad-output trap

1. Treat a passing `meshc fmt --check` alone as insufficient for this bug class.
2. Always pair it with `fmt_preserves_dotted_paths_exactly` when verifying formatter changes in this area.
3. **Expected:** both checks pass. If only `fmt --check` passes while the exact-output test fails, the slice has regressed back to semantically wrong but stable formatting.

## Failure Signals

- Any output containing `Api. Router`, `Foo. Bar`, or `Baz. Qux`
- `reference-backend/api/health.mpl` rewritten to a single-line import
- `cargo run -q -p meshc -- fmt --check reference-backend` emits a diff or non-zero exit
- `rg -n '^from .*\. ' reference-backend -g '*.mpl'` returns matches
- `e2e_multiline_import_paren` fails or reports fewer than 3 passing tests

## Requirements Proved By This UAT

- R026 — proves the formatter preserves dotted module paths and parenthesized multiline imports
- R027 — proves `reference-backend/` now has canonical dotted imports and stays clean under formatter round-trip verification

## Not Proven By This UAT

- R024’s remaining mesher work (`json {}` adoption, remaining interpolation cleanup, pipe cleanup, broad multiline-import rollout)
- `meshc fmt --check mesher` and mesher build cleanliness
- Full milestone closeout (`meshc build` on both codebases and the broader `cargo test -p meshc --test e2e` gate)

## Notes for Tester

Use the exact-output CLI test as the primary truth surface for future formatter edits in this area. This bug class is deceptive: once a file is corrupted, `fmt --check` can still go green because the wrong text may already be stable.