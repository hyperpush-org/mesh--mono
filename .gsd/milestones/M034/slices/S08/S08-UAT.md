# S08: Hosted rollout completion and first-green evidence — UAT

**Milestone:** M034
**Written:** 2026-03-27T17:17:42.376Z

# S08: Hosted rollout completion and first-green evidence — UAT

**Milestone:** M034
**Written:** 2026-03-27

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: S08 changed repo-owned workflow/verifier logic and evidence-capture behavior. The important proof is that the local contract stays green, the archive wrapper preserves truthful hosted state, and the blocker evidence precisely identifies why `first-green` is still unavailable.

## Preconditions

- Run from the repo root with `.env` present so GitHub read-only workflow queries can authenticate.
- Docker is installed and usable for the `packages-website` image build.
- The tester understands that `first-green` must remain absent unless all hosted candidate-tag workflows are green.
- If rerunning the archive capture, remove `.tmp/m034-s06/evidence/s08-prepush/` first; do not touch `.tmp/m034-s06/evidence/first-green/`.

## Smoke Test

Run `bash scripts/verify-m034-s05-workflows.sh`.

**Expected:** The deploy/deploy-services workflow contract verifier exits 0 and prints `verify-m034-s05-workflows: ok (all)`.

## Test Cases

### 1. Fresh pre-push hosted-evidence baseline stays red and preserves the archive

1. Remove any disposable prior archive with `rm -rf .tmp/m034-s06/evidence/s08-prepush`.
2. Load `.env`, then run:
   `bash scripts/verify-m034-s06-remote-evidence.sh s08-prepush`
   and expect the command to exit non-zero.
3. Inspect `.tmp/m034-s06/evidence/s08-prepush/status.txt`, `current-phase.txt`, `manifest.json`, and `remote-runs.json`.
4. **Expected:**
   - `status.txt` is `failed`
   - `current-phase.txt` is `remote-evidence`
   - `manifest.json` records `stopAfterPhase == "remote-evidence"`
   - `remote-runs.json` shows `deploy.yml` and `authoritative-verification.yml` as green on `main`
   - `remote-runs.json` shows `release.yml` and `deploy-services.yml` as failed on `v0.1.0`
   - `.tmp/m034-s06/evidence/first-green/` does not exist

### 2. Local deploy/release contract repairs are green

1. Run `docker build -f packages-website/Dockerfile packages-website`.
2. Run `bash scripts/verify-m034-s02-workflows.sh`.
3. Run `bash scripts/verify-m034-s05-workflows.sh`.
4. Run `bash scripts/verify-m034-s03.sh`.
5. **Expected:**
   - the Docker build completes successfully without a runtime-stage `npm install --omit=dev --ignore-scripts` / `ERESOLVE` failure
   - the S02 workflow contract verifier exits 0
   - the S05 workflow contract verifier exits 0
   - the staged installer verifier exits 0, builds `mesh-rt`, installs staged `meshc`/`meshpkg`, and exercises the expected metadata/checksum/download/extract failure cases

### 3. Candidate-tag blocker evidence is durable and points at rollout propagation, not tag creation

1. Inspect `.tmp/m034-s08/tag-rollout/tag-refs.txt`.
2. Inspect `.tmp/m034-s08/tag-rollout/workflow-status.json` plus the per-workflow `*-view.json` files.
3. Compare `local_head_sha` in `tag-refs.txt` to the remote `refs/heads/main` SHA and the `headSha` values in `workflow-status.json`.
4. **Expected:**
   - `refs/tags/v0.1.0` and `refs/tags/ext-v0.3.0` both exist and point at `6979a4a17221af8e39200b574aa2209ad54bc983`
   - `local_head_sha` is different (`5e457f3cce9b58d34be6516164b093f253047510`)
   - `publish-extension.yml` is green on `ext-v0.3.0`
   - `release.yml` and `deploy-services.yml` are `completed/failure` on `v0.1.0`
   - the blocker is clearly a stale rolled-out SHA / missing remote propagation, not missing tag refs

## Edge Cases

### Stale `v0.1.0` evidence directory stays non-authoritative

1. Inspect `.tmp/m034-s06/evidence/v0.1.0/`.
2. **Expected:** `manifest.json` and `status.txt` are absent there, so the directory is treated as historical noise rather than as a valid archive bundle.

### Archive label reuse fails closed

1. Leave `.tmp/m034-s06/evidence/s08-prepush/` in place.
2. Re-run `bash scripts/verify-m034-s06-remote-evidence.sh s08-prepush`.
3. **Expected:** The command fails immediately with a label-exists error instead of overwriting the existing archive.

## Failure Signals

- `first-green/` exists before the hosted `v0.1.0` workflows are green.
- `s08-prepush/manifest.json` or `remote-runs.json` is missing after archive capture.
- `workflow-status.json` stops recording `headSha`, `headBranch`, or final conclusions for the candidate workflows.
- The `packages-website` Docker build reintroduces a second runtime dependency resolution path or fails with `ERESOLVE`.
- `bash scripts/verify-m034-s03.sh` fails to build `mesh-rt`, fails staged installer smoke, or regresses the portable checksum paths.

## Requirements Proved By This UAT

- none — S08 is a blocker-capture and delivery-truth slice; it does not transition a requirement by itself.

## Not Proven By This UAT

- That `origin/main` contains the repaired local SHA.
- That `release.yml` and `deploy-services.yml` are green on the repaired rollout commit.
- That `.tmp/m034-s06/evidence/first-green/` can be claimed yet.
- That `meshlang.dev` public freshness is reconciled; that remains downstream S09 work after hosted rollout is fixed.

## Notes for Tester

Use the canonical local verifier surfaces (`bash scripts/verify-m034-s03.sh`, workflow verifiers, and the archive wrapper) rather than older ad hoc snapshots. Do not treat `.tmp/m034-s06/evidence/v0.1.0/` as proof, and do not create `first-green` until the hosted candidate-tag workflows are actually green on the rolled-out commit.
