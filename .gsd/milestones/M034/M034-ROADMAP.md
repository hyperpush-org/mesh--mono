# M034: 

## Vision
Harden CI/CD and ensure everything important is included in it, test the package manager end to end, and turn Mesh’s public release path into something that is proven rather than assumed.

## Slice Overview
| ID | Slice | Risk | Depends | Done | After this |
|----|-------|------|---------|------|------------|
| S01 | Real registry publish/install proof | high | — | ✅ | A release-scoped package can be published to the real registry path and installed with `meshpkg`, with checksum, metadata, download, and lockfile truth rechecked. |
| S02 | Authoritative CI verification lane | high | S01 | ✅ | PR and release verification rerun the real Mesh proof surfaces, including the package-manager path, instead of stopping at artifact builds. |
| S03 | Release assets and installer truth | medium | S01, S02 | ✅ | Released `meshc` and `meshpkg` artifacts are proven installable and runnable through the documented installer path instead of only being uploaded. |
| S04 | Extension release path hardening | medium | S02 | ✅ | The VS Code extension publish lane validates the packaged extension and release prerequisites before public publication. |
| S05 | Full public release assembly proof | high | S01, S02, S03, S04 | ✅ | One release candidate is proven across binaries, installer, docs deployment, registry/packages-site health, and extension release checks as a single public-ready flow. |
| S06 | Hosted rollout evidence capture | high | S05 | ✅ | The remote default branch and current candidate tags have first green hosted runs for authoritative verification, release-smoke, deploy, services deploy, extension proof, and extension publish, with evidence captured for S05 consumption. |
| S07 | Public surface freshness and final assembly replay | high | S06 | ✅ | `meshlang.dev` installers/docs now match repo truth, and the canonical `bash scripts/verify-m034-s05.sh` replay finishes green through `remote-evidence`, `public-http`, and `s01-live-proof`. |
| S08 | Hosted rollout completion and first-green evidence | high | S07 | ✅ | Remote `main`, `v0.1.0`, and `ext-v0.3.0` now have the hosted workflow evidence S05 expects, with a preserved first-green bundle for milestone closeout. |
| S09 | Public freshness reconciliation and final assembly replay | high | S08 | ✅ | `meshlang.dev` installers/docs match repo truth and the canonical `bash scripts/verify-m034-s05.sh` replay finishes green through `remote-evidence`, `public-http`, and `s01-live-proof`. |
| S10 | Hosted verification blocker remediation | high | S09 | ⬜ | `authoritative-verification.yml` and `release.yml` are green on the current rollout SHA, with blocker artifacts and local regressions updated to match the repaired hosted behavior. |
| S11 | First-green archive and final assembly closeout | high | S10 | ⬜ | `VERIFY_M034_S05_STOP_AFTER=remote-evidence bash scripts/verify-m034-s05.sh` is green, `.tmp/m034-s06/evidence/first-green/` is captured exactly once, and the full `bash scripts/verify-m034-s05.sh` assembly replay finishes green for milestone revalidation. |
