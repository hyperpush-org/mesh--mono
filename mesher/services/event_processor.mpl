# EventProcessor service -- enriches events with fingerprint computation and
# issue upsert before routing to StorageWriter.
# Uses synchronous call handler so HTTP handlers get processing results back.
# Validation is done by the caller (HTTP handler) using Ingestion.Validation
# before calling ProcessEvent. This avoids cross-module from_json limitations.
#
# Event processing pipeline:
#   1. Extract fields and compute fingerprint via SQL (extract_event_fields)
#   2. Check if fingerprint is discarded (is_issue_discarded)
#   3. Upsert issue with regression detection (upsert_issue)
#   4. Build enriched entry and forward to StorageWriter

from Ingestion.Fingerprint import compute_fingerprint
from Storage.Queries import upsert_issue, is_issue_discarded, extract_event_fields
from Services.Writer import StorageWriter

struct ProcessorState do
  pool :: PoolHandle
  processed_count :: Int
end

# Build an enriched entry string for StorageWriter.
# Format: "issue_id|||fingerprint|||event_json"
# The StorageWriter splits this to pass issue_id and fingerprint as separate
# SQL parameters to insert_event (avoiding JSON field injection in Mesh).
fn build_enriched_entry(issue_id :: String, fingerprint :: String, event_json :: String) -> String do
  "#{issue_id}|||#{fingerprint}|||#{event_json}"
end

# Store enriched event via StorageWriter and return updated state.
fn store_enriched_event(state :: ProcessorState, writer_pid, event_json :: String, issue_id :: String, fingerprint :: String) -> (ProcessorState, String!String) do
  let enriched = build_enriched_entry(issue_id, fingerprint, event_json)
  StorageWriter.store(writer_pid, enriched)
  let new_state = ProcessorState { pool: state.pool, processed_count: state.processed_count + 1 }
  (new_state, Ok(issue_id))
end

# Upsert the issue and store the enriched event if successful.
fn do_upsert_and_store(state :: ProcessorState, project_id :: String, writer_pid, event_json :: String, fingerprint :: String, title :: String, level :: String) -> (ProcessorState, String!String) do
  let upsert_result = upsert_issue(state.pool, project_id, fingerprint, title, level)
  case upsert_result do
    Err(e) -> (state, Err(e))
    Ok(issue_id) -> store_enriched_event(state, writer_pid, event_json, issue_id, fingerprint)
  end
end

# Process event if not discarded; otherwise skip with Ok("discarded").
fn process_if_not_discarded(state :: ProcessorState, project_id :: String, writer_pid, event_json :: String, fingerprint :: String, title :: String, level :: String, discarded :: Bool) -> (ProcessorState, String!String) do
  if discarded do
    (state, Ok("discarded"))
  else
    do_upsert_and_store(state, project_id, writer_pid, event_json, fingerprint, title, level)
  end
end

# Check discard status and process accordingly.
fn process_with_fingerprint(state :: ProcessorState, project_id :: String, writer_pid, event_json :: String, fingerprint :: String, title :: String, level :: String) -> (ProcessorState, String!String) do
  let discarded_result = is_issue_discarded(state.pool, project_id, fingerprint)
  case discarded_result do
    Err(e) -> (state, Err(e))
    Ok(discarded) -> process_if_not_discarded(state, project_id, writer_pid, event_json, fingerprint, title, level, discarded)
  end
end

# Process extracted fields: get fingerprint, title, level from the map
# and continue to fingerprint processing pipeline.
# Extracted from case arm per Mesh single-expression case arm constraint.
fn process_extracted_fields(state :: ProcessorState, project_id :: String, writer_pid, event_json :: String, fields :: Map<String, String>) -> (ProcessorState, String!String) do
  let fingerprint = Map.get(fields, "fingerprint")
  let title = Map.get(fields, "title")
  let level = Map.get(fields, "level")
  process_with_fingerprint(state, project_id, writer_pid, event_json, fingerprint, title, level)
end

# Route an event through the enrichment pipeline.
# Extracts fields and computes fingerprint via SQL (avoids cross-module
# from_json limitation per decision [88-02]), checks discard status,
# upserts issue (with regression detection), and forwards to StorageWriter.
fn route_event(state :: ProcessorState, project_id :: String, writer_pid, event_json :: String) -> (ProcessorState, String!String) do
  let fields_result = extract_event_fields(state.pool, event_json)
  case fields_result do
    Err(e) -> (state, Err(e))
    Ok(fields) -> process_extracted_fields(state, project_id, writer_pid, event_json, fields)
  end
end

service EventProcessor do
  fn init(pool :: PoolHandle) -> ProcessorState do
    ProcessorState { pool: pool, processed_count: 0 }
  end

  # Synchronous event processing: computes fingerprint, upserts issue,
  # and routes enriched event to StorageWriter.
  # The caller is responsible for JSON parsing and field validation
  # (using Ingestion.Validation) before calling ProcessEvent.
  # Returns Ok(issue_id) on success, Ok("discarded") for suppressed events.
  call ProcessEvent(project_id :: String, writer_pid, event_json :: String) do |state|
    route_event(state, project_id, writer_pid, event_json)
  end
end
