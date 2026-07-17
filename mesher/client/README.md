# Hyperpush dashboard

This package is the production TanStack dashboard for the Mesher backend. The launch surface is
deliberately narrow: authenticated Issues, in-product Alerts, and backed Settings. Unsupported
routes and controls are removed instead of being represented by sample records or client-only
success states.

## Runtime contract

- `vite dev` starts the development app, normally on port `3000`.
- `vite build` creates the production bundle in `dist/`.
- `node server.mjs` serves that bundle and proxies same-origin `/api/v1` requests to Mesher.
- A management bearer session is required for dashboard routes.
- `GET /api/v1/auth/me` supplies the current user and authorized organization/project memberships.
- The selected project ID drives every project-scoped read and write.
- Ingestion API keys are a separate credential type and are never used as dashboard sessions.

The canonical route and removal record is [ROUTE-INVENTORY.md](ROUTE-INVENTORY.md). The executable
capability state is `../capabilities.json`.

## Commands

From the product root:

```bash
npm --prefix mesher/client ci
npm --prefix mesher/client run typecheck
npm --prefix mesher/client run lint
npm --prefix mesher/client run build
npm --prefix mesher/client run verify:route-inventory
npm --prefix mesher/client run test:e2e:dev -- --grep "mock surface closeout"
npm --prefix mesher/client run test:e2e:prod -- --grep "mock surface closeout"
```

The complete isolated backend, dashboard, landing, browser, accessibility, dependency, and bundle
gate is:

```bash
bash scripts/verify-platform.sh
```

## Source map

- `src/routes/_dashboard.tsx` — authenticated dashboard guard and shared layout.
- `components/dashboard/dashboard-session.tsx` — live user, membership, and active-project context.
- `components/dashboard/dashboard-route-map.ts` — retained route map validated against capabilities.
- `lib/mesher-api.ts` — strict same-origin API contracts and dynamic project/org methods.
- `lib/issues-live-adapter.ts` and `lib/alerts-live-adapter.ts` — direct live view-model mapping.
- `components/dashboard/settings/settings-live-state.tsx` — backed settings administration.
- `tests/e2e/mock-surface-closeout.spec.ts` — session, retained-route, lifecycle, project-switch,
  removed-route, and no-fallback browser proof.

## Product-data rule

Production source must not import seeded product records. Failed reads render empty error states, and
unsupported capabilities remain absent until their catalog state and proof are promoted together.
