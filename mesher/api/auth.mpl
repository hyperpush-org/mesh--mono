# Bearer-session lifecycle endpoints. Tokens are returned only by login,
# accepted only in the Authorization header, and never placed in cookies or
# URLs; cookie-auth CSRF therefore does not apply to this API.

from Ingestion.Pipeline import PipelineRegistry
from Ingestion.ManagementAuth import extract_bearer_token
from Storage.Queries import authenticate_user, create_session, delete_session, validate_session, get_user, get_user_project_context, record_audit
from Api.Helpers import get_registry, to_json_array
from Types.User import User

struct LoginInput do
  email :: String
  password :: String
end deriving(Json)

fn no_store_headers() do
  %{"Cache-Control" => "no-store", "Pragma" => "no-cache"}
end

fn login_success(pool :: PoolHandle, user :: User, token :: String) do
  let _audit_result = record_audit(pool, user.id, "POST", "/api/v1/auth/login", "success")
  HTTP.response_with_headers(200,
  json {
    token : token,
    token_type : "Bearer",
    expires_in : 604800,
    user : json { id : user.id, email : user.email, display_name : user.display_name }
  },
  no_store_headers())
end

fn create_login_session(pool :: PoolHandle, user :: User) do
  let session_result = create_session(pool, user.id)
  case session_result do
    Ok( token) -> login_success(pool, user, token)
    Err( _) -> HTTP.response_with_headers(503, json { error : "authentication unavailable" }, no_store_headers())
  end
end

fn authenticate_login(pool :: PoolHandle, input :: LoginInput) do
  let auth_result = authenticate_user(pool, input.email, input.password)
  case auth_result do
    Ok( user) -> create_login_session(pool, user)
    Err( _) -> HTTP.response_with_headers(401, json { error : "invalid credentials" }, no_store_headers())
  end
end

pub fn handle_login(request) do
  let reg_pid = get_registry()
  let pool = PipelineRegistry.get_pool(reg_pid)
  let parsed = LoginInput.from_json(Request.body(request))
  case parsed do
    Ok( input) -> authenticate_login(pool, input)
    Err( _) -> HTTP.response_with_headers(400, json { error : "invalid login payload" }, no_store_headers())
  end
end

pub fn handle_logout(request) do
  let reg_pid = get_registry()
  let pool = PipelineRegistry.get_pool(reg_pid)
  let token_result = extract_bearer_token(request)
  case token_result do
    Ok( token) -> case delete_session(pool, token) do
      Ok( _) -> HTTP.response_with_headers(200, json { status : "ok" }, no_store_headers())
      Err( _) -> HTTP.response_with_headers(503, json { error : "authentication unavailable" }, no_store_headers())
    end
    Err( _) -> HTTP.response_with_headers(401, json { error : "unauthorized" }, no_store_headers())
  end
end

fn context_row_to_json(row :: Map < String, String >) -> String do
  let org_id = Map.get(row, "org_id")
  let org_name = Map.get(row, "org_name")
  let org_slug = Map.get(row, "org_slug")
  let role = Map.get(row, "role")
  let project_id = Map.get(row, "project_id")
  let project_slug = Map.get(row, "project_slug")
  let project_name = Map.get(row, "project_name")
  let project_platform = Map.get(row, "project_platform")
  json { org_id : org_id, org_name : org_name, org_slug : org_slug, role : role, project_id : project_id, project_slug : project_slug, project_name : project_name, project_platform : project_platform }
end

fn respond_user_context(user :: User, context_rows) do
  let context_json = context_rows
    |> List.map(fn (row) do context_row_to_json(row) end)
    |> to_json_array()
  let user_json = json { id : user.id, email : user.email, display_name : user.display_name }
  HTTP.response_with_headers(200,
  """{"user":#{user_json},"memberships":#{context_json}}""",
  no_store_headers())
end

fn load_current_user_context(pool :: PoolHandle, user :: User) do
  let context_result = get_user_project_context(pool, user.id)
  case context_result do
    Ok( rows) -> respond_user_context(user, rows)
    Err( _) -> HTTP.response_with_headers(503, json { error : "authentication context unavailable" }, no_store_headers())
  end
end

fn respond_current_user(pool :: PoolHandle, user_id :: String) do
  let user_result = get_user(pool, user_id)
  case user_result do
    Ok( user) -> load_current_user_context(pool, user)
    Err( _) -> HTTP.response_with_headers(401, json { error : "unauthorized" }, no_store_headers())
  end
end

pub fn handle_me(request) do
  let reg_pid = get_registry()
  let pool = PipelineRegistry.get_pool(reg_pid)
  let token_result = extract_bearer_token(request)
  case token_result do
    Ok( token) -> do
      let session_result = validate_session(pool, token)
      case session_result do
        Ok( session) -> respond_current_user(pool, session.user_id)
        Err( _) -> HTTP.response_with_headers(401, json { error : "unauthorized" }, no_store_headers())
      end
    end
    Err( _) -> HTTP.response_with_headers(401, json { error : "unauthorized" }, no_store_headers())
  end
end
