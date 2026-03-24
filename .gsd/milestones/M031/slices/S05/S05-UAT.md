# S05 UAT: Language Test Expansion

## Preconditions

- Rust toolchain installed with `cargo` available
- Repository at the M031/S05 completion state
- No other `cargo test` processes running concurrently (avoids lock contention)

## Test Cases

### TC1: Bare Expression Side-Effect Tests Pass

**Steps:**
1. Run `cargo test -p meshc --test e2e bare_expression -- --nocapture`

**Expected:**
- 2 tests run: `e2e_bare_expression_side_effects`, `e2e_bare_expression_in_block`
- Both pass (exit code 0)
- `e2e_bare_expression_side_effects` output includes bare `println()` calls executing without `let _ =`
- `e2e_bare_expression_in_block` output includes expressions evaluated inside if/else branches

### TC2: Not-Fn-Call Condition Tests Pass

**Steps:**
1. Run `cargo test -p meshc --test e2e not_fn_call -- --nocapture`

**Expected:**
- 2 tests run: `e2e_not_fn_call_if_condition`, `e2e_not_fn_call_while_condition`
- Both pass (exit code 0)
- `e2e_not_fn_call_if_condition` demonstrates `if not fn_call()` correctly negating a function return
- `e2e_not_fn_call_while_condition` demonstrates `while not fn_call()` with both skip and enter-then-break paths

### TC3: Struct Update in Service Handler Test Passes

**Steps:**
1. Run `cargo test -p meshc --test e2e struct_update_in_service -- --nocapture`

**Expected:**
- 1 test runs: `e2e_struct_update_in_service_call`
- Passes (exit code 0)
- Test uses `compile_multifile_and_run` (multiple Mesh source files)
- Service uses `%{state | field: value}` struct update syntax in both `call` and `cast` handlers
- Output demonstrates state mutations through the service interface

### TC4: Full E2E Suite Regression-Free

**Steps:**
1. Run `cargo test -p meshc --test e2e 2>&1 | tail -5`

**Expected:**
- 328 total tests
- 318 passed
- 10 failed (all pre-existing `try_*`/`from_try_*` tests)
- 0 new failures compared to pre-S05 baseline (323 tests before S05)
- The 5 new tests from S05 account for the 323 → 328 increase

### TC5: Pre-Existing Failures Are Unchanged

**Steps:**
1. Run `cargo test -p meshc --test e2e 2>&1 | grep 'failures:' -A 15`

**Expected:**
- Exactly these 10 failures (no more, no less):
  - `e2e_cross_module_try_operator`
  - `e2e_err_binding_pattern`
  - `e2e_from_try_error_conversion`
  - `e2e_option_field_extraction`
  - `e2e_try_chained_result`
  - `e2e_try_operator_result`
  - `e2e_try_option_some_path`
  - `e2e_try_result_binding_arity`
  - `e2e_try_result_ok_path`
  - `e2e_tryfrom_try_operator`

## Edge Cases

### EC1: Individual Test Isolation

Each of the 5 new tests should pass when run completely alone (no dependency on test ordering or shared state):
- `cargo test -p meshc --test e2e e2e_bare_expression_side_effects -- --exact`
- `cargo test -p meshc --test e2e e2e_bare_expression_in_block -- --exact`
- `cargo test -p meshc --test e2e e2e_not_fn_call_if_condition -- --exact`
- `cargo test -p meshc --test e2e e2e_not_fn_call_while_condition -- --exact`
- `cargo test -p meshc --test e2e e2e_struct_update_in_service_call -- --exact`

### EC2: Diagnostic Output Available

For any failing test, running with `-- --nocapture` should print:
- Full `meshc` compiler stderr (parse/type errors if any)
- Binary execution stdout/stderr
- Expected vs actual output comparison
