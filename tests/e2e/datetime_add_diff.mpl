fn print_diff(base :: DateTime) do
  let future = DateTime.add(base, 7, :day)
  let past = DateTime.add(base, -1, :hour)
  let diff_days = DateTime.diff(future, base, :day)
  let diff_hours = DateTime.diff(base, past, :hour)
  println("${diff_days}")
  println("${diff_hours}")
end

fn main() do
  let base_r = DateTime.from_unix_ms(1705312200000)
  case base_r do
    Ok(base) -> print_diff(base)
    Err(e) -> println(e)
  end
end
