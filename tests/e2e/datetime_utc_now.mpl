fn main() do
  let dt = DateTime.utc_now()
  let ms = DateTime.to_unix_ms(dt)
  let positive = ms > 1700000000000
  println("${positive}")
end
