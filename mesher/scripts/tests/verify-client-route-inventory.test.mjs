import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const mesherRoot = path.resolve(scriptDirectory, '../..')
const productRoot = path.resolve(mesherRoot, '..')
const clientRoot = path.join(mesherRoot, 'client')
const landingRoot = path.join(mesherRoot, 'landing')
const catalogPath = path.join(mesherRoot, 'capabilities.json')
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
const runtimeProjection = JSON.parse(readFileSync(path.join(mesherRoot, 'capabilities.runtime.json'), 'utf8'))
const publicProjection = JSON.parse(
  readFileSync(path.join(landingRoot, 'lib', 'capabilities.public.json'), 'utf8'),
)

const expectedRoutes = [
  { key: 'issues', pathname: '/', capability: 'issues', routeFile: '_dashboard.index.tsx' },
  { key: 'alerts', pathname: '/alerts', capability: 'alerts', routeFile: '_dashboard.alerts.tsx' },
  { key: 'settings', pathname: '/settings', capability: 'project-settings', routeFile: '_dashboard.settings.tsx' },
]

function read(relativePath) {
  return readFileSync(path.join(productRoot, relativePath), 'utf8')
}

function collectSourceFiles(root) {
  const files = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.next') continue
    const candidate = path.join(root, entry.name)
    if (entry.isDirectory()) files.push(...collectSourceFiles(candidate))
    else if (/\.(?:js|jsx|ts|tsx)$/.test(entry.name)) files.push(candidate)
  }
  return files
}

function productionClientSources() {
  return ['src', 'components', 'lib'].flatMap((directory) =>
    collectSourceFiles(path.join(clientRoot, directory)),
  )
}

function assertSourceAbsent(files, pattern, description) {
  const hits = []
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    if (pattern.test(source)) hits.push(path.relative(productRoot, file))
    pattern.lastIndex = 0
  }
  assert.deepEqual(hits, [], `${description}: ${hits.join(', ')}`)
}

test('capability catalog is complete, fail-closed, and proof-backed', () => {
  assert.equal(catalog.schemaVersion, 1)
  const entries = Object.entries(catalog.capabilities)
  assert.ok(entries.length > expectedRoutes.length)
  assert.equal(new Set(entries.map(([, capability]) => capability.publicLabel)).size, entries.length)

  for (const [key, capability] of entries) {
    assert.ok(['unavailable', 'preview', 'beta', 'live'].includes(capability.state), `${key}: invalid state`)
    assert.ok(capability.owner.trim(), `${key}: missing owner`)
    assert.ok(capability.publicLabel.trim(), `${key}: missing public label`)
    if (capability.state === 'live') assert.ok(capability.proof.trim(), `${key}: live capability needs proof`)
    if (capability.state === 'unavailable') assert.equal(capability.proof, '', `${key}: unavailable capability cannot cite live proof`)
  }

  for (const key of ['releases', 'performance', 'ai-analysis', 'notification-delivery', 'integrations', 'billing', 'enterprise-security', 'profile-writes', 'project-creation']) {
    assert.equal(catalog.capabilities[key].state, 'unavailable')
  }

  assert.deepEqual(
    runtimeProjection,
    {
      schemaVersion: catalog.schemaVersion,
      capabilities: Object.fromEntries(
        entries.map(([key, capability]) => [key, { state: capability.state }]),
      ),
    },
    'runtime capability projection drifted from the authoritative catalog',
  )
  assert.deepEqual(
    publicProjection,
    {
      schemaVersion: catalog.schemaVersion,
      capabilities: Object.fromEntries(
        entries
          .filter(([, capability]) => capability.state === 'live')
          .map(([key, capability]) => [key, { state: capability.state, publicLabel: capability.publicLabel }]),
      ),
    },
    'public capability projection drifted from live catalog entries',
  )
})

test('dashboard route map exposes exactly the live launch routes', () => {
  const routeMap = read('mesher/client/components/dashboard/dashboard-route-map.ts')
  assert.match(routeMap, /DASHBOARD_ROUTE_KEYS\s*=\s*\[\s*'issues',\s*'alerts',\s*'settings',?\s*\]/)
  assert.match(routeMap, /isCapabilityLive\(route\.capability\)/)

  for (const route of expectedRoutes) {
    const block = routeMap.match(new RegExp(`${route.key}:\\s*\\{[\\s\\S]*?\\n\\s*\\},`))?.[0] ?? ''
    assert.match(block, new RegExp(`pathname:\\s*'${route.pathname === '/' ? '\\/' : route.pathname}'`), `${route.key}: pathname drifted`)
    assert.match(block, new RegExp(`capability:\\s*'${route.capability}'`), `${route.key}: capability drifted`)
    assert.equal(catalog.capabilities[route.capability].state, 'live')
    assert.ok(existsSync(path.join(clientRoot, 'src/routes', route.routeFile)), `${route.routeFile} is missing`)
  }

  assert.doesNotMatch(routeMap, /performance|releases/i)
  assert.equal(existsSync(path.join(clientRoot, 'src/routes/_dashboard.performance.tsx')), false)
  assert.equal(existsSync(path.join(clientRoot, 'src/routes/_dashboard.releases.tsx')), false)
})

test('production dashboard source cannot import or embed seeded product records', () => {
  const files = productionClientSources()
  assert.equal(existsSync(path.join(clientRoot, 'lib/mock-data.ts')), false)
  assertSourceAbsent(files, /(?:from|import\()\s*['"][^'"]*mock-data/i, 'mock-data import found')
  assertSourceAbsent(files, /\b(?:MOCK_ISSUES|MOCK_ALERTS|MOCK_RELEASES|MOCK_TRANSACTIONS)\b/, 'seeded mock constant found')
  assertSourceAbsent(files, /data-source\s*=\s*['"](?:mock|mock-only|shell-only|fallback)['"]/i, 'non-live production source marker found')
  assertSourceAbsent(files, /\/api\/v1\/(?:projects|orgs)\/default\b/, 'compile-time default tenant path found')
  assertSourceAbsent(files, /\b(?:Alex Chen|acme-corp|Web Platform)\b/, 'hardcoded identity or project found')
})

test('removed dashboard modules and controls stay absent', () => {
  const removedFiles = [
    'components/dashboard/ai-panel.tsx',
    'components/dashboard/performance-page.tsx',
    'components/dashboard/releases-page.tsx',
    'components/dashboard/transaction-list.tsx',
    'components/dashboard/release-list.tsx',
  ]
  for (const relativePath of removedFiles) {
    assert.equal(existsSync(path.join(clientRoot, relativePath)), false, `${relativePath} returned`)
  }

  const visibleDashboard = [
    read('mesher/client/components/dashboard/sidebar.tsx'),
    read('mesher/client/components/dashboard/issue-detail.tsx'),
    read('mesher/client/components/dashboard/alert-detail.tsx'),
    read('mesher/client/components/dashboard/settings/settings-page.tsx'),
  ].join('\n')
  for (const label of ['AI Analysis', 'Performance', 'Releases', 'Integrations', 'Billing', 'Security', 'Notifications', 'Profile', 'PagerDuty', 'Slack']) {
    assert.doesNotMatch(visibleDashboard, new RegExp(`(?:>|['"])${label}(?:<|['"])`, 'i'), `${label} returned to production UI`)
  }
})

test('authenticated project context drives project-scoped reads', () => {
  const auth = read('mesher/api/auth.mpl')
  const queries = read('mesher/storage/queries.mpl')
  const session = read('mesher/client/components/dashboard/dashboard-session.tsx')
  const issues = read('mesher/client/components/dashboard/dashboard-issues-state.tsx')
  const alerts = read('mesher/client/components/dashboard/alerts-live-state.tsx')
  const settings = read('mesher/client/components/dashboard/settings/settings-live-state.tsx')

  assert.match(auth, /get_user_project_context/)
  assert.match(auth, /"memberships"/)
  assert.match(queries, /fn get_user_project_context/)
  assert.match(session, /fetchMesherSessionContext/)
  assert.match(session, /hyperpush\.active-project-id/)
  assert.match(issues, /fetchProjectDashboardBootstrap\(activeProject\.id/)
  assert.match(alerts, /fetchProjectAlerts\(activeProject\.id/)
  assert.match(settings, /const projectId = activeProject\?\.id/)
})

test('public feature and access surfaces consume the same live projection', () => {
  const features = read('mesher/landing/components/landing/features.tsx')
  const pricing = read('mesher/landing/components/landing/pricing.tsx')
  const clientProjection = read('mesher/client/lib/capabilities.ts')
  const publicProjection = read('mesher/landing/lib/capabilities.ts')

  assert.match(features, /livePublicCapabilities\(\)/)
  assert.match(pricing, /livePublicCapabilities\(\)/)
  assert.match(pricing, /No paid plans yet/)
  assert.match(clientProjection, /capabilities\.runtime\.json/)
  assert.match(publicProjection, /capabilities\.public\.json/)

  const publicSources = [
    path.join(landingRoot, 'app/layout.tsx'),
    path.join(landingRoot, 'app/mesh/page.tsx'),
    path.join(landingRoot, 'app/docs/page.tsx'),
    path.join(landingRoot, 'app/docs/layout.tsx'),
    ...collectSourceFiles(path.join(landingRoot, 'components/landing')),
    ...collectSourceFiles(path.join(landingRoot, 'lib/pitch')),
  ]
  assertSourceAbsent(
    publicSources,
    /AI[- ](?:powered|assisted)|AI root-cause|Performance Monitoring|Release Health|Email alerts|PagerDuty|\$29|\$100|140% faster|99\.8% uptime|millions of events|verified recovery/i,
    'unsupported public claim found',
  )
})

test('route inventory and browser proof describe the closed launch surface', () => {
  const inventory = read('mesher/client/ROUTE-INVENTORY.md')
  const proof = read('mesher/client/tests/e2e/mock-surface-closeout.spec.ts')

  for (const route of expectedRoutes) {
    assert.ok(
      inventory.includes(`| \`${route.key}\` | \`${route.pathname}\` | \`live\` |`),
      `${route.key}: inventory row drifted`,
    )
  }
  assert.match(inventory, /\| `performance` \| `unavailable` \|/)
  assert.match(inventory, /\| `releases` \| `unavailable` \|/)
  assert.match(proof, /switches project context/)
  assert.match(proof, /blocks removed routes/)
  assert.match(proof, /without substituting seeded records/)
})

test('root release gate includes structural closeout verification', () => {
  const releaseGate = read('scripts/verify-platform.sh')
  const ci = read('.github/workflows/ci.yml')
  assert.match(releaseGate, /verify:route-inventory/)
  assert.match(releaseGate, /run test:e2e/)
  assert.match(ci, /verify-client-route-inventory\.test\.mjs/)
})
