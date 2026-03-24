---
id: S02
parent: M032
milestone: M032
provides:
  - Usage-driven MIR repair for unconstrained inferred exports, including per-signature lowering for mixed concrete call sites.
requires:
  - slice: S01
    provides: audited retained-limit matrix plus the `xmod_identity` replay surface and Mesher workaround inventory.
affects:
  - S04
  - S05
key_files:
  - compiler/meshc/src/main.rs
  - compiler/mesh-codegen/src/lib.rs
  - compiler/mesh-codegen/src/mir/lower.rs
  - compiler/meshc/tests/e2e.rs
  - mesher/storage/writer.mpl
  - mesher/services/writer.mpl
  - scripts/verify-m032-s01.sh
key_decisions:
  - D049: repair unconstrained inferred exports with call-site usage evidence and per-signature MIR clones instead of widening generic machinery.
patterns_established:
  - Treat `cargo test -p meshc --test e2e m032_inferred -- --nocapture` as the authoritative repro for inferred-export ABI drift.
  - Dogfood a repaired compiler path in Mesher immediately by moving a real helper across the module boundary instead of keeping a stale local workaround.
observability_surfaces:
  - cargo test -p meshc --test e2e m032_inferred -- --nocapture
  - cargo test -p meshc --test e2e m032_inferred_cross_module_identity -- --nocapture
  - bash scripts/verify-m032-s01.sh
  - cargo run -q -p meshc -- fmt --check mesher
  - cargo run -q -p meshc -- build mesher
drill_down_paths:
  - .gsd/milestones/M032/slices/S02/tasks/T01-SUMMARY.md
  - .gsd/milestones/M032/slices/S02/tasks/T02-SUMMARY.md
duration: two partial task handoffs plus closer repair and verification replay
verification_result: passed
completed_at: 2026-03-24
---

# S02: Cross-module and inferred-export blocker retirement

**Mesh now lowers unconstrained inferred exports from real call-site evidence, and Mesher dogfoods that repaired path by importing `flush_batch` from `Storage.Writer` instead of keeping the helper local to the service.**

## What Happened

The task-level handoffs captured the real blocker accurately but stopped before closure: T01 froze the new `m032_inferred_*` regressions, and T02 correctly refused to move Mesher or the replay script while the compiler still reproduced both failure modes.

Slice closure finished the work instead of preserving those intermediate failures:

1. **Reproduced the exact blocker surface**
   - `m032_inferred_local_identity` showed the local path collapsing to the first observed ABI and returning `{}` at LLVM level.
   - `m032_inferred_cross_module_identity` showed the exporting module still lowering in isolation, so the imported `identity` function never saw downstream concrete usage and failed LLVM verification.

2. **Fixed the real lowering bug in Mesh**
   - `compiler/meshc/src/main.rs` now collects concrete inferred-function usage signatures from the type-checked modules before MIR lowering.
   - `compiler/mesh-codegen/src/lib.rs` threads that usage evidence into `lower_to_mir_raw(...)` while leaving the single-file path on an empty default map.
   - `compiler/mesh-codegen/src/mir/lower.rs` now:
     - merges local and cross-module usage evidence,
     - treats still-generic function definitions as specialization candidates,
     - repairs unresolved return types alongside parameters,
     - emits per-signature MIR clones when one inferred function is used at multiple concrete ABIs,
     - rewrites imported and qualified references to the right specialized symbol instead of letting the first observed ABI win.

3. **Kept the proof surface honest**
   - `compiler/meshc/tests/e2e.rs` now proves the repaired path with passing `m032_inferred_local_identity` and `m032_inferred_cross_module_identity` coverage.
   - The adjacency controls `e2e_cross_module_polymorphic` and `e2e_cross_module_service` stayed green unchanged.

4. **Dogfooded the repaired path in Mesher**
   - `mesher/storage/writer.mpl` now owns `flush_loop(...)` and exports `pub fn flush_batch(...)` with an inferred collection parameter.
   - `mesher/services/writer.mpl` imports `flush_batch` from `Storage.Writer` and keeps buffering, retry policy, and timer wiring local.
   - The stale “must stay in main.mpl because inferred exports cannot cross modules” comment was removed and replaced with the real raw-SQL boundary rationale.

5. **Updated the public replay surface**
   - `scripts/verify-m032-s01.sh` now treats `xmod_identity` as a success path with exact stdout while keeping the other retained-limit checks unchanged.

## Verification

All slice-plan verification passed after the repair:

- `cargo test -p meshc --test e2e m032_inferred -- --nocapture`
- `cargo test -p meshc --test e2e m032_inferred_cross_module_identity -- --nocapture`
- `cargo test -p meshc --test e2e e2e_cross_module_polymorphic -- --nocapture`
- `cargo test -p meshc --test e2e e2e_cross_module_service -- --nocapture`
- `bash scripts/verify-m032-s01.sh`
- `rg -n "^pub fn flush_batch|flush_batch\(" mesher/storage/writer.mpl mesher/services/writer.mpl`
- `cargo run -q -p meshc -- fmt --check mesher`
- `cargo run -q -p meshc -- build mesher`

The observability contract from the slice plan is also working now:
- the named `m032_inferred_*` tests isolate the local-runtime and imported-LLVM failure classes,
- `scripts/verify-m032-s01.sh` exposes step-level drift instead of one opaque compiler failure,
- Mesher’s real fmt/build path stayed green after the helper crossed the module boundary.

## Requirements Advanced

- R011 — This repair came directly from Mesher dogfood pressure (`Storage.Writer`/`Services.Writer` boundary plus the S01 `xmod_identity` repro), not from speculative language work.
- R035 — The stale inferred-export comment in `mesher/storage/writer.mpl` is gone, and the replay script now reflects current truth for `xmod_identity` instead of preserving old folklore.

## Requirements Validated

- R013 — A real Mesh compiler blocker was fixed in Mesh, regression-covered, replayed as a success path, and used from Mesher through a real module-boundary helper import.

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

The task summaries on disk reflect the earlier partial/blocker handoffs, not the final repaired state. Slice closure resolved that mismatch by finishing the planned compiler repair and Mesher dogfood move before writing the slice artifacts.

## Known Limitations

- S03 is still responsible for the broader request/handler/control-flow folklore cleanup.
- S04 still owns the module-boundary `from_json` and related workaround convergence work.
- S05 still needs the integrated retained-limit ledger and final Mesher closeout proof.
- The current inferred-export specialization collection is keyed by exported function name, so future work that introduces colliding same-name unresolved pub functions across modules should revisit that lookup before assuming it is namespace-safe.

## Follow-ups

- Retire the remaining stale request/handler/control-flow workaround comments in S03 using the now-green inferred-export path as the baseline.
- Use the repaired cross-module inferred-export surface in S04’s module-boundary cleanup instead of keeping additional helpers artificially local.
- Carry the updated `xmod_identity` success proof and Mesher helper move into S05’s retained-limit ledger so the milestone closeout does not regress back to old folklore.

## Files Created/Modified

- `compiler/meshc/src/main.rs` — collects concrete inferred-function usage signatures before MIR lowering and passes them into codegen.
- `compiler/mesh-codegen/src/lib.rs` — threads inferred-function usage evidence into raw MIR lowering.
- `compiler/mesh-codegen/src/mir/lower.rs` — repairs unresolved inferred returns/params, merges usage evidence, and emits per-signature MIR clones for mixed concrete call sites.
- `compiler/meshc/tests/e2e.rs` — keeps the named `m032_inferred_*` regression surface as the authoritative proof for the repaired blocker.
- `mesher/storage/writer.mpl` — now exports `flush_batch(...)` and owns the storage-local batch flush loop.
- `mesher/services/writer.mpl` — imports and uses `Storage.Writer.flush_batch(...)` while keeping retry/state/timer logic local.
- `scripts/verify-m032-s01.sh` — reclassifies `xmod_identity` from retained failure to supported success while leaving the other retained-limit checks intact.
- `.gsd/REQUIREMENTS.md` — marks R013 validated from the final proof surface.
- `.gsd/DECISIONS.md` — records the narrow usage-driven specialization strategy as D049.
- `.gsd/KNOWLEDGE.md` — records the concrete failure mode and the rule that one recovered signature is not enough for unconstrained inferred exports.
- `.gsd/PROJECT.md` — refreshes current state to reflect the repaired inferred-export path and remaining M032 work.

## Forward Intelligence

### What the next slice should know
- `scripts/verify-m032-s01.sh` now treats `xmod_identity` as a supported path. If it regresses, treat that as a real compiler/lowering regression, not as expected retained fallout.
- Mesher now proves the repaired path through `Storage.Writer.flush_batch(...)`; do not move that helper back into `Services.Writer` unless the compiler path itself regresses.

### What's fragile
- Inferred-export specialization collection is still keyed by exported function name rather than a fully qualified module+name identity — that is acceptable for the current proof surface, but it is the first place to harden if later slices introduce same-name unresolved exports across modules.

### Authoritative diagnostics
- `cargo test -p meshc --test e2e m032_inferred -- --nocapture` — fastest truthful split of the local and imported inferred-export surfaces.
- `bash scripts/verify-m032-s01.sh` — authoritative milestone replay for `xmod_identity` plus the still-retained limit checks.

### What assumptions changed
- The original assumption was that imported inferred exports only needed return-type repair at the module boundary.
- What actually happened was broader but still narrow in scope: unconstrained inferred functions collapse to unit-like ABI or the first observed concrete ABI unless MIR lowering sees all concrete usages and emits per-signature symbols where needed.
