# HTTP route handlers for the ingestion API.
# Handlers are bare functions (HTTP routing does not support closures).
# Service PIDs and pool handle are obtained via the PipelineRegistry service,
# which is looked up by name using the cluster-aware get_registry() helper.

from Ingestion.Auth import authenticate_request
from Ingestion.Validation import validate_payload_size, validate_bulk_count
from Ingestion.Pipeline import PipelineRegistry
from Services.RateLimiter import RateLimiter
from Services.EventProcessor import EventProcessor, ProcessOutcome
from Services.StreamManager import StreamManager
from Types.Project import Project
from Types.Issue import Issue
from Storage.Queries import (
  resolve_issue,
  archive_issue,
  unresolve_issue,
  assign_issue,
  discard_issue,
  delete_issue,
  list_issues_by_status,
  check_new_issue,
  check_regression,
  get_event_alert_rules,
  fire_alert,
  check_sample_rate,
  decode_bulk_events,
  count_unresolved_issues,
  get_issue_project_id
)
from Api.Helpers import require_param, get_registry, to_json_array

# Helper: build 401 response

fn unauthorized_response() do
  HTTP.response(401, json { error : "unauthorized" })
end

# Helper: build 400 response with reason

fn bad_request_response(reason :: String) do
  HTTP.response(400, json { error : reason })
end

# Helper: build 429 rate-limited response with Retry-After header

fn rate_limited_response() do
  HTTP.response_with_headers(429, json { error : "rate limited" }, %{"Retry-After" => "60"})
end

# Helper: build 202 accepted response

fn accepted_response() do
  HTTP.response(202, json { status : "accepted" })
end

fn sampled_response() do
  HTTP.response(202, json { status : "sampled" })
end

fn discarded_response() do
  HTTP.response(202, json { status : "discarded" })
end

fn payload_too_large_response() do
  HTTP.response(413, json { error : "payload too large" })
end

fn unavailable_response() do
  HTTP.response(503, json { error : "ingestion unavailable" })
end

fn ingestion_cost(body :: String) -> Int do
  1 + String.length(body) / 65536
end

fn record_ingestion_outcome(project_id :: String, outcome :: String, bytes :: Int) do
  let reg_pid = get_registry()
  let count = PipelineRegistry.record_outcome(reg_pid, project_id, outcome)
  println("[Mesher] ingestion_outcome project_id=#{project_id} outcome=#{outcome} bytes=#{bytes} outcome_count=#{count}")
  0
end

# --- Event broadcasting helpers (STREAM-01, STREAM-04) ---
# Defined before route_to_processor (Mesh requires define-before-use).
# Helper: broadcast issue count from query result rows

fn broadcast_count_from_rows(project_id :: String, rows) do
  if List.length(rows) > 0 do
    let count = Map.get(List.head(rows), "cnt")
    let stream_mgr_pid = Process.whereis("stream_manager")
    StreamManager.publish_project(stream_mgr_pid,
    project_id,
    """{"type":"issue_count","project_id":#{Json.encode_string(project_id)},"count":#{count}}""")
    0
  else
    0
  end
end

# Helper: broadcast updated issue count for a project

fn broadcast_issue_count(project_id :: String) do
  let reg_pid = get_registry()
  let pool = PipelineRegistry.get_pool(reg_pid)
  let count_result = count_unresolved_issues(pool, project_id)
  case count_result do
    Ok( rows) -> broadcast_count_from_rows(project_id, rows)
    Err( _) -> 0
  end
end

# --- Event-based alert helpers (ALERT-03, ALERT-04, ALERT-05) ---
# Defined before broadcast_event (define-before-use, decision [90-03]).
# Normalize event-rule selector rows through a concrete shape before Json.get
# reads them on the live alert path.

struct EventRuleRow do
  id :: String
  name :: String
  cooldown_minutes :: String
end deriving(Json)

fn normalize_event_rule_row(row :: Map < String, String >) -> String do
  let rule = EventRuleRow {
    id : Map.get(row, "id"),
    name : Map.get(row, "name"),
    cooldown_minutes : Map.get(row, "cooldown_minutes")
  }
  Json.encode(rule)
end

# Broadcast alert notification to project WebSocket room (ALERT-04).

fn broadcast_alert_notification(project_id :: String,
alert_id :: String,
rule_name :: String,
condition_type :: String,
message :: String) do
  let msg = """{"type":"alert","alert_id":#{Json.encode_string(alert_id)},"rule_name":#{Json.encode_string(rule_name)},"condition":#{Json.encode_string(condition_type)},"message":#{Json.encode_string(message)}}"""
  let stream_mgr_pid = Process.whereis("stream_manager")
  StreamManager.publish_project(stream_mgr_pid, project_id, msg)
  0
end

# Fire and broadcast a single event-based alert.

fn fire_event_alert(pool :: PoolHandle,
rule_id :: String,
project_id :: String,
rule_name :: String,
condition_type :: String,
issue_id :: String) do
  let message = "#{condition_type} detected for issue #{issue_id}"
  let result = fire_alert(pool, rule_id, project_id, message, condition_type, rule_name)
  case result do
    Ok( alert_id) -> broadcast_alert_notification(project_id,
    alert_id,
    rule_name,
    condition_type,
    message)
    Err( e) -> do
      println("[Mesher] alert_fire_failed project_id=#{project_id} rule_id=#{rule_id} reason=#{e}")
      0
    end
  end
end

# Loop through matching rules and fire alerts.

fn fire_event_alerts_loop(pool :: PoolHandle,
rules,
project_id :: String,
condition_type :: String,
issue_id :: String,
i :: Int,
total :: Int) do
  if i < total do
    let rule = List.get(rules, i)
    let normalized = normalize_event_rule_row(rule)
    let rule_id = Json.get(normalized, "id")
    let rule_name = Json.get(normalized, "name")
    fire_event_alert(pool, rule_id, project_id, rule_name, condition_type, issue_id)
    fire_event_alerts_loop(pool, rules, project_id, condition_type, issue_id, i + 1, total)
  else
    0
  end
end

# Get matching rules and fire alerts for a condition type.

fn fire_matching_event_alerts(pool :: PoolHandle,
project_id :: String,
condition_type :: String,
issue_id :: String) do
  let rules_result = get_event_alert_rules(pool, project_id, condition_type)
  case rules_result do
    Ok( rules) -> fire_event_alerts_loop(pool,
    rules,
    project_id,
    condition_type,
    issue_id,
    0,
    List.length(rules))
    Err( e) -> do
      println("[Mesher] alert_rule_lookup_failed project_id=#{project_id} condition=#{condition_type} reason=#{e}")
      0
    end
  end
end

# Fire new_issue alerts if issue is new.

fn handle_new_issue_alert(pool :: PoolHandle,
project_id :: String,
issue_id :: String,
is_new :: Bool) do
  if is_new do
    fire_matching_event_alerts(pool, project_id, "new_issue", issue_id)
    0
  else
    0
  end
end

# Fire regression alerts when a previously resolved issue receives a new event.
# Reuses fire_matching_event_alerts with condition_type "regression" so alert
# rules with that condition type are triggered without a separate alert evaluation path.

fn handle_regression_alert(pool :: PoolHandle,
project_id :: String,
issue_id :: String,
is_regression :: Bool) do
  if is_regression do
    fire_matching_event_alerts(pool, project_id, "regression", issue_id)
    0
  else
    0
  end
end

# Check for new-issue and regression alerts after event processing (ALERT-03).
# new_issue fires on first occurrence; regression fires when a resolved issue regresses.

fn check_event_alerts(pool :: PoolHandle, project_id :: String, issue_id :: String) do
  let new_result = check_new_issue(pool, issue_id)
  case new_result do
    Ok( is_new) -> handle_new_issue_alert(pool, project_id, issue_id, is_new)
    Err( e) -> do
      println("[Mesher] new_issue_check_failed project_id=#{project_id} issue_id=#{issue_id} reason=#{e}")
      0
    end
  end
  let reg_result = check_regression(pool, issue_id)
  case reg_result do
    Ok( is_regression) -> handle_regression_alert(pool, project_id, issue_id, is_regression)
    Err( e) -> do
      println("[Mesher] regression_check_failed project_id=#{project_id} issue_id=#{issue_id} reason=#{e}")
      0
    end
  end
end

# Publish only events that were durably accepted. The body has already passed
# strict JSON decoding, so it can be embedded as the data value without string
# interpolation affecting the surrounding response shape.

pub fn publish_ingested_event(project_id :: String,
issue_id :: String,
body :: String,
level :: String,
environment :: String) do
  let stream_mgr_pid = Process.whereis("stream_manager")
  let parsed = Json.parse(body)
  case parsed do
    Ok( data) -> StreamManager.publish_event(stream_mgr_pid,
    project_id,
    level,
    environment,
    """{"type":"event","issue_id":#{Json.encode_string(issue_id)},"data":#{Json.encode(data)}}""")
    Err( _) -> nil
  end
  broadcast_issue_count(project_id)
  let reg_pid = get_registry()
  let pool = PipelineRegistry.get_pool(reg_pid)
  check_event_alerts(pool, project_id, issue_id)
  0
end

# Convert the typed processor result into the public single-event contract.

fn respond_to_outcome(project_id :: String, body :: String, outcome :: ProcessOutcome) do
  record_ingestion_outcome(project_id, outcome.kind, String.length(body))
  if outcome.kind == "accepted" do
    publish_ingested_event(project_id, outcome.issue_id, body, outcome.level, outcome.environment)
    accepted_response()
  else if outcome.kind == "discarded" do
    discarded_response()
  else if outcome.kind == "invalid" do
    bad_request_response(outcome.reason)
  else
    unavailable_response()
  end
end

fn process_event_body(processor_pid, project_id :: String, body :: String) do
  let size_check = validate_payload_size(body, 1048576)
  case size_check do
    Err( _) -> do
      record_ingestion_outcome(project_id, "invalid", String.length(body))
      payload_too_large_response()
    end
    Ok( _) -> do
      let outcome = EventProcessor.process_event(processor_pid, project_id, body)
      respond_to_outcome(project_id, body, outcome)
    end
  end
end

fn handle_event_sample_decision(should_keep :: Bool,
project_id :: String,
rate_limiter_pid,
processor_pid,
  body :: String) do
  if should_keep do
    process_event_body(processor_pid, project_id, body)
  else
    record_ingestion_outcome(project_id, "sampled", String.length(body))
    sampled_response()
  end
end

fn handle_event_sampled(pool :: PoolHandle,
project_id :: String,
rate_limiter_pid,
processor_pid,
request) do
  let body = Request.body(request)
  let allowed = RateLimiter.check_limit(rate_limiter_pid, project_id, ingestion_cost(body))
  if allowed do
    let sample_result = check_sample_rate(pool, project_id, body)
    case sample_result do
      Ok( should_keep) -> handle_event_sample_decision(should_keep,
      project_id,
      rate_limiter_pid,
      processor_pid,
      body)
      Err( _) -> do
        record_ingestion_outcome(project_id, "unavailable", String.length(body))
        unavailable_response()
      end
    end
  else
    record_ingestion_outcome(project_id, "rate_limited", String.length(body))
    rate_limited_response()
  end
end

# Handle POST /api/v1/events
# Flow: get registry -> get pool+pids -> auth -> rate limit -> validate -> process -> 202

pub fn handle_event(request) do
  let reg_pid = get_registry()
  PipelineRegistry.increment_event_count(reg_pid)
  let pool = PipelineRegistry.get_pool(reg_pid)
  let auth_result = authenticate_request(pool, request)
  case auth_result do
    Err( _) -> unauthorized_response()
    Ok( project) -> handle_event_sampled(pool,
    project.id,
    PipelineRegistry.get_rate_limiter(reg_pid),
    PipelineRegistry.get_processor(reg_pid),
    request)
  end
end

fn bulk_outcome_json(project_id :: String,
event_json :: String,
index :: Int,
outcome :: ProcessOutcome) -> String do
  record_ingestion_outcome(project_id, outcome.kind, String.length(event_json))
  if outcome.kind == "invalid" do
    json { index : index, status : outcome.kind, error : outcome.reason }
  else
    json { index : index, status : outcome.kind, issue_id : outcome.issue_id }
  end
end

fn process_bulk_item(pool :: PoolHandle,
project_id :: String,
rate_limiter_pid,
processor_pid,
event_json :: String,
index :: Int) -> String do
  let allowed = RateLimiter.check_limit(rate_limiter_pid, project_id, ingestion_cost(event_json))
  if allowed do
    let sample_result = check_sample_rate(pool, project_id, event_json)
    case sample_result do
      Ok( should_keep) -> if should_keep do
        let outcome = EventProcessor.process_event(processor_pid, project_id, event_json)
        if outcome.kind == "accepted" do
          publish_ingested_event(project_id,
          outcome.issue_id,
          event_json,
          outcome.level,
          outcome.environment)
          bulk_outcome_json(project_id, event_json, index, outcome)
        else
          bulk_outcome_json(project_id, event_json, index, outcome)
        end
      else
        record_ingestion_outcome(project_id, "sampled", String.length(event_json))
        json { index : index, status : "sampled" }
      end
      Err( _) -> do
        record_ingestion_outcome(project_id, "unavailable", String.length(event_json))
        json { index : index, status : "unavailable" }
      end
    end
  else
    record_ingestion_outcome(project_id, "rate_limited", String.length(event_json))
    json { index : index, status : "rate_limited" }
  end
end

fn process_bulk_loop(pool :: PoolHandle,
project_id :: String,
rate_limiter_pid,
processor_pid,
events,
i :: Int,
total :: Int,
results) do
  if i < total do
    let event_json = Map.get(List.get(events, i), "event_json")
    let item_result = process_bulk_item(pool, project_id, rate_limiter_pid, processor_pid, event_json, i)
    process_bulk_loop(pool,
    project_id,
    rate_limiter_pid,
    processor_pid,
    events,
    i + 1,
    total,
    List.append(results, item_result))
  else
    results
  end
end

fn process_decoded_bulk(pool :: PoolHandle,
project_id :: String,
rate_limiter_pid,
processor_pid,
events) do
  let total = List.length(events)
  if total == 0 do
    bad_request_response("bulk envelope requires at least one event")
  else
    let count_check = validate_bulk_count(total, 100)
    case count_check do
      Err( reason) -> bad_request_response(reason)
      Ok( _) -> do
        let results = process_bulk_loop(pool,
        project_id,
        rate_limiter_pid,
        processor_pid,
        events,
        0,
        total,
        List.new())
        HTTP.response(207,
        """{"status":"processed","count":#{total},"results":#{to_json_array(results)}}""")
      end
    end
  end
end

fn decode_and_process_bulk(pool :: PoolHandle,
project_id :: String,
rate_limiter_pid,
processor_pid,
body :: String) do
  let decoded = decode_bulk_events(pool, body)
  case decoded do
    Ok( events) -> process_decoded_bulk(pool, project_id, rate_limiter_pid, processor_pid, events)
    Err( _) -> bad_request_response("invalid bulk JSON")
  end
end

fn handle_bulk_authed(pool :: PoolHandle,
project_id :: String,
rate_limiter_pid,
processor_pid,
request) do
  let body = Request.body(request)
  let size_check = validate_payload_size(body, 5242880)
  case size_check do
    Err( _) -> payload_too_large_response()
    Ok( _) -> decode_and_process_bulk(pool, project_id, rate_limiter_pid, processor_pid, body)
  end
end

pub fn handle_bulk(request) do
  let reg_pid = get_registry()
  PipelineRegistry.increment_event_count(reg_pid)
  let pool = PipelineRegistry.get_pool(reg_pid)
  let rate_limiter_pid = PipelineRegistry.get_rate_limiter(reg_pid)
  let processor_pid = PipelineRegistry.get_processor(reg_pid)
  let auth_result = authenticate_request(pool, request)
  case auth_result do
    Err( _) -> unauthorized_response()
    Ok( project) -> handle_bulk_authed(pool,
    project.id,
    rate_limiter_pid,
    processor_pid,
    request)
  end
end

# --- Issue state change broadcasting helpers (STREAM-03) ---
# Defined before issue management handlers (Mesh requires define-before-use).
# Helper: broadcast issue update from project lookup rows

fn broadcast_update_from_rows(rows, issue_id :: String, action :: String) do
  if List.length(rows) > 0 do
    let project_id = Map.get(List.head(rows), "project_id")
    let msg = """{"type":"issue","action":#{Json.encode_string(action)},"issue_id":#{Json.encode_string(issue_id)}}"""
    let stream_mgr_pid = Process.whereis("stream_manager")
    StreamManager.publish_project(stream_mgr_pid, project_id, msg)
    0
  else
    0
  end
end

# Helper: look up project_id for an issue and broadcast state change notification

fn broadcast_issue_update(pool, issue_id :: String, action :: String) do
  let rows_result = get_issue_project_id(pool, issue_id)
  case rows_result do
    Ok( rows) -> broadcast_update_from_rows(rows, issue_id, action)
    Err( _) -> 0
  end
end

# Helper: broadcast resolve notification then return success response

fn resolve_success(pool, issue_id :: String) do
  broadcast_issue_update(pool, issue_id, "resolved")
  HTTP.response(200, json { status : "ok" })
end

# Helper: broadcast archive notification then return success response

fn archive_success(pool, issue_id :: String) do
  broadcast_issue_update(pool, issue_id, "archived")
  HTTP.response(200, json { status : "ok" })
end

# Helper: broadcast unresolve notification then return success response

fn unresolve_success(pool, issue_id :: String) do
  broadcast_issue_update(pool, issue_id, "unresolved")
  HTTP.response(200, json { status : "ok" })
end

# Helper: broadcast discard notification then return success response

fn discard_success(pool, issue_id :: String) do
  broadcast_issue_update(pool, issue_id, "discarded")
  HTTP.response(200, json { status : "ok" })
end

# --- Issue management route handlers (Phase 89 Plan 02) ---
# Helper: build a JSON string for a single Issue.
# Uses deriving(Json) on the Issue struct for automatic serialization.

fn issue_to_json_str(issue :: Issue) -> String do
  Json.encode(issue)
end

# Build JSON array from list of issues.

fn issues_to_json(issues :: List < Issue >) -> String do
  let items = issues
    |> List.map(fn (issue) do issue_to_json_str(issue) end)
  "[#{String.join(items, ",")}]"
end

# Handle GET /api/v1/projects/:project_id/issues?status=unresolved

pub fn handle_list_issues(request) do
  let reg_pid = get_registry()
  let pool = PipelineRegistry.get_pool(reg_pid)
  let project_id = require_param(request, "project_id")
  let status_opt = Request.query(request, "status")
  let status = case status_opt do
    Some( value) -> value
    None -> "unresolved"
  end
  let result = list_issues_by_status(pool, project_id, status)
  case result do
    Ok( issues) -> HTTP.response(200, issues_to_json(issues))
    Err( e) -> HTTP.response(500, json { error : e })
  end
end

# Handle POST /api/v1/issues/:id/resolve

pub fn handle_resolve_issue(request) do
  let reg_pid = get_registry()
  let pool = PipelineRegistry.get_pool(reg_pid)
  let issue_id = require_param(request, "id")
  let result = resolve_issue(pool, issue_id)
  case result do
    Ok( count) -> if count > 0 do
      resolve_success(pool, issue_id)
    else
      HTTP.response(404, json { error : "issue not found or already resolved" })
    end
    Err( e) -> HTTP.response(500, json { error : e })
  end
end

# Handle POST /api/v1/issues/:id/archive

pub fn handle_archive_issue(request) do
  let reg_pid = get_registry()
  let pool = PipelineRegistry.get_pool(reg_pid)
  let issue_id = require_param(request, "id")
  let result = archive_issue(pool, issue_id)
  case result do
    Ok( count) -> if count > 0 do
      archive_success(pool, issue_id)
    else
      HTTP.response(404, json { error : "issue not found or already archived" })
    end
    Err( e) -> HTTP.response(500, json { error : e })
  end
end

# Handle POST /api/v1/issues/:id/unresolve

pub fn handle_unresolve_issue(request) do
  let reg_pid = get_registry()
  let pool = PipelineRegistry.get_pool(reg_pid)
  let issue_id = require_param(request, "id")
  let result = unresolve_issue(pool, issue_id)
  case result do
    Ok( count) -> if count > 0 do
      unresolve_success(pool, issue_id)
    else
      HTTP.response(404, json { error : "issue not found or already unresolved" })
    end
    Err( e) -> HTTP.response(500, json { error : e })
  end
end

# Helper: broadcast assignment and return success response.
# Follows the resolve_success / archive_success pattern: broadcast then respond.

fn assign_success(pool, issue_id :: String) do
  broadcast_issue_update(pool, issue_id, "assigned")
  HTTP.response(200, json { status : "ok" })
end

# Helper: perform assignment after extracting user_id from parsed JSON rows.

fn assign_with_user_id(pool :: PoolHandle, issue_id :: String, user_id :: String) do
  let result = assign_issue(pool, issue_id, user_id)
  case result do
    Ok( count) -> if count > 0 do
      assign_success(pool, issue_id)
    else
      HTTP.response(404, json { error : "issue or assignee not found" })
    end
    Err( e) -> HTTP.response(500, json { error : e })
  end
end

# Handle POST /api/v1/issues/:id/assign
# Extracts user_id from JSON body using Mesh-native Json.get (no DB roundtrip).

pub fn handle_assign_issue(request) do
  let reg_pid = get_registry()
  let pool = PipelineRegistry.get_pool(reg_pid)
  let issue_id = require_param(request, "id")
  let body = Request.body(request)
  let user_id = Json.get(body, "user_id")
  assign_with_user_id(pool, issue_id, user_id)
end

# Handle POST /api/v1/issues/:id/discard

pub fn handle_discard_issue(request) do
  let reg_pid = get_registry()
  let pool = PipelineRegistry.get_pool(reg_pid)
  let issue_id = require_param(request, "id")
  let result = discard_issue(pool, issue_id)
  case result do
    Ok( count) -> if count > 0 do
      discard_success(pool, issue_id)
    else
      HTTP.response(404, json { error : "issue not found or already discarded" })
    end
    Err( e) -> HTTP.response(500, json { error : e })
  end
end

# Handle POST /api/v1/issues/:id/delete

pub fn handle_delete_issue(request) do
  let reg_pid = get_registry()
  let pool = PipelineRegistry.get_pool(reg_pid)
  let issue_id = require_param(request, "id")
  let result = delete_issue(pool, issue_id)
  case result do
    Ok( count) -> if count > 0 do
      HTTP.response(200, json { status : "ok" })
    else
      HTTP.response(404, json { error : "issue not found" })
    end
    Err( e) -> HTTP.response(500, json { error : e })
  end
end
