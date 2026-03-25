# StorageWriter SQL functions for Mesher monitoring platform.
# Provides the low-level event INSERT and the storage-local batch flush helper.
# Service state, buffering, retry policy, and timer triggers stay in Services.Writer.
#
# Events are stored as JSON strings. PostgreSQL still parses the JSON server-side,
# but insert_event now binds that extraction through Repo.insert_expr + explicit
# Pg/Expr helpers instead of a whole raw INSERT string.
# project_id, issue_id, and fingerprint are passed as separate SQL parameters
# (not extracted from JSON) -- see research Open Question 1, Option B.
# Insert a single event into the events table from a JSON-encoded string.
# project_id, issue_id, and fingerprint are passed separately (computed by EventProcessor
# via extract_event_fields + upsert_issue) rather than extracted from JSON.
# Uses PostgreSQL JSONB extraction/defaulting for the payload-backed fields.
# Returns a success marker on flush-safe completion.

pub fn insert_event(pool :: PoolHandle,
project_id :: String,
issue_id :: String,
fingerprint :: String,
json_str :: String) -> String ! String do
  let event_json = Pg.jsonb(Expr.value(json_str))
  Repo.insert_expr(pool,
  "events",
  %{"project_id" => Pg.uuid(Expr.value(project_id)), "issue_id" => Pg.uuid(Expr.value(issue_id)), "level" => Expr.fn_call("jsonb_extract_path_text",
  [event_json, Expr.value("level")]), "message" => Expr.fn_call("jsonb_extract_path_text",
  [event_json, Expr.value("message")]), "fingerprint" => Expr.value(fingerprint), "exception" => Expr.fn_call("jsonb_extract_path",
  [event_json, Expr.value("exception")]), "stacktrace" => Expr.fn_call("jsonb_extract_path",
  [event_json, Expr.value("stacktrace")]), "breadcrumbs" => Expr.fn_call("jsonb_extract_path",
  [event_json, Expr.value("breadcrumbs")]), "tags" => Expr.coalesce([Expr.fn_call("jsonb_extract_path",
  [event_json, Expr.value("tags")]), Pg.jsonb(Expr.value("{}"))]), "extra" => Expr.coalesce([Expr.fn_call("jsonb_extract_path",
  [event_json, Expr.value("extra")]), Pg.jsonb(Expr.value("{}"))]), "user_context" => Expr.fn_call("jsonb_extract_path",
  [event_json, Expr.value("user_context")]), "sdk_name" => Expr.fn_call("jsonb_extract_path_text",
  [event_json, Expr.value("sdk_name")]), "sdk_version" => Expr.fn_call("jsonb_extract_path_text",
  [event_json, Expr.value("sdk_version")])}) ?
  Ok("stored")
end

fn flush_loop(pool :: PoolHandle, events, i :: Int, total :: Int) -> String ! String do
  if i < total do
    let entry = List.get(events, i)
    let parts = String.split(entry, "|||")
    let project_id = List.get(parts, 0)
    let issue_id = List.get(parts, 1)
    let fingerprint = List.get(parts, 2)
    let event_json = List.get(parts, 3)
    insert_event(pool, project_id, issue_id, fingerprint, event_json) ?
    flush_loop(pool, events, i + 1, total)
  else
    Ok("flushed")
  end
end

pub fn flush_batch(pool :: PoolHandle, events) -> String ! String do
  let total = List.length(events)
  flush_loop(pool, events, 0, total)
end
