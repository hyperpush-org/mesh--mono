fn helper(flag :: Bool) do
  if flag do
    Ok("yes")
  else
    Err("no")
  end
end

service Demo do
  fn init() -> Int do
    0
  end

  call Go(flag :: Bool) do |state|
    (state, case helper(flag) do
      Ok(v) -> Ok(v)
      Err(e) -> Err(e)
    end)
  end
end

fn print_result(result) do
  case result do
    Ok(v) -> println(v)
    Err(e) -> println(e)
  end
end

fn main() do
  let pid = Demo.start()
  print_result(Demo.go(pid, true))
  print_result(Demo.go(pid, false))
end
