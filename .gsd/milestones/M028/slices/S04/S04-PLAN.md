# S04: Boring Native Deployment

**Goal:** Prove `reference-backend/` can ship as a staged native artifact with a boring deployment path: build once, stage a native binary plus a deploy-time migration artifact, apply schema without `meshc` on the runtime side, then start and smoke-check the binary outside the repo root.
**Demo:** A temp-dir deployment bundle containing the compiled `reference-backend` binary, a deploy SQL artifact, and thin package-local scripts can be staged from this repo, have migrations applied through `psql`, start from the staged location, pass `/health`, process a job end to end, and be described by package-local docs that name the exact build/apply/run/smoke commands.

## Must-Haves

- S04 directly advances **R005** by proving one honest boring deployment path for `reference-backend/` instead of asking the runtime host to behave like a Mesh compiler workstation.
- The runtime-side deployment contract must stay thin: staged binary + `DATABASE_URL`/`PORT`/`JOB_POLL_MS` + reachable Postgres; no `meshc`, `libmesh_rt.a`, or source-tree checkout required after staging.
- The slice must ship a package-local deployment bundle path with a checked-in deploy migration artifact and thin staging/apply/probe scripts that operate on the staged artifact rather than rebuilding locally.
- A compiler-facing ignored e2e must stage the artifact outside the repo root, apply the deploy migration path, start the staged binary, verify health/job processing truth, and assert logs/output do not echo `DATABASE_URL`.
- S04 supports **R008** and **R010** by updating `reference-backend/README.md` and `reference-backend/.env.example` to the exact verified deployment commands and by grounding the “easier deployment” claim in concrete artifacts and smoke proof.

## Proof Level

- This slice proves: operational
- Real runtime required: yes
- Human/UAT required: no

## Verification

- `cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_builds -- --nocapture`
- `tmp_dir="$(mktemp -d)" && bash reference-backend/scripts/stage-deploy.sh "$tmp_dir" && test -x "$tmp_dir/reference-backend" && test -f "$tmp_dir/reference-backend.up.sql" && test -x "$tmp_dir/deploy-smoke.sh"`
- `cargo test -p meshc e2e_self_contained_binary -- --nocapture`
- `DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_deploy_artifact_smoke -- --ignored --nocapture`
- `tmp_dir="$(mktemp -d)" && if bash reference-backend/scripts/apply-deploy-migrations.sh "$tmp_dir/missing-reference-backend.up.sql" >"$tmp_dir/apply-missing.log" 2>&1; then echo "expected apply-deploy-migrations.sh to fail for a missing artifact" >&2; exit 1; else rg -n "\[deploy-apply\] missing deploy SQL artifact" "$tmp_dir/apply-missing.log"; fi`
- `rg -n "Boring native deployment|stage-deploy\.sh|apply-deploy-migrations\.sh|deploy-smoke\.sh|runtime host" reference-backend/README.md && rg -n "^DATABASE_URL=|^PORT=|^JOB_POLL_MS=" reference-backend/.env.example`

## Observability / Diagnostics

- Runtime signals: stage/apply/probe scripts print named bundle, migration, health, and job-flow phases; the staged binary keeps readable startup logs without echoing secrets.
- Inspection surfaces: `reference-backend/scripts/stage-deploy.sh`, `reference-backend/scripts/apply-deploy-migrations.sh`, `reference-backend/scripts/deploy-smoke.sh`, `compiler/meshc/tests/e2e_reference_backend.rs`, `/health`, `/jobs/:id`, `_mesh_migrations`, and `jobs`.
- Failure visibility: deploy failures should stop at the exact stage (bundle, SQL apply, startup, health, job poll) with temp-dir/log-file context and durable DB truth available for inspection.
- Redaction constraints: do not print or persist `DATABASE_URL`; diagnostics should name safe file paths, ports, endpoints, migration versions, and job ids only.

## Integration Closure

- Upstream surfaces consumed: `reference-backend/main.mpl`, `reference-backend/migrations/20260323010000_create_jobs.mpl`, `reference-backend/scripts/smoke.sh`, `compiler/meshc/tests/e2e_reference_backend.rs`, and `compiler/meshc/tests/e2e.rs`.
- New wiring introduced in this slice: a staged deployment bundle, a deploy-time SQL apply path that preserves `_mesh_migrations`, a probe-only smoke path for staged/running artifacts, and an ignored operational e2e proving the staged artifact outside the repo root.
- What remains before the milestone is truly usable end-to-end: S05 still needs supervision/recovery proof, and S06 still needs broader docs/example promotion beyond the package-local operator path.

## Tasks

- [x] **T01: Stage a deploy bundle and boring migration path** `est:2h`
  - Why: The binary already runs outside the repo root, but deployment is not boring until schema apply stops depending on `meshc migrate` on the runtime side and the staged artifact shape is explicit.
  - Files: `reference-backend/migrations/20260323010000_create_jobs.mpl`, `reference-backend/scripts/smoke.sh`, `reference-backend/deploy/reference-backend.up.sql`, `reference-backend/scripts/stage-deploy.sh`, `reference-backend/scripts/apply-deploy-migrations.sh`, `reference-backend/scripts/deploy-smoke.sh`
  - Do: Keep the Mesh migration file canonical for dev/CI, add a deploy-time SQL artifact derived from it for the boring deployment path, create scripts to stage a temp-dir bundle and apply the deploy SQL through `psql` without `meshc`, and add a probe-only smoke script that exercises an already-staged or already-running binary instead of rebuilding locally.
  - Verify: `tmp_dir="$(mktemp -d)" && bash reference-backend/scripts/stage-deploy.sh "$tmp_dir" && test -x "$tmp_dir/reference-backend" && test -f "$tmp_dir/reference-backend.up.sql" && test -x "$tmp_dir/deploy-smoke.sh" && DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} bash reference-backend/scripts/apply-deploy-migrations.sh "$tmp_dir/reference-backend.up.sql" && psql "$DATABASE_URL" -Atqc "select version::text from _mesh_migrations where version = 20260323010000" | rg "20260323010000"`
  - Done when: a staged deployment directory contains the runnable binary plus boring deploy assets, and schema apply can be done through the deploy artifact without invoking `meshc`.
- [ ] **T02: Prove staged-artifact deployment in the backend e2e harness** `est:90m`
  - Why: S04 only counts if the staged deployment path is mechanically exercised from build to migrated startup to job processing, not just implied by scripts or docs.
  - Files: `compiler/meshc/tests/e2e_reference_backend.rs`, `compiler/meshc/tests/e2e.rs`, `reference-backend/scripts/stage-deploy.sh`, `reference-backend/scripts/apply-deploy-migrations.sh`, `reference-backend/scripts/deploy-smoke.sh`, `reference-backend/deploy/reference-backend.up.sql`
  - Do: Extend the existing `e2e_reference_backend` harness with temp-dir helpers that stage the bundle, apply the deploy SQL, start the staged binary from the staged location, and run a deploy smoke flow that cross-checks HTTP truth, DB truth, `_mesh_migrations`, and log redaction while reusing the self-contained-binary proof as supporting evidence.
  - Verify: `cargo test -p meshc e2e_self_contained_binary -- --nocapture && DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_deploy_artifact_smoke -- --ignored --nocapture`
  - Done when: one ignored Rust e2e proves the staged bundle works outside the repo root and fails with actionable stage/apply/start/probe diagnostics instead of vague deploy breakage.
- [ ] **T03: Document the operator-facing boring deployment workflow** `est:60m`
  - Why: S04 only helps launchability and the “easier deployment” claim if operators can see the exact verified build/apply/run/smoke commands and the runtime-host contract in the canonical backend docs.
  - Files: `reference-backend/README.md`, `reference-backend/.env.example`, `reference-backend/scripts/stage-deploy.sh`, `reference-backend/scripts/apply-deploy-migrations.sh`, `reference-backend/scripts/deploy-smoke.sh`
  - Do: Add a package-local “Boring native deployment” runbook that distinguishes build-host vs runtime-host requirements, documents the staged bundle layout and SQL apply path, points to the deploy smoke flow, and keeps `.env.example` aligned with the verified runtime contract without overselling broader platform support that belongs to S06.
  - Verify: `DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_deploy_artifact_smoke -- --ignored --nocapture && rg -n "Boring native deployment|stage-deploy\.sh|apply-deploy-migrations\.sh|deploy-smoke\.sh|runtime host" reference-backend/README.md && rg -n "^DATABASE_URL=|^PORT=|^JOB_POLL_MS=" reference-backend/.env.example`
  - Done when: the reference-backend docs tell the exact verified deployment story and a future evaluator can follow package-local instructions without guessing what runs at build time versus runtime.

## Files Likely Touched

- `reference-backend/migrations/20260323010000_create_jobs.mpl`
- `reference-backend/deploy/reference-backend.up.sql`
- `reference-backend/scripts/stage-deploy.sh`
- `reference-backend/scripts/apply-deploy-migrations.sh`
- `reference-backend/scripts/deploy-smoke.sh`
- `reference-backend/scripts/smoke.sh`
- `compiler/meshc/tests/e2e_reference_backend.rs`
- `reference-backend/README.md`
- `reference-backend/.env.example`
