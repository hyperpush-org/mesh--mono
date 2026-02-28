fn main() do
  let req = Http.build(:get, "http://example.com")
  let req = Http.header(req, "Authorization", "Bearer token")
  let req = Http.timeout(req, 5000)
  println("built")
end
