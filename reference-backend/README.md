# reference-backend

`reference-backend/` is the canonical Mesh backend package for this slice. It proves one real runtime can compose:

- env-driven startup validation
- Postgres migrations
- `GET /health`
- `POST /jobs`
- `GET /jobs/:id`
- a timer-driven worker that moves the same persisted row from `pending` to `processed`

## Startup contract

These variables are required by `reference-backend/main.mpl`:

- `DATABASE_URL` — required Postgres connection string
- `PORT` — required positive integer HTTP port
- `JOB_POLL_MS` — required positive integer worker poll interval in milliseconds

## Prerequisites

- Rust toolchain for `cargo`
- a reachable Postgres instance
- `curl` and `psql` available in your shell
- environment loaded from `reference-backend/.env.example` or exported in your shell

Example local setup:

```bash
cp reference-backend/.env.example .env
# Update DATABASE_URL for your local Postgres, then load it:
set -a && source .env && set +a
```

## Canonical commands

### Build compiler/runtime prerequisites

```bash
cargo build -p mesh-rt
```

### Build the package

```bash
cargo run -p meshc -- build reference-backend
```

### Check the explicit missing-env failure

```bash
env -u DATABASE_URL PORT=18080 JOB_POLL_MS=500 ./reference-backend/reference-backend 2>&1 | rg "DATABASE_URL"
```

### Inspect migration state

```bash
DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} cargo run -p meshc -- migrate reference-backend status
```

### Apply migrations

```bash
DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} cargo run -p meshc -- migrate reference-backend up
```

### Run the backend

```bash
DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} PORT=18080 JOB_POLL_MS=500 ./reference-backend/reference-backend
```

### Run the package smoke path

```bash
DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} PORT=18080 JOB_POLL_MS=500 bash reference-backend/scripts/smoke.sh
```

## Compiler-facing proof targets

These are the authoritative repo-level proofs for the package:

### Build-only proof

```bash
cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_builds -- --nocapture
```

### Non-empty `DATABASE_URL` startup regression proof

```bash
DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_runtime_starts -- --ignored --nocapture
```

### Postgres smoke proof

```bash
DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_postgres_smoke -- --ignored --nocapture
```

The ignored smoke proof runs the real migration commands and then delegates to `reference-backend/scripts/smoke.sh`, so the Rust e2e target and the package-local smoke script stay on the same contract.
