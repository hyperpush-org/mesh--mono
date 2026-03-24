# StorageWriter SQL functions for Mesher monitoring platform.
# Provides the low-level event INSERT and the storage-local batch flush helper.
# Service state, buffering, retry policy, and timer triggers stay in Services.Writer.
#
# Events are stored as JSON strings. PostgreSQL parses the JSON server-side
# during INSERT using jsonb extraction operators.
# issue_id and fingerprint are passed as separate SQL parameters (not extracted
# from JSON) -- see research Open Question 1, Option B.
# Insert a single event into the events table from a JSON-encoded string.
# issue_id and fingerprint are passed separately (computed by EventProcessor
# via extract_event_fields + upsert_issue) rather than extracted from JSON.
# Uses PostgreSQL jsonb extraction for remaining fields.
# Returns the number of rows affected (1 on success).
# ORM boundary: Repo.insert cannot express server-side JSONB extraction (j->>'field')
# in INSERT...SELECT pattern. Repo.insert takes Map<String,String> of literal values,
# but this query extracts fields from a JSONB parameter server-side. This module
# intentionally keeps that boundary in raw SQL rather than duplicating the JSONB
# extraction client-side.

pub fn insert_event(pool :: PoolHandle,
project_id :: String,
issue_id :: String,
fingerprint :: String,
json_str :: String) -> Int ! String do
  let result = Repo.execute_raw(pool,
  "INSERT INTO events (project_id, issue_id, level, message, fingerprint, exception, stacktrace, breadcrumbs, tags, extra, user_context, sdk_name, sdk_version) SELECT $1::uuid, $2::uuid, j->>'level', j->>'message', $3, (j->'exception')::jsonb, (j->'stacktrace')::jsonb, (j->'breadcrumbs')::jsonb, COALESCE((j->'tags')::jsonb, '{}'::jsonb), COALESCE((j->'extra')::jsonb, '{}'::jsonb), (j->'user_context')::jsonb, j->>'sdk_name', j->>'sdk_version' FROM (SELECT $4::jsonb AS j) AS sub",
  [project_id, issue_id, fingerprint, json_str])
  result
end

fn flush_loop(pool :: PoolHandle, project_id :: String, events, i :: Int, total :: Int) -> Int ! String do
  if i < total do
    let entry = List.get(events, i)
    let parts = String.split(entry, "|||")
    let issue_id = List.get(parts, 0)
    let fingerprint = List.get(parts, 1)
    let event_json = List.get(parts, 2)
    insert_event(pool, project_id, issue_id, fingerprint, event_json) ?
    flush_loop(pool, project_id, events, i + 1, total)
  else
    Ok(0)
  end
end

pub fn flush_batch(pool :: PoolHandle, project_id :: String, events) -> Int ! String do
  let total = List.length(events)
  flush_loop(pool, project_id, events, 0, total)
end
