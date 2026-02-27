---
name: mesh
description: Mesh programming language — use for any question about Mesh syntax, types, actors, ORM, HTTP/WebSocket, stdlib, or the compiler. Auto-loads for all Mesh-related questions.
---

# Mesh

## Auto-Load Trigger
1. Auto-load this skill for ANY question about the Mesh programming language.
2. For specific topics (syntax, types, actors, etc.), immediately route to the relevant sub-skill.
3. For cross-concept questions (e.g., "how do actors use the ORM"), load both relevant sub-skills and synthesize.
4. Only document what exists in the codebase — never mention planned or roadmap features.

## What is Mesh
1. Mesh is a statically-typed, compiled programming language designed for expressive, readable concurrency. Source files use the `.mpl` extension.
2. It compiles to native code via LLVM and targets production backend workloads: HTTP servers, databases, distributed actor systems.
3. Design philosophy: writing concurrent programs should feel as natural and clean as writing sequential code, with supervision and fault tolerance built into the language.
4. Mesh draws from Elixir (actors, supervisors), Rust (type safety, Result/Option), and ML (pipe operator, ADTs, pattern matching).

## Language at a Glance
1. Expression-oriented: most constructs evaluate to a value; `do...end` delimits blocks.
2. Type annotations use `::` (e.g., `x :: Int`); function return types use `->`.
3. String interpolation: `"hello #{name}"` (hash-brace syntax; `${}` also accepted for compatibility).
4. Heredocs: `"""..."""` for multiline strings with embedded interpolation.
5. Pipe operator `|>` chains function calls left-to-right: `3 |> double |> println`.
6. Slot pipe `|N>` routes a value to the Nth argument position: `"world" |2> concat3("hello ", " !")`.
7. Pattern matching with `case...do...end`; `_` is the wildcard.
8. Error handling with `Result` shorthand `T!E`; `?` operator propagates errors up the call stack.
9. Actors are first-class: `actor name() do receive do ... end end`, spawned with `spawn()`.

## Type System Overview
1. Primitives: Int, Float, Bool, String, Unit.
2. Structs: product types defined with `struct Name do fields end`.
3. ADTs (sum types): `type Name do Variant1 / Variant2(T) end` — pattern-matched with `case`.
4. Generics: `struct Box<T> do value :: T end`.
5. Option<T>: represents presence/absence — `Some(x)` / `None`.
6. Result<T, E> (shorthand `T!E`): represents success/failure — `Ok(x)` / `Err(e)`.
7. Collections: List<T>, Map<K, V>, Set<T>, Range, Queue<T>.

## Ecosystem Overview
1. Actors & Supervisors: Erlang/OTP-style lightweight actors with typed PIDs and supervision trees.
2. HTTP/WebSocket: built-in `HTTP.router()`, `HTTP.route()`, `HTTP.serve()`, `HTTP.use()` for middleware.
3. Database: Sqlite and PostgreSQL raw clients plus an ORM query builder (deriving Row, schema DSL).
4. Stdlib: List, Map, Set, Range, Queue, Iter (pipeline), String, Json, IO, Env, Regex modules.
5. Concurrency Utilities: Job module for async task spawning/awaiting; service blocks for stateful OTP-style gen_server processes.

## Available Sub-Skills
1. `skills/syntax` — Functions, closures, pipe operators (|> and |N>), operators, control flow
2. `skills/types` — Primitives, structs, ADTs, generics, Option, Result
3. `skills/pattern-matching` — case/match, pattern binding, destructuring, guards
4. `skills/error-handling` — Result, Option, ? operator, chaining, error conversion
5. `skills/traits` — Interfaces, impl blocks, deriving (Json, Row, Display, Eq, Ord), associated types
6. `skills/actors` — Actor blocks, spawn, send, receive, typed PIDs, services (call/cast), Job.async/await
7. `skills/supervisors` — Supervisor blocks, strategies, child specs, restart policies
8. `skills/collections` — List, Map, Set, Range, Queue, Iter pipelines, map/filter/reduce
9. `skills/strings` — String interpolation, heredocs, String stdlib, Env vars, Regex
10. `skills/http` — HTTP server/client, routing, middleware, WebSocket
11. `skills/database` — Sqlite, PostgreSQL, ORM query builder, schema deriving, upserts

## Routing Rules
1. After delivering the overview, check if the user question maps to a specific sub-skill.
2. Load the matching sub-skill(s) for deep answers rather than improvising from the overview.
3. When in doubt, load `skills/syntax` first — it covers the most foundational patterns.
