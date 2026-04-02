local mesh = require('mesh')

return {
  cmd = mesh.start_rpc,
  filetypes = { 'mesh' },
  root_markers = mesh.root_markers,
  workspace_required = false,
}
