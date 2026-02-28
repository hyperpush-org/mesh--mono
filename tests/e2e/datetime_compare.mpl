fn print_bool(b :: Bool) do
  if b do
    println("true")
  else
    println("false")
  end
end

fn compare_dts(earlier :: DateTime, later :: DateTime) do
  print_bool(DateTime.is_before(earlier, later))
  print_bool(DateTime.is_after(earlier, later))
  print_bool(DateTime.is_before(later, earlier))
  print_bool(DateTime.is_after(later, earlier))
end

fn from_later(earlier :: DateTime) do
  let r2 = DateTime.from_unix_ms(1705398600000)
  case r2 do
    Ok(later) -> compare_dts(earlier, later)
    Err(e) -> println(e)
  end
end

fn main() do
  let r1 = DateTime.from_unix_ms(1705312200000)
  case r1 do
    Ok(earlier) -> from_later(earlier)
    Err(e) -> println(e)
  end
end
