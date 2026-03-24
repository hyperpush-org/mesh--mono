# S02: Cross-module and inferred-export blocker retirement — UAT

**Milestone:** M032
**Written:** 2026-03-24

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: this slice shipped a compiler/lowering repair plus a Mesher module-boundary dogfood change, so the truthful acceptance path is the exact command surface from the slice plan rather than manual product exploration.

## Preconditions

- Run from the repo root: `/Users/sn0w/Documents/dev/mesh-lang`
- Rust/Cargo and the repo’s normal native build prerequisites are available
- No local edits are pending beyond the intended slice changes
- If you run the route checks outside the replay script, ports `18123` and `18124` must be free; the script itself handles cleanup automatically

## Smoke Test

Run:

`cargo test -p meshc --test e2e m032_inferred -- --nocapture`

Expected result:
- Cargo reports `running 2 tests`
- `m032_inferred_local_identity` passes
- `m032_inferred_cross_module_identity` passes
- Final result is `2 passed; 0 failed`

## Test Cases

### 1. Local inferred identity keeps the right ABI and runtime value

1. Run `cargo test -p meshc --test e2e m032_inferred_local_identity -- --nocapture`
2. Wait for the test binary to finish.
3. **Expected:** the test passes cleanly with no null-pointer dereference, no wrong `0` output, and no runtime abort.

### 2. Imported inferred identity lowers correctly across module boundaries

1. Run `cargo test -p meshc --test e2e m032_inferred_cross_module_identity -- --nocapture`
2. Wait for the multifile build and execution to finish.
3. **Expected:** the test passes cleanly with no `Call parameter type does not match function signature!` LLVM verifier error.

### 3. Existing adjacent cross-module controls still stay green

1. Run `cargo test -p meshc --test e2e e2e_cross_module_polymorphic -- --nocapture`
2. Run `cargo test -p meshc --test e2e e2e_cross_module_service -- --nocapture`
3. **Expected:** both tests pass unchanged, proving the inferred-export repair did not regress the already-green polymorphic-import or service-import paths.

### 4. The S01 replay surface now treats `xmod_identity` as supported behavior

1. Run `bash scripts/verify-m032-s01.sh`
2. Watch the step labels in the script output.
3. **Expected:** the script exits 0 and prints `verify-m032-s01: ok`.
4. **Expected:** inside that run, `xmod_identity` is built and executed as a success path with exact stdout `7` then `poly`.
5. **Expected:** the other retained-limit checks still behave the same as before, especially `nested_and` remaining a scripted expected failure and the route-closure runtime split still being exercised.

### 5. Mesher dogfoods the repaired inferred export from `Storage.Writer`

1. Run `rg -n "^pub fn flush_batch|flush_batch\(" mesher/storage/writer.mpl mesher/services/writer.mpl`
2. Confirm the grep output shows:
   - `pub fn flush_batch...` in `mesher/storage/writer.mpl`
   - only call sites to `flush_batch(...)` in `mesher/services/writer.mpl`
   - no local `fn flush_batch` definition left in the service file
3. Run `cargo run -q -p meshc -- fmt --check mesher`
4. Run `cargo run -q -p meshc -- build mesher`
5. **Expected:** Mesher formats cleanly, builds cleanly, and the helper now crosses the `Storage.Writer` / `Services.Writer` boundary without reintroducing the old inferred-export blocker.

## Edge Cases

### Honest retained-limit split stays intact

1. Run `rg -n "run_expect_success build_xmod_identity|run_binary_expect_exact xmod_identity|run_expect_failure_contains nested_and" scripts/verify-m032-s01.sh`
2. **Expected:** the script encodes both truths at once — `xmod_identity` is now a success path, while `nested_and` remains a retained failure.

### The stale Mesher limitation comment is actually gone

1. Run `rg -n "main\.mpl|inferred \(polymorphic\) parameters cannot be exported" mesher/storage/writer.mpl mesher/services/writer.mpl`
2. **Expected:** no stale inferred-export folklore remains in those two files.

## Failure Signals

- `m032_inferred_local_identity` prints `0`, crashes, or reports a null-pointer dereference
- `m032_inferred_cross_module_identity` reports `LLVM module verification failed` or `Call parameter type does not match function signature!`
- `scripts/verify-m032-s01.sh` still expects `xmod_identity` to fail or exits non-zero
- `rg` shows `fn flush_batch` still defined in `mesher/services/writer.mpl`
- `cargo run -q -p meshc -- fmt --check mesher` or `cargo run -q -p meshc -- build mesher` fails after the helper crosses the module boundary

## Requirements Proved By This UAT

- R013 — the blocker is fixed in Mesh, replayed as a green regression surface, and used from Mesher through a real module-boundary helper import
- R011 — the language/compiler work was driven by a real Mesher friction point instead of speculative feature work

## Not Proven By This UAT

- The remaining S03 request/handler/control-flow folklore cleanup
- The S04 module-boundary `from_json` and workaround-convergence work
- The final S05 retained-limit ledger and milestone-wide closeout proof

## Notes for Tester

- The replay script starts temporary servers for the route checks and cleans them up on exit.
- If `m032_inferred` ever regresses again, start with the named test filter before reading large swaths of code; it is the fastest truthful signal for this blocker family.
