# S02: SQLite local starter contract

**Goal:** Replace the public SQLite `todo-api` starter with an explicitly local single-node contract, preserve the historical clustered Todo proof behind internal fixture-backed rails, and split repo/skill guidance so SQLite stays the honest easy starter while Postgres remains the serious clustered path.
**Demo:** After this: `meshc init --template todo-api --db sqlite <name>` emits the matching local-first starter with explicit single-node/local guidance and no fake clustered durability claims.

## Tasks
- [x] **T01: Pinned the historical clustered Todo proof to a committed fixture and made the M047 wrapper verify fixture-copy provenance.** — Move the old clustered SQLite Todo app off the public `meshc init` path before S02 rewrites the public scaffold.

## Failure Modes

| Dependency | On error | On timeout | On malformed response |
|------------|----------|-----------|----------------------|
| Internal legacy fixture tree | Fail the helper before any runtime proof starts and name the missing file; do not silently fall back to the public scaffold. | N/A — local copy only. | Reject partial fixture copies instead of producing a misleading generated project. |
| `compiler/meshc/tests/e2e_m047_s05.rs` and `scripts/verify-m047-s05.sh` | Stop on the first red historical proof phase and preserve retained bundle pointers/logs. | Keep existing bounded timeouts on native/Docker proof. | Reject missing retained markers or bundle-shape drift instead of treating the history as optional. |

## Load Profile

- **Shared resources**: temp workspaces, retained `.tmp/m047-s05` artifacts, and the existing native/Docker proof helpers.
- **Per-operation cost**: one fixture copy plus the existing historical M047 proof replay.
- **10x breakpoint**: fixture drift or retained-artifact collisions show up before compile time.

## Negative Tests

- **Malformed inputs**: missing fixture files, stale helper paths, or a partial copied project tree.
- **Error paths**: historical verifier bundle markers missing, Docker/native proof unable to find the fixture, or any fallback back to public `meshc init`.
- **Boundary conditions**: the retained history stays runnable without reintroducing a second public starter mode.

## Steps

1. Commit a full legacy clustered Todo fixture tree under `scripts/fixtures/m047-s05-clustered-todo/` capturing the current M047 public contract.
2. Change `compiler/meshc/tests/support/m047_todo_scaffold.rs` to copy that fixture into temp workspaces instead of invoking `meshc init --template todo-api`.
3. Retarget `compiler/meshc/tests/e2e_m047_s05.rs` and `scripts/verify-m047-s05.sh` to prove the fixture-backed history while preserving native/Docker artifact retention.
4. Fail closed if the fixture tree or retained bundle markers drift; do not invent a hidden public init mode.

## Must-Haves

- [ ] Historical M047 clustered Todo proof no longer depends on the public SQLite scaffold.
- [ ] The committed fixture fully captures the old clustered Todo contract needed by the native/Docker rails.
- [ ] `bash scripts/verify-m047-s05.sh` still owns a truthful retained historical proof bundle.
  - Estimate: 1h30m
  - Files: scripts/fixtures/m047-s05-clustered-todo/mesh.toml, scripts/fixtures/m047-s05-clustered-todo/main.mpl, scripts/fixtures/m047-s05-clustered-todo/work.mpl, scripts/fixtures/m047-s05-clustered-todo/api/router.mpl, compiler/meshc/tests/support/m047_todo_scaffold.rs, compiler/meshc/tests/e2e_m047_s05.rs, scripts/verify-m047-s05.sh
  - Verify: - `cargo test -p meshc --test e2e_m047_s05 -- --nocapture`
- `bash scripts/verify-m047-s05.sh`
- [x] **T02: Rewrote the public SQLite todo-api scaffold toward a local-only contract, but the generated storage package test still fails under meshc test.** — Use S01's typed DB seam to replace the public SQLite branch with an explicitly local contract. Remove the old clustered runtime surfaces, keep the real SQLite path on `Sqlite.*`, and add generated package tests so the default starter stops being a zero-proof branch.

## Failure Modes

| Dependency | On error | On timeout | On malformed response |
|------------|----------|-----------|----------------------|
| `compiler/mesh-pkg/src/scaffold.rs` template strings and file list | Fail scaffold generation or static contract tests before a misleading mixed local/clustered project can ship. | N/A — local generation only. | Reject partial local/clustered hybrids (`work.mpl`, `HTTP.clustered(...)`, or `meshc cluster` guidance surviving in the SQLite branch). |
| `compiler/meshc/src/main.rs` init guidance and `tooling_e2e` assertions | Exit non-zero with explicit SQLite-local vs Postgres-clustered guidance and do not preserve the old clustered wording. | N/A — local CLI and test execution only. | Treat stale README/help text or missing generated tests as contract drift. |

## Load Profile

- **Shared resources**: generated project trees, local SQLite database files, and the default `meshc init` path.
- **Per-operation cost**: one scaffold write plus local `meshc test` / build proof on the generated project.
- **10x breakpoint**: repeated local DB init/test churn shows up before CPU; there should be no cluster transport or operator path left in this starter.

## Negative Tests

- **Malformed inputs**: empty title, malformed todo id, invalid positive-int env values, and broken `TODO_DB_PATH` handling.
- **Error paths**: stale `work.mpl`, `HTTP.clustered(...)`, `meshc cluster`, or `MESH_*` guidance surviving in the SQLite branch.
- **Boundary conditions**: empty todo list, `:memory:` or temp-path package tests, and the no-flag SQLite path staying the default while Postgres remains explicit.

## Steps

1. Rewrite the SQLite scaffold strings in `compiler/mesh-pkg/src/scaffold.rs` so the generated file set is local-only: remove `work.mpl`, localize `main.mpl` bootstrap, update `/health`, router, README, Dockerfile, and `.dockerignore`, and expose explicit SQLite-local markers.
2. Modernize the SQLite storage/type templates to stay on parameterized `Sqlite.*` calls and typed row conversion (`deriving(Row)` / `Todo.from_row(...)`) instead of manual `Map.get(...)` parsing.
3. Emit a small generated package-test surface (for example config and local storage tests) so `meshc test <project>` proves the local contract.
4. Update `compiler/meshc/src/main.rs` guidance and `compiler/meshc/tests/tooling_e2e.rs` expectations to teach SQLite-local vs Postgres-clustered without reintroducing a shadow scaffold mode.

## Must-Haves

- [ ] The generated SQLite starter is explicitly single-node/local: no `work.mpl`, `Node.start_from_env()`, `HTTP.clustered(...)`, `clustered_handler`, `meshc cluster`, `MESH_*` env, or cluster-port Docker exposure.
- [ ] The generated SQLite project uses current Mesh-local SQLite patterns and includes real `.test.mpl` files.
- [ ] CLI/help and tooling tests point clustered/deployable guidance at `--db postgres` / `--clustered` while keeping SQLite as the honest local default.
  - Estimate: 2h
  - Files: compiler/mesh-pkg/src/scaffold.rs, compiler/meshc/src/main.rs, compiler/meshc/tests/tooling_e2e.rs
  - Verify: - `cargo test -p mesh-pkg m049_s02_sqlite_scaffold_ -- --nocapture`
- `cargo test -p meshc --test tooling_e2e test_init_todo_template_db_sqlite_ -- --nocapture`
- [ ] **T03: Add a live SQLite starter acceptance harness for local CRUD, restart, and failure truth** — Prove the rewritten starter operationally. Generate the SQLite starter into a temp workspace, run its generated package tests, build and boot it without any cluster env, and exercise local CRUD, restart persistence, and at least one explicit negative rail.

## Failure Modes

| Dependency | On error | On timeout | On malformed response |
|------------|----------|-----------|----------------------|
| Generated SQLite project plus `meshc test` / `meshc build` | Fail closed before runtime boot and archive the generated project plus stdout/stderr. | Bound every phase with explicit timeouts and retain timeout artifacts. | Reject missing generated tests or malformed scaffold output before claiming runtime truth. |
| Local HTTP startup, `/health`, and SQLite file-path behavior | Archive startup logs and the last health/HTTP snapshot; fail the test on bad `TODO_DB_PATH` or startup regression. | Timeout with retained logs and last response instead of hanging. | Reject malformed JSON, wrong status codes, or health payloads that still imply clustered behavior. |
| Restart/persistence proof across local file DB reuse | Preserve before/after HTTP snapshots and db-path artifacts so persistence drift is diagnosable. | Timeout waiting for restarted health. | Reject missing persisted todo state or silent resets to in-memory behavior. |

## Load Profile

- **Shared resources**: temp workspaces, loopback ports, on-disk SQLite files, spawned local processes, and `.tmp/m049-s02` artifacts.
- **Per-operation cost**: one scaffold generation, one `meshc test`, one build, two local binary launches, and a short CRUD/restart sequence.
- **10x breakpoint**: port collisions and temp-db churn show up before CPU; there should be no cluster transport or operator path in this harness.

## Negative Tests

- **Malformed inputs**: empty title, malformed todo id, and invalid/broken `TODO_DB_PATH` values.
- **Error paths**: startup failure on bad db path, 404/400 rails on invalid todo access, and any non-local `/health` story.
- **Boundary conditions**: empty list before first create, persistence across restart, and rate-limit behavior if the local contract keeps it enabled.

## Steps

1. Add `compiler/meshc/tests/support/m049_todo_sqlite_scaffold.rs` to generate the SQLite starter, control ports/db paths, run `meshc test` / `meshc build`, spawn the binary, and archive logs plus raw HTTP responses.
2. Add `compiler/meshc/tests/e2e_m049_s02.rs` covering happy-path local `/health` + CRUD, restart persistence, and at least one explicit negative rail.
3. Register the helper in `compiler/meshc/tests/support/mod.rs` and keep the harness cluster-free: no `MESH_*`, no `meshc cluster`, and `/health` must prove local mode.
4. Retain a stable `.tmp/m049-s02/...` bundle so S03 can snapshot the final SQLite scaffold output rather than re-deriving it.

## Must-Haves

- [ ] `cargo test -p meshc --test e2e_m049_s02 -- --nocapture` exercises generated package tests, build, live local runtime, restart persistence, and a diagnosable failure path.
- [ ] The runtime proof shows the SQLite starter working without cluster env or operator CLI surfaces.
- [ ] The retained artifact bundle is rich enough to debug bad db-path, malformed-id, or local health/runtime failures later.
  - Estimate: 2h
  - Files: compiler/meshc/tests/support/m049_todo_sqlite_scaffold.rs, compiler/meshc/tests/e2e_m049_s02.rs, compiler/meshc/tests/support/mod.rs
  - Verify: - `cargo test -p meshc --test e2e_m049_s02 -- --nocapture`
- [ ] **T04: Split the public README and website docs between SQLite-local and Postgres-clustered starter guidance** — Update the repo-facing docs so they stop describing the SQLite Todo starter as part of the canonical clustered contract. Keep the current proof-app references bounded until S04, but make the starter split explicit now: SQLite is the local starter, Postgres is the serious clustered/deployable starter, and `meshc init --clustered` stays the minimal clustered scaffold.

## Steps

1. Rewrite `README.md` and the M047-facing website pages so `meshc init --template todo-api` no longer implies clustered durability when `--db sqlite` is in play.
2. Point serious shared/deployable guidance at `meshc init --template todo-api --db postgres` and keep `meshc init --clustered` as the canonical minimal clustered surface.
3. Preserve the boundary that top-level proof apps are only being re-framed here, not retired yet; do not overclaim S04 in this slice.
4. Update `compiler/meshc/tests/e2e_m047_s06.rs` so stale clustered-SQLite wording becomes a named docs-contract failure.

## Must-Haves

- [ ] Public README and website docs clearly split SQLite-local, Postgres-clustered, and minimal clustered-scaffold guidance.
- [ ] The docs stop calling the SQLite Todo starter a canonical clustered/operator proof surface.
- [ ] `compiler/meshc/tests/e2e_m047_s06.rs` fails on stale SQLite-clustered wording while preserving the bounded proof-app references deferred to S04.
  - Estimate: 1h30m
  - Files: README.md, website/docs/docs/tooling/index.md, website/docs/docs/getting-started/clustered-example/index.md, website/docs/docs/distributed/index.md, website/docs/docs/distributed-proof/index.md, compiler/meshc/tests/e2e_m047_s06.rs
  - Verify: - `cargo test -p meshc --test e2e_m047_s06 -- --nocapture`
- `npm --prefix website run build`
- [ ] **T05: Retarget Mesh skill guidance and skill contract tests to the honest starter split** — Finish the assistant-facing contract. The Mesh root/clustering/HTTP skills should keep the route-free clustered runtime story and bounded `HTTP.clustered(...)` guidance, but they must stop teaching the SQLite Todo starter as part of the clustered runtime path.

## Steps

1. Update `tools/skill/mesh/SKILL.md` and `tools/skill/mesh/skills/clustering/SKILL.md` so clustered-runtime questions route to `meshc init --clustered` / `meshc init --template todo-api --db postgres`, while the SQLite starter is explicitly local-only.
2. Update `tools/skill/mesh/skills/http/SKILL.md` so `HTTP.clustered(...)` remains documented, but no longer uses the SQLite starter as the proof that clustered reads are part of the local starter contract.
3. Rewrite `scripts/tests/verify-m048-s04-skill-contract.test.mjs` to pin the new split without regressing the M048 helper-name/editor/update truths.
4. Keep `scripts/tests/verify-m048-s05-contract.test.mjs` green as the broader retained M048 non-regression check.

## Must-Haves

- [ ] Mesh skill guidance clearly separates SQLite-local starter advice from clustered-runtime/bootstrap advice.
- [ ] The HTTP skill still documents `HTTP.clustered(...)`, but not as the SQLite starter's public contract.
- [ ] The retained M048 skill-contract tests fail closed on stale clustered-SQLite guidance.
  - Estimate: 1h
  - Files: tools/skill/mesh/SKILL.md, tools/skill/mesh/skills/clustering/SKILL.md, tools/skill/mesh/skills/http/SKILL.md, scripts/tests/verify-m048-s04-skill-contract.test.mjs
  - Verify: - `node --test scripts/tests/verify-m048-s04-skill-contract.test.mjs`
- `node --test scripts/tests/verify-m048-s05-contract.test.mjs`
