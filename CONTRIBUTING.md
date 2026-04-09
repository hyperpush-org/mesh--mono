# Contributing to Hyperpush Mono

Thanks for contributing.

This repository contains the product-owned Hyperpush surfaces only:

- `mesher/`
- `mesher/landing/`
- `mesher/frontend-exp/`
- root product CI/docs/verifier files that belong with those surfaces

It does **not** contain the Mesh compiler/runtime/docs/registry tree anymore. Language and toolchain changes belong in the sibling `mesh-lang` repo.

## Before you start

- Search existing issues and pull requests first.
- Keep changes scoped.
- If you change maintainer commands, update the affected README/verifier/workflow in the same PR.
- For security issues, do **not** open a public issue. See [SECURITY.md](SECURITY.md).

## Development setup

### Required

- Git
- Node.js and npm for `mesher/landing/` and `mesher/frontend-exp/`
- Docker for Mesher smoke verification
- PostgreSQL client tools (`psql`) for the Mesher maintainer verifier
- access to `meshc` via one of:
  - sibling `mesh-lang/target/debug/meshc`
  - explicit `MESHER_MESHC_BIN` + `MESHER_MESHC_SOURCE`
  - `meshc` on `PATH`

## Blessed sibling workspace

```text
<workspace>/
  mesh-lang/
  hyperpush-mono/
```

Mesher lives under `hyperpush-mono/mesher/`. Do not flatten it to `<workspace>/mesher`.

## Git safety in the split workspace

If you have the blessed sibling workspace, run this once from `mesh-lang/` to wire the tracked hooks into both repos:

```bash
bash scripts/workspace-git.sh install-hooks
```

Before committing or pushing from `hyperpush-mono`, check both repos:

```bash
bash ../mesh-lang/scripts/workspace-git.sh status
```

For a standalone `hyperpush-mono` clone with no sibling `mesh-lang` checkout, use the repo-local installer instead:

```bash
bash scripts/install-git-hooks.sh
```

The product repo `pre-push` hook blocks accidental partial pushes whenever the sibling `mesh-lang` repo is present and still dirty.
In a standalone product clone, the same tracked hook stays active but skips the cross-repo dirty-check because there is no sibling repo to inspect.
If you intentionally need a one-sided push, override that single command with `M055_ALLOW_PARTIAL_PUSH=1 git push ...`.

## Common commands

### Product-root verification

```bash
bash scripts/verify-m051-s01.sh
bash scripts/verify-landing-surface.sh
```

### Mesher package workflow

```bash
bash mesher/scripts/test.sh
DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} bash mesher/scripts/migrate.sh status
DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} bash mesher/scripts/migrate.sh up
bash mesher/scripts/build.sh .tmp/mesher-build
bash mesher/scripts/verify-maintainer-surface.sh
```

### Landing

```bash
npm --prefix mesher/landing ci
npm --prefix mesher/landing run build
```

### Frontend experiment

```bash
npm --prefix mesher/frontend-exp ci
npm --prefix mesher/frontend-exp run build
```

## Verification expectations

Use the smallest truthful command that proves the change:

- Mesher maintainer/runbook changes → `bash scripts/verify-m051-s01.sh`
- landing/root surface changes → `bash scripts/verify-landing-surface.sh`
- `frontend-exp` UI changes → `npm --prefix mesher/frontend-exp run build`
- Mesher package script changes → rerun the affected `mesher/scripts/*.sh` command plus the root wrapper if the public maintainer surface changed

## Pull requests

A good PR includes:

- a clear summary
- the exact verification commands you ran
- notes about cross-repo fallout when a product change also requires a `mesh-lang` follow-up

## License

By contributing, you agree that your contributions will be licensed under the project license in [LICENSE](LICENSE).
