# Mesher operations

Mesher ships in explicit single-node mode. Run database migrations before the
binary; startup fails closed if PostgreSQL, the hardened schema, or the next
seven event partitions are unavailable.

## Service probes

- `GET /health/live` proves the HTTP process is running.
- `GET /health/ready` verifies the required schema through PostgreSQL and
  returns `503` until the dependency is ready.
- `GET /metrics` exposes process, WebSocket, per-project ingestion outcome,
  and rate-limit counters in Prometheus text format.

Do not use a tenant API as a readiness probe. Alert on sustained readiness
failure, `unavailable`/`dropped` ingestion outcomes, rate-limit saturation,
retention failures, or an unexpected rise in authentication denials.

## Retention

Project retention is constrained to 1–365 days. Shared event partitions are
kept for the maximum active project policy plus a seven-day safety margin.
Cleanup is serialized with a PostgreSQL advisory transaction lock.

Preview a cleanup without deleting rows or partitions:

```sql
SELECT * FROM hyperpush_retention_cleanup(true);
```

Run the cleanup deliberately:

```sql
SELECT * FROM hyperpush_retention_cleanup(false);
```

Record the returned deleted-event and dropped-partition counts in the
operations log. Investigate any unexpectedly large change before rerunning.

## Credential and incident handling

Management calls use expiring bearer sessions. Ingestion uses project-scoped
API keys stored as a lookup prefix plus bcrypt hash; a reusable secret is shown
only at creation. Revoke suspected keys immediately, create a replacement, and
review `audit_logs` plus redacted authentication-denial logs. Never copy session
tokens, API keys, or event bodies into tickets or log annotations.

## Release verification

From the product repository root, run:

```bash
bash scripts/verify-platform.sh
```

The verifier creates an isolated PostgreSQL cluster, migrates and seeds it,
builds/tests the backend, runs dashboard and landing static/browser gates, and
removes the temporary database on exit.
