fn add(a :: Int, b :: Int) -> Int do
  a + b
end

fn multiply(a :: Int, b :: Int) -> Int do
  a * b
end

fn to_string_val(x :: Int) -> String do
  "${x}"
end

fn main() do
  # Chain: 5 |2> add(10) |> to_string_val
  # Step 1: 5 |2> add(10) = add(10, 5) = 15
  # Step 2: 15 |> to_string_val = "15"
  let result = 5 |2> add(10) |> to_string_val
  println(result)

  # Chain: 3 |2> add(2) |2> multiply(4)
  # Step 1: 3 |2> add(2) = add(2, 3) = 5
  # Step 2: 5 |2> multiply(4) = multiply(4, 5) = 20
  let result2 = 3 |2> add(2) |2> multiply(4)
  println("${result2}")
end
