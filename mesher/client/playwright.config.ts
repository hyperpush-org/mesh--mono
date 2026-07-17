import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test'
import { resolveMesherBackendOrigin } from './mesher-backend-origin.mjs'

const devPort = 3000
const prodPort = 3001
const mesherBackendOrigin = resolveMesherBackendOrigin()
const mesherBackendPort = Number(
  mesherBackendOrigin.port || (mesherBackendOrigin.protocol === 'https:' ? '443' : '80'),
)
const mesherWsPort = Number(process.env.MESHER_WS_PORT || String(mesherBackendPort + 1))
const mesherClusterPort = Number(process.env.MESH_CLUSTER_PORT || String(mesherBackendPort + 1000))
const e2eSessionToken =
  process.env.MESHER_E2E_SESSION_TOKEN ||
  'hyperpush-e2e-session-token-0000000000000000000000000000'

type NamedProject = NonNullable<PlaywrightTestConfig['projects']>[number] & {
  name: string
}

type NamedWebServer = NonNullable<PlaywrightTestConfig['webServer']>[number] & {
  name: string
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

function parseBaseUrl(name: string, value: string, expectedPort: number) {
  const parsedBaseUrl = new URL(value)

  if (!['http:', 'https:'].includes(parsedBaseUrl.protocol)) {
    throw new Error(`Invalid ${name} protocol: ${parsedBaseUrl.protocol}`)
  }

  if (!['', '/'].includes(parsedBaseUrl.pathname)) {
    throw new Error(`${name} must point at the app origin, received path ${parsedBaseUrl.pathname}`)
  }

  if (parsedBaseUrl.hostname !== '127.0.0.1' && parsedBaseUrl.hostname !== 'localhost') {
    throw new Error(`${name} must target localhost or 127.0.0.1, received host ${parsedBaseUrl.hostname}`)
  }

  if (parsedBaseUrl.port !== String(expectedPort)) {
    throw new Error(`${name} must target port ${expectedPort}, received ${parsedBaseUrl.port || '(default)'}`)
  }

  return parsedBaseUrl
}

function parseMesherBackendUrl(origin: URL) {
  if (!['http:', 'https:'].includes(origin.protocol)) {
    throw new Error(`MESHER_BACKEND_ORIGIN must use http or https, received ${origin.protocol}`)
  }

  if (origin.hostname !== '127.0.0.1' && origin.hostname !== 'localhost') {
    throw new Error(
      `MESHER_BACKEND_ORIGIN must target localhost or 127.0.0.1 for Playwright e2e, received ${origin.hostname}`,
    )
  }

  return origin
}

function selectNamedItems<T extends { name: string }>(
  kind: string,
  items: T[],
  requestedProjectName: string | null,
) {
  if (!requestedProjectName) {
    return items
  }

  const selectedItem = items.find((item) => item.name === requestedProjectName)

  if (!selectedItem) {
    throw new Error(
      `Unknown ${kind} project "${requestedProjectName}". Expected one of: ${items
        .map((item) => item.name)
        .join(', ')}`,
    )
  }

  return [selectedItem]
}

function buildWebServers(
  backendOrigin: URL,
  frontendServers: NamedWebServer[],
  requestedProjectName: string | null,
) {
  const selectedFrontendServers = selectNamedItems('web server', frontendServers, requestedProjectName)
  const buildDir = '../../.tmp/playwright/mesher-backend'
  const backendCommand = [
    'set -euo pipefail',
    'DATABASE_URL="${DATABASE_URL:-postgres://postgres:postgres@127.0.0.1:5432/mesher}"',
    `BUILD_DIR=${shellQuote(buildDir)}`,
    'rm -rf "$BUILD_DIR"',
    'env DATABASE_URL="$DATABASE_URL" bash ../scripts/migrate.sh up',
    'env DATABASE_URL="$DATABASE_URL" MESHER_E2E_SESSION_TOKEN=' + shellQuote(e2eSessionToken) + ' bash ../scripts/seed-e2e-auth.sh',
    'bash ../scripts/build.sh "$BUILD_DIR"',
    'cd "$BUILD_DIR"',
    'DATABASE_URL="$DATABASE_URL" \\\nPORT=' + mesherBackendPort + ' \\\nMESHER_WS_PORT=' + mesherWsPort + ' \\\nMESH_CLUSTER_COOKIE="${MESH_CLUSTER_COOKIE:-dev-cookie}" \\\nMESH_NODE_NAME="${MESH_NODE_NAME:-mesher@127.0.0.1:' + mesherClusterPort + '}" \\\nMESH_DISCOVERY_SEED="${MESH_DISCOVERY_SEED:-localhost}" \\\nMESH_CLUSTER_PORT="${MESH_CLUSTER_PORT:-' + mesherClusterPort + '}" \\\nMESH_CONTINUITY_ROLE="${MESH_CONTINUITY_ROLE:-primary}" \\\nMESH_CONTINUITY_PROMOTION_EPOCH="${MESH_CONTINUITY_PROMOTION_EPOCH:-0}" \\\n./mesher',
  ].join('; ')

  return [
    {
      name: 'mesher-backend',
      command: `env -u npm_config_project bash -lc ${shellQuote(backendCommand)}`,
      port: Number(backendOrigin.port || String(mesherBackendPort)),
      timeout: 180_000,
      reuseExistingServer: false,
    },
    ...selectedFrontendServers,
  ].map(({ name: _name, ...server }) => server)
}

// `npm exec playwright test ... --project=dev` leaks the selection through npm_config_project
// instead of forwarding the flag to Playwright unless the caller inserts `--`. Honor that env
// here so the exact repo verification commands still start only the requested environment.
const requestedProjectName =
  process.env.PLAYWRIGHT_PROJECT?.trim() || process.env.npm_config_project?.trim() || null

const devBaseUrl = parseBaseUrl(
  'PLAYWRIGHT_BASE_URL',
  process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${devPort}`,
  devPort,
)
const prodBaseUrl = parseBaseUrl(
  'PLAYWRIGHT_PROD_BASE_URL',
  process.env.PLAYWRIGHT_PROD_BASE_URL ?? `http://127.0.0.1:${prodPort}`,
  prodPort,
)
const validatedMesherBackendOrigin = parseMesherBackendUrl(mesherBackendOrigin)

const projects: NamedProject[] = [
  {
    name: 'dev',
    use: {
      ...devices['Desktop Chrome'],
      baseURL: devBaseUrl.toString(),
      extraHTTPHeaders: { authorization: `Bearer ${e2eSessionToken}` },
    },
  },
  {
    name: 'prod',
    use: {
      ...devices['Desktop Chrome'],
      baseURL: prodBaseUrl.toString(),
      extraHTTPHeaders: { authorization: `Bearer ${e2eSessionToken}` },
    },
  },
]

const frontendWebServers: NamedWebServer[] = [
  {
    name: 'dev',
    command: `env -u npm_config_project MESHER_BACKEND_ORIGIN=${shellQuote(validatedMesherBackendOrigin.toString())} npm run dev -- --host 127.0.0.1 --port ${devPort}`,
    port: devPort,
    timeout: 30_000,
    reuseExistingServer: false,
  },
  {
    name: 'prod',
    command: `env -u npm_config_project MESHER_BACKEND_ORIGIN=${shellQuote(validatedMesherBackendOrigin.toString())} npm run build && env -u npm_config_project MESHER_BACKEND_ORIGIN=${shellQuote(validatedMesherBackendOrigin.toString())} PORT=${prodPort} npm run start`,
    port: prodPort,
    timeout: 180_000,
    reuseExistingServer: false,
  },
]

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  // These suites share one seeded local Mesher runtime and intentionally mutate real Issues,
  // Alerts, and Settings entities. Running files on multiple workers causes cross-file races
  // and false negatives in the canonical assembled shell rail.
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },
  projects: selectNamedItems('Playwright', projects, requestedProjectName),
  webServer: buildWebServers(validatedMesherBackendOrigin, frontendWebServers, requestedProjectName),
})
