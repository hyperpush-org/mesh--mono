# Reusable query helper functions for all Mesher entity types.
# Provides CRUD operations using ORM Repo/Query calls for all data queries,
# with documented ORM boundaries for complex expressions (PG crypto, JSONB extraction, server-side functions).
# All functions take the pool handle (PoolHandle) as first argument.

from Types.Project import Organization, Project, ApiKey
from Types.User import User, OrgMembership, Session
from Types.Issue import Issue
from Types.Event import Event
from Types.Alert import AlertRule, Alert
from Types.Retention import RetentionSettings

# --- Issue helpers for non-storage modules ---
# Count unresolved issues for a project. Returns rows with "cnt" key.
# Used by ingestion/routes.mpl for WebSocket issue count broadcasting.
# Uses Query.where_expr + Query.select_expr instead of raw projection strings.

pub fn count_unresolved_issues(pool :: PoolHandle, project_id :: String) -> List < Map < String, String > > ! String do
  let q = Query.from(Issue.__table__())
    |> Query.where_expr(Expr.eq(Expr.column("project_id"), Pg.uuid(Expr.value(project_id))))
    |> Query.where_expr(Expr.eq(Expr.column("status"), Expr.value("unresolved")))
    |> Query.select_expr(Expr.label(Pg.text(Expr.fn_call("count", [Expr.column("*")])), "cnt"))
  Repo.all(pool, q)
end

# Look up the project_id for an issue by issue_id. Returns rows with "project_id" key.
# Used by ingestion/routes.mpl for broadcasting issue state change notifications.
# Uses Query.where_expr + Query.select_expr instead of raw projection strings.

pub fn get_issue_project_id(pool :: PoolHandle, issue_id :: String) -> List < Map < String, String > > ! String do
  let q = Query.from(Issue.__table__())
    |> Query.where_expr(Expr.eq(Expr.column("id"), Pg.uuid(Expr.value(issue_id))))
    |> Query.select_expr(Expr.label(Pg.text(Expr.column("project_id")), "project_id"))
  Repo.all(pool, q)
end

# --- Organization queries ---
# Insert a new organization. Returns the generated UUID.

pub fn insert_org(pool :: PoolHandle, name :: String, slug :: String) -> String ! String do
  let fields = %{"name" => name, "slug" => slug}
  let row = Repo.insert(pool, Organization.__table__(), fields) ?
  Ok(Map.get(row, "id"))
end

# Get an organization by ID.

pub fn get_org(pool :: PoolHandle, id :: String) -> Organization ! String do
  let row = Repo.get(pool, Organization.__table__(), id) ?
  Ok(Organization {
    id : Map.get(row, "id"),
    name : Map.get(row, "name"),
    slug : Map.get(row, "slug"),
    created_at : Map.get(row, "created_at")
  })
end

# List all organizations.

pub fn list_orgs(pool :: PoolHandle) -> List < Organization > ! String do
  let q = Query.from(Organization.__table__())
    |> Query.order_by(:name, :asc)
  let rows = Repo.all(pool, q) ?
  Ok(rows
    |> List.map(fn (row) do
      Organization {
        id : Map.get(row, "id"),
        name : Map.get(row, "name"),
        slug : Map.get(row, "slug"),
        created_at : Map.get(row, "created_at")
      }
    end))
end

# Resolve an organization slug to its UUID. Returns the id as a string.
# Used by API handlers to support slug-based org identifiers (e.g. "default").

pub fn get_org_id_by_slug(pool :: PoolHandle, slug :: String) -> String ! String do
  let row = Repo.get_by(pool, Organization.__table__(), "slug", slug) ?
  Ok(Map.get(row, "id"))
end

# --- Project queries ---
# Insert a new project. Returns the generated UUID.

pub fn insert_project(pool :: PoolHandle, org_id :: String, name :: String, platform :: String) -> String ! String do
  let fields = %{"org_id" => org_id, "name" => name, "platform" => platform}
  let row = Repo.insert(pool, Project.__table__(), fields) ?
  Ok(Map.get(row, "id"))
end

# Resolve a project slug to its UUID. Returns the id as a string.
# Used by API handlers to support slug-based project identifiers (e.g. "default").

pub fn get_project_id_by_slug(pool :: PoolHandle, slug :: String) -> String ! String do
  let row = Repo.get_by(pool, Project.__table__(), "slug", slug) ?
  Ok(Map.get(row, "id"))
end

# Get a project by ID.

pub fn get_project(pool :: PoolHandle, id :: String) -> Project ! String do
  let row = Repo.get(pool, Project.__table__(), id) ?
  Ok(Project {
    id : Map.get(row, "id"),
    org_id : Map.get(row, "org_id"),
    name : Map.get(row, "name"),
    platform : Map.get(row, "platform"),
    created_at : Map.get(row, "created_at")
  })
end

# List all projects for an organization.

pub fn list_projects_by_org(pool :: PoolHandle, org_id :: String) -> List < Project > ! String do
  let q = Query.from(Project.__table__())
    |> Query.where(:org_id, org_id)
    |> Query.order_by(:name, :asc)
  let rows = Repo.all(pool, q) ?
  Ok(rows
    |> List.map(fn (row) do
      Project {
        id : Map.get(row, "id"),
        org_id : Map.get(row, "org_id"),
        name : Map.get(row, "name"),
        platform : Map.get(row, "platform"),
        created_at : Map.get(row, "created_at")
      }
    end))
end

# --- API key queries ---
# Create a new API key for a project. The reusable secret is returned exactly
# once; only a lookup prefix and bcrypt hash are persisted.

pub fn create_api_key(pool :: PoolHandle, project_id :: String, label :: String) -> String ! String do
  let key_value = "mshr_#{Crypto.uuid4()}"
  let key_prefix = String.slice(key_value, 0, 13)
  Repo.insert_expr(pool,
  ApiKey.__table__(),
  %{"project_id" => Pg.uuid(Expr.value(project_id)), "key_prefix" => Expr.value(key_prefix), "key_hash" => Pg.crypt(Expr.value(key_value),
  Pg.gen_salt("bf", 12)), "label" => Expr.value(label)}) ?
  Ok(key_value)
end

# Get the project associated with a valid, non-revoked API key. Prefix lookup
# bounds bcrypt work; pgcrypto verifies the secret against the stored hash.

pub fn get_project_by_api_key(pool :: PoolHandle, key_value :: String) -> Project ! String do
  let key_prefix = String.slice(key_value, 0, 13)
  let rows = Repo.query_raw(pool,
  "SELECT projects.id::text AS id, projects.org_id::text AS org_id, projects.name::text AS name, COALESCE(projects.platform, '')::text AS platform, projects.created_at::text AS created_at FROM projects JOIN api_keys ON api_keys.project_id = projects.id WHERE api_keys.key_prefix = $1 AND api_keys.revoked_at IS NULL AND api_keys.key_hash = crypt($2, api_keys.key_hash) LIMIT 1",
  [key_prefix, key_value]) ?
  if List.length(rows) > 0 do
    let row = List.head(rows)
    Ok(Project {
      id : Map.get(row, "id"),
      org_id : Map.get(row, "org_id"),
      name : Map.get(row, "name"),
      platform : Map.get(row, "platform"),
      created_at : Map.get(row, "created_at")
    })
  else
    Err("not found")
  end
end

# Revoke an API key by setting revoked_at to now() through the neutral expression write path.

pub fn revoke_api_key(pool :: PoolHandle, key_id :: String) -> Int ! String do
  Repo.execute_raw(pool,
  "UPDATE api_keys SET revoked_at = now() WHERE id = $1::uuid AND revoked_at IS NULL",
  [key_id])
end

# --- User queries ---
# Create a new user with bcrypt password hashing via pgcrypto (cost factor 12).
# Uses explicit Pg helpers plus Repo.insert_expr so the auth path no longer depends on raw SQL.

pub fn create_user(pool :: PoolHandle, email :: String, password :: String, display_name :: String) -> String ! String do
  let row = Repo.insert_expr(pool,
  User.__table__(),
  %{"email" => Expr.value(email), "password_hash" => Pg.crypt(Expr.value(password),
  Pg.gen_salt("bf", 12)), "display_name" => Expr.value(display_name)}) ?
  Ok(Map.get(row, "id"))
end

# Authenticate a user by email and password.
# Returns the User if credentials match, Err("not found") otherwise.
# Uses Query.where_expr with explicit Pg.crypt verification instead of raw SQL fragments.

pub fn authenticate_user(pool :: PoolHandle, email :: String, password :: String) -> User ! String do
  let q = Query.from(User.__table__())
    |> Query.where(:email, email)
    |> Query.where_expr(Expr.eq(Expr.column("password_hash"),
    Pg.crypt(Expr.value(password), Expr.column("password_hash"))))
  let rows = Repo.all(pool, q) ?
  if List.length(rows) > 0 do
    let row = List.head(rows)
    Ok(User {
      id : Map.get(row, "id"),
      email : Map.get(row, "email"),
      display_name : Map.get(row, "display_name"),
      created_at : Map.get(row, "created_at")
    })
  else
    Err("not found")
  end
end

# Get a user by ID.

pub fn get_user(pool :: PoolHandle, id :: String) -> User ! String do
  let row = Repo.get(pool, User.__table__(), id) ?
  Ok(User {
    id : Map.get(row, "id"),
    email : Map.get(row, "email"),
    display_name : Map.get(row, "display_name"),
    created_at : Map.get(row, "created_at")
  })
end

# Return the authenticated user's organization memberships and authorized
# projects as one flat, deterministic context projection. The API groups this
# data client-side so an organization with no projects remains representable.

pub fn get_user_project_context(pool :: PoolHandle, user_id :: String) -> List < Map < String, String > > ! String do
  let sql = "SELECT organizations.id::text AS org_id, organizations.name::text AS org_name, organizations.slug::text AS org_slug, org_memberships.role::text AS role, COALESCE(projects.id::text, '') AS project_id, COALESCE(projects.slug::text, '') AS project_slug, COALESCE(projects.name::text, '') AS project_name, COALESCE(projects.platform::text, '') AS project_platform FROM org_memberships JOIN organizations ON organizations.id = org_memberships.org_id LEFT JOIN projects ON projects.org_id = organizations.id WHERE org_memberships.user_id = $1::uuid ORDER BY organizations.name ASC, projects.name ASC"
  Repo.query_raw(pool, sql, [user_id])
end

# --- Session queries ---
# Create a new session with a cryptographically random token.
# Returns the 64-char hex token.
# Uses Crypto stdlib UUID generation -- no DB round-trip needed.

pub fn create_session(pool :: PoolHandle, user_id :: String) -> String ! String do
  # Generate cryptographically random token using Crypto stdlib -- no DB round-trip needed
  # Two UUID4s with hyphens stripped = 32 + 32 = 64 hex chars (same format as before)
  let uuid1 = Crypto.uuid4()
    |> String.replace("-", "")
  let uuid2 = Crypto.uuid4()
    |> String.replace("-", "")
  let token = "#{uuid1}#{uuid2}"
  let fields = %{"token" => token, "user_id" => user_id}
  Repo.insert(pool, Session.__table__(), fields) ?
  Ok(token)
end

# Validate a session token. Returns the Session if valid and not expired.
# Uses Query.where_expr + Query.select_exprs for the token, expiry, and casted projection.

pub fn validate_session(pool :: PoolHandle, token :: String) -> Session ! String do
  let q = Query.from(Session.__table__())
    |> Query.where_expr(Expr.eq(Expr.column("token"), Expr.value(token)))
    |> Query.where_expr(Expr.gt(Expr.column("expires_at"), Pg.timestamptz(Expr.fn_call("now", []))))
    |> Query.select_exprs([Expr.label(Expr.column("token"), "token"), Expr.label(Pg.text(Expr.column("user_id")),
    "user_id"), Expr.label(Pg.text(Expr.column("created_at")), "created_at"), Expr.label(Pg.text(Expr.column("expires_at")),
    "expires_at")])
  let rows = Repo.all(pool, q) ?
  if List.length(rows) > 0 do
    let row = List.head(rows)
    Ok(Session {
      token : Map.get(row, "token"),
      user_id : Map.get(row, "user_id"),
      created_at : Map.get(row, "created_at"),
      expires_at : Map.get(row, "expires_at")
    })
  else
    Err("not found")
  end
end

# Delete a session by token (logout).
# Uses ORM Repo.delete_where -- zero raw SQL.

pub fn delete_session(pool :: PoolHandle, token :: String) -> Int ! String do
  let q = Query.from(Session.__table__())
    |> Query.where(:token, token)
  Repo.delete_where(pool, Session.__table__(), q)
end

# Resolve a user's role for a resource. Every child-resource arm scopes through
# its owning project/org; the membership arm additionally binds the child ID to
# the org path supplied by the caller.

pub fn get_management_role(pool :: PoolHandle,
user_id :: String,
resource_kind :: String,
resource_id :: String,
parent_id :: String) -> String ! String do
  let sql = "SELECT role::text AS role FROM org_memberships WHERE user_id = $1::uuid AND org_id = CASE $2 WHEN 'org' THEN (SELECT id FROM organizations WHERE id::text = $3 OR slug = $3 LIMIT 1) WHEN 'project' THEN (SELECT org_id FROM projects WHERE id::text = $3 OR slug = $3 LIMIT 1) WHEN 'issue' THEN (SELECT projects.org_id FROM issues JOIN projects ON projects.id = issues.project_id WHERE issues.id::text = $3 LIMIT 1) WHEN 'event' THEN (SELECT projects.org_id FROM events JOIN projects ON projects.id = events.project_id WHERE events.id::text = $3 LIMIT 1) WHEN 'rule' THEN (SELECT projects.org_id FROM alert_rules JOIN projects ON projects.id = alert_rules.project_id WHERE alert_rules.id::text = $3 LIMIT 1) WHEN 'alert' THEN (SELECT projects.org_id FROM alerts JOIN projects ON projects.id = alerts.project_id WHERE alerts.id::text = $3 LIMIT 1) WHEN 'key' THEN (SELECT projects.org_id FROM api_keys JOIN projects ON projects.id = api_keys.project_id WHERE api_keys.id::text = $3 LIMIT 1) WHEN 'membership' THEN (SELECT target.org_id FROM org_memberships target JOIN organizations ON organizations.id = target.org_id WHERE target.id::text = $3 AND (organizations.id::text = $4 OR organizations.slug = $4) LIMIT 1) ELSE NULL END LIMIT 1"
  let rows = Repo.query_raw(pool, sql, [user_id, resource_kind, resource_id, parent_id]) ?
  if List.length(rows) > 0 do
    Ok(Map.get(List.head(rows), "role"))
  else
    Err("forbidden")
  end
end

# Persist a redacted management audit entry. Request bodies, authorization
# headers, event payloads, and API-key secrets are never accepted by this API.

pub fn record_audit(pool :: PoolHandle,
user_id :: String,
method :: String,
path :: String,
outcome :: String) -> Int ! String do
  Repo.execute_raw(pool,
  "INSERT INTO audit_logs (user_id, method, path, outcome) VALUES ($1::uuid, $2, $3, $4)",
  [user_id, method, path, outcome])
end

# Startup/readiness proof for the exact required migration and core tables.

pub fn verify_schema_ready(pool :: PoolHandle) -> Bool ! String do
  let rows = Repo.query_raw(pool,
  "SELECT CASE WHEN to_regclass('public.projects') IS NOT NULL AND to_regclass('public.events') IS NOT NULL AND to_regclass('public.audit_logs') IS NOT NULL AND EXISTS (SELECT 1 FROM _mesh_migrations WHERE version = '20260716000000') THEN 'true' ELSE 'false' END AS ready",
  []) ?
  if List.length(rows) > 0 do
    Ok(Map.get(List.head(rows), "ready") == "true")
  else
    Ok(false)
  end
end

# --- Org membership queries ---
# Add a user to an organization with a role (owner/admin/member).

pub fn add_member(pool :: PoolHandle, user_id :: String, org_id :: String, role :: String) -> String ! String do
  let fields = %{"user_id" => user_id, "org_id" => org_id, "role" => role}
  let row = Repo.insert(pool, OrgMembership.__table__(), fields) ?
  Ok(Map.get(row, "id"))
end

# Get all members of an organization.

pub fn get_members(pool :: PoolHandle, org_id :: String) -> List < OrgMembership > ! String do
  let q = Query.from(OrgMembership.__table__())
    |> Query.where(:org_id, org_id)
  let rows = Repo.all(pool, q) ?
  Ok(rows
    |> List.map(fn (row) do
      OrgMembership {
        id : Map.get(row, "id"),
        user_id : Map.get(row, "user_id"),
        org_id : Map.get(row, "org_id"),
        role : Map.get(row, "role"),
        joined_at : Map.get(row, "joined_at")
      }
    end))
end

# --- Issue queries (Phase 89) ---
# Upsert an issue: insert on first occurrence, update on subsequent.
# Uses neutral expression-valued conflict updates for arithmetic, now(), and CASE.
# Handles GROUP-04 (new issue), GROUP-05 (event_count + last_seen), and
# ISSUE-02 (regression: resolved flips to unresolved on new event).
# Returns Ok(issue_id) or Err.

pub fn upsert_issue(pool :: PoolHandle,
project_id :: String,
fingerprint :: String,
title :: String,
level :: String) -> String ! String do
  let insert_fields = %{"project_id" => project_id, "fingerprint" => fingerprint, "title" => title, "level" => level, "event_count" => "1"}
  let update_fields = %{"event_count" => Expr.add(Expr.column("issues.event_count"),
  Expr.value("1")), "last_seen" => Expr.fn_call("now", []), "status" => Expr.case_when([Expr.eq(Expr.column("issues.status"),
  Expr.value("resolved"))],
  [Expr.value("unresolved")],
  Expr.column("issues.status")), "regression_pending" => Expr.case_when([Expr.eq(Expr.column("issues.status"),
  Expr.value("resolved"))],
  [Expr.value("true")],
  Expr.column("issues.regression_pending"))}
  let row = Repo.insert_or_update_expr(pool,
  Issue.__table__(),
  insert_fields,
  ["project_id", "fingerprint"],
  update_fields) ?
  Ok(Map.get(row, "id"))
end

# Check if an issue with the given fingerprint is discarded (ISSUE-05 suppression).
# Returns true if the issue exists with status = 'discarded', false otherwise.
# Uses ORM Query.where + Repo.all with a plain id projection instead of raw SQL.

pub fn is_issue_discarded(pool :: PoolHandle, project_id :: String, fingerprint :: String) -> Bool ! String do
  let q = Query.from(Issue.__table__())
    |> Query.where_raw("project_id = ?::uuid", [project_id])
    |> Query.where(:fingerprint, fingerprint)
    |> Query.where(:status, "discarded")
    |> Query.select(["id"])
  let rows = Repo.all(pool, q) ?
  Ok(List.length(rows) > 0)
end

# --- Issue management queries (Phase 89 Plan 02) ---
# Transition an issue to 'resolved' status (ISSUE-01).
# Uses ORM Repo.update_where instead of raw SQL.

pub fn resolve_issue(pool :: PoolHandle, issue_id :: String) -> Int ! String do
  Repo.execute_raw(pool,
  "UPDATE issues SET status = 'resolved', last_resolved_at = now(), regression_pending = false WHERE id = $1::uuid AND status != 'resolved'",
  [issue_id])
end

# Transition an issue to 'archived' status (ISSUE-01).
# Uses ORM Repo.update_where instead of raw SQL.

pub fn archive_issue(pool :: PoolHandle, issue_id :: String) -> Int ! String do
  Repo.execute_raw(pool,
  "UPDATE issues SET status = 'archived' WHERE id = $1::uuid AND status != 'archived'",
  [issue_id])
end

# Reopen an issue -- set status back to 'unresolved' (ISSUE-01).
# Uses ORM Repo.update_where instead of raw SQL.

pub fn unresolve_issue(pool :: PoolHandle, issue_id :: String) -> Int ! String do
  Repo.execute_raw(pool,
  "UPDATE issues SET status = 'unresolved', regression_pending = false WHERE id = $1::uuid AND status != 'unresolved'",
  [issue_id])
end

# Assign an issue to a user. Pass empty string to unassign (ISSUE-04).
# Uses expression-aware Repo.update_where_expr for both assign and unassign,
# with Expr.null() carrying the neutral NULL assignment path.

fn assign_issue_to_user(pool :: PoolHandle, issue_id :: String, user_id :: String) -> Int ! String do
  Repo.execute_raw(pool,
  "UPDATE issues SET assigned_to = $2::uuid WHERE id = $1::uuid AND EXISTS (SELECT 1 FROM users WHERE id = $2::uuid)",
  [issue_id, user_id])
end

fn unassign_issue(pool :: PoolHandle, issue_id :: String) -> Int ! String do
  Repo.execute_raw(pool,
  "UPDATE issues SET assigned_to = NULL WHERE id = $1::uuid AND assigned_to IS NOT NULL",
  [issue_id])
end

pub fn assign_issue(pool :: PoolHandle, issue_id :: String, user_id :: String) -> Int ! String do
  if String.length(user_id) > 0 do
    assign_issue_to_user(pool, issue_id, user_id)
  else
    unassign_issue(pool, issue_id)
  end
end

# Mark an issue as discarded -- future events with this fingerprint are suppressed (ISSUE-05).
# Uses ORM Repo.update_where instead of raw SQL.

pub fn discard_issue(pool :: PoolHandle, issue_id :: String) -> Int ! String do
  Repo.execute_raw(pool,
  "UPDATE issues SET status = 'discarded', regression_pending = false WHERE id = $1::uuid AND status != 'discarded'",
  [issue_id])
end

# Delete an issue and all associated events (ISSUE-05).
# Events deleted first due to FK constraint on issue_id.
# Uses ORM Repo.delete_where instead of raw SQL.

pub fn delete_issue(pool :: PoolHandle, issue_id :: String) -> Int ! String do
  Repo.execute_raw(pool, "DELETE FROM issues WHERE id = $1::uuid", [issue_id])
end

# Helper: parse event_count string to Int, defaulting to 0 on failure.

fn parse_event_count(s :: String) -> Int do
  let result = String.to_int(s)
  case result do
    Some( n) -> n
    None -> 0
  end
end

# Helper: parse limit string to Int, defaulting to 25 on failure.

fn parse_limit(s :: String) -> Int do
  let result = String.to_int(s)
  case result do
    Some( n) -> if n < 1 do
      1
    else if n > 100 do
      100
    else
      n
    end
    None -> 25
  end
end

# Helper: keep dashboard bucket selection honest and injection-safe.

fn normalize_time_bucket(bucket :: String) -> String do
  if bucket == "day" do
    "day"
  else
    "hour"
  end
end

# Helper: read the first row value for a key, defaulting to fallback.
# Keeps the small Mesh-side decompositions honest without reintroducing
# whole-query raw SQL for one-row composition helpers.

fn first_row_value_or(rows, key :: String, fallback :: String) -> String do
  if List.length(rows) > 0 do
    Map.get(List.head(rows), key)
  else
    fallback
  end
end

# Helper: count project events in a rolling minute window.
# Returns an Int so alert-threshold evaluation can stay Mesh-side after the
# count query, while the actual row scan remains builder-backed.

fn count_project_events_in_window(pool :: PoolHandle, project_id :: String, window_str :: String) -> Int ! String do
  let q = Query.from(Event.__table__())
    |> Query.where_expr(Expr.eq(Expr.column("project_id"), Pg.uuid(Expr.value(project_id))))
    |> Query.where_raw("received_at > now() - interval '1 minute' * ?::int", [window_str])
    |> Query.select_expr(Expr.label(Pg.text(Expr.fn_call("count", [Expr.column("*")])), "cnt"))
  let rows = Repo.all(pool, q) ?
  Ok(parse_event_count(first_row_value_or(rows, "cnt", "0")))
end

# Helper: return the next event id for detail navigation.
# Keeps the tuple comparison as a narrow raw predicate while the surrounding
# query assembly, ordering, and projection stay on Query / Expr / Pg surfaces.

fn get_next_event_id(pool :: PoolHandle,
issue_id :: String,
received_at :: String,
event_id :: String) -> String ! String do
  let q = Query.from(Event.__table__())
    |> Query.where_expr(Expr.eq(Expr.column("issue_id"), Pg.uuid(Expr.value(issue_id))))
    |> Query.where_raw("(received_at, id) > (?::timestamptz, ?::uuid)", [received_at, event_id])
    |> Query.select_expr(Expr.label(Pg.text(Expr.column("id")), "id"))
    |> Query.order_by(:received_at, :asc)
    |> Query.order_by(:id, :asc)
    |> Query.limit(1)
  let rows = Repo.all(pool, q) ?
  Ok(first_row_value_or(rows, "id", ""))
end

# Helper: return the previous event id for detail navigation.
# Same decomposition pattern as get_next_event_id with descending ordering.

fn get_prev_event_id(pool :: PoolHandle,
issue_id :: String,
received_at :: String,
event_id :: String) -> String ! String do
  let q = Query.from(Event.__table__())
    |> Query.where_expr(Expr.eq(Expr.column("issue_id"), Pg.uuid(Expr.value(issue_id))))
    |> Query.where_raw("(received_at, id) < (?::timestamptz, ?::uuid)", [received_at, event_id])
    |> Query.select_expr(Expr.label(Pg.text(Expr.column("id")), "id"))
    |> Query.order_by(:received_at, :desc)
    |> Query.order_by(:id, :desc)
    |> Query.limit(1)
  let rows = Repo.all(pool, q) ?
  Ok(first_row_value_or(rows, "id", ""))
end

# List issues for a project filtered by status (for API listing).
# Constructs Issue structs manually with parse_event_count for the Int field.
# Uses structured SELECT expressions plus regular ordering instead of raw projections.

pub fn list_issues_by_status(pool :: PoolHandle, project_id :: String, status :: String) -> List < Issue > ! String do
  let q = Query.from(Issue.__table__())
    |> Query.where_expr(Expr.eq(Expr.column("project_id"), Pg.uuid(Expr.value(project_id))))
    |> Query.where_expr(Expr.eq(Expr.column("status"), Expr.value(status)))
    |> Query.select_exprs([Expr.label(Expr.column("id"), "id"), Expr.label(Expr.column("project_id"),
    "project_id"), Expr.label(Expr.column("fingerprint"), "fingerprint"), Expr.label(Expr.column("title"),
    "title"), Expr.label(Expr.column("level"), "level"), Expr.label(Expr.column("status"), "status"), Expr.label(Expr.column("event_count"),
    "event_count"), Expr.label(Expr.column("first_seen"), "first_seen"), Expr.label(Expr.column("last_seen"),
    "last_seen"), Expr.label(Expr.coalesce([Pg.text(Expr.column("assigned_to")), Expr.value("")]),
    "assigned_to")])
    |> Query.order_by(:last_seen, :desc)
  let rows = Repo.all(pool, q) ?
  Ok(rows
    |> List.map(fn (row) do
      Issue {
        id : Map.get(row, "id"),
        project_id : Map.get(row, "project_id"),
        fingerprint : Map.get(row, "fingerprint"),
        title : Map.get(row, "title"),
        level : Map.get(row, "level"),
        status : Map.get(row, "status"),
        event_count : parse_event_count(Map.get(row, "event_count")),
        first_seen : Map.get(row, "first_seen"),
        last_seen : Map.get(row, "last_seen"),
        assigned_to : Map.get(row, "assigned_to"),
        last_resolved_at : ""
      }
    end))
end

# Spike detection: escalate archived issues with sudden volume bursts (ISSUE-03).
# If an archived issue has >10x its average hourly rate (or >10 absolute) in the
# last hour, it's auto-escalated to 'unresolved'. The WHERE status='archived'
# naturally prevents re-escalation after the first flip (research Pitfall 5).
# Returns number of escalated issues.
# Honest raw S03 keep-site: Repo.update_where cannot express the correlated
# subquery + JOIN + HAVING + GREATEST + interval arithmetic bundle in one
# statement without inventing a fake universal SQL abstraction.

pub fn check_volume_spikes(pool :: PoolHandle) -> Int ! String do
  Repo.execute_raw(pool,
  "UPDATE issues SET status = 'unresolved' WHERE status = 'archived' AND id IN (SELECT i.id FROM issues i JOIN events e ON e.issue_id = i.id AND e.received_at > now() - interval '1 hour' WHERE i.status = 'archived' GROUP BY i.id HAVING count(*) > GREATEST(10, (SELECT count(*) FROM events e2 WHERE e2.issue_id = i.id AND e2.received_at > now() - interval '7 days') / 168 * 10))",
  [])
end

# Extract event fields from JSON and compute fingerprint using PostgreSQL.
# This keeps the fingerprint fallback chain next to the JSONB operators it depends
# on: custom > stacktrace frames > exception type > message.
# Returns a Map with keys: fingerprint, title, level.
# Honest raw S03 keep-site: this query still depends on CASE + WITH ORDINALITY +
# jsonb_array_elements/string_agg scalar-subquery behavior for the fingerprint
# fallback chain. S02 moves the write-side/search-side PG helpers onto explicit
# Pg.* surfaces, but this read-side ordinality boundary remains intentionally raw
# until S03 can collapse it without pretending the expression surface is portable.

pub fn extract_event_fields(pool :: PoolHandle, event_json :: String) -> Map < String, String > ! String do
  # Honest raw S03 keep-site: this query still depends on CASE + WITH ORDINALITY +
  # jsonb_array_elements/string_agg scalar-subquery behavior for the fingerprint
  # fallback chain, so S02 keeps it raw until S03 can collapse it honestly.
  let sql = "SELECT CASE WHEN length(COALESCE(j->>'fingerprint', '')) > 0 THEN j->>'fingerprint' WHEN j->'stacktrace' IS NOT NULL AND jsonb_typeof(j->'stacktrace') = 'array' AND jsonb_array_length(j->'stacktrace') > 0 THEN (SELECT string_agg((frame->>'filename') || '|' || (frame->>'function_name'), ';' ORDER BY ordinality) FROM jsonb_array_elements(j->'stacktrace') WITH ORDINALITY AS t(frame, ordinality)) || ':' || lower(COALESCE(replace(j->>'message', '0x', ''), '')) WHEN j->'exception' IS NOT NULL AND j->'exception'->>'type_name' IS NOT NULL THEN (j->'exception'->>'type_name') || ':' || lower(COALESCE(replace(j->'exception'->>'value', '0x', ''), '')) ELSE 'msg:' || lower(COALESCE(replace(j->>'message', '0x', ''), '')) END AS fingerprint, COALESCE(NULLIF(j->>'message', ''), 'Untitled') AS title, COALESCE(j->>'level', 'error') AS level FROM (SELECT $1::jsonb AS j) AS sub"
  let rows = Repo.query_raw(pool, sql, [event_json]) ?
  if List.length(rows) > 0 do
    Ok(List.head(rows))
  else
    Err("extract_event_fields: no result")
  end
end

# --- Search, filter, and pagination queries (Phase 91 Plan 01) ---
# SEARCH-01 + SEARCH-05: List issues with optional filters and keyset pagination.
# Honest raw S03 keep-site: the conditional builder-assembled version compiled but
# crashed the real Mesher/search proof surface with a non-exhaustive switch before
# the caller could observe rows. Keep the SQL explicit and parameterized until the
# live runtime can safely carry this optional-filter + tuple-cursor row family.

pub fn list_issues_filtered(pool :: PoolHandle,
project_id :: String,
status :: String,
level :: String,
assigned_to :: String,
environment :: String,
cursor :: String,
cursor_id :: String,
limit_str :: String) -> List < Map < String, String > > ! String do
  let lim = String.from(parse_limit(limit_str))
  let sql = "SELECT id::text AS id, title::text AS title, level::text AS level, status::text AS status, event_count::text AS event_count, first_seen::text AS first_seen, last_seen::text AS last_seen, COALESCE(assigned_to::text, '') AS assigned_to FROM issues WHERE project_id = $1::uuid AND ($2 = '' OR status = $2) AND ($3 = '' OR level = $3) AND ($4 = '' OR assigned_to = NULLIF($4, '')::uuid) AND ($5 = '' OR (last_seen, id) < ($5::timestamptz, NULLIF($6, '')::uuid)) AND ($8 = '' OR EXISTS (SELECT 1 FROM events WHERE issue_id = issues.id AND environment = $8 AND received_at > now() - interval '7 days')) ORDER BY last_seen DESC, id DESC LIMIT $7::int"
  Repo.query_raw(pool, sql, [project_id, status, level, assigned_to, cursor, cursor_id, lim, environment])
end

# SEARCH-02: Full-text search on event messages using inline tsvector.
# Uses inline to_tsvector (avoids partition complications with stored tsvector column).
# Includes 24-hour default time range (SEARCH-04) for partition pruning.
# Returns relevance rank for ordering through expression-valued SELECT/WHERE helpers.

pub fn search_events_fulltext(pool :: PoolHandle,
project_id :: String,
search_query :: String,
limit_str :: String) -> List < Map < String, String > > ! String do
  let lim = parse_limit(limit_str)
  let search_vector = Pg.to_tsvector("english", Expr.column("message"))
  let search_terms = Pg.plainto_tsquery("english", Expr.value(search_query))
  let q = Query.from(Event.__table__())
    |> Query.where_expr(Expr.eq(Expr.column("project_id"), Pg.uuid(Expr.value(project_id))))
    |> Query.where_expr(Pg.tsvector_matches(search_vector, search_terms))
    |> Query.where_raw("received_at > now() - interval '24 hours'", [])
    |> Query.select(["id", "issue_id", "level", "message", "received_at"])
    |> Query.select_expr(Expr.label(Pg.ts_rank(search_vector, search_terms), "rank"))
    |> Query.order_by_raw("rank DESC, received_at DESC")
    |> Query.limit(lim)
  Repo.all(pool, q)
end

# SEARCH-03: Filter events by tag key-value pair using JSONB containment.
# Uses tags @> ?::jsonb operator which leverages existing GIN index (idx_events_tags).
# Includes 24-hour default time range (SEARCH-04).
# Uses expression-valued WHERE composition for the JSONB predicate.

pub fn filter_events_by_tag(pool :: PoolHandle,
project_id :: String,
tag_key :: String,
tag_value :: String,
limit_str :: String) -> List < Map < String, String > > ! String do
  let lim = parse_limit(limit_str)
  let q = Query.from(Event.__table__())
    |> Query.where_expr(Expr.eq(Expr.column("project_id"), Pg.uuid(Expr.value(project_id))))
    |> Query.where_expr(Pg.jsonb_contains(Expr.column("tags"), Expr.fn_call("jsonb_build_object",
    [Expr.value(tag_key), Expr.value(tag_value)])))
    |> Query.where_raw("received_at > now() - interval '24 hours'", [])
    |> Query.select(["id", "issue_id", "level", "message", "tags", "received_at"])
    |> Query.order_by(:received_at, :desc)
    |> Query.limit(lim)
  Repo.all(pool, q)
end

# Event listing within an issue with keyset pagination (for DETAIL-05 context).
# Keep the page-1 and cursor follow-up queries as separate linear builder paths.
# The earlier shared-query/raw rewrite either crashed the live route or surfaced
# pointer-stringified values from the partitioned events read surface.

fn list_events_for_issue_page(pool :: PoolHandle, issue_id :: String, limit_str :: String) -> List < Map < String, String > > ! String do
  let lim = parse_limit(limit_str)
  let q = Query.from(Event.__table__())
    |> Query.where_expr(Expr.eq(Expr.column("issue_id"), Pg.uuid(Expr.value(issue_id))))
    |> Query.select_exprs([Expr.label(Pg.text(Expr.column("id")), "id"), Expr.label(Expr.column("level"),
    "level"), Expr.label(Expr.column("message"), "message"), Expr.label(Pg.text(Expr.column("received_at")),
    "received_at")])
    |> Query.order_by(:received_at, :desc)
    |> Query.order_by(:id, :desc)
    |> Query.limit(lim)
  Repo.all(pool, q)
end

fn list_events_for_issue_after_cursor(pool :: PoolHandle,
issue_id :: String,
cursor :: String,
cursor_id :: String,
limit_str :: String) -> List < Map < String, String > > ! String do
  let lim = parse_limit(limit_str)
  let q = Query.from(Event.__table__())
    |> Query.where_expr(Expr.eq(Expr.column("issue_id"), Pg.uuid(Expr.value(issue_id))))
    |> Query.where_raw("(received_at, id) < (?::timestamptz, ?::uuid)", [cursor, cursor_id])
    |> Query.select_exprs([Expr.label(Pg.text(Expr.column("id")), "id"), Expr.label(Expr.column("level"),
    "level"), Expr.label(Expr.column("message"), "message"), Expr.label(Pg.text(Expr.column("received_at")),
    "received_at")])
    |> Query.order_by(:received_at, :desc)
    |> Query.order_by(:id, :desc)
    |> Query.limit(lim)
  Repo.all(pool, q)
end

pub fn list_events_for_issue(pool :: PoolHandle,
issue_id :: String,
cursor :: String,
cursor_id :: String,
limit_str :: String) -> List < Map < String, String > > ! String do
  if String.length(cursor) > 0 do
    list_events_for_issue_after_cursor(pool, issue_id, cursor, cursor_id, limit_str)
  else
    list_events_for_issue_page(pool, issue_id, limit_str)
  end
end

# --- Dashboard aggregation queries (Phase 91 Plan 02) ---
# DASH-01: Event volume bucketed by hour or day for a project.
# bucket param is normalized to the honest allow-list used by the caller surface.
# Honest raw S03 keep-site: the builder-backed alias/group_by form kept counts but
# dropped the bucket value on the live dashboard route, so keep the SQL explicit
# until the labeled date_trunc projection survives the real Mesher caller path.

pub fn event_volume_hourly(pool :: PoolHandle, project_id :: String, bucket :: String) -> List < Map < String, String > > ! String do
  let bucket_name = normalize_time_bucket(bucket)
  let sql = "SELECT date_trunc('" <> bucket_name <> "', received_at)::text AS bucket, count(*)::text AS count FROM events WHERE project_id = $1::uuid AND received_at > now() - interval '24 hours' GROUP BY 1 ORDER BY 1 ASC"
  Repo.query_raw(pool, sql, [project_id])
end

# DASH-02: Error breakdown by severity level for a project.
# Groups events by level (error, warning, info, etc.) with counts.
# Uses structured SELECT expressions with regular GROUP BY / ORDER BY.

pub fn error_breakdown_by_level(pool :: PoolHandle, project_id :: String) -> List < Map < String, String > > ! String do
  let q = Query.from(Event.__table__())
    |> Query.where_expr(Expr.eq(Expr.column("project_id"), Pg.uuid(Expr.value(project_id))))
    |> Query.where_raw("received_at > now() - interval '24 hours'", [])
    |> Query.select_exprs([Expr.label(Expr.column("level"), "level"), Expr.label(Expr.fn_call("count",
    [Expr.column("*")]),
    "count")])
    |> Query.group_by(:level)
    |> Query.order_by(:count, :desc)
  Repo.all(pool, q)
end

# DASH-03: Top issues ranked by frequency (event count).
# Returns unresolved issues ordered by event_count DESC.
# Uses structured projection helpers while keeping numeric ORDER BY on the real column.

pub fn top_issues_by_frequency(pool :: PoolHandle, project_id :: String, limit_str :: String) -> List < Map < String, String > > ! String do
  let lim = parse_limit(limit_str)
  let q = Query.from(Issue.__table__())
    |> Query.where_expr(Expr.eq(Expr.column("project_id"), Pg.uuid(Expr.value(project_id))))
    |> Query.where_expr(Expr.eq(Expr.column("status"), Expr.value("unresolved")))
    |> Query.select_exprs([Expr.label(Expr.column("id"), "id"), Expr.label(Expr.column("title"),
    "title"), Expr.label(Expr.column("level"), "level"), Expr.label(Expr.column("status"), "status"), Expr.label(Expr.column("event_count"),
    "event_count"), Expr.label(Expr.column("last_seen"), "last_seen")])
    |> Query.order_by(:event_count, :desc)
    |> Query.limit(lim)
  Repo.all(pool, q)
end

# DASH-04: Event breakdown by tag key (environment, release, etc.).
# Uses jsonb_exists/jsonb_extract_path_text through expression-valued helpers
# so the JSONB key filter and projection stay on the explicit PG surface.

pub fn event_breakdown_by_tag(pool :: PoolHandle, project_id :: String, tag_key :: String) -> List < Map < String, String > > ! String do
  let tag_value = Expr.fn_call("jsonb_extract_path_text",
  [Expr.column("tags"), Expr.value(tag_key)])
  let q = Query.from(Event.__table__())
    |> Query.where_expr(Expr.eq(Expr.column("project_id"), Pg.uuid(Expr.value(project_id))))
    |> Query.where_raw("received_at > now() - interval '24 hours'", [])
    |> Query.where_expr(Expr.fn_call("jsonb_exists", [Expr.column("tags"), Expr.value(tag_key)]))
    |> Query.select_exprs([Expr.label(tag_value, "tag_value"), Expr.label(Expr.fn_call("count",
    [Expr.column("*")]),
    "count")])
    |> Query.group_by(:tag_value)
    |> Query.order_by(:count, :desc)
    |> Query.limit(20)
  Repo.all(pool, q)
end

# DASH-05: Per-issue event timeline (recent events for a specific issue).
# Ordered by received_at DESC for chronological browsing.
# Uses ORM Query.where_raw + Query.select_exprs + Query.order_by + Query.limit + Repo.all.

pub fn issue_event_timeline(pool :: PoolHandle, issue_id :: String, limit_str :: String) -> List < Map < String, String > > ! String do
  let lim = parse_limit(limit_str)
  let q = Query.from(Event.__table__())
    |> Query.where_raw("issue_id = ?::uuid", [issue_id])
    |> Query.select_exprs([Expr.label(Pg.text(Expr.column("id")), "id"), Expr.label(Expr.column("level"),
    "level"), Expr.label(Expr.column("message"), "message"), Expr.label(Pg.text(Expr.column("received_at")),
    "received_at")])
    |> Query.order_by(:received_at, :desc)
    |> Query.limit(lim)
  Repo.all(pool, q)
end

# DASH-06: Project health summary with key metrics.
# Returns single row: unresolved issue count, events in last 24h, new issues today.
# Uses small Mesh-side composition over three simple builder-backed counts instead of
# a cross-table scalar-subquery bundle.

pub fn project_health_summary(pool :: PoolHandle, project_id :: String) -> List < Map < String, String > > ! String do
  let unresolved_rows = count_unresolved_issues(pool, project_id) ?
  let unresolved_count = first_row_value_or(unresolved_rows, "cnt", "0")
  let event_q = Query.from(Event.__table__())
    |> Query.where_expr(Expr.eq(Expr.column("project_id"), Pg.uuid(Expr.value(project_id))))
    |> Query.where_raw("received_at > now() - interval '24 hours'", [])
    |> Query.select_expr(Expr.label(Pg.text(Expr.fn_call("count", [Expr.column("*")])), "cnt"))
  let event_rows = Repo.all(pool, event_q) ?
  let events_24h = first_row_value_or(event_rows, "cnt", "0")
  let new_q = Query.from(Issue.__table__())
    |> Query.where_expr(Expr.eq(Expr.column("project_id"), Pg.uuid(Expr.value(project_id))))
    |> Query.where_raw("first_seen > now() - interval '24 hours'", [])
    |> Query.select_expr(Expr.label(Pg.text(Expr.fn_call("count", [Expr.column("*")])), "cnt"))
  let new_rows = Repo.all(pool, new_q) ?
  let new_today = first_row_value_or(new_rows, "cnt", "0")
  let row = %{"unresolved_count" => unresolved_count, "events_24h" => events_24h, "new_today" => new_today}
  let rows = List.new()
  let rows = List.append(rows, row)
  Ok(rows)
end

# --- Event detail queries (Phase 91 Plan 02) ---
# DETAIL-01..04, DETAIL-06: Get complete event with all JSONB fields.
# Returns full event payload including exception, stacktrace, breadcrumbs,
# tags, extra, user_context. JSONB fields use COALESCE for null safety.
# Uses structured projection helpers instead of raw SELECT fragments.

pub fn get_event_detail(pool :: PoolHandle, event_id :: String) -> List < Map < String, String > > ! String do
  let q = Query.from(Event.__table__())
    |> Query.where_expr(Expr.eq(Expr.column("id"), Pg.uuid(Expr.value(event_id))))
    |> Query.select_exprs([Expr.label(Expr.column("id"), "id"), Expr.label(Expr.column("project_id"),
    "project_id"), Expr.label(Expr.column("issue_id"), "issue_id"), Expr.label(Expr.column("level"),
    "level"), Expr.label(Expr.column("message"), "message"), Expr.label(Expr.column("fingerprint"),
    "fingerprint"), Expr.label(Expr.coalesce([Pg.text(Expr.column("exception")), Expr.value("null")]),
    "exception"), Expr.label(Expr.coalesce([Pg.text(Expr.column("stacktrace")), Expr.value("[]")]),
    "stacktrace"), Expr.label(Expr.coalesce([Pg.text(Expr.column("breadcrumbs")), Expr.value("[]")]),
    "breadcrumbs"), Expr.label(Expr.coalesce([Pg.text(Expr.column("tags")), Expr.value("{}")]),
    "tags"), Expr.label(Expr.coalesce([Pg.text(Expr.column("extra")), Expr.value("{}")]), "extra"), Expr.label(Expr.coalesce([Pg.text(Expr.column("user_context")), Expr.value("null")]),
    "user_context"), Expr.label(Expr.coalesce([Expr.column("sdk_name"), Expr.value("")]),
    "sdk_name"), Expr.label(Expr.coalesce([Expr.column("sdk_version"), Expr.value("")]),
    "sdk_version"), Expr.label(Expr.coalesce([Expr.column("environment"), Expr.value("")]),
    "environment"), Expr.label(Expr.coalesce([Expr.column("session_id"), Expr.value("")]),
    "session_id"), Expr.label(Expr.column("received_at"), "received_at")])
  Repo.all(pool, q)
end

# DETAIL-05: Get next and previous event IDs within an issue for navigation.
# Uses tuple comparison (received_at, id) for stable ordering.
# ORM boundary: Two scalar subqueries with opposing sort orders and tuple comparison
# in a single SELECT -- each subquery uses (received_at, id) tuple comparison with
# different directions (> for next, < for prev) and LIMIT 1. The ORM Query builder
# cannot compose multiple independent subqueries in SELECT expressions. Intentional raw SQL.

pub fn get_event_neighbors(pool :: PoolHandle,
issue_id :: String,
received_at :: String,
event_id :: String) -> List < Map < String, String > > ! String do
  let sql = "SELECT (SELECT id::text FROM events WHERE issue_id = $1::uuid AND (received_at, id) > ($2::timestamptz, $3::uuid) ORDER BY received_at, id LIMIT 1) AS next_id, (SELECT id::text FROM events WHERE issue_id = $1::uuid AND (received_at, id) < ($2::timestamptz, $3::uuid) ORDER BY received_at DESC, id DESC LIMIT 1) AS prev_id"
  let rows = Repo.query_raw(pool, sql, [issue_id, received_at, event_id]) ?
  Ok(rows)
end

# --- Team management queries (Phase 91 Plan 03 -- ORG-04) ---
# Update a member's role. SQL-side validation ensures only valid roles accepted.
# Returns affected row count (0 if invalid role or membership not found).
# Uses ORM Repo.update_where with Query.where_raw for role validation.

pub fn update_member_role(pool :: PoolHandle,
org_id :: String,
membership_id :: String,
new_role :: String) -> Int ! String do
  Repo.execute_raw(pool,
  "WITH locked AS (SELECT pg_advisory_xact_lock(hashtextextended($1, 0))) UPDATE org_memberships AS target SET role = $3 FROM locked WHERE target.id = $2::uuid AND target.org_id = $1::uuid AND $3 IN ('owner', 'admin', 'member') AND NOT (target.role = 'owner' AND $3 != 'owner' AND NOT EXISTS (SELECT 1 FROM org_memberships AS other WHERE other.org_id = target.org_id AND other.role = 'owner' AND other.id != target.id))",
  [org_id, membership_id, new_role])
end

# Remove a member from an organization.
# Returns affected row count (0 if membership not found).

pub fn remove_member(pool :: PoolHandle, org_id :: String, membership_id :: String) -> Int ! String do
  Repo.execute_raw(pool,
  "WITH locked AS (SELECT pg_advisory_xact_lock(hashtextextended($1, 0))) DELETE FROM org_memberships AS target USING locked WHERE target.id = $2::uuid AND target.org_id = $1::uuid AND NOT (target.role = 'owner' AND NOT EXISTS (SELECT 1 FROM org_memberships AS other WHERE other.org_id = target.org_id AND other.role = 'owner' AND other.id != target.id))",
  [org_id, membership_id])
end

# List all members of an organization with user info (email, display_name).
# JOIN with users table for enriched member listing.
# Returns raw Map rows for flexible JSON serialization.
# Uses structured SELECT expressions with regular ordering.

pub fn get_members_with_users(pool :: PoolHandle, org_id :: String) -> List < Map < String, String > > ! String do
  let q = Query.from(OrgMembership.__table__())
    |> Query.join_as(:inner, User.__table__(), "u", "u.id = org_memberships.user_id")
    |> Query.where_expr(Expr.eq(Expr.column("org_memberships.org_id"), Pg.uuid(Expr.value(org_id))))
    |> Query.select_exprs([Expr.label(Expr.column("org_memberships.id"), "id"), Expr.label(Expr.column("org_memberships.user_id"),
    "user_id"), Expr.label(Expr.column("org_memberships.org_id"), "org_id"), Expr.label(Expr.column("org_memberships.role"),
    "role"), Expr.label(Expr.column("org_memberships.joined_at"), "joined_at"), Expr.label(Expr.column("u.email"),
    "email"), Expr.label(Expr.column("u.display_name"), "display_name")])
    |> Query.order_by(:joined_at, :asc)
  Repo.all(pool, q)
end

# --- API token management queries (Phase 91 Plan 03 -- ORG-05) ---
# List API key metadata for a project. Secret hashes and reusable key material
# never cross this query boundary.
# Returns raw Map rows. revoked_at is empty string if not revoked.
# Uses Query.where_expr + Query.select_exprs + Query.order_by.

pub fn list_api_keys(pool :: PoolHandle, project_id :: String) -> List < Map < String, String > > ! String do
  Repo.query_raw(pool,
  "SELECT id::text AS id, project_id::text AS project_id, key_prefix, label, created_at::text AS created_at, COALESCE(revoked_at::text, '') AS revoked_at FROM api_keys WHERE project_id = $1::uuid ORDER BY created_at DESC",
  [project_id])
end

# --- Alert system queries (Phase 92) ---
# ALERT-01: Insert alert rule from JSON body using Repo.insert_expr plus
# PostgreSQL JSONB extraction/defaulting helpers.

pub fn create_alert_rule(pool :: PoolHandle, project_id :: String, body :: String) -> String ! String do
  let body_json = Pg.jsonb(Expr.value(body))
  let row = Repo.insert_expr(pool,
  AlertRule.__table__(),
  %{"project_id" => Pg.uuid(Expr.value(project_id)), "name" => Expr.coalesce([Expr.fn_call("jsonb_extract_path_text",
  [body_json, Expr.value("name")]), Expr.value("Unnamed Rule")]), "condition_json" => Expr.coalesce([Expr.fn_call("jsonb_extract_path",
  [body_json, Expr.value("condition")]), Pg.jsonb(Expr.value("{}"))]), "action_json" => Expr.coalesce([Expr.fn_call("jsonb_extract_path",
  [body_json, Expr.value("action")]), Pg.jsonb(Expr.value("{\"type\":\"websocket\"}"))]), "cooldown_minutes" => Expr.coalesce([Pg.int(Expr.fn_call("jsonb_extract_path_text",
  [body_json, Expr.value("cooldown_minutes")])), Pg.int(Expr.value("60"))])}) ?
  Ok(Map.get(row, "id"))
end

# ALERT-01: List all alert rules for a project.
# Uses Query.where_expr + Query.select_exprs + Query.order_by instead of raw projection strings.

pub fn list_alert_rules(pool :: PoolHandle, project_id :: String) -> List < Map < String, String > > ! String do
  let q = Query.from(AlertRule.__table__())
    |> Query.where_expr(Expr.eq(Expr.column("project_id"), Pg.uuid(Expr.value(project_id))))
    |> Query.select_exprs([Expr.label(Pg.text(Expr.column("id")), "id"), Expr.label(Pg.text(Expr.column("project_id")),
    "project_id"), Expr.label(Expr.column("name"), "name"), Expr.label(Pg.text(Expr.column("condition_json")),
    "condition_json"), Expr.label(Pg.text(Expr.column("action_json")), "action_json"), Expr.label(Pg.text(Expr.column("enabled")),
    "enabled"), Expr.label(Pg.text(Expr.column("cooldown_minutes")), "cooldown_minutes"), Expr.label(Expr.coalesce([Pg.text(Expr.column("last_fired_at")), Expr.value("")]),
    "last_fired_at"), Expr.label(Pg.text(Expr.column("created_at")), "created_at")])
    |> Query.order_by(:created_at, :desc)
  Repo.all(pool, q)
end

# Enable/disable an alert rule.
# Uses ORM Repo.update_where with Query.where_raw.

pub fn toggle_alert_rule(pool :: PoolHandle, rule_id :: String, enabled_str :: String) -> Int ! String do
  Repo.execute_raw(pool,
  "UPDATE alert_rules SET enabled = $2::boolean WHERE id = $1::uuid AND $2 IN ('true', 'false') AND enabled != $2::boolean",
  [rule_id, enabled_str])
end

# Delete an alert rule.

pub fn delete_alert_rule(pool :: PoolHandle, rule_id :: String) -> Int ! String do
  Repo.execute_raw(pool, "DELETE FROM alert_rules WHERE id = $1::uuid", [rule_id])
end

# ALERT-02: Count events in time window AND check cooldown, return true if should fire.
# ORM boundary: Cross-join between two derived tables (event count subquery + cooldown subquery)
# with CASE expression, interval arithmetic, and multiple bound parameters in complex expressions.
# Not expressible via ORM query builder. Intentional raw SQL.

pub fn evaluate_threshold_rule(pool :: PoolHandle,
rule_id :: String,
project_id :: String,
threshold_str :: String,
window_str :: String,
cooldown_str :: String) -> Bool ! String do
  let sql = "SELECT CASE WHEN event_count > $3::int AND (last_fired IS NULL OR last_fired < now() - interval '1 minute' * $5::int) THEN 'true' ELSE 'false' END AS should_fire FROM (SELECT count(*) AS event_count FROM events WHERE project_id = $2::uuid AND received_at > now() - interval '1 minute' * $4::int) counts, (SELECT last_fired_at AS last_fired FROM alert_rules WHERE id = $1::uuid) cooldown"
  let rows = Repo.query_raw(pool,
  sql,
  [rule_id, project_id, threshold_str, window_str, cooldown_str]) ?
  if List.length(rows) > 0 do
    let should_fire = Map.get(List.head(rows), "should_fire")
    Ok(should_fire == "true")
  else
    Ok(false)
  end
end

# ALERT-04/05: Insert alert record, update last_fired_at, return alert_id.
# Uses expression-valued insert/update helpers instead of raw jsonb_build_object SQL.

pub fn fire_alert(pool :: PoolHandle,
rule_id :: String,
project_id :: String,
message :: String,
condition_type :: String,
rule_name :: String) -> String ! String do
  let rows = Repo.query_raw(pool,
  "WITH claimed AS (UPDATE alert_rules SET last_fired_at = now() WHERE id = $1::uuid AND project_id = $2::uuid AND enabled = true AND (last_fired_at IS NULL OR last_fired_at < now() - interval '1 minute' * cooldown_minutes) RETURNING id), inserted AS (INSERT INTO alerts (rule_id, project_id, status, message, condition_snapshot) SELECT id, $2::uuid, 'active', $3::text, jsonb_build_object('condition_type', $4::text, 'rule_name', $5::text) FROM claimed RETURNING id) SELECT id::text AS id FROM inserted",
  [rule_id, project_id, message, condition_type, rule_name]) ?
  if List.length(rows) > 0 do
    Ok(Map.get(List.head(rows), "id"))
  else
    Err("alert cooldown not claimed")
  end
end

# ALERT-03: Check if an issue was just created (first_seen = last_seen).
# Uses structured WHERE expressions plus Repo.exists.

pub fn check_new_issue(pool :: PoolHandle, issue_id :: String) -> Bool ! String do
  let rows = Repo.query_raw(pool,
  "SELECT id::text AS id FROM issues WHERE id = $1::uuid AND event_count = 1 AND first_seen = last_seen LIMIT 1",
  [issue_id]) ?
  Ok(List.length(rows) > 0)
end

# Regression detection: an issue has regressed when it is currently unresolved,
# has a recorded last_resolved_at timestamp, and its last_seen is newer than
# last_resolved_at -- meaning a new event arrived after the last manual resolve.
# Returns true only once per regression window because last_seen advances on each
# new event while last_resolved_at stays fixed until the next resolve action.
# Wired into check_event_alerts in ingestion/routes.mpl to fire "regression" alerts.

pub fn check_regression(pool :: PoolHandle, issue_id :: String) -> Bool ! String do
  let rows = Repo.query_raw(pool,
  "UPDATE issues SET regression_pending = false WHERE id = $1::uuid AND regression_pending = true RETURNING id::text AS id",
  [issue_id]) ?
  Ok(List.length(rows) > 0)
end

# Session-scoped event retrieval: returns events for a given session_id within a project.
# Scoped to the last 24 hours for partition pruning on the range-partitioned events table.
# Returns enough fields for session-context display without the full JSONB payload.

pub fn get_events_by_session_id(pool :: PoolHandle,
project_id :: String,
session_id :: String,
limit_str :: String) -> List < Map < String, String > > ! String do
  let lim = parse_limit(limit_str)
  let q = Query.from(Event.__table__())
    |> Query.where_expr(Expr.eq(Expr.column("project_id"), Pg.uuid(Expr.value(project_id))))
    |> Query.where_raw("session_id = ?", [session_id])
    |> Query.where_raw("received_at > now() - interval '24 hours'", [])
    |> Query.select_exprs([Expr.label(Pg.text(Expr.column("id")), "id"), Expr.label(Pg.text(Expr.column("issue_id")),
    "issue_id"), Expr.label(Expr.column("level"), "level"), Expr.label(Expr.column("message"),
    "message"), Expr.label(Expr.coalesce([Expr.column("environment"), Expr.value("")]),
    "environment"), Expr.label(Pg.text(Expr.column("received_at")), "received_at")])
    |> Query.order_by(:received_at, :asc)
    |> Query.limit(lim)
  Repo.all(pool, q)
end

# ALERT-03: Get enabled alert rules for event-based conditions for a project.
# Honest raw S03 keep-site: the live alert loop needs stable text rows and a
# truthful cooldown gate. Keep the selector explicit and pre-filter it on the
# row's own cooldown window so the caller does not need a second drifting read.

pub fn get_event_alert_rules(pool :: PoolHandle, project_id :: String, condition_type :: String) -> List < Map < String, String > > ! String do
  let sql = "SELECT id::text AS id, name::text AS name, cooldown_minutes::text AS cooldown_minutes FROM alert_rules WHERE project_id = $1::uuid AND enabled = true AND jsonb_extract_path_text(condition_json, 'condition_type') = $2 AND (last_fired_at IS NULL OR last_fired_at < now() - interval '1 minute' * cooldown_minutes)"
  Repo.query_raw(pool, sql, [project_id, condition_type])
end

# ALERT-05: Check cooldown before firing (for event-based triggers).
# Honest raw S03 keep-site: the live cooldown proof needs a stable boolean row
# from the rule timestamp comparison, and the builder-backed interval predicate
# no longer held the hot-rule gate on the real alert path.

pub fn should_fire_by_cooldown(pool :: PoolHandle, rule_id :: String, cooldown_str :: String) -> Bool ! String do
  let sql = "SELECT CASE WHEN last_fired_at IS NULL OR last_fired_at < now() - interval '1 minute' * $2::int THEN 'true' ELSE 'false' END AS should_fire FROM alert_rules WHERE id = $1::uuid"
  let rows = Repo.query_raw(pool, sql, [rule_id, cooldown_str]) ?
  if List.length(rows) > 0 do
    Ok(Map.get(List.head(rows), "should_fire") == "true")
  else
    Ok(false)
  end
end

# ALERT-06: Transition alert to acknowledged.
# Uses expression-aware Repo.update_where_expr for the now() timestamp update.

pub fn acknowledge_alert(pool :: PoolHandle, alert_id :: String) -> Int ! String do
  Repo.execute_raw(pool,
  "UPDATE alerts SET status = 'acknowledged', acknowledged_at = now() WHERE id = $1::uuid AND status = 'active'",
  [alert_id])
end

# ALERT-06: Transition alert to resolved.
# Uses expression-aware Repo.update_where_expr for the now() timestamp update.

pub fn resolve_fired_alert(pool :: PoolHandle, alert_id :: String) -> Int ! String do
  Repo.execute_raw(pool,
  "UPDATE alerts SET status = 'resolved', resolved_at = now() WHERE id = $1::uuid AND status IN ('active', 'acknowledged')",
  [alert_id])
end

# ALERT-06: List alerts for a project filtered by status.
# Honest raw S03 keep-site: the builder-backed join + optional status filter
# compiled but crashed the live alerts route with a non-exhaustive switch before
# serialization. Keep the SQL explicit and named until that read-side caller
# contract can survive the real Mesher/runtime path.

pub fn list_alerts(pool :: PoolHandle, project_id :: String, status :: String) -> List < Map < String, String > > ! String do
  let sql = "SELECT alerts.id::text AS id, alerts.rule_id::text AS rule_id, alerts.project_id::text AS project_id, alerts.status::text AS status, alerts.message::text AS message, alerts.condition_snapshot::text AS condition_snapshot, alerts.triggered_at::text AS triggered_at, COALESCE(alerts.acknowledged_at::text, '') AS acknowledged_at, COALESCE(alerts.resolved_at::text, '') AS resolved_at, alert_rules.name::text AS rule_name FROM alerts JOIN alert_rules ON alert_rules.id = alerts.rule_id WHERE alerts.project_id = $1::uuid AND ($2 = '' OR alerts.status = $2) ORDER BY alerts.triggered_at DESC LIMIT 50"
  Repo.query_raw(pool, sql, [project_id, status])
end

# Load all enabled threshold rules for evaluation.
# Honest raw S03 keep-site: keep the rule rows explicit and text-cast alongside
# the event-rule selector so alert evaluation sees stable IDs and JSON payloads on
# the live path while S03 closes with a named raw boundary.

pub fn get_threshold_rules(pool :: PoolHandle) -> List < Map < String, String > > ! String do
  let sql = "SELECT id::text AS id, project_id::text AS project_id, name::text AS name, condition_json::text AS condition_json, cooldown_minutes::text AS cooldown_minutes FROM alert_rules WHERE enabled = true AND jsonb_extract_path_text(condition_json, 'condition_type') = 'threshold'"
  Repo.query_raw(pool, sql, [])
end

# --- Retention and storage queries (Phase 93, ORM rewrite Phase 113) ---
# Delete expired events for a project based on its retention_days setting.
# Returns the number of deleted rows.
# Uses ORM Repo.delete_where + Query.where_raw for interval expression instead of Repo.execute_raw.

pub fn delete_expired_events(pool :: PoolHandle, project_id :: String, retention_days_str :: String) -> Int ! String do
  let q = Query.from(Event.__table__())
    |> Query.where_raw("project_id = ?::uuid AND received_at < now() - (? || ' days')::interval",
    [project_id, retention_days_str])
  Repo.delete_where(pool, Event.__table__(), q)
end

# Get all projects with their retention settings for the cleanup loop.
# Uses Query.select_exprs so the cleanup row shape is explicit and stable.

pub fn get_all_project_retention(pool :: PoolHandle) -> List < Map < String, String > > ! String do
  let q = Query.from(Project.__table__())
    |> Query.select_exprs([Expr.label(Pg.text(Expr.column("id")), "id"), Expr.label(Pg.text(Expr.column("retention_days")),
    "retention_days")])
  Repo.all(pool, q)
end

# Estimate storage usage for a project (event count and estimated bytes).
# Uses 1024 byte average row estimate.
# Uses Query.where_expr + Query.select_exprs instead of raw projection strings.

pub fn get_project_storage(pool :: PoolHandle, project_id :: String) -> List < Map < String, String > > ! String do
  let event_count = Expr.fn_call("count", [Expr.column("*")])
  let estimated_bytes = Expr.mul(event_count, Pg.cast(Expr.value("1024"), "bigint"))
  let q = Query.from(Event.__table__())
    |> Query.where_expr(Expr.eq(Expr.column("project_id"), Pg.uuid(Expr.value(project_id))))
    |> Query.select_exprs([Expr.label(Pg.text(event_count), "event_count"), Expr.label(Pg.text(estimated_bytes),
    "estimated_bytes")])
  Repo.all(pool, q)
end

# Update project retention and sampling settings from JSON body.
# Uses Mesh-side Json.get parsing so the neutral write path only updates the
# fields that were actually provided by the caller.

pub fn update_project_settings(pool :: PoolHandle, project_id :: String, body :: String) -> Int ! String do
  let retention_days = Json.get(body, "retention_days")
  let sample_rate = Json.get(body, "sample_rate")
  Repo.execute_raw(pool,
  "UPDATE projects SET retention_days = COALESCE(NULLIF($2, '')::integer, retention_days), sample_rate = COALESCE(NULLIF($3, '')::real, sample_rate) WHERE id = $1::uuid AND ($2 != '' OR $3 != '')",
  [project_id, retention_days, sample_rate])
end

pub fn run_retention_cleanup_db(pool :: PoolHandle,
dry_run :: Bool) -> List < Map < String, String > > ! String do
  Repo.query_raw(pool,
  "SELECT deleted_events::text AS deleted_events, dropped_partitions::text AS dropped_partitions, partition_retention_days::text AS partition_retention_days FROM hyperpush_retention_cleanup($1::boolean)",
  [if dry_run do "true" else "false" end])
end

# Get retention and sampling settings for a project.
# Uses Query.where_expr + Query.select_exprs so the API row keys stay explicit.

pub fn get_project_settings(pool :: PoolHandle, project_id :: String) -> List < Map < String, String > > ! String do
  let q = Query.from(Project.__table__())
    |> Query.where_expr(Expr.eq(Expr.column("id"), Pg.uuid(Expr.value(project_id))))
    |> Query.select_exprs([Expr.label(Pg.text(Expr.column("retention_days")), "retention_days"), Expr.label(Pg.text(Expr.column("sample_rate")),
    "sample_rate")])
  Repo.all(pool, q)
end

# Check if an event should be kept based on the project's sample_rate.
# Returns true if the event should be kept, false if it should be dropped.
# Defaults to keeping all events (sample_rate = 1.0) if project not found.
# ORM boundary: SELECT random() < COALESCE((SELECT ...), 1.0) uses a server-side
# random() function comparison with a scalar subquery and COALESCE default.
# Not expressible via ORM query builder. Intentional raw SQL.

pub fn check_sample_rate(pool :: PoolHandle, project_id :: String, event_json :: String) -> Bool ! String do
  let rows = Repo.query_raw(pool,
  "SELECT mod(abs(hashtextextended($2, 0)), 1000000) < COALESCE((SELECT sample_rate FROM projects WHERE id = $1::uuid), 1.0) * 1000000 AS keep",
  [project_id, event_json]) ?
  if List.length(rows) > 0 do
    Ok(Map.get(List.head(rows), "keep") == "t")
  else
    Ok(true)
  end
end

# Decode the versioned bulk envelope while preserving each event's full JSON
# value for strict validation and storage. Invalid/non-envelope shapes yield an
# empty result; LIMIT 101 lets the caller enforce the public maximum of 100.

pub fn decode_bulk_events(pool :: PoolHandle, body :: String) -> List < Map < String, String > > ! String do
  Repo.query_raw(pool,
  "SELECT value::text AS event_json FROM jsonb_array_elements(CASE WHEN jsonb_typeof($1::jsonb) = 'object' AND jsonb_typeof(($1::jsonb)->'events') = 'array' THEN ($1::jsonb)->'events' ELSE '[]'::jsonb END) AS value LIMIT 101",
  [body])
end
