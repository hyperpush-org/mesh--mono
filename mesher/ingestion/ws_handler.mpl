# Authenticated WebSocket ingestion and management streaming. Each connection
# is immutably bound to one authorized project during the handshake.

from Services.EventProcessor import EventProcessor, ProcessOutcome
from Services.StreamManager import StreamManager
from Services.RateLimiter import RateLimiter
from Ingestion.Pipeline import PipelineRegistry
from Ingestion.Validation import validate_payload_size, validate_level
from Ingestion.Routes import publish_ingested_event
from Storage.Queries import get_project_by_api_key, validate_session, get_management_role, check_sample_rate
from Api.Helpers import get_registry, resolve_project_id
from Types.User import Session
from Types.Project import Project

fn ingestion_cost(body :: String) -> Int do
  1 + String.length(body) / 65536
end

fn record_ws_outcome(project_id :: String, outcome :: String, bytes :: Int) do
  let reg_pid = get_registry()
  let count = PipelineRegistry.record_outcome(reg_pid, project_id, outcome)
  println("[Mesher] ws_ingestion_outcome project_id=#{project_id} outcome=#{outcome} bytes=#{bytes} outcome_count=#{count}")
  0
end

fn ws_write(conn, msg :: String) do
  let _result = Ws.send(conn, msg)
  nil
end

fn ws_send_status(conn, status :: String) do
  ws_write(conn, json { status : status })
end

fn ws_send_error(conn, reason :: String) do
  ws_write(conn, json { error : reason })
end

fn bearer_value(raw :: String) -> String do
  if String.starts_with(raw, "Bearer ") do
    String.trim(String.replace(raw, "Bearer ", ""))
  else
    ""
  end
end

fn header_value(headers, name :: String) -> String do
  if Map.has_key(headers, name) do Map.get(headers, name) else "" end
end

fn stream_project_from_path(path :: String) -> String do
  let parts = String.split(path, "/")
  let seg1 = if List.length(parts) > 1 do List.get(parts, 1) else "" end
  if seg1 == "ws" do
    if List.length(parts) > 4 do List.get(parts, 4) else "" end
  else
    if List.length(parts) > 3 do List.get(parts, 3) else "" end
  end
end

fn register_stream_connection(conn, project_id :: String) do
  let room = "project:#{project_id}"
  Ws.join(conn, room)
  let stream_mgr_pid = Process.whereis("stream_manager")
  StreamManager.register_client(stream_mgr_pid, conn, 1, project_id, "", "")
  conn
end

fn authorize_stream_session(conn, path :: String, pool :: PoolHandle, session :: Session) do
  let raw_project_id = stream_project_from_path(path)
  let role_result = get_management_role(pool, session.user_id, "project", raw_project_id, "")
  case role_result do
    Ok( _) -> do
      let project_id = resolve_project_id(pool, raw_project_id)
      if String.length(project_id) > 0 do register_stream_connection(conn, project_id) else 0 end
    end
    Err( _) -> 0
  end
end

fn authorize_stream_connection(conn, path :: String, headers) do
  let raw_token = header_value(headers, "authorization")
  let token = bearer_value(raw_token)
  if String.length(token) == 0 do
    0
  else
    let reg_pid = get_registry()
    let pool = PipelineRegistry.get_pool(reg_pid)
    let session_result = validate_session(pool, token)
    case session_result do
      Ok( session) -> authorize_stream_session(conn, path, pool, session)
      Err( _) -> 0
    end
  end
end

fn register_ingest_project(conn, project :: Project) do
  let stream_mgr_pid = Process.whereis("stream_manager")
  let registered_conn = StreamManager.register_client(stream_mgr_pid, conn, 2, project.id, "", "")
  let visible = StreamManager.is_ingest_client(stream_mgr_pid, conn)
  let bound_project = StreamManager.get_project_id(stream_mgr_pid, conn)
  println("[Mesher] ws_auth kind=ingest project_id=#{project.id} registered=#{registered_conn == conn} visible=#{visible} bound=#{bound_project == project.id}")
  conn
end

fn ingestion_key(headers) -> String do
  let direct = header_value(headers, "x-sentry-auth")
  if String.length(direct) > 0 do
    direct
  else
    bearer_value(header_value(headers, "authorization"))
  end
end

fn authorize_ingest_connection(conn, headers) do
  let key = ingestion_key(headers)
  if String.length(key) == 0 do
    println("[Mesher] ws_auth kind=ingest result=missing_credentials")
    0
  else
    let reg_pid = get_registry()
    let pool = PipelineRegistry.get_pool(reg_pid)
    let auth_result = get_project_by_api_key(pool, key)
    case auth_result do
      Ok( project) -> register_ingest_project(conn, project)
      Err( _) -> do
        println("[Mesher] ws_auth kind=ingest result=invalid_credentials")
        0
      end
    end
  end
end

fn is_stream_path(path :: String) -> Bool do
  String.contains(path, "/stream/projects/")
end

pub fn ws_on_connect(conn, path, headers) do
  if is_stream_path(path) do
    authorize_stream_connection(conn, path, headers)
  else if path == "/ingest" or path == "/ws/ingest" do
    authorize_ingest_connection(conn, headers)
  else
    0
  end
end

fn valid_level_filter(level :: String) -> Bool do
  if String.length(level) == 0 do
    true
  else
    let result = validate_level(level)
    case result do
      Ok( _) -> true
      Err( _) -> false
    end
  end
end

fn handle_subscribe_update(conn, message :: String) do
  if String.length(message) > 4096 do
    ws_send_error(conn, "subscription message too large")
  else
    let level = Json.get_nested(message, "filters", "level")
    let environment = Json.get_nested(message, "filters", "environment")
    if valid_level_filter(level) do
      if String.length(environment) <= 128 do
        let stream_mgr_pid = Process.whereis("stream_manager")
        let project_id = StreamManager.get_project_id(stream_mgr_pid, conn)
        StreamManager.register_client(stream_mgr_pid,
        conn,
        1,
        project_id,
        level,
        environment)
        ws_write(conn, """{"type":"filters_updated"}""")
      else
        ws_send_error(conn, "invalid subscription filters")
      end
    else
      ws_send_error(conn, "invalid subscription filters")
    end
  end
end

fn respond_ingest_outcome(conn,
project_id :: String,
message :: String,
outcome :: ProcessOutcome) do
  record_ws_outcome(project_id, outcome.kind, String.length(message))
  if outcome.kind == "accepted" do
    publish_ingested_event(project_id,
    outcome.issue_id,
    message,
    outcome.level,
    outcome.environment)
    ws_send_status(conn, "accepted")
  else if outcome.kind == "discarded" do
    ws_send_status(conn, "discarded")
  else if outcome.kind == "invalid" do
    ws_send_error(conn, outcome.reason)
  else
    ws_send_error(conn, "ingestion unavailable")
  end
end

fn process_sampled_ws_event(conn,
project_id :: String,
message :: String,
should_keep :: Bool,
rate_limiter_pid,
  processor_pid) do
  if should_keep do
    let outcome = EventProcessor.process_event(processor_pid, project_id, message)
    respond_ingest_outcome(conn, project_id, message, outcome)
  else
    record_ws_outcome(project_id, "sampled", String.length(message))
    ws_send_status(conn, "sampled")
  end
end

fn handle_ingest_message(conn, message :: String) do
  let size_check = validate_payload_size(message, 1048576)
  case size_check do
    Err( _) -> ws_send_error(conn, "payload too large")
    Ok( _) -> do
      let reg_pid = get_registry()
      let pool = PipelineRegistry.get_pool(reg_pid)
      let stream_mgr_pid = Process.whereis("stream_manager")
      let project_id = StreamManager.get_project_id(stream_mgr_pid, conn)
      let rate_limiter_pid = PipelineRegistry.get_rate_limiter(reg_pid)
      let allowed = RateLimiter.check_limit(rate_limiter_pid, project_id, ingestion_cost(message))
      if allowed do
        let sample_result = check_sample_rate(pool, project_id, message)
        case sample_result do
          Ok( should_keep) -> process_sampled_ws_event(conn,
          project_id,
          message,
          should_keep,
          rate_limiter_pid,
          PipelineRegistry.get_processor(reg_pid))
          Err( _) -> do
            record_ws_outcome(project_id, "unavailable", String.length(message))
            ws_send_error(conn, "ingestion unavailable")
          end
        end
      else
        record_ws_outcome(project_id, "rate_limited", String.length(message))
        ws_send_error(conn, "rate limited; retry after 60 seconds")
      end
    end
  end
end

pub fn ws_on_message(conn, message) do
  let stream_mgr_pid = Process.whereis("stream_manager")
  if StreamManager.is_stream_client(stream_mgr_pid, conn) do
    handle_subscribe_update(conn, message)
  else if StreamManager.is_ingest_client(stream_mgr_pid, conn) do
    handle_ingest_message(conn, message)
  else
    ws_send_error(conn, "unauthorized")
  end
end

pub fn ws_on_close(conn, code :: Int, reason :: String) do
  let stream_mgr_pid = Process.whereis("stream_manager")
  StreamManager.remove_client(stream_mgr_pid, conn)
  println("[WS] Connection closed: #{code}")
end
