---
quick: 8
type: execute
wave: 1
depends_on: []
files_modified:
  - mesher/main.mpl
autonomous: true
requirements: []

must_haves:
  truths:
    - "mesher/main.mpl reads WS and HTTP ports via Env.get_int without a parse_port helper or intermediate string variables"
    - "The parse_port function is removed from main.mpl"
    - "Port logging still shows the actual numeric port value"
  artifacts:
    - path: "mesher/main.mpl"
      provides: "Simplified port configuration using Env.get_int"
      contains: "Env.get_int"
  key_links:
    - from: "mesher/main.mpl"
      to: "Env.get_int"
      via: "direct call — no intermediate string variable"
      pattern: "Env\\.get_int"
---

<objective>
Simplify port configuration in mesher/main.mpl by replacing the two-variable pattern (get string, parse to int) with a single `Env.get_int` call.

Purpose: `Env.get_int` was added in Phase 118 precisely for this use case — reading an integer env var with a fallback default. The `parse_port` helper and the intermediate `_str` variables in `start_services` are now dead weight.

Output: `mesher/main.mpl` with `parse_port` removed and `start_services` using `Env.get_int` directly for both ports.
</objective>

<execution_context>
@/Users/sn0w/.claude/get-shit-done/workflows/execute-plan.md
@/Users/sn0w/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@mesher/main.mpl
@tests/e2e/env_get_int.mpl
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace parse_port with Env.get_int in mesher/main.mpl</name>
  <files>mesher/main.mpl</files>
  <action>
In `mesher/main.mpl`, make two changes:

1. Delete the `parse_port` function (lines 22-28) entirely. It is no longer needed.

2. In `start_services`, replace the four port lines:

```
let ws_port_str = Env.get("MESHER_WS_PORT", "8081")
let ws_port = parse_port(ws_port_str, 8081)
let http_port_str = Env.get("MESHER_HTTP_PORT", "8080")
let http_port = parse_port(http_port_str, 8080)
```

with:

```
let ws_port = Env.get_int("MESHER_WS_PORT", 8081)
let http_port = Env.get_int("MESHER_HTTP_PORT", 8080)
```

3. Update the two `println` log lines that referenced the now-deleted `_str` variables:

```
println("[Mesher] WebSocket server starting on :#{ws_port_str}")
println("[Mesher] HTTP server starting on :#{http_port_str}")
```

Change to use the integer variables directly (string interpolation coerces Int to String automatically in Mesh):

```
println("[Mesher] WebSocket server starting on :#{ws_port}")
println("[Mesher] HTTP server starting on :#{http_port}")
```

No other changes. The `Ws.serve` and `HTTP.serve` calls already pass `ws_port` and `http_port` — those are unaffected.
  </action>
  <verify>
    <automated>cd /Users/sn0w/Documents/dev/snow && grep -n "parse_port\|ws_port_str\|http_port_str" mesher/main.mpl; echo "exit:$?"</automated>
    <manual>The grep above must return no matches (exit code 1 from grep = no matches found). Also confirm `Env.get_int` appears twice in the file.</manual>
  </verify>
  <done>
    - `parse_port` function does not appear anywhere in mesher/main.mpl
    - `ws_port_str` and `http_port_str` variables do not exist
    - `Env.get_int("MESHER_WS_PORT", 8081)` and `Env.get_int("MESHER_HTTP_PORT", 8080)` are present
    - `grep -c "Env.get_int" mesher/main.mpl` returns 2
  </done>
</task>

</tasks>

<verification>
After the task completes:

```bash
# Confirm no parse_port or stale _str vars remain
grep -n "parse_port\|ws_port_str\|http_port_str" /Users/sn0w/Documents/dev/snow/mesher/main.mpl

# Confirm Env.get_int appears exactly twice
grep -c "Env.get_int" /Users/sn0w/Documents/dev/snow/mesher/main.mpl
```

Expected: first grep exits 1 (no matches), second grep prints `2`.
</verification>

<success_criteria>
- mesher/main.mpl has no `parse_port` function and no intermediate `_str` port variables
- Both ports are read in a single expression: `let ws_port = Env.get_int("MESHER_WS_PORT", 8081)`
- Log lines still display the correct port numbers
- File compiles (meshc mesher/main.mpl succeeds if mesher binary is available, or visual inspection confirms valid Mesh syntax)
</success_criteria>

<output>
After completion, create `.planning/quick/8-improve-env-syntax-ergonomics-in-mesher-/8-SUMMARY.md` with:
- What was changed
- Lines removed (parse_port fn + 2 intermediate variables)
- The before/after pattern
- Commit hash
</output>
