# Mesher client dashboard

This package is the canonical TanStack dashboard app for Mesher.

It runs as a Vite-powered TanStack Start app from `hyperpush-mono/mesher/client/` and now exercises the Issues route through a provider-owned same-origin `/api/v1` seam for both live reads and the supported maintainer actions. The shell stays visually intact by overlaying truthful Mesher issue/detail/timeline state onto the existing mock-shaped dashboard model, so unsupported fields remain visible and explicitly shell-only instead of disappearing or pretending to be live.

## Package root

```text
hyperpush-mono/
  mesher/
    client/
```
## Docker Compose

Use the following Docker Compose commands for development and production:

```bash
# Development
docker compose up dev

# Production (build and run in detached mode)
docker compose up prod --build -d
```


## Maintainer workflow

From the product repo root:

```bash
npm --prefix mesher ci
npm --prefix mesher run dev
npm --prefix mesher/client run build
PORT=3001 npm --prefix mesher/client run start
bash mesher/scripts/seed-live-issue.sh
npm --prefix mesher/client run test:e2e:dev -- --grep "issues live"
npm --prefix mesher/client run test:e2e:prod -- --grep "issues live"
```

`npm --prefix mesher run dev` is the one-command local loop: it starts the TanStack client on port `3000`, compiles the backend, and runs the compiled Mesher binary on `http://127.0.0.1:18180` so the client proxy can use the default same-origin `/api/v1` flow.

From this package directory:

```bash
npm ci
vite dev
vite build
node server.mjs
bash ../scripts/seed-live-issue.sh
npm run test:e2e:dev -- --grep "issues live"
npm run test:e2e:prod -- --grep "issues live"
```

## Runtime contract

- `vite dev` starts the local dashboard dev server on port `3000` by default.
- `vite build` produces the production bundle in `dist/`.
- `node server.mjs` serves the built app and static assets from `dist/client`.
- `test:e2e:dev` verifies the live Issues seam against the dev server and same-origin Mesher proxy.
- `test:e2e:prod` verifies the same live seam against the built production server.
- `bash mesher/scripts/seed-live-issue.sh` deterministically seeds the read-proof issue and resets the action-proof issue back to an open/unresolved state before live verification.

## Live Issues seam

- Overview reads go through same-origin `/api/v1/projects/default/*` routes.
- Selecting an issue reads `/api/v1/issues/:issue_id/events?limit=1`, `/api/v1/events/:event_id`, and `/api/v1/issues/:issue_id/timeline` through the provider-owned state path.
- Supported live maintainer actions are `Resolve`, `Reopen`, and `Ignore`, which call same-origin `/api/v1/issues/:issue_id/{resolve,unresolve,archive}` from the existing detail action row.
- The UI intentionally uses a mixed live/mock overlay: live Mesher truth replaces supported fields, while unsupported shell sections keep explicit fallback values.
- `AI Analysis`, issue-link chrome, bounty chrome, and the retained proof-rail buttons remain visible but shell-only; they are not claimed as live backend actions.
- Backend read and mutation failures are surfaced through the mounted Radix toaster and `issues-shell` / detail-panel `data-*` attributes instead of silently reverting.

## Important files

- `src/routes/` — TanStack route tree for the dashboard shell and direct-entry pages.
- `src/router.tsx` and `src/routeTree.gen.ts` — router assembly.
- `server.mjs` — package-local production bridge for the built app.
- `playwright.config.ts` — package-local dev/prod Playwright harness.
- `tests/e2e/issues-live-read.spec.ts` — live Issues read proof, including detail/timeline reads, sparse fallback retention, and failure toasts.
- `tests/e2e/issues-live-actions.spec.ts` — live Issues action proof for resolve/reopen/ignore, same-origin routing, and destructive toast coverage.
- `components/dashboard/dashboard-issues-state.tsx` — provider-owned overview + selected-issue Mesher read orchestration.
- `components/ui/toaster.tsx` and `hooks/use-toast.ts` — mounted Radix toast surface reused for live read and mutation failures.
- `app/globals.css` — shared global styles imported by the TanStack root route.

## Verification notes

The canonical full-shell proof rail layers both seed helpers with the assembled walkthrough and the existing live Issues/admin+ops suites:

```bash
bash mesher/scripts/seed-live-issue.sh
bash mesher/scripts/seed-live-admin-ops.sh
npm --prefix mesher/client run test:e2e:dev -- --grep "issues live|admin and ops live|seeded walkthrough"
npm --prefix mesher/client run test:e2e:prod -- --grep "issues live|admin and ops live|seeded walkthrough"
```

- `tests/e2e/seeded-walkthrough.spec.ts` is the canonical route-to-route shell proof. It covers direct-entry and in-app navigation parity across Issues, Performance, Solana Programs, Releases, Alerts, Bounties, Treasury, and Settings.
- `tests/e2e/live-runtime-helpers.ts` owns the shared same-origin request tracking, direct-backend rejection, and filtered runtime diagnostics used by the walkthrough and route-level live suites.
- `bash mesher/scripts/seed-live-issue.sh` resets the seeded live Issues read/action fixtures.
- `bash mesher/scripts/seed-live-admin-ops.sh` resets the seeded Alerts and Settings admin/ops fixtures used by the assembled rail.

The narrower route-level verification commands remain useful when you are only iterating on the Issues seam:

```bash
bash mesher/scripts/seed-live-issue.sh
npm --prefix mesher/client run test:e2e:dev -- --grep "issues live"
npm --prefix mesher/client run test:e2e:prod -- --grep "issues live"
```

When the seam regresses, the first signal should appear as one of:

- a failed same-origin `/api/v1` request in Playwright request tracking
- a visible destructive toast for mutation or selected-issue read failures
- a mismatched `issues-shell` or `issue-detail-panel` `data-*` attribute
- a broken `dev`, `build`, `start`, or `test:e2e:*` script
- a `node server.mjs` boot failure after build
