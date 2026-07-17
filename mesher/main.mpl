# Mesher monitoring platform entry point.
# Connects to PostgreSQL, creates schema and partitions, starts all services.
# Services are defined in mesher/services/ modules.
# Ingestion pipeline wires HTTP routes and WS handler.
# Maintainer runbook: mesher/README.md.
# Schema DDL is managed by `cargo run -q -p meshc -- migrate mesher up` -- run before starting the application.

from Config import (
  database_url_key,
  port_key,
  ws_port_key,
  rate_limit_window_seconds_key,
  rate_limit_max_events_key,
  default_port,
  default_ws_port,
  default_rate_limit_window_seconds,
  default_rate_limit_max_events,
  invalid_positive_int,
  missing_required_env
)
from Storage.Schema import create_partitions_ahead
from Services.Org import OrgService
from Services.Project import ProjectService
from Services.User import UserService
from Ingestion.Pipeline import start_pipeline
from Ingestion.Routes import (
  handle_event,
  handle_bulk,
  handle_resolve_issue,
  handle_archive_issue,
  handle_unresolve_issue,
  handle_assign_issue,
  handle_discard_issue,
  handle_delete_issue
)
from Api.Search import handle_search_issues, handle_search_events, handle_filter_by_tag, handle_list_issue_events, handle_session_events
from Api.Dashboard import (
  handle_event_volume,
  handle_error_breakdown,
  handle_top_issues,
  handle_tag_breakdown,
  handle_issue_timeline,
  handle_project_health
)
from Api.Detail import handle_event_detail
from Api.Team import (
  handle_list_members,
  handle_add_member,
  handle_update_member_role,
  handle_remove_member,
  handle_list_api_keys,
  handle_create_api_key,
  handle_revoke_api_key
)
from Api.Alerts import (
  handle_create_alert_rule,
  handle_list_alert_rules,
  handle_toggle_alert_rule,
  handle_delete_alert_rule,
  handle_list_alerts,
  handle_acknowledge_alert,
  handle_resolve_alert
)
from Api.Settings import handle_get_project_settings, handle_update_project_settings, handle_get_project_storage
from Api.Auth import handle_login, handle_logout, handle_me
from Api.Health import handle_live, handle_ready, handle_metrics
from Ingestion.ManagementAuth import management_auth_middleware
from Storage.Queries import verify_schema_ready
from Ingestion.WsHandler import ws_on_connect, ws_on_message, ws_on_close

# Mesh applications do not yet expose a public process-exit primitive. An
# intentional bounds failure on the main startup path is therefore the runtime
# mechanism that guarantees a non-zero process status after a fatal preflight.
fn abort_startup_process() do
  let unreachable = List.get(["startup aborted"], 1)
  println(unreachable)
end

fn fatal_startup(message :: String) do
  println("[Mesher] Fatal startup error: #{message}")
  abort_startup_process()
end

fn log_config_error(message :: String) do
  println("[Mesher] Config error: #{message}")
  abort_startup_process()
end

fn optional_positive_env_int(name :: String, default_value :: Int) -> Int ! String do
  let raw = Env.get(name, "")
  if raw == "" do
    Ok(default_value)
  else
    let value = Env.get_int(name, -1)
    if value > 0 do
      Ok(value)
    else
      Err(invalid_positive_int(name))
    end
  end
end

fn on_ws_connect(conn, path, headers) do
  ws_on_connect(conn, path, headers)
end

fn on_ws_message(conn, msg) do
  ws_on_message(conn, msg)
end

fn on_ws_close(conn, code :: Int, reason :: String) do
  ws_on_close(conn, code, reason)
end

fn start_runtime(http_port :: Int, ws_port :: Int, window_seconds :: Int, max_events :: Int) do
  println(
    "[Mesher] Runtime ready http_port=#{http_port} ws_port=#{ws_port} db_backend=postgres rate_limit_window_seconds=#{window_seconds} rate_limit_max_events=#{max_events}"
  )

  println("[Mesher] WebSocket server starting on :#{ws_port}")
  Ws.serve(on_ws_connect, on_ws_message, on_ws_close, ws_port)

  println("[Mesher] HTTP server starting on :#{http_port}")
  let router = HTTP.router()
    |> HTTP.use(management_auth_middleware)
    |> HTTP.on_get("/health/live", handle_live)
    |> HTTP.on_get("/health/ready", handle_ready)
    |> HTTP.on_get("/metrics", handle_metrics)
    |> HTTP.on_post("/api/v1/auth/login", handle_login)
    |> HTTP.on_post("/api/v1/auth/logout", handle_logout)
    |> HTTP.on_get("/api/v1/auth/me", handle_me)
    |> HTTP.on_post("/api/v1/events", handle_event)
    |> HTTP.on_post("/api/v1/events/bulk", handle_bulk)
    |> HTTP.on_get("/api/v1/projects/:project_id/issues", handle_search_issues)
    |> HTTP.on_get("/api/v1/projects/:project_id/events/search", handle_search_events)
    |> HTTP.on_get("/api/v1/projects/:project_id/events/tags", handle_filter_by_tag)
    |> HTTP.on_get("/api/v1/issues/:issue_id/events", handle_list_issue_events)
    |> HTTP.on_get("/api/v1/projects/:project_id/sessions/:session_id/events", handle_session_events)
    |> HTTP.on_get("/api/v1/projects/:project_id/dashboard/volume", handle_event_volume)
    |> HTTP.on_get("/api/v1/projects/:project_id/dashboard/levels", handle_error_breakdown)
    |> HTTP.on_get("/api/v1/projects/:project_id/dashboard/top-issues", handle_top_issues)
    |> HTTP.on_get("/api/v1/projects/:project_id/dashboard/tags", handle_tag_breakdown)
    |> HTTP.on_get("/api/v1/issues/:issue_id/timeline", handle_issue_timeline)
    |> HTTP.on_get("/api/v1/projects/:project_id/dashboard/health", handle_project_health)
    |> HTTP.on_get("/api/v1/events/:event_id", handle_event_detail)
    |> HTTP.on_post("/api/v1/issues/:id/resolve", handle_resolve_issue)
    |> HTTP.on_post("/api/v1/issues/:id/archive", handle_archive_issue)
    |> HTTP.on_post("/api/v1/issues/:id/unresolve", handle_unresolve_issue)
    |> HTTP.on_post("/api/v1/issues/:id/assign", handle_assign_issue)
    |> HTTP.on_post("/api/v1/issues/:id/discard", handle_discard_issue)
    |> HTTP.on_post("/api/v1/issues/:id/delete", handle_delete_issue)
    |> HTTP.on_get("/api/v1/orgs/:org_id/members", handle_list_members)
    |> HTTP.on_post("/api/v1/orgs/:org_id/members", handle_add_member)
    |> HTTP.on_post("/api/v1/orgs/:org_id/members/:membership_id/role", handle_update_member_role)
    |> HTTP.on_post("/api/v1/orgs/:org_id/members/:membership_id/remove", handle_remove_member)
    |> HTTP.on_get("/api/v1/projects/:project_id/api-keys", handle_list_api_keys)
    |> HTTP.on_post("/api/v1/projects/:project_id/api-keys", handle_create_api_key)
    |> HTTP.on_post("/api/v1/api-keys/:key_id/revoke", handle_revoke_api_key)
    |> HTTP.on_get("/api/v1/projects/:project_id/alert-rules", handle_list_alert_rules)
    |> HTTP.on_post("/api/v1/projects/:project_id/alert-rules", handle_create_alert_rule)
    |> HTTP.on_post("/api/v1/alert-rules/:rule_id/toggle", handle_toggle_alert_rule)
    |> HTTP.on_post("/api/v1/alert-rules/:rule_id/delete", handle_delete_alert_rule)
    |> HTTP.on_get("/api/v1/projects/:project_id/alerts", handle_list_alerts)
    |> HTTP.on_post("/api/v1/alerts/:id/acknowledge", handle_acknowledge_alert)
    |> HTTP.on_post("/api/v1/alerts/:id/resolve", handle_resolve_alert)
    |> HTTP.on_get("/api/v1/projects/:project_id/settings", handle_get_project_settings)
    |> HTTP.on_post("/api/v1/projects/:project_id/settings", handle_update_project_settings)
    |> HTTP.on_get("/api/v1/projects/:project_id/storage", handle_get_project_storage)
  HTTP.serve(router, http_port)
end

fn on_runtime_ready(
  http_port :: Int,
  ws_port :: Int,
  window_seconds :: Int,
  max_events :: Int,
  pool :: PoolHandle
) do
  let schema_result = verify_schema_ready(pool)
  case schema_result do
    Ok( schema_ready) -> if schema_ready do
      case create_partitions_ahead(pool, 7) do
        Ok( _) -> do
          println("[Mesher] Partition bootstrap succeeded (7 days ahead)")
          let org_svc = OrgService.start(pool)
          println("[Mesher] OrgService started")
          let project_svc = ProjectService.start(pool)
          println("[Mesher] ProjectService started")
          let user_svc = UserService.start(pool)
          println("[Mesher] UserService started")
          let pipeline_pid = start_pipeline(pool, window_seconds, max_events)
          println("[Mesher] Foundation ready")
          start_runtime(http_port, ws_port, window_seconds, max_events)
        end
        Err( e) -> fatal_startup("required partition bootstrap failed: #{e}")
      end
    else
      fatal_startup("required database migration 20260716000000 is not applied")
    end
    Err( e) -> fatal_startup("database readiness check failed: #{e}")
  end
end

fn maybe_boot_with_pool(
  http_port :: Int,
  ws_port :: Int,
  window_seconds :: Int,
  max_events :: Int,
  pool :: PoolHandle
) do
  println("[Mesher] runtime bootstrap mode=single-node")
  on_runtime_ready(http_port, ws_port, window_seconds, max_events, pool)
end

fn start_with_values(
  database_url :: String,
  http_port :: Int,
  ws_port :: Int,
  window_seconds :: Int,
  max_events :: Int
) do
  println(
    "[Mesher] Config loaded http_port=#{http_port} ws_port=#{ws_port} rate_limit_window_seconds=#{window_seconds} rate_limit_max_events=#{max_events}"
  )
  println("[Mesher] Connecting to PostgreSQL pool...")

  let pool_result = Pool.open(database_url, 2, 10, 5000)
  case pool_result do
    Ok( pool) -> do
      println("[Mesher] PostgreSQL pool ready")
      maybe_boot_with_pool(http_port, ws_port, window_seconds, max_events, pool)
    end
    Err( _) -> fatal_startup("PostgreSQL connect failed")
  end
end

fn maybe_start_with_max_events(
  database_url :: String,
  http_port :: Int,
  ws_port :: Int,
  window_seconds :: Int
) do
  let max_events_env = rate_limit_max_events_key()
  case optional_positive_env_int(max_events_env, default_rate_limit_max_events()) do
    Ok( max_events) -> start_with_values(database_url, http_port, ws_port, window_seconds, max_events)
    Err( message) -> log_config_error(message)
  end
end

fn maybe_start_with_window_seconds(database_url :: String, http_port :: Int, ws_port :: Int) do
  let window_seconds_env = rate_limit_window_seconds_key()
  case optional_positive_env_int(window_seconds_env, default_rate_limit_window_seconds()) do
    Ok( window_seconds) -> maybe_start_with_max_events(database_url, http_port, ws_port, window_seconds)
    Err( message) -> log_config_error(message)
  end
end

fn maybe_start_with_ws_port(database_url :: String, http_port :: Int) do
  let ws_port_env = ws_port_key()
  case optional_positive_env_int(ws_port_env, default_ws_port()) do
    Ok( ws_port) -> maybe_start_with_window_seconds(database_url, http_port, ws_port)
    Err( message) -> log_config_error(message)
  end
end

fn maybe_start_with_port(database_url :: String) do
  let port_env = port_key()
  case optional_positive_env_int(port_env, default_port()) do
    Ok( http_port) -> maybe_start_with_ws_port(database_url, http_port)
    Err( message) -> log_config_error(message)
  end
end

fn main() do
  let database_url_env = database_url_key()
  let database_url = String.trim(Env.get(database_url_env, ""))
  if database_url == "" do
    log_config_error(missing_required_env(database_url_env))
  else
    maybe_start_with_port(database_url)
  end
end
