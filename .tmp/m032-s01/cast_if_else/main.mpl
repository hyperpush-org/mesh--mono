service Toggle do
  fn init() -> Int do
    0
  end

  cast Set(flag :: Bool) do |state|
    if flag do
      1
    else
      2
    end
  end

  call Get() :: Int do |state|
    (state, state)
  end
end

fn main() do
  let pid = Toggle.start()
  Toggle.set(pid, true)
  Timer.sleep(50)
  println("#{Toggle.get(pid)}")
  Toggle.set(pid, false)
  Timer.sleep(50)
  println("#{Toggle.get(pid)}")
end
