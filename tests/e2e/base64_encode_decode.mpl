fn main() do
  let encoded = Base64.encode("hello")
  println(encoded)
  let decoded = Base64.decode(encoded)
  case decoded do
    Ok(s) -> println(s)
    Err(e) -> println(e)
  end
  let bad = Base64.decode("not valid base64!!")
  case bad do
    Ok(s) -> println(s)
    Err(e) -> println(e)
  end
end
