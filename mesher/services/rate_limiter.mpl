# RateLimiter service -- single actor managing per-project rate counters.
# Uses a fixed-window approach: counts events per project within a time window.
# Window reset handled by rate_window_ticker actor (Timer.sleep + cast pattern).

struct RateLimitState do
  limits :: Map < String, Int >
  window_seconds :: Int
  max_events :: Int
end

fn check_limit_impl(state :: RateLimitState,
project_id :: String,
cost :: Int) ->( RateLimitState, Bool) do
  let count = Map.get(state.limits, project_id)
  let allowed = count + cost <= state.max_events
  let next_limits = if allowed do
    Map.put(state.limits, project_id, count + cost)
  else
    state.limits
  end
  let new_state = RateLimitState {
    limits : next_limits,
    window_seconds : state.window_seconds,
    max_events : state.max_events
  }
  (new_state, allowed)
end

fn reset_window_impl(state :: RateLimitState) -> RateLimitState do
  RateLimitState {
    limits : Map.new(),
    window_seconds : state.window_seconds,
    max_events : state.max_events
  }
end

service RateLimiter do
  fn init(window_seconds :: Int, max_events :: Int) -> RateLimitState do
    RateLimitState {
      limits : Map.new(),
      window_seconds : window_seconds,
      max_events : max_events
    }
  end
  
  # Synchronous check: returns true if allowed, false if rate limited.
  
  call CheckLimit(project_id :: String, cost :: Int) :: Bool do|state|
    check_limit_impl(state, project_id, cost)
  end

  call GetCountersJson() :: String do|state|
    (state, Json.encode(state.limits))
  end

  call GetMaxUnits() :: Int do|state|
    (state, state.max_events)
  end
  
  # Async reset: clears all counters for a new window.
  
  cast ResetWindow() do|state|
    reset_window_impl(state)
  end
end

# Ticker actor for periodic window reset.
# Same pattern as flush_ticker in StorageWriter.

actor rate_window_ticker(limiter_pid, interval :: Int) do
  Timer.sleep(interval)
  
  RateLimiter.reset_window(limiter_pid)
  
  rate_window_ticker(limiter_pid, interval)
end

pub fn start_rate_limiter(window_seconds :: Int, max_events :: Int) do
  let limiter_pid = RateLimiter.start(window_seconds, max_events)
  spawn(rate_window_ticker, limiter_pid, window_seconds * 1000)
  limiter_pid
end
