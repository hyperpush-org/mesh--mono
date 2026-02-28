fn print_unix_secs(dt :: DateTime) do
  let secs = DateTime.to_unix_secs(dt)
  println("${secs}")
end

fn main() do
  let r = DateTime.from_unix_secs(1705312200)
  case r do
    Ok(dt) -> print_unix_secs(dt)
    Err(e) -> println(e)
  end
end
