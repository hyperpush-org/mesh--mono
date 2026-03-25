# User and authentication data types for Mesher monitoring platform.
# NO password_hash field in the User struct -- never expose to application code.
# User account -- password_hash lives only in the database.

pub struct User do
  table "users"
  id :: String
  email :: String
  display_name :: String
  created_at :: String
  has_many :org_memberships, OrgMembership
  has_many :sessions, Session
end deriving(Schema, Json, Row)

# Organization membership -- many-to-many with role (owner/admin/member).

pub struct OrgMembership do
  table "org_memberships"
  id :: String
  user_id :: String
  org_id :: String
  role :: String
  joined_at :: String
  belongs_to :user, User
  belongs_to :org, Organization
end deriving(Schema, Json, Row)

# Session token -- opaque 64-char hex, not JWT.

pub struct Session do
  table "sessions"
  primary_key :token
  token :: String
  user_id :: String
  created_at :: String
  expires_at :: String
  belongs_to :user, User
end deriving(Schema, Json, Row)
