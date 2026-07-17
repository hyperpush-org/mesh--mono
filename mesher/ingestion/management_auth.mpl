# Fail-closed bearer-session authentication and tenant-scoped management API
# authorization. Ingestion API keys are intentionally handled by
# Ingestion.Auth instead of this module.

from Ingestion.Pipeline import PipelineRegistry
from Storage.Queries import validate_session, get_management_role, record_audit
from Types.User import Session
from Api.Helpers import get_registry, require_param

struct ResourceScope do
  kind :: String
  id :: String
  parent_id :: String
end

fn no_store_headers() do
  %{"Cache-Control" => "no-store", "Pragma" => "no-cache"}
end

fn unauthorized_response() do
  HTTP.response_with_headers(401, json { error : "unauthorized" }, no_store_headers())
end

fn forbidden_response() do
  HTTP.response_with_headers(403, json { error : "forbidden" }, no_store_headers())
end

fn extract_bearer_value(value :: String) -> String ! String do
  if String.starts_with(value, "Bearer ") do
    let token = String.trim(String.replace(value, "Bearer ", ""))
    if String.length(token) > 0 do
      Ok(token)
    else
      Err("missing bearer token")
    end
  else
    Err("authorization must use Bearer")
  end
end

fn authorization_header(request) -> Option<String> do
  let normalized = Request.header(request, "authorization")
  case normalized do
    Some(value) -> Some(value)
    None -> Request.header(request, "Authorization")
  end
end

pub fn extract_bearer_token(request) -> String ! String do
  case authorization_header(request) do
    Some(value) -> extract_bearer_value(value)
    None -> Err("missing authorization")
  end
end

fn authenticate_management(pool :: PoolHandle, request) -> Session ! String do
  let token = extract_bearer_token(request) ?
  validate_session(pool, token)
end

fn scope_for_project(request) -> ResourceScope do
  ResourceScope {
    kind : "project",
    id : require_param(request, "project_id"),
    parent_id : ""
  }
end

fn scope_for_org(request) -> ResourceScope do
  let membership_id = require_param(request, "membership_id")
  if String.length(membership_id) > 0 do
    ResourceScope {
      kind : "membership",
      id : membership_id,
      parent_id : require_param(request, "org_id")
    }
  else
    ResourceScope {
      kind : "org",
      id : require_param(request, "org_id"),
      parent_id : ""
    }
  end
end

fn scope_for_issue(request) -> ResourceScope do
  let issue_id = require_param(request, "issue_id")
  ResourceScope {
    kind : "issue",
    id : if String.length(issue_id) > 0 do issue_id else require_param(request, "id") end,
    parent_id : ""
  }
end

fn scope_for_resource(kind :: String, id :: String) -> ResourceScope do
  ResourceScope { kind : kind, id : id, parent_id : "" }
end

fn management_scope(request) -> ResourceScope do
  let path = Request.path(request)
  if String.starts_with(path, "/api/v1/projects/") do
    scope_for_project(request)
  else if String.starts_with(path, "/api/v1/orgs/") do
    scope_for_org(request)
  else if String.starts_with(path, "/api/v1/issues/") do
    scope_for_issue(request)
  else if String.starts_with(path, "/api/v1/events/") do
    scope_for_resource("event", require_param(request, "event_id"))
  else if String.starts_with(path, "/api/v1/alert-rules/") do
    scope_for_resource("rule", require_param(request, "rule_id"))
  else if String.starts_with(path, "/api/v1/alerts/") do
    scope_for_resource("alert", require_param(request, "id"))
  else if String.starts_with(path, "/api/v1/api-keys/") do
    scope_for_resource("key", require_param(request, "key_id"))
  else
    ResourceScope { kind : "", id : "", parent_id : "" }
  end
end

fn permission_for_request(request) -> String do
  let method = Request.method(request)
  let path = Request.path(request)
  if method == "GET" do
    "read"
  else if String.contains(path, "/members/") do
    "owner_write"
  else if String.ends_with(path, "/members") do
    "admin_write"
  else if String.contains(path, "/api-keys") do
    "admin_write"
  else if String.contains(path, "/settings") do
    "admin_write"
  else if String.contains(path, "/alert-rules") do
    "admin_write"
  else if String.starts_with(path, "/api/v1/api-keys/") do
    "admin_write"
  else
    "member_write"
  end
end

fn role_allows(role :: String, permission :: String) -> Bool do
  if role == "owner" do
    true
  else if role == "admin" do
    permission != "owner_write"
  else if role == "member" do
    permission == "read" or permission == "member_write"
  else
    false
  end
end

fn authorize_scope(pool :: PoolHandle, user_id :: String, request) -> Bool do
  let scope = management_scope(request)
  if String.length(scope.kind) == 0 or String.length(scope.id) == 0 do
    false
  else
    let role_result = get_management_role(pool, user_id, scope.kind, scope.id, scope.parent_id)
    case role_result do
      Ok( role) -> role_allows(role, permission_for_request(request))
      Err( _) -> false
    end
  end
end

fn is_public_api_path(path :: String) -> Bool do
  path == "/health/live" or path == "/health/ready" or path == "/api/v1/auth/login" or path == "/api/v1/events" or path == "/api/v1/events/bulk"
end

fn is_logout_path(path :: String) -> Bool do
  path == "/api/v1/auth/logout" or path == "/api/v1/auth/me"
end

fn record_authorized_mutation(pool :: PoolHandle, session :: Session, request) do
  let method = Request.method(request)
  if method != "GET" do
    let _audit_result = record_audit(pool, session.user_id, method, Request.path(request), "authorized")
    0
  else
    0
  end
end

fn authenticated_request_allowed(pool :: PoolHandle, session :: Session, request) -> Bool do
  let path = Request.path(request)
  is_logout_path(path) or authorize_scope(pool, session.user_id, request)
end

pub fn management_auth_middleware(request, next) do
  let path = Request.path(request)
  let request_id = Crypto.uuid4()
  println("[Mesher] management_request request_id=#{request_id} method=#{Request.method(request)} path=#{path}")
  if is_public_api_path(path) or not String.starts_with(path, "/api/v1/") do
    next(request)
  else
    let reg_pid = get_registry()
    let pool = PipelineRegistry.get_pool(reg_pid)
    let auth_result = authenticate_management(pool, request)
    case auth_result do
      Ok( session) -> if authenticated_request_allowed(pool, session, request) do
        let _recorded = record_authorized_mutation(pool, session, request)
        next(request)
      else
        let _audit_result = record_audit(pool, session.user_id, Request.method(request), path, "denied")
        forbidden_response()
      end
      Err( reason) -> do
        println("[Mesher] auth_denial request_id=#{request_id} method=#{Request.method(request)} path=#{path} reason=#{reason}")
        unauthorized_response()
      end
    end
  end
end
