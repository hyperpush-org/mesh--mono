# Search, filter, and pagination HTTP handlers for Mesher REST API.
# Provides filtered issue listing, full-text event search, tag-based
# event filtering, and per-issue event listing with keyset pagination.
# All handlers follow the PipelineRegistry pattern for pool lookup.

from Ingestion.Pipeline import PipelineRegistry
from Storage.Queries import list_issues_filtered, search_events_fulltext, filter_events_by_tag, list_events_for_issue, get_events_by_session_id
from Types.Event import Event
from Types.Issue import Issue
from Api.Helpers import query_or_default, to_json_array, require_param, get_registry, resolve_project_id

# --- Shared helpers (leaf functions first, per define-before-use requirement) ---
# Helper: cap a parsed limit value at 100, minimum 1, default 25.

fn cap_limit(n :: Int) -> String do
  if n > 100 do
    "25"
  else if n < 1 do
    "25"
  else
    String.from(n)
  end
end

# Helper: parse limit string to capped value.

fn parse_limit(s :: String) -> String do
  let parsed = String.to_int(s)
  case parsed do
    Some( n) -> cap_limit(n)
    None -> "25"
  end
end

# Extract limit query parameter, default "25", capped at 100.

fn get_limit(request) -> String do
  let opt = Request.query(request, "limit")
  case opt do
    Some( s) -> parse_limit(s)
    None -> "25"
  end
end

# Decode the small percent-encoded query subset Mesher currently emits in
# pagination cursors. Request.query hands the raw encoded component through, so
# detail/search cursor timestamps must be normalized before they reach Postgres.

fn decode_query_component(value :: String) -> String do
  value
    |> String.replace("%20", " ")
    |> String.replace("%3A", ":")
    |> String.replace("%2B", "+")
end

# Convert an issue row (Map<String, String>) to a JSON string.
# All fields are strings from SQL; event_count is numeric so parse to Int.

fn row_to_issue_json(row) -> String do
  let id = Map.get(row, "id")
  let title = Map.get(row, "title")
  let level = Map.get(row, "level")
  let status = Map.get(row, "status")
  let event_count_opt = String.to_int(Map.get(row, "event_count"))
  let event_count = case event_count_opt do
    Some( n) -> n
    None -> 0
  end
  let first_seen = Map.get(row, "first_seen")
  let last_seen = Map.get(row, "last_seen")
  let assigned_to = Map.get(row, "assigned_to")
  """{"id":"#{id}","title":"#{title}","level":"#{level}","status":"#{status}","event_count":#{event_count},"first_seen":"#{first_seen}","last_seen":"#{last_seen}","assigned_to":"#{assigned_to}"}"""
end

# Convert an event search result row to JSON.

fn row_to_event_json(row) -> String do
  let id = Map.get(row, "id")
  let issue_id = Map.get(row, "issue_id")
  let level = Map.get(row, "level")
  let message = Map.get(row, "message")
  let received_at = Map.get(row, "received_at")
  """{"id":"#{id}","issue_id":"#{issue_id}","level":"#{level}","message":"#{message}","received_at":"#{received_at}"}"""
end

# Convert a tag filter result row to JSON.
# tags field is raw JSONB -- embed directly without quoting.

fn row_to_tag_event_json(row) -> String do
  let id = Map.get(row, "id")
  let issue_id = Map.get(row, "issue_id")
  let level = Map.get(row, "level")
  let message = Map.get(row, "message")
  let tags = Map.get(row, "tags")
  let received_at = Map.get(row, "received_at")
  """{"id":"#{id}","issue_id":"#{issue_id}","level":"#{level}","message":"#{message}","tags":#{tags},"received_at":"#{received_at}"}"""
end

# Convert a per-issue event row to JSON (minimal fields).

fn row_to_issue_event_json(row) -> String do
  let event = issue_event_row_to_event(row)
  Json.encode(event)
end

# Helper: extract last_seen and id from the last row for pagination cursor.

fn issue_row_to_cursor_issue(row) -> Issue do
  Issue {
    id : Map.get(row, "id"),
    project_id : "",
    fingerprint : "",
    title : Map.get(row, "title"),
    level : Map.get(row, "level"),
    status : Map.get(row, "status"),
    event_count : 0,
    first_seen : Map.get(row, "first_seen"),
    last_seen : Map.get(row, "last_seen"),
    assigned_to : Map.get(row, "assigned_to"),
    last_resolved_at : ""
  }
end

fn extract_cursor_from_last(rows, last_seen_key :: String, id_key :: String) -> String do
  let total = List.length(rows)
  let normalized = Json.encode(issue_row_to_cursor_issue(List.get(rows, total - 1)))
  let next_cursor = Json.get(normalized, last_seen_key)
  let next_cursor_id = Json.get(normalized, id_key)
  ""","next_cursor":"#{next_cursor}","next_cursor_id":"#{next_cursor_id}","has_more":true}"""
end

# Build paginated response JSON with cursor metadata.
# has_more is true when result count equals the limit.

fn build_paginated_response(json_array :: String, rows, limit :: Int) -> String do
  let count = List.length(rows)
  if count == limit do
    """{"data":#{json_array}#{extract_cursor_from_last(rows, "last_seen", "id")}"""
  else
    """{"data":#{json_array},"has_more":false}"""
  end
end

# Build paginated response for event lists (cursor key is received_at).

fn issue_event_row_to_event(row) -> Event do
  Event {
    id : Map.get(row, "id"),
    project_id : "",
    issue_id : "",
    level : Map.get(row, "level"),
    message : Map.get(row, "message"),
    fingerprint : "",
    exception : "null",
    stacktrace : "[]",
    breadcrumbs : "[]",
    tags : "{}",
    extra : "{}",
    user_context : "null",
    sdk_name : "",
    sdk_version : "",
    environment : "",
    session_id : "",
    received_at : Map.get(row, "received_at")
  }
end

fn extract_event_cursor_from_last(rows) -> String do
  let total = List.length(rows)
  let event = issue_event_row_to_event(List.get(rows, total - 1))
  let event_json = Json.encode(event)
  let next_cursor = Json.get(event_json, "received_at")
  let next_cursor_id = Json.get(event_json, "id")
  ""","next_cursor":"#{next_cursor}","next_cursor_id":"#{next_cursor_id}","has_more":true}"""
end

fn build_event_paginated_response(json_array :: String, rows, limit :: Int) -> String do
  let count = List.length(rows)
  if count == limit do
    """{"data":#{json_array}#{extract_event_cursor_from_last(rows)}"""
  else
    """{"data":#{json_array},"has_more":false}"""
  end
end

# --- Handler functions (pub, defined after all helpers) ---
# Helper: convert limit string to int for comparison.

fn limit_to_int(limit_str :: String) -> Int do
  let parsed = String.to_int(limit_str)
  case parsed do
    Some( n) -> n
    None -> 25
  end
end

# Helper: serialize issue rows to paginated JSON response.

fn serialize_issue_rows(rows, limit_str :: String) -> String do
  let json_array = rows
    |> List.map(fn (row) do row_to_issue_json(row) end)
    |> to_json_array()
  let limit = limit_to_int(limit_str)
  build_paginated_response(json_array, rows, limit)
end

# Helper: handle successful issue query result.

fn handle_issue_result_ok(rows, limit_str :: String) do
  HTTP.response(200, serialize_issue_rows(rows, limit_str))
end

# Helper: handle issue query error.

fn handle_issue_result_err(e :: String) do
  HTTP.response(500, json { error : e })
end

# Handle GET /api/v1/projects/:project_id/issues
# Supports optional filters: status, level, assigned_to
# Supports keyset pagination: cursor, cursor_id

pub fn handle_search_issues(request) do
  let reg_pid = get_registry()
  let pool = PipelineRegistry.get_pool(reg_pid)
  let raw_id = require_param(request, "project_id")
  let project_id = resolve_project_id(pool, raw_id)
  let status = query_or_default(request, "status", "")
  let level = query_or_default(request, "level", "")
  let assigned_to = query_or_default(request, "assigned_to", "")
  let environment = query_or_default(request, "environment", "")
  let cursor = query_or_default(request, "cursor", "")
    |> decode_query_component()
  let cursor_id = query_or_default(request, "cursor_id", "")
    |> decode_query_component()
  let limit_str = get_limit(request)
  let result = list_issues_filtered(pool,
  project_id,
  status,
  level,
  assigned_to,
  environment,
  cursor,
  cursor_id,
  limit_str)
  case result do
    Ok( rows) -> handle_issue_result_ok(rows, limit_str)
    Err( e) -> handle_issue_result_err(e)
  end
end

# Helper: serialize event search rows to JSON array.

fn serialize_event_search(rows) -> String do
  rows
    |> List.map(fn (row) do row_to_event_json(row) end)
    |> to_json_array()
end

# Helper: handle empty search query.

fn missing_query_response() do
  HTTP.response(400, json { error : "missing search query" })
end

# Helper: perform event search and return response.

fn do_event_search(pool, project_id :: String, q :: String, limit_str :: String) do
  let result = search_events_fulltext(pool, project_id, q, limit_str)
  case result do
    Ok( rows) -> HTTP.response(200, serialize_event_search(rows))
    Err( e) -> HTTP.response(500, json { error : e })
  end
end

# Helper: check if query is empty and dispatch search.

fn dispatch_event_search(pool, project_id :: String, q :: String, limit_str :: String) do
  if String.length(q) == 0 do
    missing_query_response()
  else
    do_event_search(pool, project_id, q, limit_str)
  end
end

# Handle GET /api/v1/projects/:project_id/events/search?q=...
# Full-text search on event messages using PostgreSQL tsvector.

pub fn handle_search_events(request) do
  let reg_pid = get_registry()
  let pool = PipelineRegistry.get_pool(reg_pid)
  let raw_id = require_param(request, "project_id")
  let project_id = resolve_project_id(pool, raw_id)
  let q = query_or_default(request, "q", "")
  let limit_str = get_limit(request)
  dispatch_event_search(pool, project_id, q, limit_str)
end

# Helper: serialize tag filter rows to JSON array.

fn serialize_tag_events(rows) -> String do
  rows
    |> List.map(fn (row) do row_to_tag_event_json(row) end)
    |> to_json_array()
end

# Helper: handle missing tag parameters.

fn missing_tag_response() do
  HTTP.response(400, json { error : "missing key or value parameter" })
end

# Helper: perform tag filter and return response.

fn do_tag_filter(pool, project_id :: String, tag_json :: String, limit_str :: String) do
  let result = filter_events_by_tag(pool, project_id, tag_json, limit_str)
  case result do
    Ok( rows) -> HTTP.response(200, serialize_tag_events(rows))
    Err( e) -> HTTP.response(500, json { error : e })
  end
end

# Helper: check both key and value are non-empty.

fn check_tag_params(pool, project_id :: String, key :: String, value :: String, limit_str :: String) do
  let key_empty = String.length(key) == 0
  let val_empty = String.length(value) == 0
  if key_empty do
    missing_tag_response()
  else if val_empty do
    missing_tag_response()
  else
    let tag_json = """{"#{key}":"#{value}"}"""
    do_tag_filter(pool, project_id, tag_json, limit_str)
  end
end

# Handle GET /api/v1/projects/:project_id/events/tags?key=...&value=...
# Filter events by tag key-value pair using JSONB containment.

pub fn handle_filter_by_tag(request) do
  let reg_pid = get_registry()
  let pool = PipelineRegistry.get_pool(reg_pid)
  let raw_id = require_param(request, "project_id")
  let project_id = resolve_project_id(pool, raw_id)
  let key = query_or_default(request, "key", "")
  let value = query_or_default(request, "value", "")
  let limit_str = get_limit(request)
  check_tag_params(pool, project_id, key, value, limit_str)
end

# Helper: serialize event list rows to paginated JSON response.

fn serialize_issue_event_rows(rows, limit_str :: String) -> String do
  let json_array = rows
    |> List.map(fn (row) do row_to_issue_event_json(row) end)
    |> to_json_array()
  let limit = limit_to_int(limit_str)
  build_event_paginated_response(json_array, rows, limit)
end

# Helper: handle successful issue events result.

fn handle_issue_events_ok(rows, limit_str :: String) do
  HTTP.response(200, serialize_issue_event_rows(rows, limit_str))
end

# Handle GET /api/v1/issues/:issue_id/events
# List events for a specific issue with keyset pagination.

pub fn handle_list_issue_events(request) do
  let reg_pid = get_registry()
  let pool = PipelineRegistry.get_pool(reg_pid)
  let issue_id = require_param(request, "issue_id")
  let cursor = query_or_default(request, "cursor", "")
    |> decode_query_component()
  let cursor_id = query_or_default(request, "cursor_id", "")
    |> decode_query_component()
  let limit_str = get_limit(request)
  let result = list_events_for_issue(pool, issue_id, cursor, cursor_id, limit_str)
  case result do
    Ok( rows) -> handle_issue_events_ok(rows, limit_str)
    Err( e) -> HTTP.response(500, json { error : e })
  end
end

# Convert a session event row to JSON.
# Includes environment so the client can verify which deployment the event came from.

fn row_to_session_event_json(row) -> String do
  let id = Map.get(row, "id")
  let issue_id = Map.get(row, "issue_id")
  let level = Map.get(row, "level")
  let message = Map.get(row, "message")
  let environment = Map.get(row, "environment")
  let received_at = Map.get(row, "received_at")
  """{"id":"#{id}","issue_id":"#{issue_id}","level":"#{level}","message":"#{message}","environment":"#{environment}","received_at":"#{received_at}"}"""
end

# Helper: serialize session event rows and respond.

fn respond_session_events(rows) do
  let body = rows
    |> List.map(fn (row) do row_to_session_event_json(row) end)
    |> to_json_array()
  HTTP.response(200, body)
end

# Handle GET /api/v1/projects/:project_id/sessions/:session_id/events
# Returns events belonging to a specific SDK session, ordered by received_at ASC.
# Scoped to the last 24 hours (partition-pruned on the partitioned events table).
# session_id must match exactly the value the SDK sent in the event payload.

pub fn handle_session_events(request) do
  let reg_pid = get_registry()
  let pool = PipelineRegistry.get_pool(reg_pid)
  let raw_id = require_param(request, "project_id")
  let project_id = resolve_project_id(pool, raw_id)
  let session_id = require_param(request, "session_id")
  let limit_str = get_limit(request)
  let result = get_events_by_session_id(pool, project_id, session_id, limit_str)
  case result do
    Ok( rows) -> respond_session_events(rows)
    Err( e) -> HTTP.response(500, json { error : e })
  end
end
