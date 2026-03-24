fn handler(request) do
  HTTP.response(200, "bare_ok")
end

fn main() do
  let router = HTTP.router()
  let router = HTTP.route(router, "/", handler)
  HTTP.serve(router, 18124)
end
