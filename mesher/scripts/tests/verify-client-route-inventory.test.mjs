import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  BACKEND_GAP_ROUTE_SECTIONS,
  EXPECTED_TOP_LEVEL_ROUTE_KEYS,
  MIXED_ROUTE_SECTIONS,
  RECOGNIZED_PROOF_SUITES,
  getRecognizedProofSuites,
  parseDashboardRouteMapSource,
  parseRouteInventoryDocument,
  parseRouteInventoryMarkdown,
  readDashboardRouteMap,
  readRouteInventory,
  readRouteInventoryDocument,
} from '../lib/client-route-inventory.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const mesherRoot = path.resolve(__dirname, '../..')
const clientRoot = path.join(mesherRoot, 'client')
const routeMapPath = path.join(clientRoot, 'components/dashboard/dashboard-route-map.ts')
const inventoryPath = path.join(clientRoot, 'ROUTE-INVENTORY.md')
const seedLiveIssueScriptPath = path.join(mesherRoot, 'scripts/seed-live-issue.sh')
const verifyScriptPath = path.join(mesherRoot, 'scripts/verify-client-route-inventory.sh')
const rootWrapperPath = path.resolve(mesherRoot, '..', 'scripts/verify-m061-s04.sh')
const clientPackageJsonPath = path.join(clientRoot, 'package.json')
const clientReadmePath = path.join(clientRoot, 'README.md')
const productRootReadmePath = path.resolve(mesherRoot, '..', 'README.md')
const ciWorkflowPath = path.resolve(mesherRoot, '..', '.github/workflows/ci.yml')

const expectedVerifierProofFiles = [
  'dashboard-route-parity.spec.ts',
  'issues-live-read.spec.ts',
  'issues-live-actions.spec.ts',
  'admin-ops-live.spec.ts',
  'seeded-walkthrough.spec.ts',
]

const expectedRetainedProofBundleFiles = [
  'full-contract.log',
  'phase-report.txt',
  'status.txt',
  'current-phase.txt',
  'route-inventory-structure.log',
  'seed-live-issue.log',
  'seed-live-admin-ops.log',
  'route-inventory-dev.log',
  'route-inventory-prod.log',
  'route-inventory-dev.validation.log',
  'route-inventory-prod.validation.log',
  'proof-inputs/mesher.scripts.verify-client-route-inventory.sh',
  'proof-inputs/mesher.scripts.tests.verify-client-route-inventory.test.mjs',
  'proof-inputs/client.ROUTE-INVENTORY.md',
  'proof-inputs/client.README.md',
  'proof-inputs/client.package.json',
  'proof-inputs/client.playwright.config.ts',
  'proof-inputs/proof-inputs.meta.json',
]

const expectedClassificationByKey = {
  issues: 'mixed',
  performance: 'mock-only',
  releases: 'mock-only',
  alerts: 'mixed',
  settings: 'mixed',
}

const expectedMixedSurfaceRowsBySection = {
  issues: [
    { routeSection: 'issues', surfaceKey: 'overview', level: 'panel', classification: 'mixed' },
    { routeSection: 'issues', surfaceKey: 'list', level: 'subsection', classification: 'mixed' },
    { routeSection: 'issues', surfaceKey: 'detail', level: 'panel', classification: 'mixed' },
    { routeSection: 'issues', surfaceKey: 'live-actions', level: 'control', classification: 'live' },
    { routeSection: 'issues', surfaceKey: 'shell-controls', level: 'control', classification: 'shell-only' },
    { routeSection: 'issues', surfaceKey: 'proof-harness', level: 'control', classification: 'shell-only' },
  ],
  alerts: [
    { routeSection: 'alerts', surfaceKey: 'overview', level: 'panel', classification: 'mixed' },
    { routeSection: 'alerts', surfaceKey: 'list', level: 'subsection', classification: 'mixed' },
    { routeSection: 'alerts', surfaceKey: 'detail', level: 'panel', classification: 'mixed' },
    { routeSection: 'alerts', surfaceKey: 'live-actions', level: 'control', classification: 'live' },
    { routeSection: 'alerts', surfaceKey: 'shell-controls', level: 'control', classification: 'shell-only' },
  ],
  settings: [
    { routeSection: 'settings', surfaceKey: 'general', level: 'panel', classification: 'mixed' },
    { routeSection: 'settings', surfaceKey: 'team', level: 'panel', classification: 'live' },
    { routeSection: 'settings', surfaceKey: 'api-keys', level: 'panel', classification: 'live' },
    { routeSection: 'settings', surfaceKey: 'alert-rules', level: 'panel', classification: 'live' },
    { routeSection: 'settings', surfaceKey: 'alert-channels', level: 'subsection', classification: 'shell-only' },
    { routeSection: 'settings', surfaceKey: 'integrations', level: 'tab', classification: 'mock-only' },
    { routeSection: 'settings', surfaceKey: 'billing', level: 'tab', classification: 'mock-only' },
    { routeSection: 'settings', surfaceKey: 'security', level: 'tab', classification: 'mock-only' },
    { routeSection: 'settings', surfaceKey: 'notifications', level: 'tab', classification: 'mock-only' },
    { routeSection: 'settings', surfaceKey: 'profile', level: 'tab', classification: 'mock-only' },
  ],
}

const expectedMixedSurfaceRows = MIXED_ROUTE_SECTIONS.flatMap(
  (routeSection) => expectedMixedSurfaceRowsBySection[routeSection],
)

const expectedBackendGapRowsBySection = {
  issues: [
    { routeSection: 'issues', surfaceKey: 'overview', supportStatus: 'missing-payload' },
    { routeSection: 'issues', surfaceKey: 'detail', supportStatus: 'missing-payload' },
    { routeSection: 'issues', surfaceKey: 'live-actions', supportStatus: 'covered' },
    { routeSection: 'issues', surfaceKey: 'shell-controls', supportStatus: 'no-route-family' },
  ],
  alerts: [
    { routeSection: 'alerts', surfaceKey: 'overview', supportStatus: 'missing-payload' },
    { routeSection: 'alerts', surfaceKey: 'detail', supportStatus: 'missing-payload' },
    { routeSection: 'alerts', surfaceKey: 'live-actions', supportStatus: 'covered' },
    { routeSection: 'alerts', surfaceKey: 'shell-controls', supportStatus: 'missing-controls' },
  ],
  settings: [
    { routeSection: 'settings', surfaceKey: 'general', supportStatus: 'missing-controls' },
    { routeSection: 'settings', surfaceKey: 'team', supportStatus: 'covered' },
    { routeSection: 'settings', surfaceKey: 'api-keys', supportStatus: 'covered' },
    { routeSection: 'settings', surfaceKey: 'alert-rules', supportStatus: 'covered' },
    { routeSection: 'settings', surfaceKey: 'alert-channels', supportStatus: 'no-route-family' },
  ],
  performance: [
    { routeSection: 'performance', surfaceKey: 'overview', supportStatus: 'no-route-family' },
    { routeSection: 'performance', surfaceKey: 'transactions', supportStatus: 'no-route-family' },
  ],
  releases: [
    { routeSection: 'releases', surfaceKey: 'list', supportStatus: 'no-route-family' },
    { routeSection: 'releases', surfaceKey: 'detail', supportStatus: 'no-route-family' },
    { routeSection: 'releases', surfaceKey: 'actions', supportStatus: 'no-route-family' },
  ],
}

const expectedBackendGapRows = BACKEND_GAP_ROUTE_SECTIONS.flatMap(
  (routeSection) => expectedBackendGapRowsBySection[routeSection],
)

function sectionBlockPattern(heading) {
  return new RegExp(`\n${escapeRegExp(`### ${heading}`)}\n[\\s\\S]*?(?=\n### |\n## |$)`, 'm')
}

function inventoryMutation(markdown, original, replacement) {
  assert.match(markdown, new RegExp(escapeRegExp(original)))
  return markdown.replace(original, replacement)
}

function removeSection(markdown, heading) {
  const pattern = sectionBlockPattern(heading)
  assert.match(markdown, pattern)
  return markdown.replace(pattern, '\n')
}

function moveSectionBefore(markdown, headingToMove, targetHeading) {
  const sectionPattern = sectionBlockPattern(headingToMove)
  const targetPattern = new RegExp(`\n${escapeRegExp(`### ${targetHeading}`)}\n`, 'm')
  const sectionMatch = markdown.match(sectionPattern)

  assert.ok(sectionMatch?.[0], `missing section ${headingToMove}`)
  assert.match(markdown, targetPattern)

  const withoutSection = markdown.replace(sectionPattern, '\n')
  return withoutSection.replace(targetPattern, `${sectionMatch[0]}\n### ${targetHeading}\n`)
}

function assertKeyPathParity(routeMapRows, inventoryRows, sourceLabel) {
  const actual = inventoryRows.map(({ key, pathname }) => ({ key, pathname }))
  const expected = routeMapRows.map(({ key, pathname }) => ({ key, pathname }))

  try {
    assert.deepStrictEqual(actual, expected)
  } catch (error) {
    throw new Error(`${sourceLabel}: key/path parity drifted`, { cause: error })
  }
}

function assertMixedSurfaceContract(document, sourceLabel) {
  assert.deepStrictEqual(Object.keys(document.mixedSurfaceSections), MIXED_ROUTE_SECTIONS)

  for (const routeSection of MIXED_ROUTE_SECTIONS) {
    const actualRows = document.mixedSurfaceSections[routeSection]
    const expectedRows = expectedMixedSurfaceRowsBySection[routeSection]
    const displayRouteSection = routeSection

    for (let index = 0; index < Math.max(actualRows.length, expectedRows.length); index += 1) {
      const actualRow = actualRows[index]
      const expectedRow = expectedRows[index]

      if (!expectedRow && actualRow) {
        throw new Error(
          `${sourceLabel}: ${actualRow.routeSection}/${actualRow.surfaceKey}: unexpected extra mixed-surface row at position ${index + 1}`,
        )
      }

      if (expectedRow && !actualRow) {
        throw new Error(
          `${sourceLabel}: ${expectedRow.routeSection}/${expectedRow.surfaceKey}: missing mixed-surface row at position ${index + 1}`,
        )
      }

      if (!expectedRow || !actualRow) {
        continue
      }

      const expectedKey = `${expectedRow.routeSection}/${expectedRow.surfaceKey}`
      const actualKey = `${actualRow.routeSection}/${actualRow.surfaceKey}`

      if (expectedKey !== actualKey) {
        throw new Error(
          `${sourceLabel}: expected mixed-surface row ${expectedKey} at position ${index + 1}, found ${actualKey}`,
        )
      }

      if (actualRow.level !== expectedRow.level) {
        throw new Error(
          `${sourceLabel}: ${expectedKey}: expected level ${JSON.stringify(expectedRow.level)}, found ${JSON.stringify(actualRow.level)}`,
        )
      }

      if (actualRow.classification !== expectedRow.classification) {
        throw new Error(
          `${sourceLabel}: ${expectedKey}: expected classification ${JSON.stringify(expectedRow.classification)}, found ${JSON.stringify(actualRow.classification)}`,
        )
      }

      assert.ok(actualRow.codeEvidence.length > 0, `${sourceLabel}: ${expectedKey}: code evidence should not be blank`)
      assert.ok(actualRow.proofEvidence.length > 0, `${sourceLabel}: ${expectedKey}: proof evidence should not be blank`)
      assert.ok(actualRow.liveSeamSummary.length > 0, `${sourceLabel}: ${expectedKey}: live seam summary should not be blank`)
      assert.ok(actualRow.boundaryNote.length > 0, `${sourceLabel}: ${expectedKey}: boundary note should not be blank`)
      for (const proofReference of actualRow.proofEvidence) {
        assert.ok(
          RECOGNIZED_PROOF_SUITES.includes(proofReference),
          `${sourceLabel}: ${expectedKey}: cited an unrecognized proof suite: ${proofReference}`,
        )
      }
    }

    assert.ok(actualRows.length === expectedRows.length, `${displayRouteSection}: mixed-surface row count drifted`)
  }

  assert.deepStrictEqual(
    document.mixedSurfaceRows.map(({ rowKey }) => rowKey),
    expectedMixedSurfaceRows.map(({ routeSection, surfaceKey }) => `${routeSection}:${surfaceKey}`),
  )
}

function assertBackendGapContract(document, sourceLabel) {
  assert.deepStrictEqual(Object.keys(document.backendGapSections), BACKEND_GAP_ROUTE_SECTIONS)

  for (const routeSection of BACKEND_GAP_ROUTE_SECTIONS) {
    const actualRows = document.backendGapSections[routeSection]
    const expectedRows = expectedBackendGapRowsBySection[routeSection]

    for (let index = 0; index < Math.max(actualRows.length, expectedRows.length); index += 1) {
      const actualRow = actualRows[index]
      const expectedRow = expectedRows[index]

      if (!expectedRow && actualRow) {
        throw new Error(
          `${sourceLabel}: ${actualRow.routeSection}/${actualRow.surfaceKey}: unexpected extra backend-gap row at position ${index + 1}`,
        )
      }

      if (expectedRow && !actualRow) {
        throw new Error(
          `${sourceLabel}: ${expectedRow.routeSection}/${expectedRow.surfaceKey}: missing backend-gap row at position ${index + 1}`,
        )
      }

      if (!expectedRow || !actualRow) {
        continue
      }

      const expectedKey = `${expectedRow.routeSection}/${expectedRow.surfaceKey}`
      const actualKey = `${actualRow.routeSection}/${actualRow.surfaceKey}`

      if (expectedKey !== actualKey) {
        throw new Error(
          `${sourceLabel}: expected backend-gap row ${expectedKey} at position ${index + 1}, found ${actualKey}`,
        )
      }

      if (actualRow.supportStatus !== expectedRow.supportStatus) {
        throw new Error(
          `${sourceLabel}: ${expectedKey}: expected support status ${JSON.stringify(expectedRow.supportStatus)}, found ${JSON.stringify(actualRow.supportStatus)}`,
        )
      }

      assert.ok(actualRow.clientPromise.length > 0, `${sourceLabel}: ${expectedKey}: client promise should not be blank`)
      assert.ok(actualRow.currentBackendSeam.length > 0, `${sourceLabel}: ${expectedKey}: current backend seam should not be blank`)
      assert.ok(actualRow.remainingBackendWork.length > 0, `${sourceLabel}: ${expectedKey}: remaining backend work should not be blank`)
    }

    assert.ok(actualRows.length === expectedRows.length, `${routeSection}: backend-gap row count drifted`)
  }

  assert.deepStrictEqual(
    document.backendGapRows.map(({ rowKey }) => rowKey),
    expectedBackendGapRows.map(({ routeSection, surfaceKey }) => `${routeSection}:${surfaceKey}`),
  )
}

test('client route inventory matches the canonical route map and mixed-surface contract', () => {
  const recognizedProofSuites = getRecognizedProofSuites(clientRoot)
  const inventoryMarkdown = readFile(inventoryPath)
  const routeMapRows = readDashboardRouteMap(routeMapPath)
  const inventoryRows = readRouteInventory(inventoryPath, { recognizedProofSuites })
  const wrappedInventoryRows = parseRouteInventoryMarkdown(inventoryMarkdown, { recognizedProofSuites })
  const inventoryDocument = readRouteInventoryDocument(inventoryPath, { recognizedProofSuites })

  assert.deepStrictEqual(
    routeMapRows.map(({ key }) => key),
    EXPECTED_TOP_LEVEL_ROUTE_KEYS,
  )
  assert.deepStrictEqual(
    inventoryRows.map(({ key }) => key),
    EXPECTED_TOP_LEVEL_ROUTE_KEYS,
  )
  assert.deepStrictEqual(wrappedInventoryRows, inventoryRows)
  assert.deepStrictEqual(inventoryDocument.topLevelRows, inventoryRows)
  assertKeyPathParity(routeMapRows, inventoryRows, inventoryPath)

  const actualClassificationByKey = Object.fromEntries(
    inventoryRows.map(({ key, classification }) => [key, classification]),
  )
  assert.deepStrictEqual(actualClassificationByKey, expectedClassificationByKey)

  assert.equal(
    inventoryRows.filter((row) => row.classification === 'mock-only').length,
    2,
  )
  assert.equal(
    inventoryRows.filter((row) => row.classification === 'mixed').length,
    3,
  )
  assert.ok(
    inventoryDocument.backendGapRows.length > inventoryRows.length,
    'document-level helper should expose backend-gap rows beyond the top-level wrapper contract',
  )

  for (const row of inventoryRows) {
    assert.ok(row.codeEvidence.length > 0, `${row.key} should keep code evidence`)
    assert.ok(row.proofEvidence.length > 0, `${row.key} should keep proof evidence`)
    for (const proofReference of row.proofEvidence) {
      assert.ok(
        recognizedProofSuites.has(proofReference),
        `${row.key} cited an unrecognized proof suite: ${proofReference}`,
      )
    }
  }

  assertMixedSurfaceContract(inventoryDocument, inventoryPath)
  assertBackendGapContract(inventoryDocument, inventoryPath)
})

test('inventory parser fails closed on missing inventory files', () => {
  assert.throws(
    () => readRouteInventoryDocument(path.join(clientRoot, 'DOES-NOT-EXIST.md')),
    /route inventory document is missing or unreadable/i,
  )
})

test('route-map parser fails closed when the exported map name drifts', () => {
  const routeMapSource = readFile(routeMapPath)
  const driftedSource = routeMapSource.replace('export const DASHBOARD_ROUTE_MAP', 'export const DASHBOARD_ROUTE_ROWS')

  assert.throws(
    () => parseDashboardRouteMapSource(driftedSource, { sourceLabel: 'renamed-route-map.ts' }),
    /could not locate exported DASHBOARD_ROUTE_MAP object/i,
  )
})

test('inventory parser rejects malformed top-level rows and parity drift', () => {
  const inventoryMarkdown = readFile(inventoryPath)
  const routeMapRows = readDashboardRouteMap(routeMapPath)
  const recognizedProofSuites = new Set(RECOGNIZED_PROOF_SUITES)

  assert.throws(
    () => {
      const inventoryDocument = parseRouteInventoryDocument(
        inventoryMutation(inventoryMarkdown, '| `issues` | `/` | `mixed` |', '| `issues` | `/issues` | `mixed` |'),
        { sourceLabel: 'pathname-drift.md', recognizedProofSuites },
      )
      assertKeyPathParity(routeMapRows, inventoryDocument.topLevelRows, 'pathname-drift.md')
    },
    /key\/path parity drifted/i,
  )

  assert.throws(
    () =>
      parseRouteInventoryDocument(
        inventoryMutation(inventoryMarkdown, '| `settings` | `/settings` | `mixed` |', '| `settings` | `/settings` | `mixed live` |'),
        { sourceLabel: 'bad-top-level-classification.md', recognizedProofSuites },
      ),
    /top-level row settings: unknown classification/i,
  )

  assert.throws(
    () =>
      parseRouteInventoryDocument(
        inventoryMutation(
          inventoryMarkdown,
          '| `performance` | `/performance` | `mock-only` | `components/dashboard/performance-page.tsx` |',
          '| `performance` | `/performance` | `mock-only` |  |',
        ),
        { sourceLabel: 'blank-top-level-code.md', recognizedProofSuites },
      ),
    /top-level row performance: code evidence cell must contain at least one backticked reference/i,
  )

  assert.throws(
    () =>
      parseRouteInventoryDocument(
        inventoryMutation(
          inventoryMarkdown,
          '| `alerts` | `/alerts` | `mixed` | `components/dashboard/alerts-page.tsx`; `components/dashboard/alert-detail.tsx` | `tests/e2e/dashboard-route-parity.spec.ts`; `tests/e2e/admin-ops-live.spec.ts`; `tests/e2e/seeded-walkthrough.spec.ts` |',
          '| `alerts` | `/alerts` | `mixed` | `components/dashboard/alerts-page.tsx`; `components/dashboard/alert-detail.tsx` |  |',
        ),
        { sourceLabel: 'blank-top-level-proof.md', recognizedProofSuites },
      ),
    /top-level row alerts: proof evidence cell must contain at least one backticked reference/i,
  )

  assert.throws(
    () =>
      parseRouteInventoryDocument(
        inventoryMutation(
          inventoryMarkdown,
          '| `releases` | `/releases` | `mock-only` | `components/dashboard/releases-page.tsx` | `tests/e2e/dashboard-route-parity.spec.ts`; `tests/e2e/seeded-walkthrough.spec.ts` |',
          '| `releases` | `/releases` | `mock-only` | `components/dashboard/releases-page.tsx` | `tests/e2e/not-a-real-proof.spec.ts` |',
        ),
        { sourceLabel: 'unknown-top-level-proof.md', recognizedProofSuites },
      ),
    /top-level row releases: unrecognized proof suite/i,
  )
})

test('inventory parser rejects malformed mixed-surface rows and section tables', () => {
  const inventoryMarkdown = readFile(inventoryPath)
  const recognizedProofSuites = new Set(RECOGNIZED_PROOF_SUITES)

  assert.throws(
    () =>
      parseRouteInventoryDocument(removeSection(inventoryMarkdown, 'Alerts'), {
        sourceLabel: 'missing-alerts-section.md',
        recognizedProofSuites,
      }),
    /missing ### Alerts table/i,
  )

  assert.throws(
    () =>
      parseRouteInventoryDocument(
        inventoryMutation(
          inventoryMarkdown,
          '| `overview` | `panel` | `mixed` | `components/dashboard/issues-page.tsx`; `components/dashboard/stats-bar.tsx`; `components/dashboard/events-chart.tsx`; `data-testid="issues-shell"` |',
          '| `overview` | `panel` | `fallback` | `components/dashboard/issues-page.tsx`; `components/dashboard/stats-bar.tsx`; `components/dashboard/events-chart.tsx`; `data-testid="issues-shell"` |',
        ),
        { sourceLabel: 'fallback-mixed-row.md', recognizedProofSuites },
      ),
    /Issues\/overview: unknown classification "fallback"/i,
  )

  assert.throws(
    () =>
      parseRouteInventoryDocument(
        inventoryMutation(
          inventoryMarkdown,
          '| `proof-harness` | `control` | `shell-only` | `components/dashboard/issues-page.tsx`; `data-testid="issue-action-proof-harness"`; `data-testid="issue-action-proof-error"`; `data-testid="issue-action-proof-stage"` | `tests/e2e/issues-live-actions.spec.ts`; `tests/e2e/issues-live-read.spec.ts` | The retained proof rail drives unsupported and unknown-issue mutations through the real provider validation path so diagnostics remain observable. | This harness exists for verification and failure-path coverage only; it is not part of the supported maintainer action set. |',
          '| `shell-controls` | `control` | `shell-only` | `components/dashboard/issues-page.tsx`; `data-testid="issue-action-proof-harness"`; `data-testid="issue-action-proof-error"`; `data-testid="issue-action-proof-stage"` | `tests/e2e/issues-live-actions.spec.ts`; `tests/e2e/issues-live-read.spec.ts` | The retained proof rail drives unsupported and unknown-issue mutations through the real provider validation path so diagnostics remain observable. | This harness exists for verification and failure-path coverage only; it is not part of the supported maintainer action set. |',
        ),
        { sourceLabel: 'duplicate-mixed-surface.md', recognizedProofSuites },
      ),
    /Issues\/shell-controls: duplicate surface key/i,
  )

  assert.throws(
    () =>
      parseRouteInventoryDocument(
        inventoryMutation(
          inventoryMarkdown,
          '| `alert-channels` | `subsection` | `shell-only` | `components/dashboard/settings/settings-page.tsx`; `data-testid="settings-alert-channels-source-badge"`; `data-testid="settings-alert-channels-mock-only-banner"` |',
          '| `alert-channels` | `subsection` | `shell-only` |  |',
        ),
        { sourceLabel: 'blank-mixed-code.md', recognizedProofSuites },
      ),
    /Settings\/alert-channels: code evidence cell must contain at least one backticked reference/i,
  )

  assert.throws(
    () =>
      parseRouteInventoryDocument(
        inventoryMutation(
          inventoryMarkdown,
          '| `detail` | `panel` | `mixed` | `components/dashboard/alert-detail.tsx`; `data-testid="alert-detail-panel"`; `data-testid="alert-detail-live-banner"`; `data-testid="alert-detail-source-badge"` | `tests/e2e/admin-ops-live.spec.ts`; `tests/e2e/seeded-walkthrough.spec.ts` | Alert detail shows live status, source labeling, and history-backed lifecycle context for Mesher-returned alerts. | Unsupported fields remain visibly shell-backed, and a fallback detail banner is used when no live alert detail is available. |',
          '| `detail` | `panel` | `mixed` | `components/dashboard/alert-detail.tsx`; `data-testid="alert-detail-panel"`; `data-testid="alert-detail-live-banner"`; `data-testid="alert-detail-source-badge"` |  | Alert detail shows live status, source labeling, and history-backed lifecycle context for Mesher-returned alerts. | Unsupported fields remain visibly shell-backed, and a fallback detail banner is used when no live alert detail is available. |',
        ),
        { sourceLabel: 'blank-mixed-proof.md', recognizedProofSuites },
      ),
    /Alerts\/detail: proof evidence cell must contain at least one backticked reference/i,
  )

  assert.throws(
    () =>
      parseRouteInventoryDocument(
        inventoryMutation(
          inventoryMarkdown,
          '| `integrations` | `tab` | `mock-only` | `components/dashboard/settings/settings-page.tsx`; `data-testid="settings-integrations-mock-only-banner"` | `tests/e2e/seeded-walkthrough.spec.ts`; `tests/e2e/dashboard-route-parity.spec.ts` | Connected-service rows stay present so maintainers can see planned surfaces. | Configure and connect affordances are shell-only until dedicated backend routes exist. |',
          '| `integrations` | `tab` | `mock-only` | `components/dashboard/settings/settings-page.tsx`; `data-testid="settings-integrations-mock-only-banner"` | `tests/e2e/not-a-real-proof.spec.ts` | Connected-service rows stay present so maintainers can see planned surfaces. | Configure and connect affordances are shell-only until dedicated backend routes exist. |',
        ),
        { sourceLabel: 'unknown-mixed-proof.md', recognizedProofSuites },
      ),
    /Settings\/integrations: unrecognized proof suite/i,
  )
})

test('inventory parser rejects malformed backend-gap rows and section tables', () => {
  const inventoryMarkdown = readFile(inventoryPath)
  const recognizedProofSuites = new Set(RECOGNIZED_PROOF_SUITES)

  assert.throws(
    () =>
      parseRouteInventoryDocument(removeSection(inventoryMarkdown, 'Alerts backend gaps'), {
        sourceLabel: 'missing-alerts-backend-gap-section.md',
        recognizedProofSuites,
      }),
    /missing ### Alerts backend gaps table/i,
  )

  assert.throws(
    () =>
      parseRouteInventoryDocument(
        moveSectionBefore(inventoryMarkdown, 'Alerts backend gaps', 'Issues backend gaps'),
        {
          sourceLabel: 'backend-gap-section-order-drift.md',
          recognizedProofSuites,
        },
      ),
    /### Alerts backend gaps table drifted out of order/i,
  )

  assert.throws(
    () =>
      parseRouteInventoryDocument(
        inventoryMutation(
          inventoryMarkdown,
          '| `alerts/shell-controls` | Keep Silence or Unsnooze chrome visible next to the live alert actions without pretending that alert suppression already exists server-side. | The alert route family currently registers only `POST /api/v1/alerts/:id/acknowledge` and `POST /api/v1/alerts/:id/resolve`; copy-link is client-only chrome and no silence or unsnooze mutation exists. | `missing-controls` | Add explicit silence and unsnooze routes plus persistence semantics before enabling those controls as live backend actions. |',
          '| `alerts/shell-controls` | Keep Silence or Unsnooze chrome visible next to the live alert actions without pretending that alert suppression already exists server-side. | The alert route family currently registers only `POST /api/v1/alerts/:id/acknowledge` and `POST /api/v1/alerts/:id/resolve`; copy-link is client-only chrome and no silence or unsnooze mutation exists. | `partial` | Add explicit silence and unsnooze routes plus persistence semantics before enabling those controls as live backend actions. |',
        ),
        { sourceLabel: 'bad-backend-gap-status.md', recognizedProofSuites },
      ),
    /Alerts\/shell-controls: unknown support status "partial"/i,
  )

  assert.throws(
    () =>
      parseRouteInventoryDocument(
        inventoryMutation(
          inventoryMarkdown,
          '| `issues/live-actions` | Resolve, Reopen, and Ignore from the maintainer action row and then refresh the visible issue state from Mesher. | `mutateIssue()` posts to `POST /api/v1/issues/:id/{resolve,unresolve,archive}`, and `useDashboardIssuesState` re-runs the overview and selected-detail reads after the mutation. | `covered` | Keep this row covered; add new issue mutation routes before exposing more maintainer actions in the live action rail. |',
          '| `issues/detail` | Resolve, Reopen, and Ignore from the maintainer action row and then refresh the visible issue state from Mesher. | `mutateIssue()` posts to `POST /api/v1/issues/:id/{resolve,unresolve,archive}`, and `useDashboardIssuesState` re-runs the overview and selected-detail reads after the mutation. | `covered` | Keep this row covered; add new issue mutation routes before exposing more maintainer actions in the live action rail. |',
        ),
        { sourceLabel: 'duplicate-backend-gap-row.md', recognizedProofSuites },
      ),
    /Issues\/detail: duplicate backend-gap row/i,
  )

  assert.throws(
    () =>
      parseRouteInventoryDocument(
        inventoryMutation(
          inventoryMarkdown,
          '| `settings/general` | Edit live retention and sample-rate values, show live storage metrics, and keep the rest of the General tab honest about what is still shell-only. | `fetchDefaultProjectSettings()`, `updateDefaultProjectSettings()`, and `fetchDefaultProjectStorage()` target `GET/POST /api/v1/projects/default/settings` plus `GET /api/v1/projects/default/storage` through `useSettingsLiveState`. | `missing-controls` | Extend the settings payload and write routes for project name, description, default environment, public dashboard, and anonymous issue submission before turning those mock-only controls into real saves. |',
          '| `settings/general` | Edit live retention and sample-rate values, show live storage metrics, and keep the rest of the General tab honest about what is still shell-only. |  | `missing-controls` | Extend the settings payload and write routes for project name, description, default environment, public dashboard, and anonymous issue submission before turning those mock-only controls into real saves. |',
        ),
        { sourceLabel: 'blank-backend-gap-seam.md', recognizedProofSuites },
      ),
    /Settings\/general: current backend seam must not be blank/i,
  )

  assert.throws(
    () =>
      parseRouteInventoryDocument(
        inventoryMutation(
          inventoryMarkdown,
          '| `performance/transactions` | Search, filter, sort, and inspect transaction rows plus the slide-in transaction detail panel from the same Performance route. | No `/api/v1/projects/:project_id/performance` or transaction-trace read family is registered in `main.mpl`; `performance-page.tsx` filters `MOCK_TRANSACTIONS` locally and opens `TransactionDetail` over mock transaction data. | `no-route-family` | Add transaction-list and transaction-detail routes for latency spans, tags, and per-transaction diagnostics before promoting drill-down from shell behavior into backend truth. |',
          '| `performance/transactions` | Search, filter, sort, and inspect transaction rows plus the slide-in transaction detail panel from the same Performance route. | No `/api/v1/projects/:project_id/performance` or transaction-trace read family is registered in `main.mpl`; `performance-page.tsx` filters `MOCK_TRANSACTIONS` locally and opens `TransactionDetail` over mock transaction data. | `no-route-family` |  |',
        ),
        { sourceLabel: 'blank-backend-gap-remaining-work.md', recognizedProofSuites },
      ),
    /Performance\/transactions: remaining backend work must not be blank/i,
  )
})

test('mixed-surface contract points to the exact section and surface when row drift occurs', () => {
  const inventoryMarkdown = readFile(inventoryPath)
  const recognizedProofSuites = new Set(RECOGNIZED_PROOF_SUITES)
  const driftedDocument = parseRouteInventoryDocument(
    inventoryMutation(
      inventoryMarkdown,
      '| `live-actions` | `control` | `live` | `components/dashboard/alert-detail.tsx`; `data-testid="alert-detail-actions"`; `data-testid="alert-detail-action-source-note"` | `tests/e2e/admin-ops-live.spec.ts`; `tests/e2e/seeded-walkthrough.spec.ts` | Acknowledge and Resolve call the same-origin `/api/v1/alerts/...` lifecycle routes and keep mutation diagnostics mounted on failure. | These are only live when Mesher returned a live alert detail surface; action errors stay explicit and do not downgrade the durable row classification. |',
      '| `lifecycle-actions` | `control` | `live` | `components/dashboard/alert-detail.tsx`; `data-testid="alert-detail-actions"`; `data-testid="alert-detail-action-source-note"` | `tests/e2e/admin-ops-live.spec.ts`; `tests/e2e/seeded-walkthrough.spec.ts` | Acknowledge and Resolve call the same-origin `/api/v1/alerts/...` lifecycle routes and keep mutation diagnostics mounted on failure. | These are only live when Mesher returned a live alert detail surface; action errors stay explicit and do not downgrade the durable row classification. |',
    ),
    { sourceLabel: 'mixed-surface-order-drift.md', recognizedProofSuites },
  )

  assert.throws(
    () => assertMixedSurfaceContract(driftedDocument, 'mixed-surface-order-drift.md'),
    /expected mixed-surface row alerts\/live-actions at position 4, found alerts\/lifecycle-actions/i,
  )
})

test('backend-gap contract points to the exact section and surface when row drift occurs', () => {
  const inventoryMarkdown = readFile(inventoryPath)
  const recognizedProofSuites = new Set(RECOGNIZED_PROOF_SUITES)
  const driftedDocument = parseRouteInventoryDocument(
    inventoryMutation(
      inventoryMarkdown,
      '| `alerts/live-actions` | Acknowledge and Resolve a live alert from the detail footer and refresh the visible list/detail state from Mesher. | `acknowledgeAlert()` and `resolveAlert()` post to `POST /api/v1/alerts/:id/{acknowledge,resolve}`, then `useAlertsLiveState` refreshes `GET /api/v1/projects/default/alerts`. | `covered` | Keep this row covered; add any new alert lifecycle buttons only after the matching backend mutations exist. |',
      '| `alerts/lifecycle-actions` | Acknowledge and Resolve a live alert from the detail footer and refresh the visible list/detail state from Mesher. | `acknowledgeAlert()` and `resolveAlert()` post to `POST /api/v1/alerts/:id/{acknowledge,resolve}`, then `useAlertsLiveState` refreshes `GET /api/v1/projects/default/alerts`. | `covered` | Keep this row covered; add any new alert lifecycle buttons only after the matching backend mutations exist. |',
    ),
    { sourceLabel: 'backend-gap-row-order-drift.md', recognizedProofSuites },
  )

  assert.throws(
    () => assertBackendGapContract(driftedDocument, 'backend-gap-row-order-drift.md'),
    /expected backend-gap row alerts\/live-actions at position 3, found alerts\/lifecycle-actions/i,
  )
})

test('helper confirms the recognized proof-suite files still exist', () => {
  const suites = getRecognizedProofSuites(clientRoot)
  assert.deepStrictEqual([...suites], RECOGNIZED_PROOF_SUITES)
})

test('client verifier, root wrapper, readmes, and CI point to the canonical route inventory proof rail', () => {
  const packageJson = JSON.parse(readFile(clientPackageJsonPath))
  assert.equal(packageJson.scripts['verify:route-inventory'], 'bash ../scripts/verify-client-route-inventory.sh')

  const inventory = readFile(inventoryPath)
  assert.match(inventory, /^## Maintainer handoff$/m)
  assert.match(inventory, /^### Backend expansion order$/m)
  assert.match(inventory, /^### Proof commands to rerun$/m)
  assert.match(inventory, /bash scripts\/verify-m061-s04\.sh/)

  const readme = readFile(clientReadmePath)
  assert.match(readme, /`ROUTE-INVENTORY\.md` is the canonical maintainer-facing map/i)
  assert.match(readme, /README documents workflow and package boundaries; it is not the canonical route inventory/i)
  assert.match(readme, /ROUTE-INVENTORY\.md#maintainer-handoff/i)
  assert.match(readme, /bash scripts\/verify-m061-s04\.sh/)
  assert.match(readme, /npm --prefix mesher\/client run verify:route-inventory/)
  assert.match(readme, /npm run verify:route-inventory/)
  assert.match(readme, /mesher\/.tmp\/m061-s01\/verify-client-route-inventory\//)

  const productRootReadme = readFile(productRootReadmePath)
  assert.match(productRootReadme, /mesher\/client\/ROUTE-INVENTORY\.md/)
  assert.match(productRootReadme, /bash scripts\/verify-m061-s04\.sh/)
  assertContractNotPresent(productRootReadme, /mock-data TanStack dashboard/, productRootReadmePath, 'mock-data dashboard wording')

  const rootWrapper = readFile(rootWrapperPath)
  for (const needle of [
    '.tmp/m061-s04/verify',
    'DELEGATED_VERIFIER="$ROOT_DIR/mesher/scripts/verify-client-route-inventory.sh"',
    'DELEGATED_VERIFY_DIR="$ROOT_DIR/mesher/.tmp/m061-s01/verify-client-route-inventory"',
    '[verify-m061-s04] product-root wrapper delegating to bash mesher/scripts/verify-client-route-inventory.sh',
    'status.txt',
    'current-phase.txt',
    'phase-report.txt',
    'latest-proof-bundle.txt',
    'delegated-route-inventory',
    'delegated-artifacts',
    "$'route-inventory-structure\\tpassed'",
    "$'retained-proof-bundle\\tpassed'",
    'verify-m061-s04: ok',
  ]) {
    assert.match(rootWrapper, new RegExp(escapeRegExp(needle)))
  }

  const ciWorkflow = readFile(ciWorkflowPath)
  assert.match(ciWorkflow, /Verify client route-inventory structural contract/)
  assert.match(ciWorkflow, /node --test mesher\/scripts\/tests\/verify-client-route-inventory\.test\.mjs/)
  assertContractNotPresent(ciWorkflow, /verify-m061-s04\.sh/, ciWorkflowPath, 'local-only closeout wrapper command')
})

test('retained verifier keeps explicit phases, retained logs, proof inputs, and proof-suite coverage guards', () => {
  const verifierSource = readFile(verifyScriptPath)

  for (const needle of [
    '.tmp/m061-s01/verify-client-route-inventory',
    'full-contract.log',
    'phase-report.txt',
    'status.txt',
    'current-phase.txt',
    'latest-proof-bundle.txt',
    'retained-proof-bundle',
    "ROUTE_GREP='dashboard route parity|issues live|admin and ops live|seeded walkthrough'",
    'route-inventory-structure',
    'seed-live-issue',
    'seed-live-admin-ops',
    'route-inventory-dev',
    'route-inventory-prod',
    'retained-proof-bundle',
    'MESHER_SEED_ARTIFACT_DIR="$SEED_ARTIFACT_ROOT/seed-live-issue"',
    'MESHER_SEED_ARTIFACT_DIR="$SEED_ARTIFACT_ROOT/seed-live-admin-ops"',
    'node --test "$MESHER_ROOT/scripts/tests/verify-client-route-inventory.test.mjs"',
    'env PLAYWRIGHT_PROJECT=dev npm --prefix "$CLIENT_ROOT" exec -- playwright test --config "$CLIENT_ROOT/playwright.config.ts" --project=dev --grep "$ROUTE_GREP"',
    'env PLAYWRIGHT_PROJECT=prod npm --prefix "$CLIENT_ROOT" exec -- playwright test --config "$CLIENT_ROOT/playwright.config.ts" --project=prod --grep "$ROUTE_GREP"',
    'assert_retained_bundle_shape',
    'proof-inputs/proof-inputs.meta.json',
    'retained proof bundle pointer or artifact shape drifted',
    'named Playwright proof rail drifted, matched zero tests, or skipped required suites',
  ]) {
    assert.match(verifierSource, new RegExp(escapeRegExp(needle)))
  }

  for (const proofFile of expectedVerifierProofFiles) {
    assert.match(verifierSource, new RegExp(escapeRegExp(proofFile)))
  }

  for (const retainedFile of expectedRetainedProofBundleFiles) {
    assert.match(verifierSource, new RegExp(escapeRegExp(retainedFile)))
  }
})

test('maintainer handoff markers fail closed with source-aware messages', () => {
  const inventory = readFile(inventoryPath)
  assert.throws(
    () =>
      assertContractMarker(
        inventory.replace('## Maintainer handoff', '## Drifted handoff'),
        /^## Maintainer handoff$/m,
        inventoryPath,
        '## Maintainer handoff heading',
      ),
    new RegExp(escapeRegExp(`${inventoryPath}: missing ## Maintainer handoff heading`)),
  )

  const rootWrapper = readFile(rootWrapperPath)
  assert.throws(
    () =>
      assertContractMarker(
        rootWrapper.replace(
          'bash mesher/scripts/verify-client-route-inventory.sh',
          'bash mesher/scripts/verify-client-route-inventory-drift.sh',
        ),
        /bash mesher\/scripts\/verify-client-route-inventory\.sh/,
        rootWrapperPath,
        'delegated route-inventory command',
      ),
    new RegExp(escapeRegExp(`${rootWrapperPath}: missing delegated route-inventory command`)),
  )

  const ciWorkflow = readFile(ciWorkflowPath)
  assert.throws(
    () =>
      assertContractMarker(
        ciWorkflow.replace(
          'node --test mesher/scripts/tests/verify-client-route-inventory.test.mjs',
          'node --test mesher/scripts/tests/not-the-contract.test.mjs',
        ),
        /node --test mesher\/scripts\/tests\/verify-client-route-inventory\.test\.mjs/,
        ciWorkflowPath,
        'client structural contract command',
      ),
    new RegExp(escapeRegExp(`${ciWorkflowPath}: missing client structural contract command`)),
  )
})

test('seed-live-issue defaults to isolated startup when a backend already answers on the chosen port', async (t) => {
  const { server, port } = await startFakeMesherSettingsServer()
  const artifactDir = mkdtempSync(path.join(os.tmpdir(), 'mesher-seed-live-issue-'))

  t.after(async () => {
    server.close()
    await once(server, 'close')
    rmSync(artifactDir, { recursive: true, force: true })
  })

  const result = await runSeedLiveIssue({ port, artifactDir })

  assert.notEqual(result.exitCode, 0, 'seed-live-issue should fail fast without DATABASE_URL when isolation is required')
  assert.match(
    result.stderr,
    /ignoring existing backend at http:\/\/127\.0\.0\.1:\d+; starting isolated verification backend at http:\/\/127\.0\.0\.1:\d+/i,
  )
  assert.match(result.stderr, /DATABASE_URL must be set/i)
  assert.doesNotMatch(result.stderr, /reusing running Mesher/i)
})

test('seed-live-issue only reuses a running backend when explicitly requested', async (t) => {
  const { server, port } = await startFakeMesherSettingsServer()
  const artifactDir = mkdtempSync(path.join(os.tmpdir(), 'mesher-seed-live-issue-reuse-'))

  t.after(async () => {
    server.close()
    await once(server, 'close')
    rmSync(artifactDir, { recursive: true, force: true })
  })

  const result = await runSeedLiveIssue({ port, artifactDir, reuseRunningBackend: true })

  assert.notEqual(result.exitCode, 0, 'seed-live-issue should fail against the fake backend after opting into reuse')
  assert.match(result.stderr, /reusing running Mesher at http:\/\/127\.0\.0\.1:\d+/i)
  assert.doesNotMatch(result.stderr, /ignoring existing backend/i)
  assert.doesNotMatch(result.stderr, /DATABASE_URL must be set/i)
})

function startFakeMesherSettingsServer() {
  const server = createServer((req, res) => {
    if (req.url === '/api/v1/projects/default/settings') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ retention_days: 90 }))
      return
    }

    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found' }))
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('fake Mesher settings server did not expose a numeric port'))
        return
      }
      resolve({ server, port: address.port })
    })
  })
}

function runSeedLiveIssue({ port, artifactDir, reuseRunningBackend = false }) {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', [seedLiveIssueScriptPath], {
      cwd: mesherRoot,
      env: {
        ...process.env,
        BASE_URL: `http://127.0.0.1:${port}`,
        PORT: String(port),
        DATABASE_URL: '',
        MESHER_SEED_ARTIFACT_DIR: artifactDir,
        MESHER_REUSE_RUNNING_BACKEND: reuseRunningBackend ? 'true' : 'false',
        MESHER_WS_PORT: '',
        MESH_CLUSTER_PORT: '',
        MESH_NODE_NAME: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error('seed-live-issue test helper timed out'))
    }, 15000)

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.once('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once('close', (exitCode, signal) => {
      clearTimeout(timeout)
      resolve({ exitCode, signal, stdout, stderr })
    })
  })
}

function assertContractMarker(text, pattern, sourceLabel, markerLabel) {
  assert.match(text, pattern, `${sourceLabel}: missing ${markerLabel}`)
}

function assertContractNotPresent(text, pattern, sourceLabel, markerLabel) {
  assert.doesNotMatch(text, pattern, `${sourceLabel}: stale ${markerLabel}`)
}

function readFile(filePath) {
  return readFileSync(filePath, 'utf8')
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
