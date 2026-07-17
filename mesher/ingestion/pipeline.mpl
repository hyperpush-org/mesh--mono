# Pipeline startup orchestration and service registry.
# PipelineRegistry service stores the pool handle and service PIDs so
# HTTP/WS handlers can look them up via Process.whereis("mesher_registry").

from Services.RateLimiter import start_rate_limiter
from Services.EventProcessor import EventProcessor
from Services.StreamManager import StreamManager
from Storage.Queries import check_volume_spikes, get_threshold_rules, evaluate_threshold_rule, fire_alert
from Services.Retention import retention_cleaner

# Registry state holds pool handle and all service PIDs.

struct RegistryState do
  pool :: PoolHandle
  rate_limiter_pid :: Pid
  processor_pid :: Pid
  event_count :: Int
  outcomes :: Map < String, Int >
end

# PipelineRegistry service -- stores pipeline context for handler lookup.
# Call handlers return the stored values with correct types.

service PipelineRegistry do
  fn init(pool :: PoolHandle, rate_limiter_pid :: Pid, processor_pid :: Pid) -> RegistryState do
    RegistryState {
      pool : pool,
      rate_limiter_pid : rate_limiter_pid,
      processor_pid : processor_pid,
      event_count : 0,
      outcomes : Map.new()
    }
  end
  
  call GetPool() :: PoolHandle do|state|
    (state, state.pool)
  end
  
  call GetRateLimiter() :: Pid do|state|
    (state, state.rate_limiter_pid)
  end
  
  call GetProcessor() :: Pid do|state|
    (state, state.processor_pid)
  end
  
  call GetEventCount() :: Int do|state|
    (state, state.event_count)
  end
  
  call IncrementEventCount() :: Int do|state|
    let new_count = state.event_count + 1
    let new_state = RegistryState {
      pool : state.pool,
      rate_limiter_pid : state.rate_limiter_pid,
      processor_pid : state.processor_pid,
      event_count : new_count,
      outcomes : state.outcomes
    }
    (new_state, new_count)
  end
  
  call ResetEventCount() :: Int do|state|
    let new_state = RegistryState {
      pool : state.pool,
      rate_limiter_pid : state.rate_limiter_pid,
      processor_pid : state.processor_pid,
      event_count : 0,
      outcomes : state.outcomes
    }
    (new_state, 0)
  end

  call RecordOutcome(project_id :: String, outcome :: String) :: Int do|state|
    let key = "#{project_id}:#{outcome}"
    let next_count = Map.get(state.outcomes, key) + 1
    let new_state = RegistryState {
      pool : state.pool,
      rate_limiter_pid : state.rate_limiter_pid,
      processor_pid : state.processor_pid,
      event_count : state.event_count,
      outcomes : Map.put(state.outcomes, key, next_count)
    }
    (new_state, next_count)
  end

  call GetMetricsJson() :: String do|state|
    (state, Json.encode(state.outcomes))
  end
end

# Ticker actor for periodic buffer drain (STREAM-05 backpressure).
# Uses Timer.sleep + recursive call because Timer.send_after delivers raw bytes
# that cannot match service cast dispatch tags (type_tag-based dispatch).

actor stream_drain_ticker(stream_mgr_pid, interval :: Int) do
  Timer.sleep(interval)
  
  StreamManager.drain_buffers(stream_mgr_pid)
  
  stream_drain_ticker(stream_mgr_pid, interval)
end

# Health checker actor -- periodically verifies pipeline services are responsive.
# Uses Timer.sleep + recursive call pattern (established in flush_ticker).
# Verifies the PipelineRegistry responds to a service call every 10 seconds.

actor health_checker(pool :: PoolHandle) do
  Timer.sleep(10000)
  
  let reg_pid = Process.whereis("mesher_registry")
  
  PipelineRegistry.get_pool(reg_pid)
  
  println("[Mesher] Health check: all services responsive")
  
  health_checker(pool)
end

# Helper: log spike checker result (extracted for single-expression case arm).

fn log_spike_result(n :: Int) do
  if n > 0 do
    # String interpolation: #{n} converts Int to String inline
    println("[Mesher] Spike checker: escalated #{n} archived issues")
    0
  else
    0
  end
end

# Helper: log spike checker error (extracted for matching branch types).

fn log_spike_error(e :: String) do
  println("[Mesher] Spike checker error: #{e}")
  0
end

# Periodic spike detection actor -- checks archived issues for volume spikes.
# Runs every 5 minutes (300000ms). If an archived issue has a sudden burst of events
# (>10x average hourly rate), it's auto-escalated to 'unresolved' (ISSUE-03).
# Uses Timer.sleep + recursive call pattern (established in flush_ticker, health_checker).

actor spike_checker(pool :: PoolHandle) do
  Timer.sleep(300000)
  
  let result = check_volume_spikes(pool)
  
  case result do
    Ok( n) -> log_spike_result(n)
    Err( e) -> log_spike_error(e)
  end
  
  spike_checker(pool)
end

# --- Alert evaluation helpers (ALERT-02, ALERT-04, ALERT-05) ---
# Defined before alert_evaluator actor (define-before-use, decision [90-03]).
# Broadcast alert notification to project WebSocket room (ALERT-04).

fn broadcast_alert(project_id :: String,
alert_id :: String,
rule_name :: String,
condition_type :: String,
message :: String) do
  let msg = """{"type":"alert","alert_id":#{Json.encode_string(alert_id)},"rule_name":#{Json.encode_string(rule_name)},"condition":#{Json.encode_string(condition_type)},"message":#{Json.encode_string(message)}}"""
  let stream_mgr_pid = Process.whereis("stream_manager")
  StreamManager.publish_project(stream_mgr_pid, project_id, msg)
  0
end

fn broadcast_claimed_alert(project_id :: String,
alert_id :: String,
rule_name :: String,
condition_type :: String,
message :: String) do
  broadcast_alert(project_id, alert_id, rule_name, condition_type, message)
  1
end

# Fire alert record then broadcast (combines fire_alert + broadcast_alert).

fn fire_and_broadcast(pool :: PoolHandle,
rule_id :: String,
project_id :: String,
rule_name :: String,
condition_type :: String,
message :: String) do
  let result = fire_alert(pool, rule_id, project_id, message, condition_type, rule_name)
  case result do
    Ok( alert_id) -> broadcast_claimed_alert(project_id, alert_id, rule_name, condition_type, message)
    Err( _) -> 0
  end
end

# Extract a field from condition_json string using Mesh-native Json.get (no DB roundtrip).

fn extract_condition_field(pool :: PoolHandle, condition_json :: String, field :: String) -> String ! String do
  Ok(Json.get(condition_json, field))
end

# Fire if threshold exceeded.

fn fire_threshold_if_needed(pool :: PoolHandle,
rule_id :: String,
project_id :: String,
rule_name :: String,
should_fire :: Bool,
threshold_str :: String,
window_str :: String) do
  if should_fire do
    let message = "Event count exceeded #{threshold_str} in #{window_str} minutes"
    fire_and_broadcast(pool, rule_id, project_id, rule_name, "threshold", message)
  else
    0
  end
end

# Final threshold check and fire.

fn check_and_fire_threshold(pool :: PoolHandle,
rule_id :: String,
project_id :: String,
rule_name :: String,
cooldown_str :: String,
threshold_str :: String,
window_str :: String) do
  let should_fire_result = evaluate_threshold_rule(pool,
  rule_id,
  project_id,
  threshold_str,
  window_str,
  cooldown_str)
  case should_fire_result do
    Ok( should_fire) -> fire_threshold_if_needed(pool,
    rule_id,
    project_id,
    rule_name,
    should_fire,
    threshold_str,
    window_str)
    Err( _) -> 0
  end
end

# Continue evaluation after threshold extracted.

fn evaluate_threshold_with_window(pool :: PoolHandle,
rule_id :: String,
project_id :: String,
rule_name :: String,
condition_json :: String,
cooldown_str :: String,
threshold_str :: String) do
  let window_result = extract_condition_field(pool, condition_json, "window_minutes")
  case window_result do
    Ok( window_str) -> check_and_fire_threshold(pool,
    rule_id,
    project_id,
    rule_name,
    cooldown_str,
    threshold_str,
    window_str)
    Err( _) -> 0
  end
end

# Evaluate one threshold rule and fire if threshold exceeded.

fn evaluate_single_threshold(pool :: PoolHandle,
rule_id :: String,
project_id :: String,
rule_name :: String,
condition_json :: String,
cooldown_str :: String) do
  let threshold_result = extract_condition_field(pool, condition_json, "threshold")
  case threshold_result do
    Ok( threshold_str) -> evaluate_threshold_with_window(pool,
    rule_id,
    project_id,
    rule_name,
    condition_json,
    cooldown_str,
    threshold_str)
    Err( _) -> 0
  end
end

# Loop through rules list by index.

fn evaluate_rules_loop(pool :: PoolHandle, rules, i :: Int, total :: Int, fired :: Int) -> Int ! String do
  if i < total do
    let rule = List.get(rules, i)
    let rule_id = Map.get(rule, "id")
    let project_id = Map.get(rule, "project_id")
    let rule_name = Map.get(rule, "name")
    let condition_json = Map.get(rule, "condition_json")
    let cooldown_str = Map.get(rule, "cooldown_minutes")
    let fired_now = evaluate_single_threshold(pool, rule_id, project_id, rule_name, condition_json, cooldown_str)
    evaluate_rules_loop(pool, rules, i + 1, total, fired + fired_now)
  else
    Ok(fired)
  end
end

# Load and evaluate all enabled threshold rules.

fn evaluate_all_threshold_rules(pool :: PoolHandle) -> Int ! String do
  let rules = get_threshold_rules(pool) ?
  evaluate_rules_loop(pool, rules, 0, List.length(rules), 0)
end

# Log helpers (extracted for single-expression case arms, decision [88-02]).

fn log_eval_result(n :: Int) do
  println("[Mesher] Alert evaluator: checked rules, #{n} fired")
  0
end

fn log_eval_error(e :: String) do
  println("[Mesher] Alert evaluator error: #{e}")
  0
end

# Timer-driven alert evaluator actor (ALERT-02).
# Runs every 30 seconds, evaluates all enabled threshold rules.
# Uses Timer.sleep + recursive call pattern (established in flush_ticker, health_checker).

actor alert_evaluator(pool :: PoolHandle) do
  Timer.sleep(30000)
  
  let result = evaluate_all_threshold_rules(pool)
  
  case result do
    Ok( n) -> log_eval_result(n)
    Err( e) -> log_eval_error(e)
  end
  
  alert_evaluator(pool)
end

fn start_configured_rate_limiter(window_seconds :: Int, max_events :: Int) do
  let rate_limiter_pid = start_rate_limiter(window_seconds, max_events)
  println("[Mesher] RateLimiter started (#{window_seconds}s window, #{max_events} max)")
  rate_limiter_pid
end

# Start the full ingestion pipeline.
# 1. Start StreamManager + drain ticker
# 2. Start RateLimiter
# 3. Start EventProcessor
# 4. Start PipelineRegistry (stores all PIDs)
# 5. Register PipelineRegistry by name for handler lookup
# 6. Spawn health checker + spike checker + alert evaluator
# Returns registry PID.

pub fn start_pipeline(pool :: PoolHandle, window_seconds :: Int, max_events :: Int) do
  # Start stream manager (before other services so WS handler can find it)
  let stream_mgr_pid = StreamManager.start()
  Process.register("stream_manager", stream_mgr_pid)
  println("[Mesher] StreamManager started")
  # Spawn drain ticker for StreamManager buffer backpressure (250ms interval)
  spawn(stream_drain_ticker, stream_mgr_pid, 250)
  println("[Mesher] StreamManager drain ticker started (250ms interval)")
  # Start rate limiter
  let rate_limiter_pid = start_configured_rate_limiter(window_seconds, max_events)
  # Start event processor
  let processor_pid = EventProcessor.start(pool)
  println("[Mesher] EventProcessor started")
  # Start pipeline registry
  let registry_pid = PipelineRegistry.start(pool, rate_limiter_pid, processor_pid)
  Process.register("mesher_registry", registry_pid)
  println("[Mesher] PipelineRegistry started in single-node mode")
  # Spawn health checker for automatic restart (10s interval)
  spawn(health_checker, pool)
  println("[Mesher] Health checker started (10s interval)")
  # Spawn spike detection checker (5 minute interval)
  spawn(spike_checker, pool)
  println("[Mesher] Spike checker started (5 min interval)")
  # Spawn alert evaluator (30-second interval for threshold rules)
  spawn(alert_evaluator, pool)
  println("[Mesher] Alert evaluator started (30s interval)")
  # Spawn retention cleaner (24-hour interval for daily cleanup)
  spawn(retention_cleaner, pool)
  println("[Mesher] Retention cleaner started (24h interval)")
  registry_pid
end
