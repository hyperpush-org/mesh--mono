# Project

## What This Is

Mesh is a programming language and application platform repository focused on becoming a production-trustworthy general-purpose language with a lean toward server/backend code. It already contains the compiler, runtime, standard library, formatter, LSP, REPL, package tooling, registry, docs site, benchmarks, and dogfooded applications. The current priority is fixing syntax rough edges and DX friction discovered through real backend dogfooding, then cleaning up both dogfood codebases to use idiomatic Mesh.

## Core Value

Mesh should be something you can trust for a real production app backend in any capacity, starting with an honest API + DB + migrations + background jobs path that feels as easy to deploy as a Go binary.

## Current State

The repository ships a broad backend-oriented language platform:
- Rust workspace crates for lexing, parsing, type checking, code generation, runtime, formatter, LSP, REPL, package resolution, and CLI tooling
- native LLVM code generation to standalone binaries
- runtime support for actors, supervision, HTTP, WebSocket, JSON, database access, migrations, files, env, crypto, datetime, and collections
- package and registry infrastructure plus a docs/website surface
- dogfooded backend applications: `reference-backend/` (API + DB + jobs) and `mesher/` (error monitoring platform)

M028 established the backend trust baseline with recovery proof, deployment proof, tooling trust, and documentation. M031 fixed syntax rough edges and bad DX patterns discovered through dogfooding: S01 fixed three compiler bugs (trailing-closure disambiguation, else-if chain values, multiline fn call types), S02 added multiline imports and trailing commas, S03–S04 cleaned both dogfood codebases to idiomatic Mesh, and S05 expanded e2e test coverage to 328 tests covering all 12 pattern categories from R025. All M031 slices are complete.

## Architecture / Key Patterns

- Rust workspace under `compiler/` with distinct crates for lexer, parser, type checker, codegen, runtime, formatter, LSP, REPL, package tooling, and CLI
- native-binary compilation via LLVM rather than a VM runtime requirement
- runtime centered on actors, supervision, HTTP, WebSocket, DB, migrations, and other backend primitives
- dogfooding through `reference-backend/` and `mesher/`
- proof-first rule: if a language limitation blocks the app, fix Mesh at the source and prove it through a real backend workflow

## Capability Contract

See `.gsd/REQUIREMENTS.md` for the explicit capability contract, requirement status, and coverage mapping.

## Milestone Sequence

- [ ] M028: Language Baseline Audit & Hardening — slice work landed, closure blocked by serial recovery-proof instability
- [ ] M029: Backend Ergonomics — improve the language/runtime/DX where real backend pressure exposes friction
- [ ] M030: Tooling & Package Trust — make fmt/LSP/tests/coverage/dependency flow credible for daily backend work
- [ ] M031: Language DX Audit & Rough Edge Fixes — fix parser/codegen bugs, clean up dogfood code, expand test coverage
