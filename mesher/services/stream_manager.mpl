# StreamManager service -- per-connection subscription state for WebSocket streaming clients.
# Tracks which connections are streaming clients, their project association,
# and filter preferences (level, environment) for targeted event delivery.
# Buffer fields (buffer, buffer_len, max_buffer) support backpressure;
# BufferMessage/DrainBuffers handlers queue and flush buffered messages (STREAM-05).

struct ConnectionState do
  # 1 = management stream, 2 = ingestion. An integer discriminator avoids
  # runtime string-representation ambiguity in service state.
  kind_code :: Int
  project_id :: String
  level_filter :: String
  # "" means no filter (accept all)
  env_filter :: String
  # "" means no filter (accept all)
  buffer :: List < String >
  # pending messages for slow client
  buffer_len :: Int
  max_buffer :: Int
  # drop oldest when exceeded (default 100)
end

struct StreamState do
  connections :: Map < Int, ConnectionState >
  # Keep the role in a scalar map as well as the connection record. The Mesh
  # runtime currently does not preserve the leading scalar discriminator when
  # a struct is stored as a map value, while the remaining fields are stable.
  roles :: Map < Int, Int >
  # conn_handle -> state
end

# --- Helper functions (outside service block per established pattern) ---

fn register_client(state :: StreamState,
conn :: Int,
kind_code :: Int,
project_id :: String,
level_filter :: String,
env_filter :: String) -> StreamState do
  let cs = ConnectionState {
    kind_code : kind_code,
    project_id : project_id,
    level_filter : level_filter,
    env_filter : env_filter,
    buffer : List.new(),
    buffer_len : 0,
    max_buffer : 100
  }
  let new_conns = Map.put(state.connections, conn, cs)
  let new_roles = Map.put(state.roles, conn, kind_code)
  StreamState { connections : new_conns, roles : new_roles }
end

fn remove_client(state :: StreamState, conn :: Int) -> StreamState do
  let new_conns = Map.delete(state.connections, conn)
  let new_roles = Map.delete(state.roles, conn)
  StreamState { connections : new_conns, roles : new_roles }
end

fn is_stream_client(state :: StreamState, conn :: Int) -> Bool do
  let has = Map.has_key(state.roles, conn)
  if has do
    Map.get(state.roles, conn) == 1
  else
    false
  end
end

fn is_ingest_client(state :: StreamState, conn :: Int) -> Bool do
  let has = Map.has_key(state.roles, conn)
  if has do
    Map.get(state.roles, conn) == 2
  else
    false
  end
end

fn get_project_id(state :: StreamState, conn :: Int) -> String do
  let has = Map.has_key(state.connections, conn)
  if has do
    let cs = Map.get(state.connections, conn)
    cs.project_id
  else
    ""
  end
end

# AND helper for filter matching -- avoids && codegen issue inside nested if blocks.

fn both_match(a :: Bool, b :: Bool) -> Bool do
  if a do
    b
  else
    false
  end
end

fn matches_filter(state :: StreamState, conn :: Int, level :: String, environment :: String) -> Bool do
  let has = Map.has_key(state.connections, conn)
  if has do
    let cs = Map.get(state.connections, conn)
    let level_ok = if cs.level_filter == "" do
      true
    else
      cs.level_filter == level
    end
    let env_ok = if cs.env_filter == "" do
      true
    else
      cs.env_filter == environment
    end
    both_match(level_ok, env_ok)
  else
    false
  end
end

# --- Buffer management helpers (STREAM-05 backpressure) ---
# Queue a message for a connection with drop-oldest when max_buffer exceeded.
# Same drop-oldest pattern as StorageWriter (writer.mpl).

fn buffer_message_for_conn(state :: StreamState, conn :: Int, msg :: String) -> StreamState do
  let cs = Map.get(state.connections, conn)
  let appended = List.append(cs.buffer, msg)
  let new_len = cs.buffer_len + 1
  if new_len > cs.max_buffer do
    println("[Mesher] websocket_slow_consumer conn=#{conn} project_id=#{cs.project_id} action=disconnect")
    remove_client(state, conn)
  else
    let new_cs = ConnectionState {
      kind_code : cs.kind_code,
      project_id : cs.project_id,
      level_filter : cs.level_filter,
      env_filter : cs.env_filter,
      buffer : appended,
      buffer_len : new_len,
      max_buffer : cs.max_buffer
    }
    let new_conns = Map.put(state.connections, conn, new_cs)
    StreamState { connections : new_conns, roles : state.roles }
  end
end

# --- Buffer drain helpers (STREAM-05 backpressure) ---
# Drain all connection buffers by iterating connections and sending buffered messages via Ws.send.
# On send failure (Ws.send returns -1), the connection is removed.
# Functions ordered bottom-up: leaf functions first, then callers (Mesh requires define-before-use).

fn send_buffer_loop(conn :: Int, buffer, i :: Int, total :: Int) -> Int do
  if i < total do
    let msg = List.get(buffer, i)
    let result = Ws.send(conn, msg)
    if result == -1 do
      -1
    else
      send_buffer_loop(conn, buffer, i + 1, total)
    end
  else
    0
  end
end

fn drain_single_connection(state :: StreamState, conn :: Int) -> StreamState do
  let cs = Map.get(state.connections, conn)
  if cs.buffer_len > 0 do
    let send_ok = send_buffer_loop(conn, cs.buffer, 0, cs.buffer_len)
    if send_ok == 0 do
      # All sends succeeded -- clear buffer
      let cleared_cs = ConnectionState {
        kind_code : cs.kind_code,
        project_id : cs.project_id,
        level_filter : cs.level_filter,
        env_filter : cs.env_filter,
        buffer : List.new(),
        buffer_len : 0,
        max_buffer : cs.max_buffer
      }
      let new_conns = Map.put(state.connections, conn, cleared_cs)
      StreamState { connections : new_conns, roles : state.roles }
    else
      # Ws.send returned -1 (connection error) -- remove this connection
      remove_client(state, conn)
    end
  else
    state
  end
end

fn drain_connections_loop(state :: StreamState, conns, i :: Int, total :: Int) -> StreamState do
  if i < total do
    let conn = List.get(conns, i)
    let new_state = drain_single_connection(state, conn)
    drain_connections_loop(new_state, conns, i + 1, total)
  else
    state
  end
end

fn drain_all_buffers(state :: StreamState) -> StreamState do
  let conns = Map.keys(state.connections)
  drain_connections_loop(state, conns, 0, List.length(conns))
end

fn project_matches(state :: StreamState,
conn :: Int,
cs :: ConnectionState,
project_id :: String) -> Bool do
  is_stream_client(state, conn) and cs.project_id == project_id
end

fn buffer_project_loop(state :: StreamState,
conns,
project_id :: String,
level :: String,
environment :: String,
msg :: String,
apply_filters :: Bool,
i :: Int,
total :: Int) -> StreamState do
  if i < total do
    let conn = List.get(conns, i)
    let cs = Map.get(state.connections, conn)
    let selected = if project_matches(state, conn, cs, project_id) do
      if apply_filters do
        matches_filter(state, conn, level, environment)
      else
        true
      end
    else
      false
    end
    let next_state = if selected do buffer_message_for_conn(state, conn, msg) else state end
    buffer_project_loop(next_state,
    conns,
    project_id,
    level,
    environment,
    msg,
    apply_filters,
    i + 1,
    total)
  else
    state
  end
end

fn buffer_project(state :: StreamState,
project_id :: String,
level :: String,
environment :: String,
msg :: String,
apply_filters :: Bool) -> StreamState do
  let conns = Map.keys(state.connections)
  buffer_project_loop(state,
  conns,
  project_id,
  level,
  environment,
  msg,
  apply_filters,
  0,
  List.length(conns))
end

# --- StreamManager Service ---
# Per-connection subscription state for WebSocket streaming clients.
# RegisterClient/RemoveClient are casts (fire-and-forget state updates).
# IsStreamClient/GetProjectId/MatchesFilter are calls (synchronous queries).

service StreamManager do
  fn init() -> StreamState do
    StreamState { connections : Map.new(), roles : Map.new() }
  end

  # Register a streaming client connection with project and filter preferences

  call RegisterClient(conn :: Int,
  kind_code :: Int,
  project_id :: String,
  level_filter :: String,
  env_filter :: String) :: Int do|state|
    (register_client(state, conn, kind_code, project_id, level_filter, env_filter), conn)
  end

  # Remove a connection (called on disconnect)

  cast RemoveClient(conn :: Int) do|state|
    remove_client(state, conn)
  end

  # Check if a connection is a streaming client (vs ingestion client)

  call IsStreamClient(conn :: Int) :: Bool do|state|
    (state, is_stream_client(state, conn))
  end


  call IsIngestClient(conn :: Int) :: Bool do|state|
    (state, is_ingest_client(state, conn))
  end

  # Get the project_id for a streaming client

  call GetProjectId(conn :: Int) :: String do|state|
    (state, get_project_id(state, conn))
  end

  call ConnectionCount() :: Int do|state|
    (state, List.length(Map.keys(state.connections)))
  end

  # Check if an event matches a connection's filters

  call MatchesFilter(conn :: Int, level :: String, environment :: String) :: Bool do|state|
    (state, matches_filter(state, conn, level, environment))
  end

  # Buffer a message for a slow client with drop-oldest backpressure (STREAM-05)

  cast BufferMessage(conn :: Int, msg :: String) do|state|
    if is_stream_client(state, conn) do
      buffer_message_for_conn(state, conn, msg)
    else
      state
    end
  end

  # Drain all connection buffers -- called by stream_drain_ticker periodically

  cast DrainBuffers() do|state|
    drain_all_buffers(state)
  end


  cast PublishEvent(project_id :: String,
  level :: String,
  environment :: String,
  msg :: String) do|state|
    buffer_project(state, project_id, level, environment, msg, true)
  end

  cast PublishProject(project_id :: String, msg :: String) do|state|
    buffer_project(state, project_id, "", "", msg, false)
  end
end
