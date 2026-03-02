# Mesh

## What This Is

Mesh is a programming language that combines Elixir/Ruby-style expressive syntax with static Hindley-Milner type inference and BEAM-style concurrency (actors, supervision trees, fault tolerance), compiled via LLVM to native single-binary executables. The compiler is written in Rust. v1.0-v1.9 built a complete language: compiler pipeline, actor runtime, trait system, module system, loops, stdlib, and developer tooling. v2.0 added database drivers and JSON serde. v3.0 made Mesh production-ready: TLS, connection pooling, transactions, deriving(Row). v4.0 added WebSocket support with actor-per-connection model. v5.0 added distributed actors with location-transparent PIDs and TLS-encrypted node clustering. v6.0 added a documentation website. v7.0 added a comprehensive trait ecosystem (iterators, From/Into, numeric traits, Collect). v8.0 made Mesh installable with one-command install scripts, VS Code extension, and LSP. v9.0 shipped Mesher, a production error-monitoring backend (~4,441 lines of Mesh). v10.0 added a full ORM. v11.0 expanded the ORM with comprehensive query builder capabilities and rewrote all Mesher data queries. v12.0 added language ergonomics: slot pipe operator (`|N>`), string interpolation (`#{expr}`), heredoc strings, regex literals, typed env var stdlib, Mesh agent skill, repository reorganization, and published performance benchmarks (29,108 req/s — within 4% of Go). v13.0 completed the language's expressiveness: multi-line pipe continuation, type aliases (cross-module), TryFrom/TryInto traits, Map.collect string keys, native `json { }` object literals, VS Code extension v0.3.0, and full documentation. v14.0 shipped a complete ecosystem: Crypto/Encoding/DateTime stdlib, HTTP client fluent builder API with streaming and keep-alive, `meshc test` testing framework with mock actors, meshpkg CLI + hosted package registry (Fly.io + Cloudflare R2), dogfooded in Mesher, automated CI/CD on tag push, and a production-grade redesign of packages.meshlang.dev with Tailwind CSS v4 + OKLCH. v15.0 validated the end-to-end package manager workflow: built, published, and consumed a real Mesh package (`mesh-slug`) in production, integrating it into Mesher for slug auto-generation. ~132,524+ total LOC across 25 milestones. Zero known compiler correctness issues.

## Current Milestone: Planning Next

v15.0 shipped 2026-03-02. Planning next milestone.

## Current State

Shipped v15.0 Package Dogfood (2026-03-02). 25 milestones complete, 148 phases, 401 plans.

**Latest milestone (v15.0):** Built `mesh-slug` pure-Mesh library (4 functions, 26 tests). Fixed meshpkg tarball + discovery.rs scoped package layout. Published `snowdamiz/mesh-slug@1.0.0` to live registry. E2E verified install+use with consumer project. Integrated into Mesher: `insert_org` auto-generates org slugs via `Slug.slugify`. 13/13 requirements satisfied. 55 files, +4,239 lines.

## Core Value

Expressive, readable concurrency -- writing concurrent programs should feel as natural and clean as writing sequential code, with the safety net of supervision and fault tolerance built into the language.

## Requirements

### Validated

- ✓ Elixir/Ruby-style syntax (do/end blocks, pattern matching, keyword-based, minimal punctuation) -- v1.0
- ✓ Static type system with Hindley-Milner inference (rarely write type annotations) -- v1.0
- ✓ BEAM-style concurrency: lightweight actor processes with typed message passing -- v1.0
- ✓ Supervision trees with let-it-crash fault tolerance -- v1.0
- ✓ LLVM backend producing native single-binary executables (runtime bundled) -- v1.0
- ✓ Functional-first paradigm (no classes, no OOP hierarchies) -- v1.0
- ✓ General purpose -- suitable for web backends/APIs and CLI tools -- v1.0
- ✓ Pattern matching as a core language feature with exhaustiveness checking -- v1.0
- ✓ Standard library sufficient for HTTP servers and file I/O -- v1.0
- ✓ Developer tooling: formatter, REPL, package manager, LSP server -- v1.0
- ✓ Multi-clause function definitions with guard clauses and exhaustiveness warnings -- v1.1
- ✓ String comparison in pattern matching (compile-time string matching via snow_string_eq) -- v1.1
- ✓ Pipe operator with inline closures (full closure rewrite + pipe-aware type inference) -- v1.1
- ✓ Actor-per-connection HTTP server with catch_unwind crash isolation -- v1.1
- ✓ Generic map types Map<K, V> with string keys and map literal syntax -- v1.1
- ✓ Fun() type annotation parsed as function type instead of type constructor -- v1.2
- ✓ Mark-sweep garbage collector for per-actor heaps (replacing arena/bump allocation) -- v1.2
- ✓ User-defined interface definitions with method signatures and default implementations -- v1.3
- ✓ impl blocks to implement interfaces for concrete types with static dispatch via monomorphization -- v1.3
- ✓ Where clauses working with user-defined traits (TraitNotSatisfied enforcement) -- v1.3
- ✓ Trait-based operator overloading for user types (all 6 comparison operators via Eq/Ord) -- v1.3
- ✓ Stdlib protocols: Display, Debug, Eq, Ord, Hash, Default -- v1.3
- ✓ Auto-derive: deriving(Eq, Ord, Display, Debug, Hash) from struct/sum-type metadata -- v1.3
- ✓ Collection Display/Debug for List, Map, Set -- v1.3
- ✓ Sum type constructor pattern matching extracts field values in LLVM codegen -- v1.4
- ✓ Ordering sum type (Less | Equal | Greater) user-visible with compare() via Ord trait -- v1.4
- ✓ Nested collection Display renders recursively with synthetic MIR wrapper callbacks -- v1.4
- ✓ Generic types support auto-derive with monomorphization-aware trait impl registration -- v1.4
- ✓ Higher-order constrained functions preserve trait constraints when captured as values -- v1.4
- ✓ Polymorphic List<T> -- lists work with any element type (String, Bool, structs, nested lists) -- v1.5
- ✓ List trait integration -- Display/Debug/Eq/Ord work for List<T> via callback dispatch -- v1.5
- ✓ Cons pattern destructuring -- head :: tail pattern matching for all list element types -- v1.5
- ✓ Compile-time trait deriving safety -- Ord without Eq emits E0029 error with suggestion -- v1.5
- ✓ Qualified types -- trait constraints propagate through higher-order function arguments -- v1.5
- ✓ Method dot-syntax: `expr.method(args)` resolves impl block methods for receiver type -- v1.6
- ✓ Self-parameter desugaring: receiver passed as first argument automatically -- v1.6
- ✓ Chained method calls: `expr.method1().method2()` -- v1.6
- ✓ Trait method dot-syntax: trait methods callable via dot on implementing types -- v1.6
- ✓ Generic method resolution: dot syntax works with monomorphized generic types -- v1.6
- ✓ While loops (`while condition do body end`) with break/continue and loop-depth tracking -- v1.7
- ✓ For-in over ranges (`for i in 0..10 do body end`) with zero-allocation integer arithmetic -- v1.7
- ✓ For-in over collections (List, Map with destructuring, Set) with indexed iteration -- v1.7
- ✓ Comprehension semantics: for-in returns `List<T>` of collected body results -- v1.7
- ✓ Filter clause (`for x in list when cond do body end`) across all collection types -- v1.7
- ✓ Break/continue: early exit returns partial list, closure boundary enforcement (E0032/E0033) -- v1.7
- ✓ Reduction checks at loop back-edges for actor scheduler fairness -- v1.7
- ✓ File-based modules with recursive discovery and path-to-name convention (math/vector.snow -> Math.Vector) -- v1.8
- ✓ Module dependency graph with Kahn's toposort and circular import detection -- v1.8
- ✓ Multi-file build pipeline (`snowc build <dir>`) with per-module parsing and zero regressions -- v1.8
- ✓ Qualified imports (`import M` -> `M.fn()`) and selective imports (`from M import { fn }`) -- v1.8
- ✓ Cross-module type checking for functions, structs, sum types, and traits -- v1.8
- ✓ Private-by-default visibility with `pub` modifier and PrivateItem error with suggestion -- v1.8
- ✓ Global trait impl visibility across all modules without explicit import -- v1.8
- ✓ Cross-module generic monomorphization and module-qualified name mangling -- v1.8
- ✓ Module-aware diagnostics: file paths in errors and module-qualified type names -- v1.8
- ✓ Full backward compatibility: single-file programs compile identically -- v1.8
- ✓ Math stdlib: abs, min, max, pow, sqrt, floor, ceil, round, pi via LLVM intrinsics -- v1.9
- ✓ Int/Float type conversion: Int.to_float(x) and Float.to_int(x) -- v1.9
- ✓ ? operator for Result<T,E> error propagation with early return -- v1.9
- ✓ ? operator for Option<T> error propagation with early return -- v1.9
- ✓ Compiler error (E0036/E0037) when ? used in incompatible function -- v1.9
- ✓ Receive timeout: `receive { ... } after ms -> body` with type-checked timeout arm -- v1.9
- ✓ Timer.sleep(ms) for cooperative actor suspension -- v1.9
- ✓ Timer.send_after(pid, ms, msg) for delayed message delivery -- v1.9
- ✓ List operations: sort, find, any, all, contains, zip, flat_map, flatten, enumerate, take, drop -- v1.9
- ✓ String operations: split, join, to_int, to_float -- v1.9
- ✓ Map operations: merge, to_list, from_list -- v1.9
- ✓ Set operations: difference, to_list, from_list -- v1.9
- ✓ Self-recursive tail-call elimination: constant stack space for 1M+ iterations -- v1.9
- ✓ Tail position detection through if/else, case, receive, blocks, let-chains -- v1.9
- ✓ JSON struct serde with `deriving(Json)` for automatic encode/decode -- v2.0
- ✓ JSON handles nested structs, Option, List, Map fields with type-safe round-trip -- v2.0
- ✓ JSON sum type serde as tagged unions (`{"tag":"V","fields":[...]}`) -- v2.0
- ✓ JSON generic struct serde via monomorphization -- v2.0
- ✓ Compile error (E0038) when `deriving(Json)` on struct with non-serializable field -- v2.0
- ✓ Int/Float JSON round-trip fidelity (separate tags) -- v2.0
- ✓ HTTP path parameters (`/users/:id`) with segment-based matching and Request.param extraction -- v2.0
- ✓ HTTP method-specific routing (on_get/on_post/on_put/on_delete) with three-pass priority -- v2.0
- ✓ HTTP middleware pipeline with `HTTP.use(router, fn)`, next function, and registration-order composition -- v2.0
- ✓ SQLite driver: open/close/query/execute with `?` parameterized queries, bundled (zero system deps) -- v2.0
- ✓ PostgreSQL driver: connect/close/query/execute with `$1` parameterized queries, pure wire protocol -- v2.0
- ✓ PostgreSQL SCRAM-SHA-256 and MD5 authentication -- v2.0
- ✓ Database handles are GC-safe opaque u64 values -- v2.0
- ✓ PostgreSQL TLS via SSLRequest with sslmode=disable/prefer/require -- v3.0
- ✓ PgStream enum (Plain/Tls) with Read+Write abstraction for transparent encryption -- v3.0
- ✓ rustls 0.23 with ring crypto provider and webpki-roots CA certificates -- v3.0
- ✓ Ring CryptoProvider installed at runtime startup for all TLS consumers -- v3.0
- ✓ HTTPS server via Http.serve_tls(router, port, cert_path, key_path) -- v3.0
- ✓ Hand-rolled HTTP/1.1 parser replacing tiny_http for unified TLS stack -- v3.0
- ✓ Connection pool with configurable min/max connections and checkout timeout -- v3.0
- ✓ Pool checkout/checkin with health check (SELECT 1) and dirty connection cleanup -- v3.0
- ✓ Pool.query/Pool.execute with automatic checkout-use-checkin -- v3.0
- ✓ Pool.close drains connections and prevents new checkouts -- v3.0
- ✓ Opaque u64 pool handles (GC-safe, same pattern as DB connections) -- v3.0
- ✓ Pg.begin/commit/rollback for manual PostgreSQL transaction control -- v3.0
- ✓ Sqlite.begin/commit/rollback for manual SQLite transaction control -- v3.0
- ✓ PgConn tracks transaction status byte from ReadyForQuery (I/T/E) -- v3.0
- ✓ Pg.transaction(conn, fn) with automatic commit on success, rollback on error -- v3.0
- ✓ Pg.transaction rollbacks on panic via catch_unwind -- v3.0
- ✓ deriving(Row) generates from_row function for struct-to-row mapping -- v3.0
- ✓ from_row maps Map<String,String> to typed struct fields (String, Int, Float, Bool, Option) -- v3.0
- ✓ from_row returns Result<T,String> with descriptive error on missing column or parse failure -- v3.0
- ✓ NULL columns map to None for Option fields, error for non-Option fields -- v3.0
- ✓ Pg.query_as/Pool.query_as for one-step query and struct hydration -- v3.0
- ✓ Compile error (E0039) when deriving(Row) on struct with non-mappable field type -- v3.0
- ✓ WebSocket server with actor-per-connection model (Ws.serve, crash isolation via catch_unwind) -- v4.0
- ✓ RFC 6455 protocol implementation (HTTP upgrade handshake, frame parsing, XOR masking, close handshake) -- v4.0
- ✓ Unified messaging: WS text/binary frames arrive in actor mailbox via receive with reserved type tags -- v4.0
- ✓ Callback API (on_connect with reject, on_message, on_close with close code) -- v4.0
- ✓ Text and binary frame support with UTF-8 validation -- v4.0
- ✓ TLS (wss://) via WsStream enum reusing rustls 0.23 infrastructure -- v4.0
- ✓ Rooms/channels with Ws.join/leave/broadcast/broadcast_except and automatic disconnect cleanup -- v4.0
- ✓ Ping/pong heartbeat (30s interval, 10s timeout) with dead connection detection and fragment reassembly (16 MiB limit) -- v4.0
- ✓ Location-transparent PIDs with 16-bit node_id bit-packing in u64 and branch-free locality check -- v5.0
- ✓ Snow Term Format (STF) binary wire protocol serializing all Snow types with version byte and round-trip fidelity -- v5.0
- ✓ Node naming, TLS-encrypted connections with HMAC-SHA256 cookie auth, and heartbeat dead connection detection -- v5.0
- ✓ Automatic mesh formation via peer list exchange on node connect -- v5.0
- ✓ Transparent remote send: `send(pid, msg)` routes to remote node automatically, `send({name, node}, msg)` for named processes -- v5.0
- ✓ Remote process monitoring (`Process.monitor`) delivering `:down` on crash or net split -- v5.0
- ✓ Node monitoring (`Node.monitor`) delivering `:nodedown`/`:nodeup` events -- v5.0
- ✓ Remote links with bidirectional exit signal propagation across nodes -- v5.0
- ✓ Remote spawn via function name registry: `Node.spawn(node, function, args)` and `Node.spawn_link` -- v5.0
- ✓ Global process registry: `Global.register/whereis/unregister` with cluster-wide broadcast and auto-cleanup -- v5.0
- ✓ Cross-node WebSocket room broadcast via DIST_ROOM_BROADCAST wire message -- v5.0
- ✓ Remote supervision: supervision trees can monitor and restart children on remote nodes -- v5.0
- ✓ Mesh website with landing page, 9 documentation guides, custom syntax highlighting, search, SEO -- v6.0
- ✓ Associated types in traits (`type Item`, `Self.Item`) with HM inference integration -- v7.0
- ✓ Iterator/Iterable two-trait protocol with built-in implementations for List, Map, Set, Range -- v7.0
- ✓ Lazy iterator pipeline composition (map, filter, take, skip, enumerate, zip) with short-circuit evaluation -- v7.0
- ✓ Terminal operations (count, sum, any, all, find, reduce) for consuming iterators -- v7.0
- ✓ From/Into conversion traits with automatic Into generation and ? operator error type conversion -- v7.0
- ✓ Numeric traits (Add, Sub, Mul, Div, Neg) with Output associated type for user-extensible arithmetic -- v7.0
- ✓ Collect trait for iterator materialization into List, Map, Set, String -- v7.0
- ✓ Website documentation updated with all v7.0 features (Iterators page, Type System, Cheatsheet, Language Basics) -- v7.0
- ✓ Install script with prebuilt binaries for macOS and Linux (6-target CI pipeline, curl|sh one-liner) -- v8.0
- ✓ VS Code extension grammar updated for all language features through v7.0 (TextMate + Shiki themes) -- v8.0
- ✓ LSP code completion, document symbols, signature help, formatting -- v8.0
- ✓ REPL and formatter compatibility with v7.0 features (80+ JIT symbol registrations) -- v8.0
- ✓ Website and docs corrections (install instructions, version badge, terminology, binary name) -- v8.0
- ✓ VS Code extension published to Marketplace and Open VSX (18KB VSIX, 0.2.0) -- v8.0
- ✓ ORM: Schema DSL for model definition with field types and options -- v10.0
- ✓ ORM: Pipe-chain query builder with where, order_by, limit, offset, select -- v10.0
- ✓ ORM: Full relationships (belongs_to, has_many, has_one, many-to-many) -- v10.0
- ✓ ORM: Eager loading / preloading with nested relationship support -- v10.0
- ✓ ORM: Migration tooling (generate, run up/down, track applied) -- v10.0
- ✓ ORM: Repo pattern (insert, update, delete, all, get, get_by) -- v10.0
- ✓ ORM: Changesets for validation and casting -- v10.0
- ✓ ORM: Compiler additions for ORM expressiveness (atoms, keyword args, multi-line pipes, struct update syntax) -- v10.0
- ✓ Codegen: Struct-in-Result pointer-boxing for correct ABI across service calls -- v10.1
- ✓ Query builder: Advanced WHERE operators (>, <, !=, IN, NOT IN, IS NULL, BETWEEN, LIKE, ILIKE, OR grouped) -- v11.0
- ✓ Query builder: Raw SQL fragments (Query.fragment) with $N renumbering for PG-specific expressions (crypt, JSONB, FTS) -- v11.0
- ✓ Query builder: JOIN support (inner, left, aliased, multi-table) with on-clause expressions -- v11.0
- ✓ Query builder: Aggregations (count, sum, avg, min, max) with group_by and having -- v11.0
- ✓ Query builder: Upsert (INSERT ON CONFLICT DO UPDATE) via Repo.insert_or_update -- v11.0
- ✓ Query builder: RETURNING clause via Repo.delete_where_returning -- v11.0
- ✓ Query builder: Subquery support in WHERE IN via Query.where_sub -- v11.0
- ✓ Mesher rewrite: zero Repo.query_raw/execute_raw for data queries (49+ rewrites, 18 documented boundaries) -- v11.0
- ✓ Mesher verification: all 8 HTTP API domains return 2xx, WebSocket 101, EventProcessor SIGSEGV resolved -- v11.0
- ✓ Slot pipe operator (`|N>`) with type-checked argument routing to any position — v12.0
- ✓ String interpolation (`#{expr}`) and heredoc strings (`"""..."""`) with full expression support — v12.0
- ✓ Regular expression literals (`~r/pattern/flags`) and runtime `Regex.compile` with full API — v12.0
- ✓ Typed env var stdlib: `Env.get("KEY", "default")` and `Env.get_int("PORT", 8080)` — v12.0
- ✓ Mesh agent skill with 10 progressive-disclosure sub-skills for AI-assisted development — v12.0
- ✓ Repository reorganized for open source: compiler/, mesher/, website/, tools/ top-level structure — v12.0
- ✓ Performance benchmarks published: Mesh 29,108 req/s (within 4% of Go, 2.3× faster than Elixir) — v12.0
- ✓ Developer seed migration: default org/project/API key created by `meshc migrate up` — v12.0
- ✓ Public documentation updated to v12.0 (README, landing page, cheatsheet, guides) — v12.0
- ✓ Multi-line pipe continuation: `|>` at end-of-line or start-of-continuation, semantically equivalent to single-line — v13.0
- ✓ Type aliases: `type Alias = ExistingType` locally and `pub type Alias = ExistingType` for cross-module export; transparent unification; ALIAS-04 undefined-type error — v13.0
- ✓ TryFrom/TryInto traits: user-defined fallible conversions with automatic TryInto derivation and `?` operator ergonomics — v13.0
- ✓ Map.collect for string keys: `Iter.zip` string-key dispatch fix; `collect()` on `{String, V}` pairs produces `Map<String, V>` — v13.0
- ✓ Zero-warning compiler build: all 3 pre-existing warnings resolved; `cargo build --all` clean — v13.0
- ✓ Native `json { }` object literals: full compiler pipeline (lexer→parser→AST→typeck→MIR→codegen); replaces manual string escaping for JSON — v13.0
- ✓ VS Code extension v0.3.0: updated grammar (m10-m13 syntax forms), LSP completions (49 keywords), type alias and json snippets, packaged VSIX — v13.0
- ✓ Documentation fully current: cheatsheet, language-basics, type-system guide, web docs, and AI agent skills updated with all v13.0 features — v13.0
- ✓ Crypto stdlib: SHA-256, SHA-512, HMAC-SHA256/SHA512, UUID v4, secure_compare — v14.0
- ✓ Encoding stdlib: Base64 (standard + URL-safe), Hex encode/decode — v14.0
- ✓ DateTime stdlib: utc_now, from/to iso8601, from/to unix, add, diff, is_before/is_after — v14.0
- ✓ HTTP client fluent builder API: Http.build/header/body/timeout/query/json/send — v14.0
- ✓ HTTP client streaming via OS-thread-per-stream (Http.stream) without buffering full body — v14.0
- ✓ HTTP keep-alive client handle: Http.client() + Http.send_with(client, req) — v14.0
- ✓ Testing framework: `meshc test` runner with `*.test.mpl` discovery, per-file compile+execute — v14.0
- ✓ Testing: assert/assert_eq/assert_ne/assert_raises assertion helpers — v14.0
- ✓ Testing: describe/setup/teardown blocks with group name in failure output — v14.0
- ✓ Testing: Test.mock_actor for concurrency testing, assert_receive with timeout — v14.0
- ✓ Testing: --coverage flag (stub; full MIR counter injection deferred to v14.1) — v14.0
- ✓ Package manifest: mesh.toml format with [package] and [dependencies] sections, mesh.lock lockfile — v14.0
- ✓ meshpkg CLI: login, publish, install, search subcommands with SHA-256 verification — v14.0
- ✓ Package Registry: Axum+Postgres+Cloudflare R2, GitHub OAuth, argon2 token management, tsvector FTS — v14.0
- ✓ Hosted packages site: browse, search, per-package README + version history; redesigned with Tailwind CSS v4 + OKLCH — v14.0
- ✓ Mesher dogfooded: Crypto.uuid4() replaces pgcrypto, mesh.toml package manifest, unit tests via meshc test — v14.0
- ✓ CI/CD: tag push auto-deploys registry + packages site to Fly.io + docs to GitHub Pages with health checks — v14.0
- ✓ Slug library: `Slug.slugify`, `Slug.slugify_with_sep`, `Slug.truncate`, `Slug.is_valid` with 26 `meshc test` tests — v15.0
- ✓ Package distribution: `mesh.toml` manifest, `meshpkg publish`, registry discoverability, `meshpkg install` — v15.0
- ✓ End-to-end package workflow: real package (`mesh-slug`) published, installed, imported, and used in Mesher production code — v15.0

### Active

<!-- Next milestone requirements — defined via /gsd:new-milestone -->

### Out of Scope

- Classes and OOP -- functional-first design, use structs/traits/protocols instead
- Systems programming (drivers, embedded, OS-level) -- not targeting bare-metal performance
- GUI framework -- web and CLI are the primary targets
- Self-hosting compiler -- Rust is the compiler language, bootstrapping is not a v1 goal
- Ad-hoc operator overloading -- trait-based overloading (impl Add for T) is supported; arbitrary symbol overloading is not
- Shared mutable state between actors -- defeats actor model, causes data races
- Null/nil values -- Option<T> is the only way to represent absence
- Exceptions (try/catch/throw) -- Result<T,E> + let-it-crash philosophy replaces them
- Async/await colored functions -- runtime handles concurrency transparently
- Inheritance -- functional paradigm uses composition + traits instead
- Manual memory management -- per-actor GC handles this
- Generational GC -- mark-sweep sufficient for now; generational optimization is future work
- Concurrent/incremental GC -- per-actor isolation means pauses only affect one actor
- Compacting GC -- mark-sweep with free-list is sufficient
- Dynamic dispatch / vtables / trait objects -- use sum types instead; static dispatch via monomorphization
- Higher-kinded types (Functor/Monad) -- out of language philosophy
- Specialization (overlapping impls) -- unsound without careful design; not planned
- UFCS (any function callable via dot) -- pipe operator covers this use case; UFCS blurs method/function distinction
- Auto-ref/auto-deref on receiver -- Snow has no references; all values are value-typed
- Method overloading by parameter count -- Snow does not support function overloading
- Extension methods without traits -- breaks coherence; use pipe + module functions instead

## Context

Shipped v15.0 with ~132,524+ total LOC (Rust + Mesh + website source).
Tech stack: Rust compiler, LLVM 21 (Inkwell 0.8), corosensei coroutines, rowan CST, ariadne diagnostics.
ORM/DB: mesh-orm crate (schema DSL, repo, query builder, changesets, relationships, migrations), libsqlite3-sys (bundled), PostgreSQL pure wire protocol.
Website: VitePress, Vue 3, Tailwind CSS v4, shadcn-vue, Shiki syntax highlighting.
Packages site: SvelteKit + adapter-node + Tailwind CSS v4 + OKLCH design system, deployed to Fly.io.
Registry: Axum 0.8, SQLx (runtime queries), Postgres, Cloudflare R2 (S3-compatible), GitHub OAuth, argon2 token hashing, tsvector FTS.
Crates (under compiler/): mesh-lexer, mesh-parser, mesh-typeck, mesh-mir, mesh-codegen, mesh-rt, mesh-fmt, mesh-repl, mesh-pkg, mesh-lsp, mesh-orm, meshc.
New in v15.0: mesh-slug/ (first published Mesh package), mesher now a registry consumer (mesh.toml + mesh.lock + .mesh/packages/), scoped package install layout ({owner}/{name}@{version}/).
Distribution: GitHub Actions CI (6 targets), install scripts (POSIX + PowerShell), VS Code Marketplace + Open VSX (v0.3.0). Tag push auto-deploys all services.
Repository structure: compiler/ (Rust crates), mesher/ (production app + frontend), website/ (docs site), packages-website/ (SvelteKit packages site), registry/ (Axum registry backend), tools/ (install scripts, CI helpers, VS Code extension), skill/ (AI agent skills), benchmarks/ (perf comparison servers), mesh-slug/ (published Mesh package).
Mesher (~4,441+ lines of Mesh): production error-monitoring backend; uses Crypto.uuid4() for token generation; declared as Mesh package via mesh.toml; uses mesh-slug for org slug auto-generation; has unit tests via meshc test.
Benchmarks: Mesh 29,108 req/s (isolated /text), Go 30,306, Rust 46,244, Elixir 12,441. Methodology in benchmarks/.

Zero known critical bugs. Zero known compiler correctness issues. All 25 milestones shipped.

Known limitations: None.

Tech debt (minor, pre-existing):
- List.find Option return pattern matching triggers LLVM verification error with case expression (pre-existing codegen gap)
- Timer e2e tests flake under high parallelism (5s timeout too tight when CPU-contended; pass with --test-threads=1)
- Pre-existing TODO in lower.rs:5947 for string comparison callback
- Passthrough middleware (`next(request)` body only) still requires `:: Request` annotation — HM let-generalization prevents type variable resolution without accessor calls (QUAL-02 scope limitation, documented)
- PostgreSQL E2E test requires external server, marked `#[ignore]`
- send_dist_unlink marked dead_code since snow_actor_unlink not yet exposed as extern C
- TyVar from Ptr->List<T> remains unresolved for .to_string() on collected collections (use string interpolation instead)
- TEST-10 coverage: --coverage flag stub only; full MIR counter injection deferred to v14.1

## Constraints

- **Compiler language**: Rust -- chosen for safety, LLVM ecosystem (inkwell), and compiler development ergonomics
- **Compilation target**: LLVM IR -- enables native binaries across platforms without writing multiple backends
- **No OOP**: Functional paradigm only -- structs, traits/protocols, pattern matching. No class hierarchies.
- **Runtime**: Actor runtime bundled into the binary. Lightweight enough to not bloat small CLI tools.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Rust for compiler | Strong LLVM bindings, memory safe, good for complex software | ✓ Good -- 76K LOC Rust, stable compiler |
| LLVM as backend | Proven codegen, multi-platform, avoids writing own backend | ✓ Good -- native binaries on macOS/Linux |
| Elixir/Ruby syntax style | Expressive, readable, pattern matching native | ✓ Good -- clean do/end blocks, pipe operator |
| Static types with HM inference | Safety without verbosity | ✓ Good -- rarely need annotations |
| No OOP | Functional-first aligns with actor model | ✓ Good -- simpler language, structs+traits sufficient |
| Bundled runtime | Single binary deployment like Go | ✓ Good -- self-contained executables |
| Angle brackets <T> for generics | Disambiguates from list syntax | ✓ Good -- migrated from [T] in Phase 3 |
| corosensei for coroutines | M:N scheduling without OS threads per actor | ✓ Good -- 100K actors in ~2.78s |
| Rowan for CST | Lossless syntax tree, editor tooling support | ✓ Good -- powers formatter and LSP |
| Actor-per-connection HTTP | Crash isolation, lightweight, uses existing actor runtime | ✓ Good -- v1.1, replaced threads with actors |
| Mark-sweep GC for actor heaps | Arena/bump allocation caused unbounded growth in long-running actors | ✓ Good -- v1.2, bounded memory validated |
| Lazy key_type tagging for Maps | HM let-generalization prevents type resolution at Map.new() | ✓ Good -- runtime dispatch at put/get sites |
| Pipe-aware type inference | infer_pipe handles CallExpr RHS, prepends lhs_ty before arity check | ✓ Good -- enables pipe+closure chains |
| panic!() instead of abort() | catch_unwind requires catchable panics for crash isolation | ✓ Good -- actors survive peer crashes |
| Fun() as text-comparison, not keyword | Type-position disambiguation only; avoids breaking existing code | ✓ Good -- v1.2, clean integration with HM |
| Conservative stack scanning | No type maps yet; every 8-byte word treated as potential pointer | ✓ Good -- safe, may retain some garbage |
| GC at yield points only | Cooperative; never interrupts other actors | ✓ Good -- per-actor isolation preserved |
| Static dispatch for traits | Monomorphization fits LLVM codegen naturally, no runtime vtable overhead | ✓ Good -- v1.3, zero-overhead trait calls |
| MIR lowering as trait integration point | Type checker resolves concrete types; MIR mangles names and emits direct calls | ✓ Good -- v1.3, clean separation of concerns |
| Trait__Method__Type name mangling | Double-underscore separators extend existing mangle_type_name infrastructure | ✓ Good -- v1.3, consistent naming scheme |
| FNV-1a for Hash protocol | Deterministic, platform-independent, ~35 lines in snow-rt | ✓ Good -- v1.3, zero new Rust dependencies |
| Trust typeck for where-clause enforcement | Type checker already comprehensively checks; MIR adds warning-only defense-in-depth | ✓ Good -- v1.3, no duplicate checking logic |
| deriving as contextual keyword | IDENT text check avoids adding to TokenKind; backward compatible | ✓ Good -- v1.3, no breaking changes |
| Thread sum_type_defs as parameter | PatMatrix cloned frequently; reference avoids data duplication | ✓ Good -- v1.4, correct tag resolution |
| Ordering as non-generic built-in | Simpler than Option/Result; no type parameters needed | ✓ Good -- v1.4, clean Ord integration |
| Synthetic wrapper functions | Runtime expects fn(u64)->ptr; wrappers bridge two-arg calls to one-arg callback | ✓ Good -- v1.4, enables nested Display |
| Lazy monomorphization at struct literal sites | Generate trait functions on demand when generic type instantiated | ✓ Good -- v1.4, correct field type substitution |
| Clone-locally fn_constraints | Avoids &mut cascade to 10+ callers; cloning small map is cheap | ✓ Good -- v1.4, contained mutability |
| ListLit MIR + snow_list_from_array | Single allocation O(n) vs O(n^2) append chain for list literals | ✓ Good -- v1.5, efficient list creation |
| Uniform u64 storage with codegen conversion | No runtime type tags; all conversion at compile time | ✓ Good -- v1.5, zero-overhead polymorphism |
| Callback-based list Eq/Ord | Matches snow_list_to_string pattern; runtime receives fn ptr | ✓ Good -- v1.5, consistent callback architecture |
| ListDecons decision tree node | Cons patterns need runtime length check + extraction; doesn't fit Switch/Test | ✓ Good -- v1.5, clean pattern compilation |
| Local var precedence over builtin names | Pattern binding `head` was incorrectly mapped to snow_list_head | ✓ Good -- v1.5, correct name resolution |
| E0029 error + early-return for Ord without Eq | User opted into selective deriving; respect with clear error and suggestion | ✓ Good -- v1.5, user-friendly diagnostics |
| Soft error collection for argument constraints | Callee check returns Err; argument check uses extend to avoid aborting inference early | ✓ Good -- v1.5, non-disruptive constraint checking |
| NameRef-only argument constraint checking | Covers direct names and let aliases; complex expressions out of scope | ✓ Good -- v1.5, practical coverage |
| Retry-based method resolution | Normal inference first, method-call fallback on NoSuchField; preserves backward compat | ✓ Good -- v1.6, zero regressions |
| Method as last in resolution priority | module > service > variant > struct field > method; method is fallback | ✓ Good -- v1.6, no existing syntax affected |
| Shared resolve_trait_callee helper | Eliminates duplication between bare-name and dot-syntax dispatch | ✓ Good -- v1.6, single maintenance point |
| Stdlib module method fallback | Maps receiver type to module name (String, List, Map, Set, Range) | ✓ Good -- v1.6, dot-syntax for stdlib functions |
| Defense-in-depth sort in MIR | Sort matching_traits before selection, independent of typeck ambiguity check | ✓ Good -- v1.6, deterministic regardless of HashMap order |
| AmbiguousMethod with TextRange span | Consistent with other span-bearing error variants | ✓ Good -- v1.6, precise error locations |
| InferCtx.loop_depth for break/continue | Threading through 55+ signatures too invasive; field on context is clean | ✓ Good -- v1.7, simple loop validation |
| Reset loop_depth in closures | BRKC-05 requires boundary enforcement; reset to 0 in closure bodies | ✓ Good -- v1.7, correct closure semantics |
| alloca counter for loop state | mem2reg promotes to register; matches existing if-expression pattern | ✓ Good -- v1.7, zero-overhead loops |
| Indexed iteration for collections | Counter 0..len avoids Rust iterator complexity; works for List/Map/Set | ✓ Good -- v1.7, uniform codegen |
| List builder for comprehensions | Pre-allocated O(N) vs O(N^2) append chains for for-in results | ✓ Good -- v1.7, efficient collection |
| Half-open range [start, end) | Consistent with Rust/Python; SLT comparison for termination | ✓ Good -- v1.7, familiar semantics |
| Five-block codegen for filter | Filter false skips to latch directly; clean separation from body | ✓ Good -- v1.7, minimal overhead |
| ForInRange returns List<T> not Unit | Comprehension semantics apply uniformly to all for-in variants | ✓ Good -- v1.7, consistent behavior |
| Hand-written Kahn's algorithm for toposort | Avoids petgraph dependency for simple DAG | ✓ Good -- v1.8, zero new dependencies |
| Sequential u32 ModuleId | Simple, zero-allocation, direct Vec indexing | ✓ Good -- v1.8, efficient module lookup |
| Two-phase graph construction | Register all modules first, then parse and build edges | ✓ Good -- v1.8, correct forward references |
| Single LLVM module via MIR merge | Avoids cross-module linking complexity | ✓ Good -- v1.8, single binary output |
| Accumulator-pattern type checking | Each module's exports feed into next module's ImportContext | ✓ Good -- v1.8, correct dependency ordering |
| Module-qualified name mangling (ModuleName__fn) | Double-underscore separators prevent private name collisions | ✓ Good -- v1.8, safe multi-module codegen |
| TyCon::display_prefix for module-qualified types | Excluded from PartialEq/Hash to preserve type identity | ✓ Good -- v1.8, display-only qualification |
| ariadne named-source spans | (String, Range) spans replace anonymous Source::from() for file-aware diagnostics | ✓ Good -- v1.8, file paths in errors |
| Trait impls unconditionally exported | XMOD-05: global visibility without explicit import | ✓ Good -- v1.8, coherent trait dispatch |
| PrivateItem error with pub suggestion | Clear diagnostic when accessing non-pub items across modules | ✓ Good -- v1.8, user-friendly errors |
| LLVM intrinsics for math ops | Zero new dependencies; direct fabs/fmin/fmax/pow/sqrt intrinsics | ✓ Good -- v1.9, zero-overhead math |
| Float-only pow/sqrt | Simpler API; users convert with Int.to_float() if needed | ✓ Good -- v1.9, clean type boundaries |
| fn_return_type_stack for ? operator | Push/pop pattern matching loop_depth; closures push None to block cross-boundary ? | ✓ Good -- v1.9, correct scoping |
| Desugar ? to Match+Return in MIR | Zero new MIR nodes or codegen paths; reuses existing pattern matching infrastructure | ✓ Good -- v1.9, minimal complexity |
| Timer.sleep via yield loop with deadline | Actor stays Ready (not Waiting) to avoid scheduler skip; cooperative with other actors | ✓ Good -- v1.9, actor-safe timers |
| Timer.send_after spawns OS thread | Simple implementation with deep-copied message bytes; avoids timer wheel complexity | ✓ Good -- v1.9, functional for common cases |
| SnowOption shared module | Extracted from env.rs; now shared by list.rs, string.rs, env.rs, http/server.rs | ✓ Good -- v1.9, code reuse |
| alloc_pair GC heap layout | {len=2, elem0, elem1} matching Snow tuple convention; shared by list.rs and map.rs | ✓ Good -- v1.9, consistent tuple representation |
| Post-lowering MIR rewrite for TCE | Avoids threading is_tail_position through every lower_* method; clean separation | ✓ Good -- v1.9, minimal code changes |
| Two-phase arg evaluation for TailCall | Evaluate all args THEN store; critical for parameter swap correctness (e.g., fib(n-1, b, a+b)) | ✓ Good -- v1.9, correct semantics |
| Entry-block alloca hoisting for TCE | build_entry_alloca when tce_loop_header set; prevents stack growth in tail-call loops | ✓ Good -- v1.9, constant stack space |
| Separate JSON_INT/JSON_FLOAT tags | Round-trip fidelity: 42 stays Int, 3.14 stays Float through encode/decode | ✓ Good -- v2.0, no type confusion |
| If-chain for from_json (not Match) | Avoids Ptr vs SumType mismatch in LLVM codegen for Result pattern matching | ✓ Good -- v2.0, consistent across phases |
| Tagged union JSON for sum types | `{"tag":"V","fields":[...]}` -- standard, unambiguous, round-trips all variant shapes | ✓ Good -- v2.0, clean encoding |
| HTTP.on_get/on_post naming | Avoids collision with existing HTTP.get/post client functions | ✓ Good -- v2.0, backward compatible |
| Three-pass route matching | Exact > parameterized > wildcard priority without explicit ordering | ✓ Good -- v2.0, correct semantics |
| Trampoline-based middleware chain | chain_next builds Snow closure via GC-allocated {fn_ptr, env_ptr} struct | ✓ Good -- v2.0, composable pipeline |
| libsqlite3-sys bundled | Compiles SQLite from C amalgamation -- zero system dependencies | ✓ Good -- v2.0, self-contained |
| Opaque u64 handles for DB connections | GC cannot trace through opaque handles; prevents use-after-free | ✓ Good -- v2.0, GC-safe |
| Pure Rust PostgreSQL wire protocol | ~550 lines hand-rolled; only crypto deps (sha2/hmac/md-5/base64ct) | ✓ Good -- v2.0, minimal dependencies |
| Extended Query protocol for PostgreSQL | Parse/Bind/Execute/Sync with $1, $2 placeholders and text format | ✓ Good -- v2.0, parameterized queries |
| Empty n= in SCRAM client-first-bare | PG knows username from StartupMessage; spec allows empty | ✓ Good -- v2.0, correct auth |
| PgStream enum (Plain/Tls) | Zero-cost dispatch instead of Box<dyn Read+Write>; mirrors HttpStream | ✓ Good -- v3.0, unified pattern |
| Default sslmode=prefer | Backward compatible with v2.0 URLs; auto-upgrades when server supports TLS | ✓ Good -- v3.0, safe default |
| CryptoProvider in snow_rt_init() | Guarantees pre-TLS availability for both PG and HTTP consumers | ✓ Good -- v3.0, single install point |
| Replace tiny_http with hand-rolled parser | Eliminates rustls 0.20 conflict; enables shared TLS stack | ✓ Good -- v3.0, unified rustls 0.23 |
| HttpStream enum mirroring PgStream | Consistent pattern across database and HTTP TLS | ✓ Good -- v3.0, clean abstraction |
| Lazy TLS handshake in actor | StreamOwned::new defers I/O; handshake inside per-connection actor | ✓ Good -- v3.0, non-blocking accept |
| Arc::into_raw leak for ServerConfig | Server runs forever; no cleanup needed; avoids Arc overhead per request | ✓ Good -- v3.0, pragmatic |
| Simple Query protocol for txn commands | BEGIN/COMMIT/ROLLBACK need no params; simpler than Extended Query | ✓ Good -- v3.0, minimal wire overhead |
| parking_lot Mutex+Condvar for pool | Consistent with actor scheduler; blocking checkout with timeout | ✓ Good -- v3.0, reliable synchronization |
| Health check on checkout (SELECT 1) | Detects dead connections from server restarts before user code | ✓ Good -- v3.0, transparent recovery |
| Optimistic slot reservation for pool | Increment total_created before dropping lock for I/O; avoids over-creation | ✓ Good -- v3.0, correct concurrency |
| Pg.transaction with catch_unwind | Panic-safe rollback prevents transaction leak on actor crash | ✓ Good -- v3.0, fault-tolerant |
| FromRowFn callback via fn ptr transmute | Matches existing Snow closure pattern; enables query_as integration | ✓ Good -- v3.0, consistent callback architecture |
| Polymorphic Scheme for query_as | Quantified TyVar enables type-safe generic result mapping | ✓ Good -- v3.0, correct type inference |
| Option fields receive None for missing columns | Lenient NULL handling matches common SQL patterns | ✓ Good -- v3.0, practical ergonomics |
| SHA-1 via ring (not sha1 crate) | Already a dependency for TLS; reuse avoids new crate for RFC 6455 Sec-WebSocket-Accept | ✓ Good -- v4.0, zero new deps |
| Reader thread bridge (OS thread per WS conn) | Avoids blocking M:N scheduler with network I/O; thread does read + mailbox delivery | ✓ Good -- v4.0, scheduler-safe |
| Reserved type tags (u64::MAX-1 through -4) | WS frame types in mailbox without collision with user actor-to-actor messages | ✓ Good -- v4.0, clean separation |
| Arc<Mutex<WsStream>> unified pattern | Single code path for plain TCP and TLS WebSocket I/O; replaces try_clone | ✓ Good -- v4.0, simpler than alternatives |
| 100ms reader thread timeout | Balances mutex contention with heartbeat responsiveness; macOS EAGAIN handled | ✓ Good -- v4.0, responsive heartbeat |
| Pong handled before process_frame | Heartbeat needs to validate payload before normal dispatch | ✓ Good -- v4.0, correct ordering |
| 16 MiB MAX_PAYLOAD_SIZE | Production safety limit; generous for most WS use cases; close 1009 on exceed | ✓ Good -- v4.0, safe default |
| RoomRegistry dual-map (rooms + conn_rooms) | O(1) join/leave, O(rooms_per_conn) cleanup; nested lock ordering prevents deadlocks | ✓ Good -- v4.0, efficient + safe |
| Room cleanup before shutdown.store | Prevents use-after-free when concurrent broadcasts access WsConnection during disconnect | ✓ Good -- v4.0, correct ordering |
| PID bit-packing: 16-bit node_id, 8-bit creation, 40-bit local_id | Fits in existing u64, backward compatible (local PIDs have node_id=0) | ✓ Good -- v5.0, zero-overhead locality check |
| Custom STF wire format (not Erlang ETF) | Snow's type system differs from Erlang; custom format is simpler and type-safe | ✓ Good -- v5.0, round-trip fidelity for all types |
| Hand-crafted ASN.1 DER for ephemeral certs | Avoids rcgen dependency; ring provides ECDSA P-256 key gen | ✓ Good -- v5.0, zero new deps |
| HMAC-SHA256 cookie-based auth | Constant-time verification via Mac::verify_slice; simple trust model | ✓ Good -- v5.0, secure handshake |
| Silent drop on dist failure paths | Remote sends silently fail until Phase 66 adds :nodedown signals | ✓ Good -- v5.0, incremental build |
| Two-phase disconnect (collect refs, drop lock, execute) | Prevents deadlocks in handle_node_disconnect | ✓ Good -- v5.0, safe concurrency |
| FnPtr newtype for function registry | Send+Sync wrapper for function pointers in OnceLock static | ✓ Good -- v5.0, safe remote spawn |
| Selective receive via Mailbox::remove_first | Erlang-style predicate scan preserving FIFO for non-matching | ✓ Good -- v5.0, correct spawn reply handling |
| Single RwLock for GlobalRegistry | Wraps all three maps (names, pid_names, node_names) for deadlock-free consistency | ✓ Good -- v5.0, simple correctness |
| DIST_ROOM_BROADCAST no re-forwarding | Reader loop delivers locally only; prevents broadcast storms in mesh | ✓ Good -- v5.0, correct topology |
| Remote supervisor async terminate | Mark not-running immediately; receive loop handles exit signal | ✓ Good -- v5.0, non-blocking supervision |
| VitePress custom theme (not extend default) | Blank Layout.vue prevents default theme CSS leaking; full design control | ✓ Good -- v6.0, clean monochrome design |
| VitePress isDark over VueUse useDark | Avoids dual localStorage keys fighting; VitePress manages theme internally | ✓ Good -- v6.0, no theme toggle conflicts |
| Monochrome OKLCH palette at zero chroma | Perceptually uniform grayscale; no color bias in dark or light mode | ✓ Good -- v6.0, consistent aesthetic |
| onMounted client-side Shiki highlighting | Raw code fallback for SSR; highlighting runs only in browser | ✓ Good -- v6.0, no hydration mismatch |
| DOM-based heading extraction for TOC | page.headers unreliable for dynamic content; DOM MutationObserver is authoritative | ✓ Good -- v6.0, correct TOC always |
| E2E-verified code examples in docs | All examples sourced from test files, not invented; prevents stale/wrong docs | ✓ Good -- v6.0, accurate documentation |
| VPNavBarSearch for search | Zero-config MiniSearch; handles Cmd+K, modal, results without custom code | ✓ Good -- v6.0, minimal implementation |
| CSS-only copy button | VitePress injects button.copy on code blocks; only CSS styling needed | ✓ Good -- v6.0, zero custom JS |
| Dedicated parse_impl_body for assoc types | Avoids changing shared parse_item_block_body code paths used by module/function bodies | ✓ Good -- v7.0, isolated parsing |
| IDENT text matching for Self | Uppercase Self is IDENT not SELF_KW; resolution uses text comparison | ✓ Good -- v7.0, no new keyword needed |
| Two-trait Iterator/Iterable protocol | Iterable for collections, Iterator for stateful cursor; infer_for_in checks Iterable first | ✓ Good -- v7.0, clean separation |
| Opaque TyCon names for iterator handles | ListIterator, MapIterator etc. as type names; resolve to MirType::Ptr | ✓ Good -- v7.0, uniform pointer handling |
| Synthetic Into generation | Inserts directly into impls HashMap; avoids blanket impl coherence problems | ✓ Good -- v7.0, no infinite recursion |
| Parameterized trait registry | TraitRegistry extended with type args for From<T>/Into<T> | ✓ Good -- v7.0, clean parameterization |
| Type-tag dispatch for iterators | u8 tag as first byte of all iterator handles for uniform generic_next | ✓ Good -- v7.0, simple dispatch |
| iterator_ptr_compatible() unification | ListIterator and adapter types unify with Ptr for combinator chaining | ✓ Good -- v7.0, seamless pipelines |
| Safe Vec<u64> intermediary for collect | Bounds checking vs mesh_list_builder which has none | ✓ Good -- v7.0, safe collection |
| DocumentSymbolResponse::Nested for Outline | Hierarchical tree instead of flat SymbolInformation list | ✓ Good -- v8.0, proper nesting |
| Module-qualified call lookahead in grammar | Only match call sites (`Module.fn()`), not field access | ✓ Good -- v8.0, precise highlighting |
| LLVM 21 per-platform installation in CI | Homebrew on macOS, official tarballs on Linux, ycm-core on ARM64 | ✓ Good -- v8.0, all 6 targets build |
| ~/.mesh/bin install location | Rustup convention with ~/.mesh/env sourced from shell profiles | ✓ Good -- v8.0, familiar pattern |
| Four-tier completion sort ordering | 0_scope > 1_types > 2_keywords > 3_snippets | ✓ Good -- v8.0, intuitive ranking |
| Multi-strategy callee type resolution | Direct range, NAME_REF children, Ty::Fun containment for signature help | ✓ Good -- v8.0, robust lookup |
| Full-document TextEdit for LSP formatting | Simpler than computing diff edits; return None on no-op | ✓ Good -- v8.0, clean implementation |
| Dynamic version badge via useData().theme | DocsVersionBadge.vue pattern avoids hardcoded version strings | ✓ Good -- v8.0, maintenance-free |
| RAW: prefix encoding with $N renumbering for SQL fragments | Reuses existing where_raw encoding pattern; renumber_placeholders handles mixed $N / ? placeholder merging | ✓ Good -- v11.0, composable fragment embedding |
| Positional-arg API for upsert/RETURNING (insert_or_update, delete_where_returning, where_sub) | Simpler than keyword-option style; no keyword arg machinery; canonical for v11.0 | ✓ Good -- v11.0, clean, consistent with Repo pattern |
| ORM boundary documentation (18 intentional raw SQL sites) | Not all SQL is ORM-expressible (arithmetic SET, JSONB build, nested subqueries, DDL); document boundaries rather than force-fit | ✓ Good -- v11.0, honest about ORM scope |
| Decimal phase insertion (109.1) for mid-milestone bug fixes | Preserves numeric ordering without renumbering; INSERTED marker in roadmap | ✓ Good -- v11.0, unambiguous insertion semantics |
| Type-aware service loop arg dispatch (Bool trunc, Float bitcast, Struct alloca) | i1/float/struct LLVM types need explicit casts; i64 passthrough insufficient | ✓ Good -- v11.0, correct codegen for all handler param types |
| SlotPipe insertion semantics (x |2> f(a,b,c) = f(a,x,b,c)) | Standard argument insertion; conflict check removed, arity unification handles mismatches | ✓ Good -- v12.0, intuitive slot routing |
| Both ${ and #{ emit identical InterpolationStart tokens | Zero parser changes needed; backward compat with ${} users | ✓ Good -- v12.0, clean migration path |
| env_get_int silently returns default on parse failure (no stderr warning) | Simpler UX; dev configures correct env vars, no noise from startups | ✓ Good -- v12.0, pragmatic default |
| Regex.is_match not Regex.match ('match' is a Mesh keyword) | Avoids keyword collision without special-case parser rules | ✓ Good -- v12.0, clean API naming |
| Ty::Con(Regex) maps to MirType::Ptr (opaque heap pointer) | Prevents LLVM opaque struct failures; consistent with other opaque handles | ✓ Good -- v12.0, zero struct type errors |
| crates/ flattened directly to compiler/ with no intermediate directory | 11 crates are direct children; simpler navigation than crates/mesh-*/src | ✓ Good -- v12.0, clean open source layout |
| Isolated benchmark (single server per VM) vs co-located | Eliminates CPU sharing artifacts; Mesh improved +47% isolated vs co-located | ✓ Good -- v12.0, fair comparison methodology |
| projects.slug ON CONFLICT requires WHERE slug IS NOT NULL predicate | Partial index requires predicate match to avoid PostgreSQL runtime error | ✓ Good -- v12.0, correct partial index semantics |
| is_newline_insignificant pub(crate) for multi-line pipes | Minimal change; exposes existing parser method without new API surface | ✓ Good -- v13.0, zero new methods |
| ALIAS-04 skips generic alias targets | Type vars not in registry; only validates single-IDENT alias targets to avoid false positives | ✓ Good -- v13.0, conservative validation |
| Struct values always pointer-boxed in variant fields | ptr slot in {i8,ptr} variant layout always dereferenced; even 8-byte structs must be heap-allocated | ✓ Good -- v13.0, fixes SIGSEGV in TryFrom dispatch |
| Pipe string-key detection via Iter.zip source analysis | HM let-generalization prevents K=String unification at collect-pipe time; source-based detection is the only reliable approach | ✓ Good -- v13.0, correct string-key map collect |
| QUAL-02 passthrough middleware scope limitation | Without Request.* accessor calls in body, type variable generalizes to `forall T`; codegen emits {} LLVM type → SIGBUS. Full inference would require constraint propagation beyond HM scope. | ⚠ Revisit -- v13.0, partial satisfaction documented |
| Two-level json lowering: lower_json_expr_inner (Ptr) + lower_json_expr (String) | Enables json-typed variable nesting via mesh_json_parse_raw without double-encoding | ✓ Good -- v13.0, clean separation |
| json { } keys as bare IDENT only (TYPE_KW 'type' excluded) | 'type' is a reserved keyword (TYPE_KW token, not IDENT); parser requires bare IDENT for json literal keys | ✓ Good -- v13.0, parser consistency |
| json { } documented in strings sub-skill (not new sub-skill) | JSON literals are a string/serialization concern; adding new sub-skill would fragment discovery | ✓ Good -- v13.0, clean skill organization |
| DateTime ABI as i64 Unix milliseconds throughout | Avoids new type machinery in typeck/codegen; all 11 functions share scalar ABI | ✓ Good -- v14.0, clean integration |
| OS-thread-per-stream for Http.stream | Avoids blocking M:N scheduler; reuses WS reader pattern from v4.0 | ✓ Good -- v14.0, scheduler-safe streaming |
| test runner copies *.test.mpl to temp dir as main.mpl | Reuses existing build() entry-point lookup without modification | ✓ Good -- v14.0, minimal code change |
| registry/ excluded from main Cargo workspace | Avoids libsqlite3-sys links conflict with mesh-rt bundled sqlite3; registry has own workspace root | ✓ Good -- v14.0, clean isolation |
| Packages site deployed to Fly.io (not Cloudflare Pages) | User preference; adapter-node + Dockerfile consistent with registry platform | ✓ Good -- v14.0, platform consistency |
| cancel-in-progress: false on deploy-fly CI | Never cancel mid-flight Fly.io deploy (leaves app in broken state) | ✓ Good -- v14.0, safe CI |
| meshc test project_dir walks upward to find nearest main.mpl | CWD-based approach copied entire workspace to temp build dir | ✓ Good -- v14.0, correct project detection |
| meshpkg credentials stored as TOML at ~/.mesh/credentials | Consistent with ~/.mesh/bin install location from v8.0 | ✓ Good -- v14.0, familiar convention |
| slugify_with_sep/2 naming for two-arg slug variant | ModuleExports.functions is FxHashMap<String, Scheme> keyed by name only; arity overloading unsupported across module boundaries | ✓ Good -- v15.0, clear naming convention |
| Scoped packages use two-level install layout ({owner}/{name}@{version}/) | Mirrors GitHub namespace; discovery.rs Phase 1b walks two levels | ✓ Good -- v15.0, consistent with registry owner model |
| Default registry is https://api.packages.meshlang.dev | registry.meshlang.dev is Vercel frontend (404s); api. subdomain is Axum backend | ✓ Good -- v15.0, documented to prevent confusion |
| Empty-string sentinel for optional slug in insert_org | Caller passes "" to request auto-generation; preserves explicit-slug behavior; no overloading needed | ✓ Good -- v15.0, simple API without function overloading |

---
*Last updated: 2026-03-02 after v15.0 milestone*
