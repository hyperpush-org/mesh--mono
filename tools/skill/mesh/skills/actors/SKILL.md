---
name: mesh-actors
description: Mesh actor model: actor blocks, spawn, send, receive, typed PIDs, actor loops, linking, and preemption.
---

## What are Actors

Rules:
1. Actors are lightweight concurrent processes — each has its own heap and mailbox.
2. Actors communicate only by message passing (no shared mutable state).
3. The Mesh runtime schedules actors cooperatively with preemption.
4. Actors are defined statically with `actor name(params) do ... end`.

## Defining an Actor

Rules:
1. `actor name(params) do receive do pattern -> action ... end end`
2. The `receive` block matches against incoming messages — patterns work like `case`.
3. Actors can accept initial state via parameters: `actor counter(n :: Int) do`.
4. An actor terminates when its `receive` block finishes without looping.
5. To loop (keep alive), have the receive handler call back into the actor or use tail-call recursion.

Code example (from tests/e2e/actors_basic.mpl):
```mesh
actor greeter() do
  receive do
    msg -> println("actor received")
  end
end
```

Code example with args (from tests/e2e/actors_with_args.mpl):
```mesh
actor counter(n :: Int) do
  receive do
    _ -> println("count: #{n}")
  end
end
```

## Spawning Actors

Rules:
1. `spawn(actor_name)` starts a new actor instance and returns its `Pid`.
2. `spawn(actor_name, args...)` passes initial arguments.
3. `Pid` is typed: `spawn(int_receiver)` returns `Pid<Int>` — message type enforced.
4. The spawned actor runs concurrently from this point.

Code example (from tests/e2e/actors_typed_pid.mpl):
```mesh
actor int_receiver() do
  receive do
    n -> println("typed pid ok")
  end
end

fn main() do
  let pid = spawn(int_receiver)  # Pid<Int> — only Int messages accepted
  send(pid, 42)
  println("typed pid sent")
end
```

## Sending and Receiving Messages

Rules:
1. `send(pid, message)` — delivers message to actor's mailbox asynchronously.
2. Messages are type-checked against the Pid's type parameter: `Pid<Int>` only accepts Int.
3. `receive do ... end` inside an actor processes the next message from the mailbox.
4. The actor blocks at `receive` until a matching message arrives.
5. `self()` inside an actor returns the actor's own Pid — used for self-messaging in loops.

Code example with actor loop (from tests/e2e/tce_actor_loop.mpl):
```mesh
actor countdown() do
  receive do
    n ->
      if n > 0 do
        println("#{n}")
        send(self(), n - 1)
      else
        println("done")
      end
  end
end

fn main() do
  let pid = spawn(countdown)
  send(pid, 5)
end
```

## Typed PIDs

Rules:
1. `Pid<T>` is the type of a process identifier that accepts messages of type T.
2. `spawn` infers the Pid type from the actor's receive pattern type.
3. `send(pid, value)` is type-checked: value must match T.
4. Typed PIDs make actor communication safe — wrong message types are compile errors.

## Linking Actors

Rules:
1. `link(pid)` establishes a bidirectional crash link between the current actor and `pid`.
2. If the linked actor crashes, the current actor also receives an exit signal.
3. Used to build supervision trees at a low level (prefer `supervisor` blocks for structured supervision).

Code example (from tests/e2e/actors_linking.mpl):
```mesh
# link(pid) -- links caller to pid; if pid crashes, caller also crashes
fn main() do
  let pid = spawn(worker)
  link(pid)
  send(pid, "hello")
end
```

## Actor Preemption

Rules:
1. The Mesh runtime can preempt long-running actors to prevent starvation.
2. Actors yield at receive points and at reduction checkpoints.
3. No manual yield needed in normal code — the runtime handles scheduling.

## Concurrent Messaging Pattern

Rules:
1. For request-reply, pass the sender's Pid as part of the message.
2. The receiving actor sends a response to the provided Pid.
3. For fire-and-forget, just call `send` without waiting for a response.

Code example (from tests/e2e/actors_basic.mpl):
```mesh
actor greeter() do
  receive do
    msg -> println("actor received")
  end
end

fn main() do
  let pid = spawn(greeter)
  send(pid, 1)
  println("main done")
end
```

## See Also

- `skills/supervisors` — supervisors manage and restart crashed actors
- `skills/types` — Pid<T> and typed message patterns
