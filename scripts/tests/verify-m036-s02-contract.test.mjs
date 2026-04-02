import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(scriptDir, '..', '..')
const readmePath = path.join(root, 'tools/editors/neovim-mesh/README.md')
const runtimePath = path.join(root, 'tools/editors/neovim-mesh/lua/mesh.lua')
const lspConfigPath = path.join(root, 'tools/editors/neovim-mesh/lsp/mesh.lua')
const verifyScriptPath = path.join(root, 'scripts/verify-m036-s02.sh')
const smokeScriptPath = path.join(root, 'tools/editors/neovim-mesh/tests/smoke.lua')

function readText(filePath, label) {
  assert.ok(fs.existsSync(filePath), `missing ${label}: ${path.relative(root, filePath)}`)
  return fs.readFileSync(filePath, 'utf8')
}

test('README documents the pack-local install, bounded syntax proof, and manifest-first root contract', () => {
  const readme = readText(readmePath, 'Neovim README')

  assert.match(readme, /Neovim 0\.11\+/)
  assert.match(readme, /pack\/\*\/start\/mesh-nvim/)
  assert.match(readme, /vim\.g\.mesh_lsp_path/)
  assert.match(readme, /require\('mesh'\)\.setup\(\{ lsp_path = '\/absolute\/path\/to\/meshc' \}\)/)
  assert.match(readme, /NEOVIM_BIN="\$\{NEOVIM_BIN:-nvim\}" bash scripts\/verify-m036-s02\.sh/)
  assert.match(readme, /No Tree-sitter grammar\./)
  assert.match(readme, /@cluster/)
  assert.match(readme, /shared S01 interpolation corpus/)
  assert.match(readme, /scripts\/fixtures\/m048-s04-cluster-decorators\.mpl/)
  assert.match(readme, /workspace root prefers `mesh\.toml`/)
  assert.match(readme, /then falls back to root `main\.mpl`/)
  assert.match(readme, /then falls back to `\.git`/)
  assert.match(readme, /manifest-first override-entry fixture/)
})

test('Neovim runtime and exported LSP config stay synchronized on manifest-first roots and bounded syntax probes', () => {
  const runtime = readText(runtimePath, 'Neovim runtime')
  const lspConfig = readText(lspConfigPath, 'Neovim LSP config')
  const smokeScript = readText(smokeScriptPath, 'M036 S02 smoke runner')

  assert.match(runtime, /M\.root_markers = \{ 'mesh\.toml', 'main\.mpl', '\.git' \}/)
  assert.match(runtime, /for _, marker in ipairs\(M\.root_markers\) do/)
  assert.match(runtime, /if marker == '\.git' then/)
  assert.match(lspConfig, /root_markers = mesh\.root_markers/)
  assert.match(smokeScript, /m048-s04-cluster-decorators\.mpl/)
  assert.match(smokeScript, /plain-decorator-name/)
  assert.match(smokeScript, /bare-cluster-identifier/)
  assert.match(smokeScript, /decorator_probes=/)
  assert.match(smokeScript, /case=override-entry materialized/)
  assert.match(smokeScript, /marker_path=/)
  assert.match(smokeScript, /checked_cases=4/)
})

test('the repo verifier defaults to the full proof and calls the consolidated smoke runner', () => {
  const verifyScript = readText(verifyScriptPath, 'M036 S02 verifier')
  const smokeScript = readText(smokeScriptPath, 'M036 S02 smoke runner')

  assert.match(verifyScript, /PHASE="\$\{1:-all\}"/)
  assert.match(verifyScript, /verify-m036-s02-materialize-corpus\.mjs/)
  assert.match(verifyScript, /tests\/smoke\.lua/)
  assert.match(verifyScript, /run_shared_grammar_phase/)
  assert.match(verifyScript, /run_upstream_lsp_phase/)
  assert.match(smokeScript, /phase=syntax result=pass/)
  assert.match(smokeScript, /phase=lsp result=pass/)
})
