# Project

## What This Is

Mesh is a programming language and backend application platform repository aimed at being trustworthy for real backend work, not just toy examples. The repo contains the compiler, runtime, formatter, LSP, REPL, package tooling, docs site, and two dogfood applications: `reference-backend/` as the narrow proof surface and `mesher/` as the broader pressure test.

## Core Value

Dogfood friction should turn into honest platform improvements: when Mesh or its data layer hits a real backend limitation, the repo should fix that limitation in Mesh and then use the repaired path in the app instead of carrying permanent folklore workarounds.

## Current State

Mesh already ships a broad backend-oriented stack:
- Rust workspace crates under `compiler/` for lexing, parsing, type checking, code generation, runtime, formatter, LSP, REPL, package tooling, and CLI commands
- native compilation to standalone binaries
- runtime support for actors, supervision, HTTP, WebSocket, JSON, database access, migrations, files, env, crypto, datetime, and collections
- dogfooded applications: `reference-backend/` and `mesher/`

Recent milestone state:
- M028 established the production-backend trust baseline around API + DB + migrations + jobs
- M029 completed the major formatter correctness and dogfood cleanup wave across `mesher/` and `reference-backend/`
- M031 fixed several real DX/compiler rough edges found through dogfooding and expanded the regression suite
- M032/S02 retired the unconstrained inferred-export blocker by threading concrete call-site signatures into MIR lowering, replaying `xmod_identity` as a success path, and dogfooding the repaired export via `mesher/storage/writer.mpl`
- M032/S03 retired the stale request/handler/control-flow folklore in the audited `mesher/` modules by dogfooding direct `Request.query(...)`, inline service-call `case`, and inline cast-handler `if/else`, while preserving the real route-closure, nested-`&&`, and timer keep-sites
- M032/S04 retired the stale module-boundary `from_json` folklore in Mesher's event ingestion/storage comments, kept the real PostgreSQL JSONB/ORM keep-sites explicit, and revalidated the supported cross-module `from_json` path plus Mesher fmt/build on the cleaned codebase
- M032/S05 replayed the full Mesher proof matrix, closed the supported-now versus retained-limit ledger, and left a short file-backed keep-list for the remaining Mesh and data-layer pressure sites
- M032/S06 backfilled the missing S01 acceptance artifact, reran the live S01 proof bundle with non-zero test-count guards, and closed the last milestone evidence gap so M032 now seals cleanly
- M032 is now fully closed through `.gsd/milestones/M032/M032-SUMMARY.md`, which records the compiler repair, the Mesher dogfood cleanup, and the three-bucket handoff into M033 (supported-now proof, still-real Mesh keep-sites, and real data-layer follow-on work)

The next planned work is M033:
1. S01 has now landed the neutral expression/runtime/compiler plumbing plus Mesher write-path rewrites for `revoke_api_key`, `assign_issue`, `acknowledge_alert`, `resolve_fired_alert`, `update_project_settings`, and `upsert_issue`, but the slice closeout still records a live Mesher HTTP-readiness blocker in the new `e2e_m033_s01` harness.
2. finish the blocked S01 acceptance rerun, then continue with explicit PG extras around the recurring `mesher/storage/queries.mpl` and `mesher/storage/writer.mpl` ORM boundary families
3. cover the retained migration/DDL gap anchored by the `PARTITION BY` note while keeping a clean path for SQLite-specific extras later

## Architecture / Key Patterns

- Rust workspace under `compiler/` with separate crates for parser, type checker, codegen, runtime, formatter, LSP, CLI, REPL, and package tooling
- backend-first proof surfaces through `reference-backend/` and `mesher/`
- Mesh data access built around `Repo`, `Query`, and `Migration` runtime surfaces
- proof-first dogfooding: reproduce a real app limitation, fix Mesh at the source, then dogfood the repaired path back into the app
- keep the default surface boring and composable; use database-specific extras explicitly when the underlying behavior is genuinely vendor-specific

## Capability Contract

See `.gsd/REQUIREMENTS.md` for the explicit capability contract, requirement status, and coverage mapping.

## Milestone Sequence

- [x] M028: Language Baseline Audit & Hardening — prove the first honest API + DB + migrations + jobs backend path
- [x] M029: Mesher & Reference-Backend Dogfood Completion — fix formatter corruption and complete the dogfood cleanup wave
- [ ] M030: Tooling & Package Trust — make package, dependency, and daily-driver tooling flow credible for backend work
- [x] M031: Language DX Audit & Rough Edge Fixes — retire real dogfood rough edges through compiler and parser fixes
- [x] M032: Mesher Limitation Truth & Mesh Dogfood Retirement — audit workaround folklore, fix real blockers in Mesh, and dogfood those repairs back into `mesher/`
- [ ] M033: ORM Expressiveness & Schema Extras — strengthen the neutral data layer, add PG-first extras now, and leave a clean path for SQLite extras later
