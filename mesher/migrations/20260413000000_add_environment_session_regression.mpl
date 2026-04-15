# Migration: add environment and session_id to events, last_resolved_at to issues.
# environment -- first-class column so operators can filter by deployment target
#   without relying on tags JSONB. Partial index covers only rows where the SDK
#   sends the field; rows from older SDKs are excluded from the index automatically.
# session_id -- correlates events from the same SDK session for session-context
#   queries without decomposing user_context JSONB on every read path.
# last_resolved_at -- records the timestamp of the last manual resolve so
#   regression detection (resolved -> unresolved flip) can fire regression alerts.

pub fn up(pool :: PoolHandle) -> Int ! String do
  Pool.execute(pool, "ALTER TABLE events ADD COLUMN IF NOT EXISTS environment TEXT", []) ?
  Pool.execute(pool, "ALTER TABLE events ADD COLUMN IF NOT EXISTS session_id TEXT", []) ?
  Pool.execute(pool, "ALTER TABLE issues ADD COLUMN IF NOT EXISTS last_resolved_at TIMESTAMPTZ", []) ?
  Pool.execute(pool, "CREATE INDEX IF NOT EXISTS idx_events_environment ON events (project_id, environment, received_at DESC) WHERE environment IS NOT NULL", []) ?
  Pool.execute(pool, "CREATE INDEX IF NOT EXISTS idx_events_session ON events (session_id, received_at DESC) WHERE session_id IS NOT NULL", []) ?
  Pool.execute(pool, "CREATE INDEX IF NOT EXISTS idx_issues_last_resolved ON issues (last_resolved_at) WHERE last_resolved_at IS NOT NULL", []) ?
  Ok(0)
end

pub fn down(pool :: PoolHandle) -> Int ! String do
  Pool.execute(pool, "DROP INDEX IF EXISTS idx_issues_last_resolved", []) ?
  Pool.execute(pool, "DROP INDEX IF EXISTS idx_events_session", []) ?
  Pool.execute(pool, "DROP INDEX IF EXISTS idx_events_environment", []) ?
  Pool.execute(pool, "ALTER TABLE issues DROP COLUMN IF EXISTS last_resolved_at", []) ?
  Pool.execute(pool, "ALTER TABLE events DROP COLUMN IF EXISTS session_id", []) ?
  Pool.execute(pool, "ALTER TABLE events DROP COLUMN IF EXISTS environment", []) ?
  Ok(0)
end
