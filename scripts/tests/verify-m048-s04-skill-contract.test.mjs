import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(scriptDir, '..', '..')

const skillPaths = {
  root: path.join(root, 'tools/skill/mesh/SKILL.md'),
  clustering: path.join(root, 'tools/skill/mesh/skills/clustering/SKILL.md'),
  syntax: path.join(root, 'tools/skill/mesh/skills/syntax/SKILL.md'),
  http: path.join(root, 'tools/skill/mesh/skills/http/SKILL.md'),
}

function relative(filePath) {
  return path.relative(root, filePath)
}

function readText(filePath, label) {
  assert.ok(fs.existsSync(filePath), `missing ${label}: ${relative(filePath)}`)
  return fs.readFileSync(filePath, 'utf8')
}

function expectMatch(text, filePath, pattern, label) {
  assert.match(text, pattern, `${relative(filePath)} should include ${label}`)
}

function expectNoMatch(text, filePath, pattern, label) {
  assert.ok(!pattern.test(text), `${relative(filePath)} should not include ${label}`)
}

test('Mesh root skill routes clustered runtime questions to the dedicated clustering sub-skill', () => {
  const rootSkill = readText(skillPaths.root, 'Mesh root skill')

  expectMatch(rootSkill, skillPaths.root, /clustered runtime/i, 'clustered runtime overview text')
  expectMatch(rootSkill, skillPaths.root, /@cluster/, '`@cluster` guidance')
  expectMatch(rootSkill, skillPaths.root, /Node\.start_from_env\(\)/, '`Node.start_from_env()` guidance')
  expectMatch(rootSkill, skillPaths.root, /meshc init --clustered/, '`meshc init --clustered` guidance')
  expectMatch(rootSkill, skillPaths.root, /meshc cluster status\|continuity\|diagnostics/, 'runtime-owned operator command summary')
  expectMatch(rootSkill, skillPaths.root, /`skills\/clustering`/, '`skills/clustering` listing')
  expectMatch(
    rootSkill,
    skillPaths.root,
    /Clustered runtime, bootstrap, scaffold, failover, or operator questions should load `skills\/clustering`/,
    'cluster-routing rule',
  )
})

test('Mesh clustering sub-skill pins the route-free clustered contract and bounded routed guidance', () => {
  const clusteringSkill = readText(skillPaths.clustering, 'Mesh clustering skill')

  expectMatch(clusteringSkill, skillPaths.clustering, /@cluster/, '`@cluster` guidance')
  expectMatch(clusteringSkill, skillPaths.clustering, /@cluster\(N\)/, '`@cluster(N)` guidance')
  expectMatch(clusteringSkill, skillPaths.clustering, /Node\.start_from_env\(\)/, '`Node.start_from_env()` guidance')
  expectMatch(clusteringSkill, skillPaths.clustering, /meshc init --clustered/, '`meshc init --clustered` scaffold guidance')
  expectMatch(clusteringSkill, skillPaths.clustering, /meshc init --template todo-api/, '`meshc init --template todo-api` starter guidance')
  expectMatch(
    clusteringSkill,
    skillPaths.clustering,
    /meshc cluster status <node-name@host:port> --json/,
    '`meshc cluster status` operator command',
  )
  expectMatch(
    clusteringSkill,
    skillPaths.clustering,
    /meshc cluster continuity <node-name@host:port> --json/,
    '`meshc cluster continuity` list command',
  )
  expectMatch(
    clusteringSkill,
    skillPaths.clustering,
    /meshc cluster continuity <node-name@host:port> <request-key> --json/,
    '`meshc cluster continuity` detail command',
  )
  expectMatch(
    clusteringSkill,
    skillPaths.clustering,
    /meshc cluster diagnostics <node-name@host:port> --json/,
    '`meshc cluster diagnostics` command',
  )
  expectMatch(clusteringSkill, skillPaths.clustering, /HTTP\.clustered\(handler\)/, '`HTTP.clustered(handler)` guidance')
  expectMatch(clusteringSkill, skillPaths.clustering, /HTTP\.clustered\(1, handler\)/, '`HTTP.clustered(1, handler)` guidance')
  expectMatch(clusteringSkill, skillPaths.clustering, /GET \/todos/, 'Todo clustered read-route guidance')
  expectMatch(clusteringSkill, skillPaths.clustering, /GET \/health/, 'Todo local health-route guidance')
  expectMatch(clusteringSkill, skillPaths.clustering, /mutating routes stay local/, 'Todo local mutating-route guidance')
  expectMatch(
    clusteringSkill,
    skillPaths.clustering,
    /Mesh-owned CLI commands instead of package-owned routes/,
    'runtime-owned inspection guidance',
  )
})

test('syntax and HTTP sub-skills cross-link the clustered runtime without dropping their local scope', () => {
  const syntaxSkill = readText(skillPaths.syntax, 'Mesh syntax skill')
  const httpSkill = readText(skillPaths.http, 'Mesh HTTP skill')

  expectMatch(syntaxSkill, skillPaths.syntax, /@cluster/, 'syntax-level `@cluster` note')
  expectMatch(syntaxSkill, skillPaths.syntax, /@cluster\(N\)/, 'syntax-level `@cluster(N)` note')
  expectMatch(syntaxSkill, skillPaths.syntax, /Node\.start_from_env\(\)/, 'syntax-level bootstrap note')
  expectMatch(syntaxSkill, skillPaths.syntax, /skills\/clustering/, 'syntax-to-clustering cross-link')

  expectMatch(httpSkill, skillPaths.http, /HTTP\.route\(router, path, handler\)/, 'generic `HTTP.route(...)` guidance')
  expectMatch(httpSkill, skillPaths.http, /HTTP\.on_get/, '`HTTP.on_get` guidance')
  expectMatch(httpSkill, skillPaths.http, /HTTP\.on_post/, '`HTTP.on_post` guidance')
  expectMatch(httpSkill, skillPaths.http, /HTTP\.on_put/, '`HTTP.on_put` guidance')
  expectMatch(httpSkill, skillPaths.http, /HTTP\.on_delete/, '`HTTP.on_delete` guidance')
  expectMatch(httpSkill, skillPaths.http, /HTTP\.clustered\(handler\)/, '`HTTP.clustered(handler)` guidance')
  expectMatch(httpSkill, skillPaths.http, /HTTP\.clustered\(1, handler\)/, '`HTTP.clustered(1, handler)` guidance')
  expectMatch(
    httpSkill,
    skillPaths.http,
    /Keep route-free `@cluster` declarations as the canonical clustered surface/,
    'canonical route-free `@cluster` boundary',
  )
  expectMatch(httpSkill, skillPaths.http, /GET \/health/, 'local health-route boundary')
  expectMatch(httpSkill, skillPaths.http, /mutating routes stay local/, 'local mutating-route boundary')
  expectMatch(httpSkill, skillPaths.http, /skills\/clustering/, 'HTTP-to-clustering cross-link')
})

test('Mesh skill bundle rejects stale clustered guidance patterns', () => {
  for (const [label, filePath] of Object.entries(skillPaths)) {
    const text = readText(filePath, label)

    expectNoMatch(text, filePath, /\[cluster\]/, 'legacy manifest cluster stanza guidance')
    expectNoMatch(text, filePath, /clustered\(work\)/, 'legacy helper-shaped clustered guidance')
    expectNoMatch(text, filePath, /execute_declared_work/, 'stale helper-shaped work name')
    expectNoMatch(text, filePath, /Work\.execute_declared_work/, 'stale runtime helper name')
  }
})
