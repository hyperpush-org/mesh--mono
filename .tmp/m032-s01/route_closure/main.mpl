fn main() do
  let router = HTTP.router()
  let _router = HTTP.route(router, "/", fn (request) do
    HTTP.response(200, "ok")
  end)
  println("route_closure_built")
end
