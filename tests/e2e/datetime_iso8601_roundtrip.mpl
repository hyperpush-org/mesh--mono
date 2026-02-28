fn main() do
  let r1 = DateTime.from_iso8601("2024-01-15T10:30:00Z")
  case r1 do
    Ok(dt) -> println(DateTime.to_iso8601(dt))
    Err(e) -> println(e)
  end
  let r2 = DateTime.from_iso8601("2024-01-15T10:30:00+05:30")
  case r2 do
    Ok(dt) -> println(DateTime.to_iso8601(dt))
    Err(e) -> println(e)
  end
  let r3 = DateTime.from_iso8601("2024-01-15T10:30:00")
  case r3 do
    Ok(dt) -> println("should not reach")
    Err(e) -> println(e)
  end
end
