# Alert data types for Mesher monitoring platform.
# Alert rules define conditions and actions for automated notifications.
# Alert rule -- condition_json and action_json are JSONB stored as String in Row struct.

pub struct AlertRule do
  table "alert_rules"
  id :: String
  project_id :: String
  name :: String
  condition_json :: String
  action_json :: String
  enabled :: Bool
  created_at :: String
  belongs_to :project, Project
  has_many :alerts, Alert
end deriving(Schema, Json, Row)

# Typed alert condition for JSON parsing -- not a Row struct.

pub struct AlertCondition do
  condition_type :: String
  threshold :: Int
  window_minutes :: Int
end deriving(Json)

# Fired alert record -- all-String fields per Row struct convention (decision [87-01]).
# JSONB condition_snapshot stored as String. Nullable timestamps COALESCE'd to empty string in queries.

pub struct Alert do
  table "alerts"
  id :: String
  rule_id :: String
  project_id :: String
  status :: String
  message :: String
  condition_snapshot :: String
  triggered_at :: String
  acknowledged_at :: String
  resolved_at :: String
  belongs_to :rule, AlertRule
  belongs_to :project, Project
end deriving(Schema, Json, Row)
