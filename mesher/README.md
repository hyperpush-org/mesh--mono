# Mesher

This README is the canonical maintainer runbook for Mesher's current PostgreSQL + runtime contract inside the product-only Hyperpush repo.

## Startup contract

Mesher validates configuration, opens the PostgreSQL pool, verifies the hardened schema, creates the next seven daily event partitions, and only then starts its HTTP and WebSocket listeners. It currently ships in explicit single-node mode.

### Required for every run

- `DATABASE_URL` — PostgreSQL connection string

### Local-development defaults

- `PORT` — HTTP port (`8080` by default)
- `MESHER_WS_PORT` — WebSocket port (`8081` by default)
- `MESHER_RATE_LIMIT_WINDOW_SECONDS` — rate-limit window size (`60` by default)
- `MESHER_RATE_LIMIT_MAX_EVENTS` — rate-limit budget per window (`1000` by default)

Clustering, continuity, and automatic failover are not product contracts in this release. Run one Mesher process per database until a supervised multi-node design is implemented and tested.

## Toolchain boundary

Mesher scripts need `meshc`.

Supported resolution paths:

1. blessed sibling `mesh-lang/target/debug/meshc`
2. explicit executable path in `MESHER_MESHC_BIN` (`MESHER_MESHC_SOURCE` is optional diagnostic metadata)
3. `meshc` on `PATH`

If you are working in the blessed sibling workspace, keep:

```text
<workspace>/
  mesh-lang/
  hyperpush-mono/
```

## Seeded development data

`mesher/migrations/20260226000000_seed_default_org.mpl` inserts the local smoke data this runbook proves:

- organization slug: `default`
- project slug: `default`
- dev API key label: `dev-default`
- dev API key: `mshr_devdefaultapikey000000000000000000000000000`

## Maintainer loop

### 1. Load local env

From the product repo root:

```bash
cp mesher/.env.example .env.mesher
# Update DATABASE_URL for your local Postgres, then load it.
set -a && source .env.mesher && set +a
```

### 2. Install Mesher dev helpers

```bash
npm --prefix mesher ci
```

### 3. Run the package tests

```bash
bash mesher/scripts/test.sh
```

### 4. Inspect migration state

```bash
DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} bash mesher/scripts/migrate.sh status
```

### 5. Apply migrations

```bash
DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} bash mesher/scripts/migrate.sh up
```

For the local dashboard walkthrough, seed an expiring owner session after migrating:

```bash
DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} bash mesher/scripts/seed-e2e-auth.sh
```

### 6. Run the frontend and backend together

```bash
npm --prefix mesher run dev
```

That command uses `concurrently` to:

- start the TanStack client on `http://127.0.0.1:3000`
- compile Mesher into `hyperpush-mono/.tmp/mesher-dev/build/mesher`
- run the compiled backend on `http://127.0.0.1:18180` with WebSockets on `18181`

The default `18180` backend port matches the client proxy contract, so `/api/v1` works without an extra `MESHER_BACKEND_ORIGIN` override during local development.

### 7. Build Mesher directly

```bash
bash mesher/scripts/build.sh .tmp/mesher-build
```

That build writes the runnable binary to `.tmp/mesher-build/mesher`.

### 8. Run Mesher directly

```bash
DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} \
PORT=${PORT:-8080} \
MESHER_WS_PORT=${MESHER_WS_PORT:-8081} \
MESHER_RATE_LIMIT_WINDOW_SECONDS=${MESHER_RATE_LIMIT_WINDOW_SECONDS:-60} \
MESHER_RATE_LIMIT_MAX_EVENTS=${MESHER_RATE_LIMIT_MAX_EVENTS:-1000} \
.tmp/mesher-build/mesher
```

## Live seed-event smoke

### Readiness check

```bash
curl -sSf http://127.0.0.1:8080/health/ready
```

### Event ingest smoke

```bash
curl -sSf \
  -X POST \
  http://127.0.0.1:8080/api/v1/events \
  -H 'Content-Type: application/json' \
  -H 'x-sentry-auth: mshr_devdefaultapikey000000000000000000000000000' \
  -d '{"message":"README smoke event","level":"error"}'
```

### Read back seeded project issues

```bash
curl -sSf \
  -H 'Authorization: Bearer hyperpush-e2e-session-token-0000000000000000000000000000' \
  'http://127.0.0.1:8080/api/v1/projects/default/issues?status=unresolved'
```

### Optional storage readback

```bash
curl -sSf \
  -H 'Authorization: Bearer hyperpush-e2e-session-token-0000000000000000000000000000' \
  http://127.0.0.1:8080/api/v1/projects/default/storage
```

Operational probes, retention procedures, credential handling, and incident guidance live in `mesher/OPERATIONS.md`.

## Authoritative proof rails

Package-owned maintainer replay:

```bash
bash mesher/scripts/verify-maintainer-surface.sh
```

Hermetic platform release replay (isolated PostgreSQL, backend, both frontends, browsers, accessibility, dependency audit, and budgets):

```bash
bash scripts/verify-platform.sh
```

Product-root wrapper:

```bash
bash scripts/verify-m051-s01.sh
```

The package-owned verifier is the authoritative Mesher maintainer rail. The root wrapper exists so product-root CI and repo-boundary callers can invoke the same proof surface from the repo root without depending on a local `mesh-lang` layout hack.
