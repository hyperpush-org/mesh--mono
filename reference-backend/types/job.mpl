# Shared job row and lifecycle types for the reference backend.
# JSONB payload is represented as a JSON string at the Mesh module boundary.

pub type JobStatus do
  Pending
  Processing
  Processed
  Failed
end deriving(Json)

pub struct Job do
  table "jobs"
  id :: String
  status :: String
  attempts :: String
  last_error :: String
  payload :: String
  created_at :: String
  updated_at :: String
  processed_at :: String
end deriving(Schema, Json, Row)
