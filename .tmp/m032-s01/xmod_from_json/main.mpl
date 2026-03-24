from Models import User

fn main() do
  let u = User { name: "Scout", age: 7 }
  let json_str = Json.encode(u)
  let result = User.from_json(json_str)
  case result do
    Ok(u2) -> println("#{u2.name} #{u2.age}")
    Err(e) -> println(e)
  end
end
