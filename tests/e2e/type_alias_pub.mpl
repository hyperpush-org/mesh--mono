pub type UserId = Int
pub type Email = String

fn greet(id :: UserId, email :: Email) -> Email do
  email
end

fn main() do
  let id :: UserId = 42
  let addr :: Email = "user@example.com"
  println(greet(id, addr))
end
