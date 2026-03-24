fn handler(request) do
  let status = case Request.query(request, "status") do
    Some(v) -> v
    None -> "unresolved"
  end
  HTTP.response(200, status)
end

fn main() do
  let r = HTTP.router()
  let _r = HTTP.route(r, "/issues", handler)
  println("request_query_ok")
end
