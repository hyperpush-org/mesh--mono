# Issue data types for Mesher monitoring platform.
# Issues are grouped errors identified by fingerprint.
# Issue lifecycle status -- state machine for issue resolution.

pub type IssueStatus do
  Unresolved

  Resolved

  Archived

  Discarded
end deriving(Json)

# Database Row struct for issues. Status stored as text in DB,
# parsed to IssueStatus via from_json when needed.

pub struct Issue do
  table "issues"
  id :: String
  project_id :: String
  fingerprint :: String
  title :: String
  level :: String
  status :: String
  event_count :: Int
  first_seen :: String
  last_seen :: String
  assigned_to :: String
  last_resolved_at :: String
  belongs_to :project, Project
  has_many :events, Event
end deriving(Schema, Json, Row)
