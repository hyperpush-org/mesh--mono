fn print_unix_ms(dt :: DateTime) do
  let ms = DateTime.to_unix_ms(dt)
  println("${ms}")
  println(DateTime.to_iso8601(dt))
end

fn main() do
  let r = DateTime.from_unix_ms(1705312200000)
  case r do
    Ok(dt) -> print_unix_ms(dt)
    Err(e) -> println(e)
  end
end
