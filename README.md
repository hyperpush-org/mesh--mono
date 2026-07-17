# Hyperpush

This repo is the product-only root for Hyperpush in the blessed two-repo workspace.

It owns:

- `mesher/` — the Mesher app/runtime package
- `mesher/landing/` — the landing site
- `mesher/client/` — the canonical product-owned TanStack dashboard surface
- product-root CI, docs, and maintainer verifiers that belong with those surfaces

It does **not** own the Mesh language/compiler/runtime/docs/registry/packages-site tree. That stays in the sibling `mesh-lang` repo.

## Blessed sibling workspace

```text
<workspace>/
  mesh-lang/
  hyperpush-mono/
    mesher/
    mesher/landing/
    mesher/client/
```

The blessed product package root remains `hyperpush-mono/mesher/...`.
Do not flatten the product package to `<workspace>/mesher`.

## Repo-root maintainer surfaces

- `MOCK-SURFACE-CLOSEOUT-PLAN.md` — ordered vertical-slice plan for replacing or removing every mixed, shell-only, and mock-only product surface
- `mesher/README.md` — Mesher maintainer runbook
- `mesher/client/ROUTE-INVENTORY.md` — canonical retained-route and unavailable-capability inventory
- `bash mesher/scripts/verify-maintainer-surface.sh` — package-owned Mesher maintainer replay
- `bash scripts/verify-platform.sh` — isolated PostgreSQL, backend, dashboard, landing, browser, accessibility, dependency, and bundle release gates
- `bash scripts/verify-landing-surface.sh` — landing/root-surface verifier
- `bash scripts/verify-m061-s04.sh` — root-level closeout wrapper for the canonical client inventory handoff
- `.github/workflows/ci.yml` — product CI for Mesher + landing + `client`
- `.github/workflows/deploy-landing.yml` — landing deploy/build workflow
- `.github/dependabot.yml` — product-owned dependency update scope

## Toolchain boundary

Mesher build/test/migrate/smoke flows need `meshc`.

The supported paths are:

1. a blessed sibling `mesh-lang/` checkout with `target/debug/meshc`
2. an explicit executable path in `MESHER_MESHC_BIN` (`MESHER_MESHC_SOURCE` is optional diagnostic metadata)
3. `meshc` on `PATH`

If you are working in the blessed sibling workspace, the normal path is:

```text
<workspace>/
  mesh-lang/
  hyperpush-mono/
```

## Product repo identity

Canonical product repo URL: https://github.com/hyperpush-org/hyperpush

The landing app and `client` stay product-owned here. `mesher/landing` remains the intentional Next.js runtime surface; `mesher/client` owns the authenticated Issues, Alerts, and backed Settings launch surface. Performance, Releases, AI, delivery channels, commercial controls, unsupported security/profile writes, and self-service project creation are unavailable and absent from production UI until implemented and proven.

## Working rules

- product changes live here
- language/toolchain changes live in `mesh-lang`
- if a product workflow depends on Mesh tooling, wire it to the sibling `mesh-lang` checkout or an explicit `meshc` override instead of copying compiler sources into this repo

## Git safety in the split workspace

If you are working in the blessed sibling workspace, install the tracked split-workspace hooks once from `mesh-lang/`:

```bash
bash ../mesh-lang/scripts/workspace-git.sh install-hooks
```

Then check both repos before committing or pushing:

```bash
bash ../mesh-lang/scripts/workspace-git.sh status
```

For a standalone `hyperpush-mono` clone with no sibling `mesh-lang` checkout, use the repo-local installer instead:

```bash
bash scripts/install-git-hooks.sh
```

The product repo `pre-push` hook blocks accidental partial pushes whenever the sibling `mesh-lang` repo is present and still dirty.
In a standalone product clone, the same tracked hook stays active but skips the cross-repo dirty-check because there is no sibling repo to inspect.
If you intentionally need a one-sided push, override the guard for that command only with `M055_ALLOW_PARTIAL_PUSH=1 git push ...`.
