fn main() do
  let router = HTTP.router()
  let router = HTTP.route(router, "/", fn (request) do
    HTTP.response(200, "closure_ok")
  end)
  HTTP.serve(router, 18123)
end
