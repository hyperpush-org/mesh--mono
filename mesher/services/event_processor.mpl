# EventProcessor owns the strict live event contract. It decodes and validates
# once, computes the canonical Mesh fingerprint, applies suppression, and only
# returns accepted after the event row has been synchronously persisted.

from Storage.Queries import upsert_issue, is_issue_discarded
from Storage.Writer import insert_event
from Ingestion.Validation import validate_event
from Ingestion.Fingerprint import compute_fingerprint
from Types.Event import EventPayload

pub struct ProcessOutcome do
  kind :: String
  issue_id :: String
  reason :: String
  level :: String
  environment :: String
end

# Keep the required wire contract in a small derived record. Mesh's current
# JSON decoder does not yet support optional nested fields reliably, so the
# optional fingerprint/context fields are normalized after this strict typed
# decode instead of making the live path permissive or crash-prone.
struct LiveEventCore do
  message :: String
  level :: String
end deriving(Json)

struct ProcessorState do
  pool :: PoolHandle
  processed_count :: Int
end

fn option_string(value :: Option < String >) -> String do
  case value do
    Some( inner) -> inner
    None -> ""
  end
end

fn optional_string(value :: String) -> Option < String > do
  if String.length(value) > 0 do Some(value) else None end
end

fn normalize_payload(event_json :: String, core :: LiveEventCore) -> EventPayload do
  EventPayload {
    message : core.message,
    level : core.level,
    fingerprint : Json.get(event_json, "fingerprint"),
    exception : None,
    stacktrace : None,
    breadcrumbs : None,
    tags : Json.get(event_json, "tags"),
    extra : Json.get(event_json, "extra"),
    user_context : Json.get(event_json, "user_context"),
    sdk_name : optional_string(Json.get(event_json, "sdk_name")),
    sdk_version : optional_string(Json.get(event_json, "sdk_version")),
    environment : optional_string(Json.get(event_json, "environment")),
    session_id : optional_string(Json.get(event_json, "session_id"))
  }
end

fn invalid_outcome(reason :: String) -> ProcessOutcome do
  ProcessOutcome { kind : "invalid", issue_id : "", reason : reason, level : "", environment : "" }
end

fn unavailable_outcome(reason :: String, payload :: EventPayload) -> ProcessOutcome do
  ProcessOutcome {
    kind : "unavailable",
    issue_id : "",
    reason : reason,
    level : payload.level,
    environment : option_string(payload.environment)
  }
end

fn persist_event(pool :: PoolHandle,
project_id :: String,
event_json :: String,
payload :: EventPayload,
fingerprint :: String,
issue_id :: String) -> ProcessOutcome do
  let store_result = insert_event(pool, project_id, issue_id, fingerprint, event_json)
  case store_result do
    Ok( _) -> ProcessOutcome {
      kind : "accepted",
      issue_id : issue_id,
      reason : "",
      level : payload.level,
      environment : option_string(payload.environment)
    }
    Err( e) -> unavailable_outcome(e, payload)
  end
end

fn upsert_valid_event(pool :: PoolHandle,
project_id :: String,
event_json :: String,
payload :: EventPayload,
fingerprint :: String) -> ProcessOutcome do
  let discarded_result = is_issue_discarded(pool, project_id, fingerprint)
  case discarded_result do
    Err( e) -> unavailable_outcome(e, payload)
    Ok( discarded) -> if discarded do
      ProcessOutcome {
        kind : "discarded",
        issue_id : "",
        reason : "suppressed fingerprint",
        level : payload.level,
        environment : option_string(payload.environment)
      }
    else
      let upsert_result = upsert_issue(pool, project_id, fingerprint, payload.message, payload.level)
      case upsert_result do
        Ok( issue_id) -> persist_event(pool, project_id, event_json, payload, fingerprint, issue_id)
        Err( e) -> unavailable_outcome(e, payload)
      end
    end
  end
end

fn process_parsed_event(pool :: PoolHandle,
project_id :: String,
event_json :: String,
payload :: EventPayload) -> ProcessOutcome do
  let validation = validate_event(payload)
  case validation do
    Err( reason) -> invalid_outcome(reason)
    Ok( _) -> do
      let fingerprint = compute_fingerprint(payload)
      upsert_valid_event(pool, project_id, event_json, payload, fingerprint)
    end
  end
end

fn route_event(pool :: PoolHandle, project_id :: String, event_json :: String) -> ProcessOutcome do
  let parsed = LiveEventCore.from_json(event_json)
  case parsed do
    Ok( core) -> process_parsed_event(pool, project_id, event_json, normalize_payload(event_json, core))
    Err( _) -> invalid_outcome("invalid event JSON or field types")
  end
end

fn next_processed_count(state :: ProcessorState, outcome :: ProcessOutcome) -> Int do
  if outcome.kind == "accepted" do
    state.processed_count + 1
  else
    state.processed_count
  end
end

service EventProcessor do
  fn init(pool :: PoolHandle) -> ProcessorState do
    ProcessorState { pool : pool, processed_count : 0 }
  end

  call ProcessEvent(project_id :: String, event_json :: String) do|state|
    let outcome = route_event(state.pool, project_id, event_json)
    let new_state = ProcessorState {
      pool : state.pool,
      processed_count : next_processed_count(state, outcome)
    }
    (new_state, outcome)
  end
end
