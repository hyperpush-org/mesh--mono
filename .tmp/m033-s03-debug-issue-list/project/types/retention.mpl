# Retention and sampling settings -- virtual projection of the projects table.
# Used for settings-specific queries (get/update retention_days, sample_rate).

pub struct RetentionSettings do
  table "projects"
  retention_days :: String
  sample_rate :: String
end deriving(Schema, Json, Row)
