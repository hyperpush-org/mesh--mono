---
name: mesh-http
description: Mesh HTTP: server routing (HTTP.router/route/serve), middleware (HTTP.use), path parameters, HTTP client (HTTP.get), response helpers, and WebSocket.
---

## HTTP Server Basics

Rules:
1. `HTTP.router()` creates a new router instance.
2. `HTTP.route(router, path, handler)` registers a handler for a path — returns updated router (rebind).
3. `HTTP.serve(router, port)` starts the HTTP server on the given port (blocks).
4. Handler signature: `fn handler(request) do ... HTTP.response(status, body) end`.
5. `HTTP.response(status_code, body_string)` creates a Response — return this from handlers.

Code example (from tests/e2e/stdlib_http_server_runtime.mpl):
```mesh
fn handler(request) do
  HTTP.response(200, "{\"status\":\"ok\"}")
end

fn main() do
  let r = HTTP.router()
  let r = HTTP.route(r, "/health", handler)
  HTTP.serve(r, 8080)
end
```

## Request Object

Rules:
1. Handlers receive a `Request` value — use `Request.*` functions to inspect it.
2. `Request.path(request)` — returns the URL path as String.
3. `Request.param(request, "name")` — extracts a named path parameter (e.g., from `/users/:id`).
4. `Request.body(request)` — returns the raw request body as String.
5. `Request.header(request, "Header-Name")` — reads a request header.

Code example (from tests/e2e/stdlib_http_path_params.mpl):
```mesh
fn user_handler(request :: Request) do
  let id = Request.param(request, "id")
  HTTP.response(200, "user id: #{id}")
end

fn main() do
  let r = HTTP.router()
  let r = HTTP.route(r, "/users/:id", user_handler)
  HTTP.serve(r, 8080)
end
```

## Response Helpers

Rules:
1. `HTTP.response(status, body)` — creates response with given status code and string body.
2. Return this from any handler or middleware.
3. Common status codes: 200 (ok), 201 (created), 400 (bad request), 401 (unauthorized), 404 (not found), 500 (error).

Code example (from tests/e2e/stdlib_http_response.mpl):
```mesh
fn handler(request :: Request) -> Response do
  HTTP.response(200, "hello world")
end
```

## Middleware

Rules:
1. `HTTP.use(router, middleware_fn)` registers middleware — returns updated router (rebind).
2. Middleware signature: `fn name(request :: Request, next) -> Response do ... end`.
3. Call `next(request)` to pass control to the next middleware or final handler.
4. Return a Response directly (without calling `next`) to short-circuit (e.g., auth rejection).
5. Middleware executes in registration order — first registered runs first.
6. Multiple middleware can be chained with successive `HTTP.use` calls.

Code example (from tests/e2e/stdlib_http_middleware.mpl):
```mesh
fn logger(request :: Request, next) -> Response do
  next(request)   # pass through
end

fn auth_check(request :: Request, next) do
  let path = Request.path(request)
  if String.starts_with(path, "/secret") do
    HTTP.response(401, "Unauthorized")   # short-circuit
  else
    next(request)
  end
end

fn main() do
  let r = HTTP.router()
  let r = HTTP.use(r, logger)
  let r = HTTP.use(r, auth_check)
  let r = HTTP.route(r, "/hello", handler)
  let r = HTTP.route(r, "/secret", secret_handler)
  HTTP.serve(r, 8080)
end
```

## HTTP Client

Rules:
1. `HTTP.get(url) -> Result<String, String>` — synchronous GET; returns body or error message.
2. Returns `Ok(body_string)` on 2xx, `Err(message)` on failure.
3. Use the `?` operator or `case` to handle the result.

Code example (from tests/e2e/stdlib_http_client.mpl):
```mesh
let result = HTTP.get("http://api.example.com/data")
case result do
  Ok(body) -> println(body)
  Err(msg) -> println("request failed: #{msg}")
end
```

## WebSocket

Rules:
1. WebSocket support is integrated with the HTTP server — same router.
2. `HTTP.ws_route(router, path, ws_handler)` registers a WebSocket handler.
3. WebSocket handlers work with the actor runtime — each connection is an actor.
4. `HTTP.ws_send(conn, message)` sends a message to a WebSocket connection.
5. See skills/actors for the actor model that backs WebSocket connections.

## Error Handling with HTTP.serve

Rules:
1. `HTTP.serve` runs the server inside the actor runtime.
2. Handler panics are isolated — one failing request does not crash the server.
3. For production use, pair with a supervisor (see skills/supervisors) to restart the server actor on crash.
4. The `HTTP.crash_isolation` test verifies that panicking handlers return 500 without killing the server.

Code example (from tests/e2e/stdlib_http_crash_isolation.mpl):
```mesh
fn panicky_handler(request :: Request) do
  panic("deliberate crash")
end

fn safe_handler(request :: Request) do
  HTTP.response(200, "ok")
end

fn main() do
  let r = HTTP.router()
  let r = HTTP.route(r, "/crash", panicky_handler)
  let r = HTTP.route(r, "/safe", safe_handler)
  HTTP.serve(r, 8085)
  # /crash returns 500; /safe still returns 200
end
```
