# Platform hardening migration.
#
# This migration closes the trust-boundary and schema-integrity gaps found by
# the 2026-07-16 platform audit. API key plaintext is deliberately destroyed:
# callers must rotate/reissue keys after this migration if they did not retain
# the original one-time value.

pub fn up(pool :: PoolHandle) -> Int ! String do
  # API keys are looked up by a non-secret prefix and verified with pgcrypto's
  # bcrypt implementation. The reusable plaintext column is removed.
  Pool.execute(pool, "ALTER TABLE api_keys ADD COLUMN key_prefix TEXT", []) ?
  Pool.execute(pool, "ALTER TABLE api_keys ADD COLUMN key_hash TEXT", []) ?
  Pool.execute(pool, "UPDATE api_keys SET key_prefix = left(key_value, 13), key_hash = crypt(key_value, gen_salt('bf', 12))", []) ?
  Pool.execute(pool, "ALTER TABLE api_keys ALTER COLUMN key_prefix SET NOT NULL", []) ?
  Pool.execute(pool, "ALTER TABLE api_keys ALTER COLUMN key_hash SET NOT NULL", []) ?
  Pool.execute(pool, "DROP INDEX IF EXISTS idx_api_keys_value", []) ?
  Pool.execute(pool, "ALTER TABLE api_keys DROP COLUMN key_value", []) ?
  Pool.execute(pool, "CREATE INDEX idx_api_keys_prefix_active ON api_keys (key_prefix) WHERE revoked_at IS NULL", []) ?

  # Normalize legacy rows before validating stronger constraints. Orphans are
  # removed in child-first order because they cannot be assigned safely to a
  # tenant; bounded/enumerated values are repaired to documented defaults.
  Pool.execute(pool, "DELETE FROM events e WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = e.project_id) OR NOT EXISTS (SELECT 1 FROM issues i WHERE i.id = e.issue_id)", []) ?
  Pool.execute(pool, "DELETE FROM issues i WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = i.project_id)", []) ?
  Pool.execute(pool, "DELETE FROM sessions WHERE expires_at <= created_at", []) ?
  Pool.execute(pool, "UPDATE org_memberships SET role = 'member' WHERE role NOT IN ('owner', 'admin', 'member')", []) ?
  Pool.execute(pool, "UPDATE projects SET retention_days = LEAST(365, GREATEST(1, retention_days)), sample_rate = LEAST(1.0, GREATEST(0.0, sample_rate))", []) ?
  Pool.execute(pool, "UPDATE issues SET level = 'error' WHERE level NOT IN ('fatal', 'error', 'warning', 'info', 'debug')", []) ?
  Pool.execute(pool, "UPDATE issues SET status = 'unresolved' WHERE status NOT IN ('unresolved', 'resolved', 'archived', 'discarded')", []) ?
  Pool.execute(pool, "UPDATE issues SET event_count = 0 WHERE event_count < 0", []) ?
  Pool.execute(pool, "UPDATE events SET level = 'error' WHERE level NOT IN ('fatal', 'error', 'warning', 'info', 'debug')", []) ?
  Pool.execute(pool, "UPDATE alert_rules SET cooldown_minutes = LEAST(10080, GREATEST(0, cooldown_minutes))", []) ?
  Pool.execute(pool, "UPDATE alerts SET status = 'active' WHERE status NOT IN ('active', 'acknowledged', 'resolved')", []) ?

  # Tenant ownership and lifecycle integrity.
  Pool.execute(pool, "ALTER TABLE org_memberships ADD CONSTRAINT org_memberships_role_check CHECK (role IN ('owner', 'admin', 'member'))", []) ?
  Pool.execute(pool, "ALTER TABLE sessions ADD CONSTRAINT sessions_expiry_check CHECK (expires_at > created_at)", []) ?
  Pool.execute(pool, "ALTER TABLE projects ADD CONSTRAINT projects_retention_days_check CHECK (retention_days BETWEEN 1 AND 365)", []) ?
  Pool.execute(pool, "ALTER TABLE projects ADD CONSTRAINT projects_sample_rate_check CHECK (sample_rate >= 0.0 AND sample_rate <= 1.0)", []) ?
  Pool.execute(pool, "ALTER TABLE issues ADD CONSTRAINT issues_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE", []) ?
  Pool.execute(pool, "ALTER TABLE issues ADD CONSTRAINT issues_level_check CHECK (level IN ('fatal', 'error', 'warning', 'info', 'debug'))", []) ?
  Pool.execute(pool, "ALTER TABLE issues ADD CONSTRAINT issues_status_check CHECK (status IN ('unresolved', 'resolved', 'archived', 'discarded'))", []) ?
  Pool.execute(pool, "ALTER TABLE issues ADD CONSTRAINT issues_event_count_check CHECK (event_count >= 0)", []) ?
  Pool.execute(pool, "ALTER TABLE events ADD CONSTRAINT events_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE", []) ?
  Pool.execute(pool, "ALTER TABLE events ADD CONSTRAINT events_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE", []) ?
  Pool.execute(pool, "ALTER TABLE events ADD CONSTRAINT events_level_check CHECK (level IN ('fatal', 'error', 'warning', 'info', 'debug'))", []) ?
  Pool.execute(pool, "ALTER TABLE alert_rules ADD CONSTRAINT alert_rules_cooldown_check CHECK (cooldown_minutes BETWEEN 0 AND 10080)", []) ?
  Pool.execute(pool, "ALTER TABLE alerts ADD CONSTRAINT alerts_status_check CHECK (status IN ('active', 'acknowledged', 'resolved'))", []) ?

  # A regression is claimed once per resolved -> unresolved transition.
  Pool.execute(pool, "ALTER TABLE issues ADD COLUMN regression_pending BOOLEAN NOT NULL DEFAULT false", []) ?

  # Redacted audit records intentionally omit request bodies and credentials.
  Migration.create_table(pool,
  "audit_logs",
  ["id:UUID:PRIMARY KEY DEFAULT gen_random_uuid()", "user_id:UUID REFERENCES users(id) ON DELETE SET NULL", "method:TEXT:NOT NULL", "path:TEXT:NOT NULL", "outcome:TEXT:NOT NULL", "created_at:TIMESTAMPTZ:NOT NULL DEFAULT now()"]) ?
  Migration.create_index(pool, "audit_logs", ["user_id", "created_at:DESC"], "name:idx_audit_logs_user_created") ?
  Migration.create_index(pool, "audit_logs", ["created_at:DESC"], "name:idx_audit_logs_created") ?

  # Retention is executed as one database transaction. The transaction-scoped
  # advisory lock prevents two schedulers from deleting/dropping concurrently;
  # shared partitions are retained for the largest active project policy plus
  # a seven-day safety margin. Dry runs count candidates without mutation.
  Pool.execute(pool,
  """CREATE OR REPLACE FUNCTION hyperpush_retention_cleanup(p_dry_run boolean DEFAULT false)
RETURNS TABLE(deleted_events bigint, dropped_partitions integer, partition_retention_days integer)
LANGUAGE plpgsql AS $$
DECLARE
  v_retention_days integer;
  v_partition record;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('hyperpush-retention-cleaner')) THEN
    RAISE EXCEPTION 'retention cleanup already running';
  END IF;

  SELECT COALESCE(max(retention_days), 1) + 7
    INTO v_retention_days
    FROM projects;

  IF p_dry_run THEN
    SELECT count(*) INTO deleted_events
      FROM events e
      JOIN projects p ON p.id = e.project_id
     WHERE e.received_at < now() - make_interval(days => p.retention_days);
    SELECT count(*)::integer INTO dropped_partitions
      FROM pg_inherits i
      JOIN pg_class child ON child.oid = i.inhrelid
      JOIN pg_class parent ON parent.oid = i.inhparent
     WHERE parent.relname = 'events'
       AND substring(child.relname from '([0-9]{8})$') <> ''
       AND to_date(substring(child.relname from '([0-9]{8})$'), 'YYYYMMDD') < current_date - v_retention_days;
  ELSE
    DELETE FROM events e USING projects p
     WHERE p.id = e.project_id
       AND e.received_at < now() - make_interval(days => p.retention_days);
    GET DIAGNOSTICS deleted_events = ROW_COUNT;
    dropped_partitions := 0;
    FOR v_partition IN
      SELECT child.relname AS partition_name
        FROM pg_inherits i
        JOIN pg_class child ON child.oid = i.inhrelid
        JOIN pg_class parent ON parent.oid = i.inhparent
       WHERE parent.relname = 'events'
         AND substring(child.relname from '([0-9]{8})$') <> ''
         AND to_date(substring(child.relname from '([0-9]{8})$'), 'YYYYMMDD') < current_date - v_retention_days
    LOOP
      EXECUTE format('DROP TABLE %I', v_partition.partition_name);
      dropped_partitions := dropped_partitions + 1;
    END LOOP;
  END IF;

  partition_retention_days := v_retention_days;
  RETURN NEXT;
END;
$$""",
  []) ?
  Ok(0)
end

pub fn down(pool :: PoolHandle) -> Int ! String do
  Pool.execute(pool, "DROP FUNCTION hyperpush_retention_cleanup(boolean)", []) ?
  Migration.drop_table(pool, "audit_logs") ?
  Pool.execute(pool, "ALTER TABLE issues DROP COLUMN regression_pending", []) ?
  Pool.execute(pool, "ALTER TABLE alerts DROP CONSTRAINT alerts_status_check", []) ?
  Pool.execute(pool, "ALTER TABLE alert_rules DROP CONSTRAINT alert_rules_cooldown_check", []) ?
  Pool.execute(pool, "ALTER TABLE events DROP CONSTRAINT events_level_check", []) ?
  Pool.execute(pool, "ALTER TABLE events DROP CONSTRAINT events_issue_id_fkey", []) ?
  Pool.execute(pool, "ALTER TABLE events DROP CONSTRAINT events_project_id_fkey", []) ?
  Pool.execute(pool, "ALTER TABLE issues DROP CONSTRAINT issues_event_count_check", []) ?
  Pool.execute(pool, "ALTER TABLE issues DROP CONSTRAINT issues_status_check", []) ?
  Pool.execute(pool, "ALTER TABLE issues DROP CONSTRAINT issues_level_check", []) ?
  Pool.execute(pool, "ALTER TABLE issues DROP CONSTRAINT issues_project_id_fkey", []) ?
  Pool.execute(pool, "ALTER TABLE projects DROP CONSTRAINT projects_sample_rate_check", []) ?
  Pool.execute(pool, "ALTER TABLE projects DROP CONSTRAINT projects_retention_days_check", []) ?
  Pool.execute(pool, "ALTER TABLE sessions DROP CONSTRAINT sessions_expiry_check", []) ?
  Pool.execute(pool, "ALTER TABLE org_memberships DROP CONSTRAINT org_memberships_role_check", []) ?
  Pool.execute(pool, "DROP INDEX idx_api_keys_prefix_active", []) ?
  Pool.execute(pool, "ALTER TABLE api_keys ADD COLUMN key_value TEXT", []) ?
  Pool.execute(pool, "UPDATE api_keys SET key_value = 'revoked_' || id::text", []) ?
  Pool.execute(pool, "ALTER TABLE api_keys ALTER COLUMN key_value SET NOT NULL", []) ?
  Pool.execute(pool, "ALTER TABLE api_keys ADD CONSTRAINT api_keys_key_value_key UNIQUE (key_value)", []) ?
  Pool.execute(pool, "CREATE INDEX idx_api_keys_value ON api_keys (key_value) WHERE revoked_at IS NULL", []) ?
  Pool.execute(pool, "ALTER TABLE api_keys DROP COLUMN key_hash", []) ?
  Pool.execute(pool, "ALTER TABLE api_keys DROP COLUMN key_prefix", []) ?
  Ok(0)
end
