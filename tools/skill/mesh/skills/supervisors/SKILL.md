---
name: mesh-supervisors
description: Mesh supervisor model: supervisor blocks, restart strategies (one_for_one, one_for_all), child specs, and fault tolerance.
---

## What are Supervisors

Rules:
1. Supervisors are specialized actors that monitor and restart child actors when they crash.
2. They implement the Erlang/OTP supervision tree pattern for fault tolerance.
3. Defined with the `supervisor` keyword — the runtime manages the lifecycle automatically.
4. Supervisors can themselves be supervised, forming a tree.

## Defining a Supervisor

Rules:
1. `supervisor Name do strategy: ... max_restarts: N max_seconds: N child ... end`
2. `strategy` defines how children are restarted when one crashes.
3. `max_restarts` and `max_seconds` define the restart budget — if exceeded, the supervisor itself crashes.
4. Each `child` block specifies one child process.
5. Spawn a supervisor with `spawn(SupervisorName)` — same as actors.

Code example (from tests/e2e/supervisor_basic.mpl):
```mesh
actor worker() do
  receive do
    msg -> println("worker got message")
  end
end

supervisor WorkerSup do
  strategy: one_for_one
  max_restarts: 3
  max_seconds: 5

  child w1 do
    start: fn -> spawn(worker) end
    restart: permanent
    shutdown: 5000
  end
end

fn main() do
  let sup = spawn(WorkerSup)
  println("supervisor started")
end
```

## Restart Strategies

Rules:
1. `one_for_one` — only the crashed child is restarted; other children continue unaffected.
2. `one_for_all` — when any child crashes, ALL children are stopped and restarted.
3. Use `one_for_one` when children are independent.
4. Use `one_for_all` when children depend on each other and must restart together.

Code example (from tests/e2e/supervisor_one_for_all.mpl):
```mesh
supervisor AllSup do
  strategy: one_for_all
  max_restarts: 2
  max_seconds: 3

  child w1 do
    start: fn -> spawn(worker1) end
    restart: permanent
    shutdown: 1000
  end

  child w2 do
    start: fn -> spawn(worker2) end
    restart: transient
    shutdown: 1000
  end
end
```

## Child Spec Fields

Rules:
1. `start: fn -> spawn(actor_name) end` — function called to start (or restart) the child.
2. `restart: permanent` — always restart on crash (normal termination too).
3. `restart: transient` — restart only on abnormal crash (not on clean exit).
4. `restart: temporary` — never restart; let it die.
5. `shutdown: N` — milliseconds to wait for graceful shutdown before forcing kill.

## Restart Limits

Rules:
1. `max_restarts: N` — maximum restarts allowed within `max_seconds`.
2. If a child crashes more than `max_restarts` times in `max_seconds`, the supervisor itself crashes.
3. This propagates up the supervision tree — parent supervisor handles the crashed child supervisor.
4. Choose conservative limits (e.g., 3 restarts in 5 seconds) for production systems.

Code example (from tests/e2e/supervisor_restart_limit.mpl):
```mesh
supervisor StrictSup do
  strategy: one_for_one
  max_restarts: 1
  max_seconds: 10

  child w1 do
    start: fn -> spawn(fragile_worker) end
    restart: permanent
    shutdown: 1000
  end
end
```

## Supervision Trees

Rules:
1. Nest supervisors by adding a child supervisor inside a parent supervisor.
2. The `start` function for a child supervisor is `fn -> spawn(ChildSupervisor) end`.
3. Trees should be designed top-down: root supervisor -> subsystem supervisors -> leaf actors.
4. A crash in a leaf actor propagates to its immediate supervisor only (not the whole tree).

## Typed Error Supervision

Rules:
1. Actors can carry typed error information for structured supervision decisions.
2. `supervisor_typed_error` pattern: actors return typed exit values on crash.
3. The supervisor can inspect the exit reason to decide restart vs escalate.

Code example (from tests/e2e/supervisor_typed_error.mpl):
```mesh
actor typed_worker() do
  receive do
    "crash" -> panic("deliberate crash")
    msg -> println("ok: #{msg}")
  end
end
```

## See Also

- `skills/actors` — actor primitives that supervisors manage
- `skills/error-handling` — Result and Option for non-fatal error handling
