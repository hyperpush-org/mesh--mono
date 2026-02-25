fn add(a :: Int, b :: Int) -> Int do
  a + b
end

fn concat3(a :: String, b :: String, c :: String) -> String do
  a <> b <> c
end

fn main() do
  # x |2> add(1) desugars to add(1, x) = 1 + 10 = 11
  let result1 = 10 |2> add(1)
  println("${result1}")

  # "world" |2> concat3("hello ", " !") = concat3("hello ", "world", " !") = "hello world !"
  let result2 = "world" |2> concat3("hello ", " !")
  println(result2)
end
