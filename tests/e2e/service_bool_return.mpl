# Service Bool return E2E test.
# Verifies: service call returning Bool type with struct state.
# Exercises the Bool truncation path (i64 -> i1) in codegen_service_call_helper.
# Also exercises Bool ARGUMENT passing to service handler (i64 -> trunc -> i1).
# Expected output: true\ntrue\nfalse\nenabled:true\ndisabled:false\n

struct LimitState do
  count :: Int
  max :: Int
end

fn check_impl(state :: LimitState) -> (LimitState, Bool) do
  if state.count >= state.max do
    (state, false)
  else
    let new_state = LimitState { count: state.count + 1, max: state.max }
    (new_state, true)
  end
end

fn set_enabled_impl(state :: LimitState, enabled :: Bool) -> (LimitState, Bool) do
  let new_max = if enabled do state.max else 0 end
  let new_state = LimitState { count: state.count, max: new_max }
  (new_state, enabled)
end

service Limiter do
  fn init(max :: Int) -> LimitState do
    LimitState { count: 0, max: max }
  end

  call Check() :: Bool do |state|
    check_impl(state)
  end

  call SetEnabled(enabled :: Bool) :: Bool do |state|
    set_enabled_impl(state, enabled)
  end
end

fn main() do
  let pid = Limiter.start(2)
  let r1 = Limiter.check(pid)
  if r1 do
    println("true")
  else
    println("false")
  end
  let r2 = Limiter.check(pid)
  if r2 do
    println("true")
  else
    println("false")
  end
  # Third call: count=2 >= max=2, should be false
  let r3 = Limiter.check(pid)
  if r3 do
    println("true")
  else
    println("false")
  end
  # Test Bool argument passing: SetEnabled(true) should return true
  let r4 = Limiter.set_enabled(pid, true)
  if r4 do
    println("enabled:true")
  else
    println("enabled:false")
  end
  # Test Bool argument passing: SetEnabled(false) should return false
  let r5 = Limiter.set_enabled(pid, false)
  if r5 do
    println("disabled:true")
  else
    println("disabled:false")
  end
end
