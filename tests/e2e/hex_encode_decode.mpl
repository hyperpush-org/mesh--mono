fn main() do
  let h = Hex.encode("hi")
  println(h)
  let d = Hex.decode(h)
  case d do
    Ok(s) -> println(s)
    Err(e) -> println(e)
  end
  let upper = Hex.decode("6869")
  case upper do
    Ok(s) -> println(s)
    Err(e) -> println(e)
  end
  let bad = Hex.decode("xyz")
  case bad do
    Ok(s) -> println(s)
    Err(e) -> println(e)
  end
end
