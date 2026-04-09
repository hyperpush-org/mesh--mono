# Agent workspace rules

This repo is the **product-only** side of the split workspace.
It is not the Mesh language repo.

## Repo ownership

This repo owns:

- `mesher/`
- `mesher/landing/`
- `mesher/frontend-exp/`
- product-root CI/docs/verifier surfaces

Language/toolchain changes belong in the sibling `mesh-lang` repo.

Blessed sibling workspace:

```text
<workspace>/
  mesh-lang/
  hyperpush-mono/
```

## Before commit or push

If the blessed sibling workspace exists, check both repos first:

```bash
bash ../mesh-lang/scripts/workspace-git.sh status
```

Install the tracked split hooks once from `mesh-lang/`:

```bash
bash ../mesh-lang/scripts/workspace-git.sh install-hooks
```

If this is only a standalone `hyperpush-mono` clone with no sibling `mesh-lang` checkout, use the repo-local installer instead:

```bash
bash scripts/install-git-hooks.sh
```

The product repo `pre-push` hook refuses accidental partial pushes whenever the sibling `mesh-lang` repo is present and still dirty.
In a standalone product clone, it stays active but skips the cross-repo dirty-check.

## Push commands

From `mesh-lang/`, the safest push entrypoints are:

```bash
bash scripts/workspace-git.sh push hyperpush-mono
bash scripts/workspace-git.sh push both
```

If you are already in `hyperpush-mono/`, ordinary `git push` is fine once the sibling repo is clean and the hooks are installed.

To bypass the guard intentionally for one command only:

```bash
M055_ALLOW_PARTIAL_PUSH=1 git push ...
```

## Never do this

- Do not treat this repo and `mesh-lang` as one branch graph.
- Do not land language/compiler/runtime changes here just because you are in the product workspace.
- Do not ignore a dirty sibling `mesh-lang` checkout when the hook warns about it unless the one-sided push is truly intentional.
