# S04 Research: Module-boundary JSON and workaround convergence

## Summary

S04 is narrower than the roadmap wording suggests after S02.

- Live stale `from_json` rationale remains only at `mesher/services/event_processor.mpl:5,120` and `mesher/storage/queries.mpl:482`.
- `mesher/storage/writer.mpl` is no longer an S04 target: `rg -n "from_json" mesher/storage/writer.mpl` returns no matches, and its current top-of-file comments already describe the real JSONB/raw-SQL boundary.
- Cross-module `from_json` is already supported on three durable surfaces: `compiler/meshc/tests/e2e.rs:3338`, `compiler/meshc/tests/e2e.rs:3385`, and `compiler/meshc/tests/e2e.rs:6841`. `scripts/verify-m032-s01.sh:128-129` already replays `xmod_from_json` as a success path.
- The honest keep-surface is PostgreSQL JSONB + ORM expressiveness, not module-boundary JSON. `mesher/storage/queries.mpl:486-489` and `mesher/storage/writer.mpl:1-17` describe a still-real server-side JSONB pipeline.
- `mesher/services/event_processor.mpl` also has comment drift unrelated to `from_json`: it still claims caller-side `Ingestion.Validation` happens before `ProcessEvent`, but `validate_event(...)` is defined at `mesher/ingestion/validation.mpl:21` and unused. Routes only call `validate_payload_size(...)` before `EventProcessor.process_event(...)`.
- There is no parity test tying `Ingestion.Fingerprint.compute_fingerprint(...)` to `Storage.Queries.extract_event_fields(...)`. Swapping the SQL path for typed Mesh parsing would be a redesign, not just workaround cleanup.

## Recommendation

Use the `debug-like-expert` rules **VERIFY, DON'T ASSUME** and **NO DRIVE-BY FIXES** here. Pair that with the `rust-best-practices` bias toward the smallest explicit change instead of a speculative rewrite.

Plan S04 as surgical truth cleanup plus tiny dead-code cleanup:

1. **`mesher/services/event_processor.mpl`**
   - rewrite the stale top-of-file and `route_event(...)` comments so they stop blaming cross-module `from_json`
   - stop claiming that caller-side `validate_event(...)` already happens
   - remove the unused `compute_fingerprint` import if it stays unused after the wording cleanup
   - keep `process_extracted_fields(...)` and the service API shape unchanged
2. **`mesher/storage/queries.mpl`**
   - rewrite the `extract_event_fields(...)` banner so it explains the current server-side JSONB/fingerprint rationale without blaming `from_json`
   - keep the raw-SQL/ORM-boundary explanation intact
   - do not rewrite the SQL into Mesh-side parsing/fingerprinting in this slice
3. **Guard files, not targets**
   - `mesher/storage/writer.mpl` should stay as the already-correct JSONB boundary explanation from S02
   - `mesher/types/event.mpl` and `mesher/types/issue.mpl` should stay untouched; those are row-shape notes, not limitation folklore

Do **not** convert the event path to `EventPayload.from_json(...)` in this slice unless execution first adds new parity proof between `Ingestion.Fingerprint.compute_fingerprint(...)` and `Storage.Queries.extract_event_fields(...)`. Current evidence only justifies comment convergence, not a runtime-path swap.

## Requirements Targeted

- **R035** — primary S04 goal: stale module-boundary folklore must be removed or rewritten truthfully.
- **R011** — the cleanup should stay anchored to the real mesher ingestion/storage path, not synthetic compiler examples.
- **Supports R010** — the repo's claims about Mesh capability should match the current CLI and dogfood truth.
- **Protects validated R013** — S02 already fixed the real module-boundary blocker; S04 should not reintroduce stale `storage/writer` folklore or fake new dogfood.

## Skills Discovered

- **Loaded:** `debug-like-expert`
  - Applied rules:
    - **VERIFY, DON'T ASSUME** — every rewrite recommendation below is tied to current test, grep, and call-site evidence.
    - **NO DRIVE-BY FIXES** — do not turn stale comment cleanup into an unproven event-processing redesign.
- **Loaded:** `rust-best-practices`
  - Applied rule: prefer the smallest explicit seam already present in the code over a broader refactor with new behavioral risk.
- **Skill search performed:**
  - `npx skills find "compiler tooling"`
- **Result:** no new skill installed. The returned skills were generic compiler/LLVM aids, not directly useful for a mesher-local truth-cleanup slice.

## Implementation Landscape

### A. Current stale targets after S02

Live `from_json` folklore now survives only in two files:

- `mesher/services/event_processor.mpl:5`
- `mesher/services/event_processor.mpl:120`
- `mesher/storage/queries.mpl:482`

Controls / non-targets:

- `mesher/storage/writer.mpl` has no `from_json` references now.
- `mesher/types/event.mpl:55` and `mesher/types/issue.mpl:14` are data-shape notes about row decoding, not limitation folklore.
- `scripts/verify-m032-s01.sh` already treats `xmod_from_json` as supported success, so S04 does not need script work.

### B. EventProcessor cleanup is the only safe code-adjacent convergence

`mesher/services/event_processor.mpl` has three separate concerns mixed together:

1. **stale `from_json` blame**
   - top-of-file comment at line 5
   - `route_event(...)` banner at line 120
2. **real keep-site**
   - `process_extracted_fields(...)` at `mesher/services/event_processor.mpl:107` still exists because multi-statement case arms remain a real parser limitation; S04 should not inline it
3. **plain drift / dead code**
   - `from Ingestion.Fingerprint import compute_fingerprint` at line 13 is currently unused
   - the comment claiming caller-side validation is inaccurate today

Actual call chain today:

- `mesher/ingestion/routes.mpl:223-247` single-event path only does `validate_payload_size(...)` and then calls `EventProcessor.process_event(...)`
- `mesher/ingestion/routes.mpl:307-311` bulk path does the same
- `mesher/ingestion/validation.mpl:21` defines `validate_event(...)`, but `rg -n "validate_event\(" mesher -g '*.mpl'` only finds that definition

Planning consequence:

- rewrite comments to match the live behavior
- remove the unused import if it remains unused
- do **not** add payload parsing or validation inside S04 unless the slice explicitly accepts behavior drift

### C. The real keep-surface is the SQL JSONB pipeline

`mesher/storage/queries.mpl:491` `extract_event_fields(...)` is not just a leftover workaround. It computes `fingerprint`, `title`, and `level` inside PostgreSQL using `CASE`, `jsonb_array_elements`, `string_agg`, and `COALESCE`.

Relevant boundaries:

- `mesher/storage/queries.mpl:486-489` — honest raw-SQL reason that must survive, minus the stale `from_json` sentence at line 482
- `mesher/storage/writer.mpl:1-17` — complementary boundary explaining why `insert_event(...)` keeps server-side JSONB extraction for the remaining fields
- `mesher/ingestion/fingerprint.mpl:82` — Mesh-side `compute_fingerprint(...)` helper with the same conceptual fallback chain
- `mesher/tests/fingerprint.test.mpl:1-77` — tests only the Mesh-side helper in isolation; there is no parity proof against `extract_event_fields(...)`

Planning consequence:

Compiler support for cross-module `from_json` does **not** automatically mean the SQL extraction path should disappear. The honest convergence in S04 is comment truth, not deleting the server-side JSONB path without new parity evidence.

### D. Durable compiler truth already exists; S04 does not need compiler work

Existing support proofs:

- `compiler/meshc/tests/e2e.rs:3338` — `e2e_cross_module_from_json`
- `compiler/meshc/tests/e2e.rs:3385` — `e2e_cross_module_from_json_selective_import`
- `compiler/meshc/tests/e2e.rs:6841` — `e2e_m032_supported_cross_module_from_json`
- `scripts/verify-m032-s01.sh:128-129` — direct `xmod_from_json` build + run replay

Planning consequence:

S04 can reuse the existing compiler/replay surfaces. There is no need to add compiler tests or replay-script edits unless execution deliberately expands scope beyond comment convergence.

## Verification Plan

### Focused support proof

```bash
cargo test -q -p meshc --test e2e e2e_m032_supported_cross_module_from_json -- --nocapture
```

### Optional broader controls

```bash
cargo test -q -p meshc --test e2e e2e_cross_module_from_json -- --nocapture
cargo test -q -p meshc --test e2e e2e_cross_module_from_json_selective_import -- --nocapture
```

### Mesher closeout

```bash
cargo run -q -p meshc -- fmt --check mesher
cargo run -q -p meshc -- build mesher
```

### Comment-truth greps

Stale rationale should be gone from the live S04 targets:

```bash
rg -n "cross-module from_json limitation|from_json limitation per decision \[88-02\]" mesher/services/event_processor.mpl mesher/storage/queries.mpl
```

`storage/writer` should stay clean:

```bash
rg -n "from_json" mesher/storage/writer.mpl || true
```

Data-shape notes should remain in the type files:

```bash
rg -n "from_json" mesher/types/event.mpl mesher/types/issue.mpl
```

Honest raw-SQL boundary wording should still exist:

```bash
rg -n "ORM boundary: ORM fragments cannot express CASE/jsonb_array_elements/string_agg|Repo.insert cannot express server-side JSONB extraction" mesher/storage/queries.mpl mesher/storage/writer.mpl
```

Use `bash scripts/verify-m032-s01.sh` only as final slice-level replay, not the first feedback loop.

## Current Baseline Observed During Research

These all passed from repo root during this scout pass:

```bash
cargo test -q -p meshc --test e2e e2e_m032_supported_cross_module_from_json -- --nocapture
cargo run -q -p meshc -- fmt --check mesher
cargo run -q -p meshc -- build mesher
```

Observed result:

- `e2e_m032_supported_cross_module_from_json` passed
- `meshc fmt --check mesher` was silent-success
- `meshc build mesher` produced `Compiled: mesher/mesher`

Additional scope check:

```bash
rg -n "from_json" mesher/storage/writer.mpl
```

Observed result: no matches.

## Planner Notes

- Fastest safe order is `mesher/services/event_processor.mpl` first, then `mesher/storage/queries.mpl`, then build/fmt + comment greps.
- The likely executor mistake is to treat compiler support for `from_json` as proof that the SQL path should be deleted. That would skip the still-real JSONB/ORM boundary and the missing parity tests.
- `mesher/storage/writer.mpl` is now a guard file, not a work item.
- If an execution agent proposes parsing `EventPayload` in the route or service layer, require a fresh scope check: that changes validation behavior and needs new parity proof before it is honest.
