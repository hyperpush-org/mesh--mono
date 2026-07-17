# Unit tests for Ingestion.Fingerprint.compute_fingerprint.
# Pure function tests — no database or actor dependencies.
# Run with: meshc test mesher/tests/

from Ingestion.Fingerprint import compute_fingerprint
from Types.Event import EventPayload, ExceptionInfo, StackFrame

# Helper: build a minimal EventPayload with sensible defaults

fn make_payload(msg :: String, lvl :: String, fp :: String) -> EventPayload do
  EventPayload {
    message : msg,
    level : lvl,
    fingerprint : fp,
    exception : None,
    stacktrace : None,
    breadcrumbs : None,
    tags : "{}",
    extra : "{}",
    user_context : "{}",
    sdk_name : None,
    sdk_version : None,
    environment : None,
    session_id : None
  }
end

describe("compute_fingerprint — custom fingerprint override")do test("returns custom fingerprint when set")do let payload = make_payload("some error",
"error",
"my-custom-fp")
assert_eq(compute_fingerprint(payload), "my-custom-fp") end
test("non-empty fingerprint takes priority over exception")do let payload = EventPayload {
  message : "test",
  level : "error",
  fingerprint : "priority-fp",
  exception : Some(ExceptionInfo {
    type_name : "RuntimeError",
    value : "oops",
    module_name : ""
  }),
  stacktrace : None,
  breadcrumbs : None,
  tags : "{}",
  extra : "{}",
  user_context : "{}",
  sdk_name : None,
  sdk_version : None,
  environment : None,
  session_id : None
}
assert_eq(compute_fingerprint(payload), "priority-fp") end end

describe("compute_fingerprint — message fallback")do test("falls back to msg: prefix with normalized message")do let payload = make_payload("something 0x1234 failed",
"error",
"")
let fp = compute_fingerprint(payload)
assert_eq(fp, "msg:something 1234 failed") end
test("lowercases message in fallback")do let payload = make_payload("ERROR: Database Connection Failed",
"error",
"")
let fp = compute_fingerprint(payload)
assert_eq(fp, "msg:error: database connection failed") end end

describe("compute_fingerprint — exception fallback")do test("uses exception type and normalized value")do let payload = EventPayload {
  message : "fallback",
  level : "error",
  fingerprint : "",
  exception : Some(ExceptionInfo {
    type_name : "TypeError",
    value : "Cannot read 0xFF",
    module_name : ""
  }),
  stacktrace : None,
  breadcrumbs : None,
  tags : "{}",
  extra : "{}",
  user_context : "{}",
  sdk_name : None,
  sdk_version : None,
  environment : None,
  session_id : None
}
let fp = compute_fingerprint(payload)
assert_eq(fp, "TypeError:cannot read ff") end end
