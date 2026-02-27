# Requirements: Mesh

**Defined:** 2026-02-25
**Core Value:** Expressive, readable concurrency — writing concurrent programs should feel as natural and clean as writing sequential code, with the safety net of supervision and fault tolerance built into the language.

## v12.0 Requirements

Requirements for v12.0 Language Ergonomics & Open Source Readiness. Each maps to roadmap phases.

### Slot Pipe Operator

- [x] **PIPE-01**: User can write `expr |2> func(a)` to pipe result as second argument (becomes `func(a, expr)`)
- [x] **PIPE-02**: User can write `expr |N>` for any argument position N ≥ 2
- [x] **PIPE-03**: Slot pipes are chainable: `a |2> f(b) |> g()` works correctly
- [x] **PIPE-04**: Type inference validates slot pipe position against function arity with a clear error
- [x] **PIPE-05**: Mesher codebase updated using slot pipe where it improves readability (dogfooding verified)

### Regular Expressions

- [x] **REGEX-01**: User can write regex literals `~r/pattern/` and `~r/pattern/flags` (i, m, s flags)
- [x] **REGEX-02**: User can compile regex at runtime: `Regex.compile(str) -> Result<Regex, String>`
- [x] **REGEX-03**: User can test a match: `Regex.match(rx, str) -> Bool`
- [x] **REGEX-04**: User can extract captures: `Regex.captures(rx, str) -> Option<List<String>>`
- [x] **REGEX-05**: User can replace matches: `Regex.replace(rx, str, replacement) -> String`
- [x] **REGEX-06**: User can split by pattern: `Regex.split(rx, str) -> List<String>`

### String Ergonomics

- [x] **STRG-01**: User can write string interpolation `"Value: #{expr}"` supporting arbitrary expressions
- [x] **STRG-02**: User can write heredoc strings `"""..."""` for multiline content without escape sequences
- [x] **STRG-03**: Heredoc strings support interpolation: `"""{"id": "#{id}"}"""`
- [x] **STRG-04**: User can read env var with default: `Env.get("KEY", "default") -> String`
- [x] **STRG-05**: User can parse env var as integer with default: `Env.get_int("PORT", 8080) -> Int`
- [x] **STRG-06**: Mesher server code updated using new string features (dogfooding verified)

### Mesh Agent Skill

- [x] **SKILL-01**: Mesh language agent skill created in GSD skill format with progressive disclosure
- [x] **SKILL-02**: Skill has a main entry command providing language overview and available sub-topics
- [x] **SKILL-03**: Skill has per-topic deep-dive commands (syntax, types, actors, ORM, HTTP/WS, stdlib, distributed actors)
- [x] **SKILL-04**: Skill registered and usable by AI for all Mesh-related questions without explicit invocation

### Repository Reorganization

- [x] **REPO-01**: Compiler Rust crates moved under `compiler/` directory
- [x] **REPO-02**: Mesher application moved under `mesher/` directory
- [x] **REPO-03**: Documentation website moved under `website/` directory
- [x] **REPO-04**: Install scripts and build tooling moved under `tools/` directory
- [x] **REPO-05**: All CI/CD pipelines (GitHub Actions) updated for new directory structure
- [x] **REPO-06**: All tests pass and Mesher E2E verified after reorganization

### Performance Benchmarks

- [x] **BENCH-01**: Mesh benchmark HTTP server written (JSON endpoint, configurable concurrency)
- [x] **BENCH-02**: Equivalent benchmark server written in Go (net/http or Gin)
- [x] **BENCH-03**: Equivalent benchmark server written in Rust (axum or actix-web)
- [x] **BENCH-04**: Equivalent benchmark server written in Elixir (Plug/Cowboy)
- [x] **BENCH-05**: Benchmarks measure throughput (req/s), p50/p99 latency, and memory usage
- [x] **BENCH-06**: Methodology documented (tool, hardware, concurrency settings) and results published in repo

## Documentation Requirements (Phase 125)

- [ ] **DOC-01**: All public-facing documentation (README.md, landing page, docs pages) accurately reflects v12.0 features using passing e2e tests as source of truth — correct version badge, isolated benchmark numbers, #{} interpolation, slot pipe |N>, heredocs, regex, and env var stdlib documented.

## Future Requirements

### Language Features (v13.0+)

- Multi-line pipe continuation (parser support for `|>` at start of next line)
- TryFrom/TryInto traits (fallible conversion)
- Infinite iterators and iterator fusion optimization
- Type aliases

### Tooling (v13.0+)

- Semantic tokens for LSP
- Workspace symbols
- Tree-sitter grammar
- Homebrew packaging
- Inlay hints

## Out of Scope

| Feature | Reason |
|---------|--------|
| Hot code reloading | Complex runtime integration, not blocking v12.0 goals |
| Distributed ETS / process groups | Runtime feature, separate milestone when needed |
| Atom cache optimization | Performance micro-optimization, not urgent |
| Browser playground (WASM) | Large effort, website milestone |
| Generational GC | Mark-sweep is sufficient, premature optimization |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PIPE-01 | Phase 116 | Complete |
| PIPE-02 | Phase 116 | Complete |
| PIPE-03 | Phase 116 | Complete |
| PIPE-04 | Phase 116 | Complete |
| PIPE-05 | Phase 120 | Complete |
| REGEX-01 | Phase 119 | Complete |
| REGEX-02 | Phase 119 | Complete |
| REGEX-03 | Phase 119 | Complete |
| REGEX-04 | Phase 119 | Complete |
| REGEX-05 | Phase 119 | Complete |
| REGEX-06 | Phase 119 | Complete |
| STRG-01 | Phase 117 | Complete |
| STRG-02 | Phase 117 | Complete |
| STRG-03 | Phase 117 | Complete |
| STRG-04 | Phase 118 | Complete |
| STRG-05 | Phase 118 | Complete |
| STRG-06 | Phase 120 | Complete |
| SKILL-01 | Phase 121 | Complete |
| SKILL-02 | Phase 121 | Complete |
| SKILL-03 | Phase 121 | Complete |
| SKILL-04 | Phase 121 | Complete |
| REPO-01 | Phase 122 | Complete |
| REPO-02 | Phase 122 | Complete |
| REPO-03 | Phase 122 | Complete |
| REPO-04 | Phase 122 | Complete |
| REPO-05 | Phase 122 | Complete |
| REPO-06 | Phase 122 | Complete |
| BENCH-01 | Phase 123 | Complete |
| BENCH-02 | Phase 123 | Complete |
| BENCH-03 | Phase 123 | Complete |
| BENCH-04 | Phase 123 | Complete |
| BENCH-05 | Phase 123 | Complete |
| BENCH-06 | Phase 123 | Complete |

**Coverage:**
- v12.0 requirements: 33 total
- Mapped to phases: 33
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-25*
*Last updated: 2026-02-25 after v12.0 roadmap creation (phases 116-123)*
