# Event data types for Mesher monitoring platform.
# Defines the core event model: severity levels, stack frames,
# exception info, breadcrumbs, and the event/payload structs.
# Fingerprint string type alias -- fingerprints are stable string identifiers
# computed from event payload fields for deduplication grouping.

pub type Fingerprint = String

# Severity levels following Sentry convention (5 levels).

pub type Severity do
  Fatal
  
  Error
  
  Warning
  
  Info
  
  Debug
end deriving(Json)

# Structured stack frame for fingerprinting and display.

pub struct StackFrame do
  filename :: String
  function_name :: String
  lineno :: Int
  colno :: Int
  context_line :: String
  in_app :: Bool
end deriving(Json)

# Exception metadata extracted from the error.

pub struct ExceptionInfo do
  type_name :: String
  value :: String
  module_name :: String
end deriving(Json)

# Breadcrumb trail entry -- data field is JSON string for flexible JSONB.

pub struct Breadcrumb do
  timestamp :: String
  category :: String
  message :: String
  level :: String
  data :: String
end deriving(Json)

# Database Row struct for events. ALL String fields because deriving(Row)
# maps through Map<String, String> text protocol. JSONB columns (exception,
# stacktrace, breadcrumbs, tags, extra, user_context) arrive as JSON strings
# that must be parsed with from_json() in a separate step.

pub struct Event do
  table "events"
  id :: String
  project_id :: String
  issue_id :: String
  level :: String
  message :: String
  fingerprint :: String
  exception :: String
  stacktrace :: String
  breadcrumbs :: String
  tags :: String
  extra :: String
  user_context :: String
  sdk_name :: String
  sdk_version :: String
  received_at :: String
  belongs_to :project, Project
  belongs_to :issue, Issue
end deriving(Schema, Json, Row)

# Typed payload struct for JSON deserialization of incoming events.
# Uses proper types for structured fields -- not a Row struct.

pub struct EventPayload do
  message :: String
  level :: String
  fingerprint :: String
  exception :: Option < ExceptionInfo >
  stacktrace :: Option < List < StackFrame > >
  breadcrumbs :: Option < List < Breadcrumb > >
  tags :: String
  extra :: String
  user_context :: String
  sdk_name :: Option < String >
  sdk_version :: Option < String >
end deriving(Json)
