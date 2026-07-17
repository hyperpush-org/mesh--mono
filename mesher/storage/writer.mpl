# Durable event insertion for Mesher. The live processor calls this
# synchronously, so a transport is never told an event was accepted before the
# database confirms the row.
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
# Returns a success marker after durable insertion.

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
  [event_json, Expr.value("sdk_version")]), "environment" => Expr.fn_call("jsonb_extract_path_text",
  [event_json, Expr.value("environment")]), "session_id" => Expr.fn_call("jsonb_extract_path_text",
  [event_json, Expr.value("session_id")])}) ?
  Ok("stored")
end
