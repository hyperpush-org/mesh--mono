fn add(a :: Int, b :: Int) -> Int do
  a + b
end

fn main() do
  # Slot position 5 on a 2-arg function — should fail to compile
  let result = 10 |5> add(1)
  println("${result}")
end
