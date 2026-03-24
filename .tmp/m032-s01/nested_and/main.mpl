fn main() do
  let outer = true
  let left = true
  let right = false
  if outer do
    if left && right do
      println("both")
    else
      println("nested_and_ok")
    end
  else
    println("outer_false")
  end
end
