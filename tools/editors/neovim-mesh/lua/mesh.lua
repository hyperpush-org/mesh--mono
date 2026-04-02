local M = {}

M._options = {}
M.root_markers = { 'mesh.toml', 'main.mpl', '.git' }

local uv = vim.uv or vim.loop

local function normalize(path)
  if type(path) ~= 'string' or path == '' then
    return nil
  end
  local real = uv.fs_realpath(path)
  return vim.fs.normalize(real or path)
end

local function path_exists(path)
  return path ~= nil and uv.fs_stat(path) ~= nil
end

local function is_dir(path)
  local stat = path and uv.fs_stat(path)
  return stat ~= nil and stat.type == 'directory'
end

local function is_executable(path)
  return type(path) == 'string' and path ~= '' and vim.fn.executable(path) == 1
end

local function shellescape(path)
  return vim.fn.shellescape(path)
end

local function buffer_path(bufnr)
  bufnr = bufnr or vim.api.nvim_get_current_buf()
  local name = vim.api.nvim_buf_get_name(bufnr)
  return normalize(name)
end

local function parent_dir(path)
  if not path then
    return nil
  end
  local parent = vim.fs.dirname(path)
  if parent == nil or parent == '' or parent == path then
    return nil
  end
  return parent
end

local function root_marker_type(marker)
  if marker == '.git' then
    return nil
  end
  return 'file'
end

local function ancestors(path)
  local dirs = {}
  local seen = {}
  local current = normalize(path)
  if not current then
    return dirs
  end

  if not is_dir(current) then
    current = parent_dir(current)
  end

  while current do
    if not seen[current] then
      table.insert(dirs, current)
      seen[current] = true
    end
    local next_parent = parent_dir(current)
    if not next_parent then
      break
    end
    current = next_parent
  end

  return dirs
end

local function append_candidate(list, seen, candidate)
  local key = string.format('%s:%s', candidate.class, candidate.path or candidate.label or '')
  if seen[key] then
    return
  end
  seen[key] = true
  table.insert(list, candidate)
end

local function override_path(opts)
  return normalize(opts.override or M._options.lsp_path or vim.g.mesh_lsp_path)
end

function M.setup(opts)
  opts = opts or {}
  M._options = vim.tbl_extend('force', M._options, opts)
  return M
end

function M.supports_native_lsp()
  return vim.fn.has('nvim-0.11') == 1
    and type(vim.lsp) == 'table'
    and type(vim.lsp.enable) == 'function'
end

function M.assert_native_lsp()
  if M.supports_native_lsp() then
    return true
  end

  return nil, 'Mesh Neovim LSP requires Neovim 0.11+ with vim.lsp.enable().'
end

function M.notify(message, level)
  vim.schedule(function()
    vim.notify(message, level or vim.log.levels.ERROR, { title = 'mesh.nvim' })
  end)
end

function M.set_last_error(message)
  vim.g.mesh_lsp_last_error = message
end

function M.clear_last_error()
  vim.g.mesh_lsp_last_error = vim.NIL
end

function M.set_last_resolution(info)
  vim.g.mesh_lsp_last_resolution = info
end

function M.detect_root(bufnr)
  bufnr = bufnr or vim.api.nvim_get_current_buf()
  local path = buffer_path(bufnr)
  if not path then
    return {
      root_dir = nil,
      marker = 'single-file',
      marker_path = nil,
      buffer_path = nil,
    }
  end

  local start = parent_dir(path) or path

  for _, marker in ipairs(M.root_markers) do
    local find_opts = {
      path = start,
      upward = true,
      limit = 1,
    }
    local marker_type = root_marker_type(marker)
    if marker_type then
      find_opts.type = marker_type
    end

    local match = vim.fs.find(marker, find_opts)[1]
    if match then
      return {
        root_dir = normalize(parent_dir(match) or match),
        marker = marker,
        marker_path = normalize(match),
        buffer_path = path,
      }
    end
  end

  return {
    root_dir = nil,
    marker = 'single-file',
    marker_path = nil,
    buffer_path = path,
  }
end

function M.discovery_candidates(opts)
  opts = opts or {}
  local candidates = {}
  local seen = {}
  local override = override_path(opts)

  if override then
    append_candidate(candidates, seen, {
      class = 'override',
      source = 'override',
      path = override,
      explicit = true,
      detail = 'vim.g.mesh_lsp_path or require("mesh").setup({ lsp_path = ... })',
    })
    return candidates
  end

  local root_dir = normalize(opts.root_dir)
  local file_path = normalize(opts.buffer_path)
  local cwd = normalize(opts.cwd or vim.fn.getcwd())

  local search_roots = {}
  local root_seen = {}
  local ordered_starts = {}
  local function push_start(path)
    if path then
      table.insert(ordered_starts, path)
    end
  end
  push_start(root_dir)
  push_start(file_path)
  push_start(cwd)
  for _, start in ipairs(ordered_starts) do
    for _, dir in ipairs(ancestors(start)) do
      if not root_seen[dir] then
        table.insert(search_roots, dir)
        root_seen[dir] = true
      end
    end
  end

  for _, dir in ipairs(search_roots) do
    append_candidate(candidates, seen, {
      class = 'workspace-target-debug',
      source = dir,
      path = normalize(vim.fs.joinpath(dir, 'target', 'debug', 'meshc')),
    })
    append_candidate(candidates, seen, {
      class = 'workspace-target-release',
      source = dir,
      path = normalize(vim.fs.joinpath(dir, 'target', 'release', 'meshc')),
    })
  end

  local home = normalize(uv.os_homedir())
  for _, path in ipairs({
    home and normalize(vim.fs.joinpath(home, '.mesh', 'bin', 'meshc')) or nil,
    '/usr/local/bin/meshc',
    '/opt/homebrew/bin/meshc',
  }) do
    if path then
      append_candidate(candidates, seen, {
        class = 'well-known',
        source = 'well-known',
        path = normalize(path),
      })
    end
  end

  append_candidate(candidates, seen, {
    class = 'path',
    source = 'PATH',
    label = 'meshc',
  })

  return candidates
end

function M.describe_candidates(candidates)
  local lines = {}
  for index, candidate in ipairs(candidates or {}) do
    if candidate.path then
      table.insert(lines, string.format('%d. [%s] %s (source=%s)', index, candidate.class, candidate.path, candidate.source))
    else
      table.insert(lines, string.format('%d. [%s] %s', index, candidate.class, candidate.label or '?'))
    end
  end
  return table.concat(lines, '\n')
end

local function format_resolution_error(reason, meta, candidates)
  local lines = {
    string.format('Mesh LSP meshc discovery failed: %s', reason),
    string.format('buffer=%s', meta.buffer_path or '<none>'),
    string.format('root=%s', meta.root_dir or '<single-file>'),
    string.format('cwd=%s', meta.cwd or '<none>'),
    'candidates:',
    M.describe_candidates(candidates),
    'Override with vim.g.mesh_lsp_path = "/absolute/path/to/meshc" or require("mesh").setup({ lsp_path = "/absolute/path/to/meshc" }).',
  }
  return table.concat(lines, '\n')
end

function M.resolve_meshc(opts)
  opts = opts or {}
  local meta = {
    buffer_path = normalize(opts.buffer_path),
    root_dir = normalize(opts.root_dir),
    cwd = normalize(opts.cwd or vim.fn.getcwd()),
  }
  local candidates = M.discovery_candidates(opts)

  for _, candidate in ipairs(candidates) do
    if candidate.class == 'path' then
      local resolved = vim.fn.exepath(candidate.label or 'meshc')
      if resolved ~= nil and resolved ~= '' then
        local resolved_path = normalize(resolved)
        return {
          path = resolved_path,
          class = candidate.class,
          source = candidate.source,
          candidates = candidates,
        }
      end
    elseif path_exists(candidate.path) then
      if not is_executable(candidate.path) then
        local message = format_resolution_error(
          string.format('candidate is not executable: %s', candidate.path),
          meta,
          candidates
        )
        return nil, message, candidates
      end

      return {
        path = candidate.path,
        class = candidate.class,
        source = candidate.source,
        candidates = candidates,
      }
    elseif candidate.explicit then
      local message = format_resolution_error(
        string.format('override path does not exist: %s', candidate.path),
        meta,
        candidates
      )
      return nil, message, candidates
    end
  end

  local message = format_resolution_error('no executable meshc candidate found', meta, candidates)
  return nil, message, candidates
end

function M.start_rpc(dispatchers, config)
  local ok_native, native_error = M.assert_native_lsp()
  if not ok_native then
    M.set_last_error(native_error)
    M.notify(native_error, vim.log.levels.ERROR)
    error(native_error)
  end

  local current_buffer = vim.api.nvim_get_current_buf()
  local current_path = buffer_path(current_buffer)
  local cmd_cwd = normalize(config.root_dir) or parent_dir(current_path) or normalize(vim.fn.getcwd())
  local resolution, resolve_error = M.resolve_meshc({
    root_dir = config.root_dir,
    buffer_path = current_path,
    cwd = vim.fn.getcwd(),
  })

  if not resolution then
    M.set_last_error(resolve_error)
    M.notify(resolve_error, vim.log.levels.ERROR)
    error(resolve_error)
  end

  local cmd = { resolution.path, 'lsp' }
  config.cmd_cwd = cmd_cwd
  config._mesh_resolved = {
    path = resolution.path,
    class = resolution.class,
    source = resolution.source,
    candidates = resolution.candidates,
    buffer_path = current_path,
    root_dir = normalize(config.root_dir),
    cmd_cwd = cmd_cwd,
  }
  M.set_last_resolution(config._mesh_resolved)
  M.clear_last_error()

  local ok, rpc_or_error = pcall(vim.lsp.rpc.start, cmd, dispatchers, {
    cwd = cmd_cwd,
    env = config.cmd_env,
    detached = config.detached,
  })

  if ok then
    return rpc_or_error
  end

  local message = table.concat({
    string.format('Mesh LSP failed to spawn %s via %s.', shellescape(resolution.path), resolution.class),
    string.format('buffer=%s', current_path or '<none>'),
    string.format('root=%s', normalize(config.root_dir) or '<single-file>'),
    string.format('cmd_cwd=%s', cmd_cwd or '<none>'),
    string.format('error=%s', tostring(rpc_or_error)),
    'candidates:',
    M.describe_candidates(resolution.candidates),
    'Override with vim.g.mesh_lsp_path = "/absolute/path/to/meshc" or require("mesh").setup({ lsp_path = "/absolute/path/to/meshc" }).',
  }, '\n')

  M.set_last_error(message)
  M.notify(message, vim.log.levels.ERROR)
  error(message)
end

return M
