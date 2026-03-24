service Ticker do
  fn init() -> Int do
    0
  end

  cast Tick() do |state|
    state + 1
  end

  call Get() :: Int do |state|
    (state, state)
  end
end

fn main() do
  let pid = Ticker.start()
  Timer.send_after(pid, 20, ())
  Timer.sleep(100)
  println("#{Ticker.get(pid)}")
end
