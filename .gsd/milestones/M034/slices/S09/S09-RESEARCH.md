# S09 Research — Public freshness reconciliation and final assembly replay

## Summary

S09 is no longer a broad docs/public-surface debugging slice. The live public HTTP contract is already green against the checked repo state, while the canonical S05 replay is still blocked earlier in `remote-evidence` by stale hosted tag runs.

The current split is:

- **Public surface truth is green now.**
  - `python3 scripts/lib/m034_public_surface_contract.py public-http --root . --artifact-dir .tmp/m034-s09-public-http-check`
  - Passed on attempt 1.
  - `public-http.log` shows all seven exact surfaces passing: installers, docs pages, packages-site detail/search, and registry search.
- **Hosted workflow freshness is still red.**
  - `.tmp/m034-s05/verify/phase-report.txt` shows every local phase through `s04-workflows` passing and `remote-evidence` as the first failure.
  - `.tmp/m034-s05/verify/remote-runs.json` shows only two failing workflows now:
    - `deploy-services.yml` on `v0.1.0`
    - `release.yml` on `v0.1.0`
  - `deploy.yml`, `authoritative-verification.yml`, `extension-release-proof.yml`, and `publish-extension.yml` are already green.

This means S09 should be planned around **remote rollout + final replay**, not around more public-docs editing.

## Requirements Supported

From the milestone context, this slice primarily supports:

- **R045** — prove shipped release/deploy surfaces rather than inferring from artifact presence
- **R046** — ensure the real package-manager path still passes inside the assembled verifier replay
- **R047** — keep the extension release lane inside the assembled public-ready story

## Skills Discovered

Relevant installed skills already cover the slice’s core technologies:

- `github-workflows`
- `flyio-cli-public`
- `vitepress`

No new skills were installed. No `npx skills find ...` lookup was needed because the direct technologies for this slice already have installed skills.

Skill rules that matter here:

- **`github-workflows`**: use the repo-owned verifier/wrapper instead of ad hoc workflow probing. For this slice, that means `scripts/verify-m034-s05.sh` and `scripts/verify-m034-s06-remote-evidence.sh` stay authoritative.
- **`flyio-cli-public`**: debug deploy failures as **build/packaging vs runtime vs platform**. The current `deploy-services.yml` failure is clearly **build/packaging** in the `packages-website` image build, not a runtime or health-check problem.
- **`vitepress`**: assets in `website/docs/public/` are served as-is. That matches the current helper design, which compares `install.sh` and `install.ps1` by exact bytes against built/public surfaces.

## Current Truth

### Live remote refs

Read-only ref checks show the remote state is still pinned to the old rollout SHA:

- `git ls-remote --heads origin main` -> `6979a4a17221af8e39200b574aa2209ad54bc983 refs/heads/main`
- `git ls-remote --tags origin v0.1.0 ext-v0.3.0` -> both tags also point at `6979a4a17221af8e39200b574aa2209ad54bc983`
- Local `HEAD` is `163f24009b868256d7a3d144dd3a68bddce5a660`

So the hosted tag runs are still executing against the old remote SHA, not the current local branch tip.

### Current hosted verdicts

From `.tmp/m034-s05/verify/remote-runs.json`:

- `deploy.yml` -> **ok** on `main`
- `authoritative-verification.yml` -> **ok** on `main`
- `extension-release-proof.yml` -> **ok** on `ext-v0.3.0`
- `publish-extension.yml` -> **ok** on `ext-v0.3.0`
- `deploy-services.yml` -> **failed** on `v0.1.0`
  - run: `https://github.com/snowdamiz/mesh-lang/actions/runs/23655908637`
- `release.yml` -> **failed** on `v0.1.0`
  - run: `https://github.com/snowdamiz/mesh-lang/actions/runs/23655908648`

### Exact failing hosted surfaces

The durable failure logs are already present under `.tmp/m034-s08/tag-rollout/`.

#### `deploy-services.yml`

`deploy-services-v0.1.0-log-failed.txt` shows the failure is still the old `packages-website` image path:

- runtime Docker stage reruns `npm install --omit=dev --ignore-scripts`
- that hits `npm ERR! ERESOLVE unable to resolve dependency tree`
- `Deploy mesh-packages website` fails
- `Post-deploy health checks` is skipped

This matches the pre-fix Dockerfile, not the current local one.

#### `release.yml`

`release-v0.1.0-log-failed.txt` shows the failures are still the old release-smoke problems:

- Unix/macOS `Verify release assets (...)` jobs fail because `libmesh_rt.a` is missing for the staged smoke
- macOS Unix checksum step fails because `sha256sum` is unavailable
- Windows checksum step fails because the old `Select-Object -First 1,` syntax is broken
- `Create Release` is skipped because required `Verify release assets (...)` jobs are red

Again, this matches the pre-fix workflow, not the current local one.

## Implementation Landscape

### `scripts/verify-m034-s05.sh`

Canonical assembled verifier.

What it owns:

1. `prereq-sweep`
2. `candidate-tags`
3. local workflow/doc/install/extension reuse (`s05-workflows`, docs build/truth, `s02-workflows`, `s03-installer`, `s04-*`)
4. `remote-evidence`
5. `public-http`
6. `s01-live-proof`

Key planner constraints:

- The first red gate is currently `remote-evidence`; nothing after that is the blocker right now.
- `--stop-after remote-evidence` is a real public interface and should be used for preflight before the full replay.
- Full replay sources the repo `.env` before `scripts/verify-m034-s01.sh`, so S09 execution must preserve that self-contained pattern.

### `scripts/verify-m034-s06-remote-evidence.sh`

Archive wrapper for the stop-after `remote-evidence` bundle.

Important behavior:

- runs S05 with `VERIFY_M034_S05_STOP_AFTER=remote-evidence`
- requires `candidate-tags.json`, `remote-runs.json`, `phase-report.txt`, `status.txt`, `current-phase.txt`
- fails closed if the archive label already exists
- archives red bundles too

Current state:

- `.tmp/m034-s06/evidence/first-green/` is still absent
- `first-green` remains available for the first all-green hosted archive

### `scripts/lib/m034_public_surface_contract.py`

Shared helper for three scopes:

- `local-docs`
- `built-docs`
- `public-http`

What matters for S09:

- the helper already owns the exact public freshness contract
- it uses a bounded retry budget (`6` attempts, `15s` sleep, `20s` fetch timeout)
- it is already wired into `deploy.yml`, `deploy-services.yml`, and `scripts/verify-m034-s05.sh`
- a fresh direct run passed, so S09 should not spend time reworking public HTTP checks unless a later replay produces contradictory evidence

### Rollout-critical repo files

These are the local files that explain the current hosted failures:

#### `packages-website/Dockerfile`

Current local shape:

- builder does `npm ci`, `npm run build && npm prune --omit=dev`
- runtime copies builder-resolved `node_modules` and `build`
- runtime no longer reruns `npm install --omit=dev --ignore-scripts`

This is the exact fix for the current `deploy-services.yml` failure mode.

#### `.github/workflows/release.yml`

Current local shape:

- Unix checksum generation switched from `sha256sum` to an inline portable Python hasher
- Windows checksum generation now binds the two archives separately and avoids the broken `Select-Object -First 1,` form
- the `Verify release assets` job now installs Rust and runs `cargo build -q -p mesh-rt` before installer smoke

This is the exact fix for the current `release.yml` failure mode.

#### `scripts/verify-m034-s02-workflows.sh`

Not rollout-critical itself, but it already encodes the stronger contract for the updated `release.yml`. If `release.yml` changes again during S09, update this verifier in the same task.

### Commit seam for rollout work

`git log origin/main..HEAD -- .github/workflows/release.yml packages-website/Dockerfile ...` isolates the rollout-critical code to two commits:

- `85dab015` — packages-website Docker fix
- `5e457f3c` — release workflow smoke/checksum fix

Later local commits are evidence/slice bookkeeping, not the hosted failure repair itself.

## Key Risk

### Local `HEAD` is not a clean rollout target

`git diff --stat origin/main..HEAD -- ':!.gsd/'` shows local `HEAD` contains unrelated changes beyond the two S08 rollout fixes, including multiple `mesher/landing/...` files and local `.tmp` churn.

So S09 should **not** assume “push local `HEAD`” is the safe next step.

Natural implication for planning:

- either isolate the minimal rollout commit set for remote delivery
- or prove that the broader branch content is intended to ship

Because GitHub mutations are outward-facing, any push/tag recreation still requires explicit user confirmation.

## Freshness Gap To Be Aware Of

The current `remote-evidence` implementation checks:

- workflow file
- event
- branch/tag name
- run success
- required jobs/prefixes/steps

It does **not** fail if the successful run’s `headSha` is stale relative to the intended rollout SHA. It records `headSha` in `remote-runs.json` and the archive manifest, but freshness is still a planner/operator responsibility rather than an enforced verifier invariant.

That means S09 has two viable paths:

1. **Operational closeout only**: move the remote branch/tags to the correct SHA and rerun the existing verifier stack.
2. **Small verifier hardening first**: teach `remote-evidence` to compare required runs against the expected remote/tag SHA before trusting green status.

Given the current evidence, path 1 is likely enough to finish the slice; path 2 is a small, reasonable hardening if the user wants “freshness” enforced rather than observed manually.

## Recommendation

Plan S09 as three tasks, in this order:

### T01 — Rollout target isolation

Goal:

- decide the exact commit(s) that must reach GitHub for hosted `deploy-services.yml` and `release.yml` to rerun with the fixed code
- avoid blindly shipping unrelated local `HEAD` changes

Inputs:

- `git diff --name-only origin/main..HEAD -- ':!.gsd/'`
- `git log origin/main..HEAD -- .github/workflows/release.yml packages-website/Dockerfile ...`
- current remote refs (`origin/main`, `v0.1.0`, `ext-v0.3.0`)

Deliverable:

- a concrete rollout strategy the executor can perform after user approval

### T02 — Remote rollout + candidate-tag freshness

Goal:

- move the rollout-critical fixes onto GitHub
- retarget/recreate `v0.1.0` and likely `ext-v0.3.0` on the intended remote SHA
- wait for hosted workflows to settle

Expected hosted end-state:

- `deploy.yml` green on `main`
- `authoritative-verification.yml` green on `main`
- `deploy-services.yml` green on `v0.1.0`
- `release.yml` green on `v0.1.0`
- `extension-release-proof.yml` green on `ext-v0.3.0`
- `publish-extension.yml` green on `ext-v0.3.0`

### T03 — Final replay and evidence capture

Goal:

- rerun the stop-after `remote-evidence` preflight first
- if green and `first-green` is still unused, archive it exactly once
- then run the full `bash scripts/verify-m034-s05.sh` replay with `.env` loaded

This is the only task that should spend S01 live-proof time.

## Verification

Read-only checks already worth keeping in the plan:

```bash
git ls-remote --heads origin main && git ls-remote --tags origin v0.1.0 ext-v0.3.0
python3 scripts/lib/m034_public_surface_contract.py public-http --root . --artifact-dir .tmp/m034-s09-public-http-check
python3 - <<'PY'
import json
from pathlib import Path
obj = json.loads(Path('.tmp/m034-s05/verify/remote-runs.json').read_text())
for wf in obj['workflows']:
    print(wf['workflowFile'], wf['status'], (wf.get('runSummary') or {}).get('url'))
PY
```

Preflight after rollout:

```bash
bash -c 'set -euo pipefail; test -f .env; set -a; source .env; set +a; VERIFY_M034_S05_STOP_AFTER=remote-evidence bash scripts/verify-m034-s05.sh'
```

Archive only after the stop-after preflight is green:

```bash
bash -c 'set -euo pipefail; test -f .env; set -a; source .env; set +a; bash scripts/verify-m034-s06-remote-evidence.sh first-green'
```

Final acceptance replay:

```bash
bash -c 'set -euo pipefail; test -f .env; set -a; source .env; set +a; bash scripts/verify-m034-s05.sh'
```

If `.env` is missing publish credentials during execution, use `secure_env_collect` rather than asking the user to edit files.

## Don’t Hand-Roll

- Do **not** replace `scripts/verify-m034-s05.sh` with ad hoc `gh run list` / `curl` scripts for slice closeout.
- Do **not** debug `deploy-services.yml` as a runtime health issue first; the current failure is still the old Docker build path.
- Do **not** treat the current public docs/install surfaces as the blocker; the helper already proved them green live.
- Do **not** spend the `first-green` archive label until the stop-after `remote-evidence` replay is fully green.
