# S01 UAT: Canonical Backend Golden Path

## Purpose

Validate that `reference-backend/` is a real Mesh backend proof path, not just a compilable scaffold. This UAT exercises the exact surfaces S02-S06 will depend on: startup contract, migrations, health, create/read job APIs, background processing, DB inspection, and compiler-facing proof commands.

## Preconditions

- Run every command from the repo root.
- A reachable Postgres instance is available and exported as `DATABASE_URL`.
- `PORT` is free for the chosen run.
- `curl`, `psql`, and `python3` are installed.
- No stale `reference-backend` process is listening on `:18080` before the compiler runtime-start proof.

Recommended env:

```bash
export DATABASE_URL='postgres://<user>:<pass>@<host>:<port>/<db>'
export PORT=18080
export JOB_POLL_MS=500
```

## Test Case 1 — Build and explicit missing-env failure

### Steps

1. Run:
   ```bash
   cargo build -p mesh-rt
   cargo run -p meshc -- build reference-backend
   ```
2. Confirm the binary exists:
   ```bash
   test -x reference-backend/reference-backend
   ```
3. Run the missing-env path:
   ```bash
   mkdir -p .gsd/tmp
   env -u DATABASE_URL PORT=18080 JOB_POLL_MS=500 ./reference-backend/reference-backend 2>&1 | tee .gsd/tmp/reference-backend-missing-env.log
   ```
4. Check the output:
   ```bash
   rg "Missing required environment variable DATABASE_URL" .gsd/tmp/reference-backend-missing-env.log
   ```

### Expected outcome

- `mesh-rt` and `reference-backend` build successfully.
- `reference-backend/reference-backend` exists and is executable.
- The missing-env run fails explicitly with a readable `DATABASE_URL` error.
- The process does not segfault or bind HTTP when `DATABASE_URL` is absent.

## Test Case 2 — Migration visibility and schema readiness

### Steps

1. Inspect migration status:
   ```bash
   DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} cargo run -p meshc -- migrate reference-backend status
   ```
2. Apply any pending migrations:
   ```bash
   DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} cargo run -p meshc -- migrate reference-backend up
   ```
3. Confirm the durable table exists:
   ```bash
   psql "$DATABASE_URL" -Atqc "SELECT to_regclass('public.jobs') IS NOT NULL"
   ```
4. Confirm the key columns exist:
   ```bash
   psql "$DATABASE_URL" -Atqc "SELECT string_agg(column_name, ',') FROM information_schema.columns WHERE table_name = 'jobs' AND column_name IN ('id','status','attempts','last_error','payload','created_at','updated_at','processed_at')"
   ```

### Expected outcome

- Status shows `20260323010000_create_jobs` as applied or pending before `up`.
- `up` applies the migration or reports `No pending migrations`.
- `to_regclass('public.jobs')` returns `t`.
- The `jobs` table exposes the lifecycle columns used by HTTP and the worker.

## Test Case 3 — Runtime startup, logs, and `/health`

### Steps

1. Start the backend and capture logs:
   ```bash
   mkdir -p .gsd/tmp
   rm -f .gsd/tmp/reference-backend.log .gsd/tmp/reference-backend.pid
   DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} PORT=${PORT:-18080} JOB_POLL_MS=${JOB_POLL_MS:-500} ./reference-backend/reference-backend >.gsd/tmp/reference-backend.log 2>&1 & echo $! >.gsd/tmp/reference-backend.pid
   ```
2. Wait for health:
   ```bash
   python3 - <<'PY'
import json, time, urllib.request, os
port = os.environ.get('PORT', '18080')
url = f'http://127.0.0.1:{port}/health'
for _ in range(40):
    try:
        data = json.loads(urllib.request.urlopen(url, timeout=2).read().decode())
        print(json.dumps(data))
        raise SystemExit(0)
    except Exception:
        time.sleep(0.25)
raise SystemExit('health never became ready')
PY
   ```
3. Inspect the captured log file:
   ```bash
   rg "Config loaded|PostgreSQL pool ready|Runtime registry ready|Job worker started|HTTP server starting" .gsd/tmp/reference-backend.log
   ```
4. Confirm the logs do not echo the DB URL:
   ```bash
   if grep -F "$DATABASE_URL" .gsd/tmp/reference-backend.log; then exit 1; fi
   ```

### Expected outcome

- `/health` returns HTTP 200 with JSON containing `status: "ok"` and a `worker` object.
- The `worker` object includes `status`, `poll_ms`, `started_at`, `last_tick_at`, `processed_jobs`, and `failed_jobs`.
- Logs show config load, pool readiness, registry readiness, worker start, and HTTP bind.
- Logs do not contain the literal `DATABASE_URL`.

## Test Case 4 — Durable job lifecycle (`POST /jobs` → worker → `GET /jobs/:id`)

### Steps

1. Create a job:
   ```bash
   create_json=$(curl -sf -X POST "http://127.0.0.1:${PORT:-18080}/jobs" -H 'content-type: application/json' --data '{"kind":"uat","source":"S01-UAT","attempt":1}')
   echo "$create_json"
   ```
2. Capture the job id:
   ```bash
   job_id=$(CREATE_JSON="$create_json" python3 - <<'PY'
import json, os
print(json.loads(os.environ['CREATE_JSON'])['id'])
PY
)
   echo "$job_id"
   ```
3. Immediately fetch the job once:
   ```bash
   curl -sf "http://127.0.0.1:${PORT:-18080}/jobs/$job_id"
   ```
4. Poll until the worker processes it:
   ```bash
   JOB_ID="$job_id" PORT=${PORT:-18080} python3 - <<'PY'
import json, os, time, urllib.request
job_id = os.environ['JOB_ID']
port = os.environ['PORT']
url = f'http://127.0.0.1:{port}/jobs/{job_id}'
for _ in range(40):
    data = json.loads(urllib.request.urlopen(url, timeout=2).read().decode())
    if data['status'] == 'processed':
        print(json.dumps(data))
        raise SystemExit(0)
    time.sleep(0.25)
raise SystemExit('job never reached processed')
PY
   ```
5. Confirm the durable DB row matches the HTTP state:
   ```bash
   psql "$DATABASE_URL" -P pager=off -x -c "SELECT id::text, status, attempts, last_error, processed_at IS NOT NULL AS processed, payload::text FROM jobs WHERE id = '$job_id';"
   ```
6. Re-check health after processing:
   ```bash
   curl -sf "http://127.0.0.1:${PORT:-18080}/health"
   ```

### Expected outcome

- `POST /jobs` returns HTTP 201 with a JSON job record and a stable UUID id.
- The job is visible through `GET /jobs/:id`.
- The worker flips the same durable row from `pending` to `processed` without manual DB edits.
- `attempts` becomes `1`.
- `processed_at` becomes non-null.
- The DB row and HTTP response agree on job id, status, attempts, and payload.
- `/health` reflects worker activity via `last_job_id` and `processed_jobs`.

## Test Case 5 — Edge case: unknown job id returns a clean 404

### Steps

1. Request a job id that should not exist:
   ```bash
   curl -si "http://127.0.0.1:${PORT:-18080}/jobs/00000000-0000-0000-0000-000000000000"
   ```

### Expected outcome

- Response status is `404 Not Found`.
- Response body is `{"error":"job not found"}`.
- The server stays healthy after the request.

## Test Case 6 — Compiler-facing proof targets stay green

### Steps

1. Run the build-only proof:
   ```bash
   cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_builds -- --nocapture
   ```
2. Clear any stale listener on `:18080`:
   ```bash
   lsof -ti tcp:18080 | xargs -r kill -TERM || true
   ```
3. Run the runtime-start regression proof:
   ```bash
   DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_runtime_starts -- --ignored --nocapture
   ```
4. Run the end-to-end Postgres smoke proof:
   ```bash
   lsof -ti tcp:18080 | xargs -r kill -TERM || true
   DATABASE_URL=${DATABASE_URL:?set DATABASE_URL} cargo test -p meshc --test e2e_reference_backend e2e_reference_backend_postgres_smoke -- --ignored --nocapture
   ```

### Expected outcome

- All three repo-level proof targets pass.
- The runtime-start proof reaches `/health` on a real `DATABASE_URL`.
- The Postgres smoke proof delegates to the same package-local smoke contract and passes end-to-end.

## Cleanup

After the manual runtime cases, stop the background server:

```bash
kill "$(cat .gsd/tmp/reference-backend.pid)" 2>/dev/null || true
rm -f .gsd/tmp/reference-backend.pid
```

## Known execution gotchas

- The working migration CLI order is `meshc migrate reference-backend <command>`.
- The working Cargo test order is `cargo test -p meshc --test e2e_reference_backend <test_name> -- ...`.
- If `e2e_reference_backend_runtime_starts` fails unexpectedly, clear stale listeners on `:18080` before rerunning it.
- `GET /health` is the fastest trustworthy way to distinguish an idle worker from a failed or never-started worker before diving into raw logs.
