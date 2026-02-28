fn main() do
  let encoded = Base64.encode_url("hello")
  println(encoded)
  let decoded = Base64.decode_url(encoded)
  case decoded do
    Ok(s) -> println(s)
    Err(e) -> println(e)
  end
end
