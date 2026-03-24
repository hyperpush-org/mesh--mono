# M032: Mesher Limitation Truth & Mesh Dogfood Retirement

**Gathered:** 2026-03-24
**Status:** Ready for planning

## Project Description

This milestone audits `mesher/` for comments and code structure that claim a Mesh language, compiler, runtime, or tooling limitation; proves which claims are stale versus still real; fixes the real blockers in Mesh; and then dogfoods those repaired paths back into `mesher/` without changing mesher's product behavior.

## Why This Milestone

`mesher/` is currently carrying a mix of real limitations and stale folklore. Some comments still claim missing capabilities that already exist (`Request.query(...)`, cross-module `from_json`, selected handler/control-flow patterns), while other workarounds still point at live compiler or module-boundary problems. That makes the codebase a poor truth surface. Before broadening the ORM and migration APIs, the repo needs an honest audit that separates stale folklore from real Mesh blockers and retires the real blockers at the source.

## User-Visible Outcome

### When this milestone is complete, the user can:

- point to a short, current list of real Mesh limitations that still affect `mesher/`, instead of relying on stale workaround comments
- build and verify `mesher/` on repaired Mesh paths where the old limitation comments were no longer true

### Entry point / environment

- Entry point: `cargo run -q -p meshc -- build mesher`, `cargo run -q -p meshc -- fmt --check mesher`, targeted `cargo test -q -p meshc --test e2e ...` repros, and mesher migration/build smoke commands
- Environment: local dev, compiler CLI, Postgres-backed mesher package
- Live dependencies involved: mesher, compiler/runtime/tooling crates, PostgreSQL

## Completion Class

- Contract complete means: targeted compiler/runtime/tooling repros prove which limitation comments were stale and which blockers were real, and the repaired behavior is covered by fresh regression proof.
- Integration complete means: the repaired or already-supported behavior is used from actual `mesher/` modules rather than only from tiny fixtures.
- Operational complete means: `mesher/` build, formatter, tests, and selected migrate/dogfood commands stay green after the cleanup and blocker retirement.

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- a previously real blocker found through the audit now compiles or runs through a real `meshc` path with regression coverage
- `mesher/` uses at least one repaired or revalidated path directly and still preserves its current product behavior
- every retained limitation comment in `mesher/` names a current, rechecked limitation with evidence; stale folklore is gone

## Risks and Unknowns

- Some comments may be stale in one proof surface but still hide breakage in another — this matters because `meshc build`, compiler e2e helpers, and dogfood package builds do not always fail the same way.
- Multiple workarounds may collapse to one root cause or hide several separate bugs — this matters because the milestone should fix the source, not paper over each call site independently.
- Mesher behavior could drift while removing workaround structure — this matters because the user wants `mesher/` to remain behaviorally stable while Mesh improves under it.

## Existing Codebase / Prior Art

- `mesher/ingestion/routes.mpl` — contains a stale query-string limitation comment even though `Request.query(...)` already exists and is used elsewhere.
- `mesher/api/helpers.mpl` and `mesher/api/search.mpl` — prove that live request query handling already exists in mesher.
- `mesher/services/user.mpl`, `mesher/services/stream_manager.mpl`, `mesher/services/event_processor.mpl`, and `mesher/storage/writer.mpl` — carry the main handler, case-arm, module-boundary, and export-related workaround comments to audit.
- `compiler/meshc/tests/e2e.rs` — already contains cross-module `from_json` and cross-module polymorphic import proofs to compare against fresh `meshc build` repros.
- `compiler/mesh-parser/src/parser/expressions.rs` — still shapes the current `case` arm body limitations, including the remaining `-> do ... end` requirement for multiline arm bodies.

> See `.gsd/DECISIONS.md` for all architectural and pattern decisions — it is an append-only register; read it during planning, append to it during execution.

## Relevant Requirements

- R011 — keeps new platform work anchored to real backend dogfood friction
- R013 — requires real Mesh blockers to be fixed in Mesh and then used in mesher
- R035 — requires limitation comments and workaround notes to be truthful and current
- R010 — improves the repo's ability to make honest claims about Mesh through real dogfood evidence

## Scope

### In Scope

- audit `mesher/` limitation comments and workaround-shaped code paths
- reproduce live compiler/runtime/tooling/module-boundary blockers behind those workarounds
- remove or rewrite stale comments and stale workaround structure
- fix the real blockers in Mesh and dogfood the repaired path back into `mesher/`
- leave a verified retained-limit ledger for the gaps that remain and should flow into M033

### Out of Scope / Non-Goals

- broad language-design expansion unrelated to proven mesher blockers
- general ORM or migration feature growth beyond what M032 needs to prove the truth surface
- product redesign in `mesher/`

## Technical Constraints

- `mesher/` should remain behaviorally stable from the product point of view
- the milestone should prefer precise source fixes over wide new language or runtime surface area
- claims about stale vs real limitations must be verified through actual compiler/CLI or dogfood proof, not only through comment audit or grep

## Integration Points

- `mesher/` — the broader dogfood application and the main truth surface for limitation comments
- `compiler/meshc/tests/e2e.rs` — the narrow repro and regression surface for isolated proofs
- parser, typechecker, codegen, runtime, and tooling crates under `compiler/` — the likely fix locations depending on what the audit confirms
- PostgreSQL-backed mesher migration/build flow — the integration proof that the repaired paths survive real app use

## Open Questions

- Which remaining limitation comments collapse to one shared root cause versus several independent bugs? — Current thinking: classify them by proof surface first in S01 before choosing fix slices.
- Is the cross-module inferred export failure a CLI-specific path bug or a broader export/type-scheme bug? — Current thinking: treat it as a live S02 risk until a single root cause is proven.
