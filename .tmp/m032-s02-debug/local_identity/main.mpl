pub fn identity(x) do
  x
end

fn main() do
  println("#{identity(7)}")
  println(identity("poly"))
end
