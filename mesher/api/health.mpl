# Dedicated liveness/readiness endpoints. Liveness proves the process can serve;
# readiness proves the database and required schema migration are available.

from Ingestion.Pipeline import PipelineRegistry
from Services.RateLimiter import RateLimiter
from Services.StreamManager import StreamManager
from Storage.Queries import verify_schema_ready
from Api.Helpers import get_registry

fn health_headers() do
  %{"Cache-Control" => "no-store", "X-Content-Type-Options" => "nosniff"}
end

pub fn handle_live(request) do
  HTTP.response_with_headers(200, json { status : "live" }, health_headers())
end

pub fn handle_ready(request) do
  let reg_pid = get_registry()
  let pool = PipelineRegistry.get_pool(reg_pid)
  let result = verify_schema_ready(pool)
  case result do
    Ok( ready) -> if ready do
      HTTP.response_with_headers(200, json { status : "ready" }, health_headers())
    else
      HTTP.response_with_headers(503, json { status : "not_ready" }, health_headers())
    end
    Err( _) -> HTTP.response_with_headers(503, json { status : "not_ready" }, health_headers())
  end
end

pub fn handle_metrics(request) do
  let reg_pid = get_registry()
  let rate_limiter_pid = PipelineRegistry.get_rate_limiter(reg_pid)
  let stream_mgr_pid = Process.whereis("stream_manager")
  let outcomes = PipelineRegistry.get_metrics_json(reg_pid)
  let rate_counters = RateLimiter.get_counters_json(rate_limiter_pid)
  let max_units = RateLimiter.get_max_units(rate_limiter_pid)
  let ws_connections = StreamManager.connection_count(stream_mgr_pid)
  HTTP.response_with_headers(200,
  """{"ingestion_outcomes":#{outcomes},"rate_limit_units":#{rate_counters},"rate_limit_max_units":#{max_units},"websocket_connections":#{ws_connections}}""",
  %{"Cache-Control" => "no-store", "Content-Type" => "application/json", "X-Content-Type-Options" => "nosniff"})
end
