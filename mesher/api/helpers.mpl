# Shared helper functions for API modules.
# Provides common utilities used across search, dashboard, and team handlers.
# All functions are pub for cross-module import.

from Storage.Queries import get_project_id_by_slug, get_org_id_by_slug

fn strip_uuid_characters(value :: String) -> String do
  value
    |> String.to_lower()
    |> String.replace("-", "")
    |> String.replace("0", "")
    |> String.replace("1", "")
    |> String.replace("2", "")
    |> String.replace("3", "")
    |> String.replace("4", "")
    |> String.replace("5", "")
    |> String.replace("6", "")
    |> String.replace("7", "")
    |> String.replace("8", "")
    |> String.replace("9", "")
    |> String.replace("a", "")
    |> String.replace("b", "")
    |> String.replace("c", "")
    |> String.replace("d", "")
    |> String.replace("e", "")
    |> String.replace("f", "")
end

pub fn is_uuid(value :: String) -> Bool do
  if String.length(value) != 36 do
    false
  else
    let parts = String.split(value, "-")
    if List.length(parts) != 5 do
      false
    else if String.length(List.get(parts, 0)) != 8 do
      false
    else if String.length(List.get(parts, 1)) != 4 do
      false
    else if String.length(List.get(parts, 2)) != 4 do
      false
    else if String.length(List.get(parts, 3)) != 4 do
      false
    else if String.length(List.get(parts, 4)) != 12 do
      false
    else
      String.length(strip_uuid_characters(value)) == 0
    end
  end
end

# Hyperpush currently ships in explicit single-node mode. Keeping registry
# lookup process-local avoids advertising cross-node routing that the product
# does not implement yet.

pub fn get_registry() do
  Process.whereis("mesher_registry")
end

# Resolve a project identifier to a UUID.
# If the identifier is 36 chars (UUID format), returns it directly.
# Otherwise, treats it as a slug and looks up the project UUID from the database.
# Returns the UUID string on success, or an empty string if slug not found.

pub fn resolve_project_id(pool :: PoolHandle, raw_id :: String) -> String do
  if is_uuid(raw_id) do
    raw_id
  else
    let result = get_project_id_by_slug(pool, raw_id)
    case result do
      Ok( uuid) -> uuid
      Err( _) -> ""
    end
  end
end

# Resolve an org identifier to a UUID.
# If the identifier is 36 chars (UUID format), returns it directly.
# Otherwise, treats it as a slug and looks up the org UUID from the database.
# Returns the UUID string on success, or an empty string if slug not found.

pub fn resolve_org_id(pool :: PoolHandle, raw_id :: String) -> String do
  if is_uuid(raw_id) do
    raw_id
  else
    let result = get_org_id_by_slug(pool, raw_id)
    case result do
      Ok( uuid) -> uuid
      Err( _) -> ""
    end
  end
end

# Extract optional query parameter with a default value.
# Request.query returns Option<String>; case match to Some/None.

pub fn query_or_default(request, param :: String, default :: String) -> String do
  let opt = Request.query(request, param)
  case opt do
    Some( v) -> v
    None -> default
  end
end

# Extract a required path parameter.
# Request.param returns Option<String>; route matching guarantees existence.

pub fn require_param(request, name :: String) -> String do
  let opt = Request.param(request, name)
  case opt do
    Some( v) -> v
    None -> ""
  end
end

# Convert a list of JSON strings to a JSON array.
# Replaces the old recursive json_array_loop pattern with String.join.

pub fn to_json_array(items) -> String do
  "[#{String.join(items, ",")}]"
end
