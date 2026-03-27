---
estimated_steps: 4
estimated_files: 4
skills_used:
  - github-workflows
---

# T01: Harden remote-evidence freshness against stale hosted runs

**Slice:** S09 — Public freshness reconciliation and final assembly replay
**Milestone:** M034

## Description

`R045` is still weak if `scripts/verify-m034-s05.sh` accepts a green run that only matches the branch/tag name while the hosted `headSha` is stale. This task turns freshness into a verifier-enforced contract instead of a manual operator check.

## Failure Modes

| Dependency | On error | On timeout | On malformed response |
|------------|----------|-----------|----------------------|
| `git ls-remote` / remote ref resolution inside the verifier | Fail closed and report the missing expected SHA instead of trusting a branch/tag-only match. | Treat it as an external ref blocker and stop the phase. | Treat missing or ambiguous ref output as freshness failure. |
| `gh run list` / `gh run view` inside remote-evidence | Keep the workflow red and preserve the query logs for inspection. | Fail the phase with the timeout artifact instead of retrying blindly. | Fail the phase and preserve raw stdout/stderr plus parse-error context. |
| S06 archive manifest copy path | Stop and repair the archive contract before later tasks rely on it. | N/A | Treat missing freshness fields in `manifest.json` as archive drift. |

## Load Profile

- **Shared resources**: GitHub Actions API queries, remote git refs, and the `.tmp/m034-s05/verify/` / `.tmp/m034-s06/evidence/` artifact trees.
- **Per-operation cost**: a bounded set of `gh` list/view calls for six workflows plus local JSON writes.
- **10x breakpoint**: GitHub API throttling or repeated list/view retries hits first, so the verifier must stay bounded and artifact-driven.

## Negative Tests

- **Malformed inputs**: missing `v0.1.0` / `ext-v0.3.0` refs, empty `headSha`, or wrong ref names in `gh` payloads.
- **Error paths**: `gh run list/view` non-zero exit, JSON parse failure, or archive copy missing required files.
- **Boundary conditions**: green workflow jobs on the right branch/tag but the wrong `headSha`; reusable workflow job names with caller prefixes.

## Steps

1. Extend `scripts/verify-m034-s05.sh` so each required workflow resolves the expected `main`, `v0.1.0`, or `ext-v0.3.0` SHA and compares it against the hosted run's `headSha`.
2. Persist expected SHA, observed SHA, mismatch reason, and latest-available run context into `.tmp/m034-s05/verify/remote-runs.json` and archived `manifest.json` content.
3. Update `scripts/verify-m034-s06-remote-evidence.sh` so the archive summary preserves the new freshness fields.
4. Extend the Node contract tests to cover stale-sha failure, reusable workflow naming, and preserved archive shape.

## Must-Haves

- [ ] `remote-evidence` rejects stale hosted green runs even when job names and branch/tag names match.
- [ ] `remote-runs.json` and archived manifests record expected SHA, observed SHA, and a freshness-specific failure reason.
- [ ] The contract tests cover both the verifier and the archive helper.

## Verification

- `node --test scripts/tests/verify-m034-s05-contract.test.mjs scripts/tests/verify-m034-s06-contract.test.mjs`
- `rg -n "headSha|expected.*Sha|stale" scripts/verify-m034-s05.sh scripts/verify-m034-s06-remote-evidence.sh`

## Observability Impact

- Signals added/changed: `.tmp/m034-s05/verify/remote-runs.json` and archived `manifest.json` now record expected ref SHAs, observed run SHAs, and freshness-specific failure reasons.
- How a future agent inspects this: rerun stop-after `remote-evidence` and inspect `.tmp/m034-s05/verify/remote-runs.json` or `.tmp/m034-s06/evidence/<label>/manifest.json`.
- Failure state exposed: stale-run acceptance becomes an explicit mismatch instead of a silent green.

## Inputs

- `scripts/verify-m034-s05.sh`
- `scripts/verify-m034-s06-remote-evidence.sh`
- `scripts/tests/verify-m034-s05-contract.test.mjs`
- `scripts/tests/verify-m034-s06-contract.test.mjs`

## Expected Output

- `scripts/verify-m034-s05.sh`
- `scripts/verify-m034-s06-remote-evidence.sh`
- `scripts/tests/verify-m034-s05-contract.test.mjs`
- `scripts/tests/verify-m034-s06-contract.test.mjs`
