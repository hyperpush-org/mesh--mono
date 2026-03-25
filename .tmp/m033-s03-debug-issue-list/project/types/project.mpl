# Project and organization data types for Mesher monitoring platform.
# Flat org -> project hierarchy (no teams layer).
# Organization -- top-level tenancy unit.

pub struct Organization do
  table "organizations"
  id :: String
  name :: String
  slug :: String
  created_at :: String
  has_many :projects, Project
  has_many :org_memberships, OrgMembership
end deriving(Schema, Json, Row)

# Project -- belongs to an organization, receives events.

pub struct Project do
  table "projects"
  id :: String
  org_id :: String
  name :: String
  platform :: String
  created_at :: String
  has_many :api_keys, ApiKey
  has_many :issues, Issue
  has_many :events, Event
  has_many :alert_rules, AlertRule
  has_many :alerts, Alert
  belongs_to :org, Organization
end deriving(Schema, Json, Row)

# API key -- multiple keys per project for rotation and environment separation.
# Key format: mshr_ prefix with hex-encoded random bytes.

pub struct ApiKey do
  table "api_keys"
  id :: String
  project_id :: String
  key_value :: String
  label :: String
  created_at :: String
  revoked_at :: Option < String >
  belongs_to :project, Project
end deriving(Schema, Json, Row)
