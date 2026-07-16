import { readFileSync, existsSync } from 'node:fs'

export const EXPECTED_TOP_LEVEL_ROUTE_KEYS = [
  'issues',
  'performance',
  'releases',
  'alerts',
  'settings',
]

export const ALLOWED_TOP_LEVEL_CLASSIFICATIONS = ['mixed', 'mock-only']
export const MIXED_ROUTE_SECTIONS = ['issues', 'alerts', 'settings']
export const BACKEND_GAP_ROUTE_SECTIONS = [
  'issues',
  'alerts',
  'settings',
  'performance',
  'releases',
]
export const ALLOWED_MIXED_SURFACE_LEVELS = ['panel', 'subsection', 'tab', 'control']
export const ALLOWED_MIXED_SURFACE_CLASSIFICATIONS = ['mixed', 'live', 'mock-only', 'shell-only']
export const ALLOWED_BACKEND_GAP_STATUSES = ['covered', 'missing-payload', 'missing-controls', 'no-route-family']

export const RECOGNIZED_PROOF_SUITES = [
  'tests/e2e/dashboard-route-parity.spec.ts',
  'tests/e2e/seeded-walkthrough.spec.ts',
  'tests/e2e/issues-live-read.spec.ts',
  'tests/e2e/issues-live-actions.spec.ts',
  'tests/e2e/admin-ops-live.spec.ts',
]

const expectedRouteKeySet = new Set(EXPECTED_TOP_LEVEL_ROUTE_KEYS)
const allowedTopLevelClassificationSet = new Set(ALLOWED_TOP_LEVEL_CLASSIFICATIONS)
const allowedMixedSurfaceLevelSet = new Set(ALLOWED_MIXED_SURFACE_LEVELS)
const allowedMixedSurfaceClassificationSet = new Set(ALLOWED_MIXED_SURFACE_CLASSIFICATIONS)
const allowedBackendGapStatusSet = new Set(ALLOWED_BACKEND_GAP_STATUSES)
const recognizedProofSuiteSet = new Set(RECOGNIZED_PROOF_SUITES)
const mixedRouteSectionDefinitions = [
  { heading: '### Issues', routeSection: 'issues', displayName: 'Issues' },
  { heading: '### Alerts', routeSection: 'alerts', displayName: 'Alerts' },
  { heading: '### Settings', routeSection: 'settings', displayName: 'Settings' },
]
const backendGapSectionDefinitions = [
  { heading: '### Issues backend gaps', routeSection: 'issues', displayName: 'Issues' },
  { heading: '### Alerts backend gaps', routeSection: 'alerts', displayName: 'Alerts' },
  { heading: '### Settings backend gaps', routeSection: 'settings', displayName: 'Settings' },
  { heading: '### Performance backend gaps', routeSection: 'performance', displayName: 'Performance' },
  { heading: '### Releases backend gaps', routeSection: 'releases', displayName: 'Releases' },
]

function fail(message) {
  throw new Error(message)
}

function readRequiredText(filePath, label) {
  try {
    return readFileSync(filePath, 'utf8')
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    fail(`${label} is missing or unreadable at ${filePath}: ${reason}`)
  }
}

function splitMarkdownLines(markdown) {
  return markdown.split(/\r?\n/)
}

function findHeadingIndexAfter(lines, heading, startIndex, sourceLabel) {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (lines[index].trim() === heading) {
      return index
    }
  }

  const earlierHeadingIndex = lines.findIndex((line) => line.trim() === heading)

  if (earlierHeadingIndex >= 0) {
    fail(`${sourceLabel}: ${heading} table drifted out of order`)
  }

  fail(`${sourceLabel}: missing ${heading} table`)
}

function extractHeadingTableAtIndex(lines, headingIndex, heading, sourceLabel) {
  if (headingIndex < 0) {
    fail(`${sourceLabel}: missing ${heading} table`)
  }

  let cursor = headingIndex + 1
  while (cursor < lines.length && lines[cursor].trim() === '') {
    cursor += 1
  }

  const tableStart = cursor
  while (cursor < lines.length && lines[cursor].trim().startsWith('|')) {
    cursor += 1
  }

  const tableLines = lines.slice(tableStart, cursor).map((line) => line.trim()).filter(Boolean)

  if (tableLines.length === 0) {
    fail(`${sourceLabel}: missing ${heading} table`)
  }

  if (tableLines.length < 3) {
    fail(`${sourceLabel}: ${heading} table is incomplete`)
  }

  return {
    tableLines,
    nextIndex: cursor,
  }
}

function extractHeadingTableLines(lines, heading, sourceLabel) {
  const headingIndex = lines.findIndex((line) => line.trim() === heading)
  return extractHeadingTableAtIndex(lines, headingIndex, heading, sourceLabel).tableLines
}

function extractOrderedSectionTableLines(lines, sectionDefinitions, sourceLabel) {
  const tableLinesByRouteSection = new Map()
  let cursor = 0

  for (const sectionDefinition of sectionDefinitions) {
    const headingIndex = findHeadingIndexAfter(lines, sectionDefinition.heading, cursor, sourceLabel)
    const { tableLines, nextIndex } = extractHeadingTableAtIndex(
      lines,
      headingIndex,
      sectionDefinition.heading,
      sourceLabel,
    )

    tableLinesByRouteSection.set(sectionDefinition.routeSection, tableLines)
    cursor = nextIndex
  }

  return tableLinesByRouteSection
}

function splitTableRow(line, rowLabel, expectedColumns) {
  const cells = line.split('|').slice(1, -1).map((cell) => cell.trim())

  if (cells.length !== expectedColumns) {
    fail(`${rowLabel}: expected ${expectedColumns} columns, found ${cells.length}`)
  }

  return cells
}

function parseSingleBacktickedValue(cell, rowLabel, columnName) {
  const value = cell.match(/^`([^`]+)`$/)?.[1]

  if (!value) {
    fail(`${rowLabel}: ${columnName} cell must contain exactly one backticked value`)
  }

  return value
}

function parseRouteSurfaceKey(cell, rowLabel, expectedRouteSection) {
  const value = parseSingleBacktickedValue(cell, rowLabel, 'route surface key')
  const [routeSection, ...rest] = value.split('/')
  const surfaceKey = rest.join('/')

  if (!routeSection || !surfaceKey) {
    fail(`${rowLabel}: route surface key must use section/surface format`)
  }

  if (routeSection !== expectedRouteSection) {
    fail(`${rowLabel}: route surface key must stay within ${expectedRouteSection}/…, found ${value}`)
  }

  return {
    routeSection,
    surfaceKey,
    value,
  }
}

function normalizeStableRows(rows, label) {
  const byKey = new Map()

  for (const row of rows) {
    if (!expectedRouteKeySet.has(row.key)) {
      fail(`${label}: unknown route key ${JSON.stringify(row.key)}`)
    }
    if (byKey.has(row.key)) {
      fail(`${label}: duplicate route row for ${row.key}`)
    }
    if (typeof row.pathname !== 'string' || !row.pathname.startsWith('/')) {
      fail(`${label}: route ${row.key} has invalid pathname ${JSON.stringify(row.pathname)}`)
    }
    byKey.set(row.key, row)
  }

  if (byKey.size !== EXPECTED_TOP_LEVEL_ROUTE_KEYS.length) {
    fail(
      `${label}: expected exactly ${EXPECTED_TOP_LEVEL_ROUTE_KEYS.length} unique top-level rows, found ${byKey.size}`,
    )
  }

  return EXPECTED_TOP_LEVEL_ROUTE_KEYS.map((key) => {
    const row = byKey.get(key)
    if (!row) {
      fail(`${label}: missing top-level route row for ${key}`)
    }
    return row
  })
}

function normalizeMixedSurfaceRows(rows, { routeSection, displayName, sourceLabel }) {
  const bySurfaceKey = new Map()

  for (const row of rows) {
    if (bySurfaceKey.has(row.surfaceKey)) {
      fail(`${sourceLabel}: ${displayName}/${row.surfaceKey}: duplicate surface key`)
    }

    bySurfaceKey.set(row.surfaceKey, row)
  }

  return rows.map((row) => ({
    ...row,
    routeSection,
    rowKey: `${routeSection}:${row.surfaceKey}`,
  }))
}

function normalizeBackendGapRows(rows, { routeSection, displayName, sourceLabel }) {
  const bySurfaceKey = new Map()

  for (const row of rows) {
    if (bySurfaceKey.has(row.surfaceKey)) {
      fail(`${sourceLabel}: ${displayName}/${row.surfaceKey}: duplicate backend-gap row`)
    }

    bySurfaceKey.set(row.surfaceKey, row)
  }

  return rows.map((row) => ({
    ...row,
    routeSection,
    rowKey: `${routeSection}:${row.surfaceKey}`,
  }))
}

function parseEvidenceCell(cell, label, { kind, recognizedProofSuites = recognizedProofSuiteSet } = {}) {
  const references = [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1].trim())

  if (references.length === 0) {
    fail(`${label}: ${kind} evidence cell must contain at least one backticked reference`)
  }

  if (kind === 'proof') {
    for (const reference of references) {
      if (!recognizedProofSuites.has(reference)) {
        fail(`${label}: unrecognized proof suite ${JSON.stringify(reference)}`)
      }
    }
  }

  return references
}

function parseTopLevelInventoryTable(lines, { sourceLabel, recognizedProofSuites }) {
  const tableLines = extractHeadingTableLines(lines, '## Top-level inventory', sourceLabel)
  const dataLines = tableLines.slice(2)

  const rows = dataLines.map((line, index) => {
    const initialLabel = `${sourceLabel}: top-level row ${index + 1}`
    const cells = splitTableRow(line, initialLabel, 7)
    const [keyCell, pathnameCell, classificationCell, codeCell, proofCell, backendCell, boundaryCell] = cells

    const key = parseSingleBacktickedValue(keyCell, initialLabel, 'route key')
    const rowLabel = `${sourceLabel}: top-level row ${key}`
    const pathname = parseSingleBacktickedValue(pathnameCell, rowLabel, 'pathname')
    const classification = parseSingleBacktickedValue(classificationCell, rowLabel, 'classification')

    if (!allowedTopLevelClassificationSet.has(classification)) {
      fail(`${rowLabel}: unknown classification ${JSON.stringify(classification)}`)
    }
    if (!backendCell) {
      fail(`${rowLabel}: backend seam summary must not be blank`)
    }
    if (!boundaryCell) {
      fail(`${rowLabel}: boundary note must not be blank`)
    }

    return {
      key,
      pathname,
      classification,
      codeEvidence: parseEvidenceCell(codeCell, rowLabel, { kind: 'code' }),
      proofEvidence: parseEvidenceCell(proofCell, rowLabel, {
        kind: 'proof',
        recognizedProofSuites,
      }),
      backendSeamSummary: backendCell,
      boundaryNote: boundaryCell,
    }
  })

  return normalizeStableRows(rows, sourceLabel)
}

function parseMixedSurfaceSectionTable(
  lines,
  sectionDefinition,
  { sourceLabel, recognizedProofSuites, tableLines } = {},
) {
  const { heading, routeSection, displayName } = sectionDefinition
  const resolvedTableLines = tableLines ?? extractHeadingTableLines(lines, heading, sourceLabel)
  const dataLines = resolvedTableLines.slice(2)

  const rows = dataLines.map((line, index) => {
    const initialLabel = `${sourceLabel}: ${displayName} row ${index + 1}`
    const cells = splitTableRow(line, initialLabel, 7)
    const [surfaceKeyCell, levelCell, classificationCell, codeCell, proofCell, liveSeamCell, boundaryCell] = cells

    const surfaceKey = parseSingleBacktickedValue(surfaceKeyCell, initialLabel, 'surface key')
    const rowLabel = `${sourceLabel}: ${displayName}/${surfaceKey}`
    const level = parseSingleBacktickedValue(levelCell, rowLabel, 'level')
    const classification = parseSingleBacktickedValue(classificationCell, rowLabel, 'classification')

    if (!allowedMixedSurfaceLevelSet.has(level)) {
      fail(`${rowLabel}: unknown level ${JSON.stringify(level)}`)
    }
    if (!allowedMixedSurfaceClassificationSet.has(classification)) {
      fail(`${rowLabel}: unknown classification ${JSON.stringify(classification)}`)
    }
    if (!liveSeamCell) {
      fail(`${rowLabel}: live seam summary must not be blank`)
    }
    if (!boundaryCell) {
      fail(`${rowLabel}: boundary note must not be blank`)
    }

    return {
      surfaceKey,
      level,
      classification,
      codeEvidence: parseEvidenceCell(codeCell, rowLabel, { kind: 'code' }),
      proofEvidence: parseEvidenceCell(proofCell, rowLabel, {
        kind: 'proof',
        recognizedProofSuites,
      }),
      liveSeamSummary: liveSeamCell,
      boundaryNote: boundaryCell,
    }
  })

  return normalizeMixedSurfaceRows(rows, { routeSection, displayName, sourceLabel })
}

function parseBackendGapSectionTable(lines, sectionDefinition, { sourceLabel, tableLines } = {}) {
  const { heading, routeSection, displayName } = sectionDefinition
  const resolvedTableLines = tableLines ?? extractHeadingTableLines(lines, heading, sourceLabel)
  const dataLines = resolvedTableLines.slice(2)

  const rows = dataLines.map((line, index) => {
    const initialLabel = `${sourceLabel}: ${displayName} backend-gap row ${index + 1}`
    const cells = splitTableRow(line, initialLabel, 5)
    const [routeSurfaceCell, clientPromiseCell, backendSeamCell, supportStatusCell, remainingWorkCell] = cells

    const parsedRouteSurface = parseRouteSurfaceKey(routeSurfaceCell, initialLabel, routeSection)
    const rowLabel = `${sourceLabel}: ${displayName}/${parsedRouteSurface.surfaceKey}`
    const supportStatus = parseSingleBacktickedValue(supportStatusCell, rowLabel, 'support status')

    if (!allowedBackendGapStatusSet.has(supportStatus)) {
      fail(`${rowLabel}: unknown support status ${JSON.stringify(supportStatus)}`)
    }
    if (!clientPromiseCell) {
      fail(`${rowLabel}: client promise must not be blank`)
    }
    if (!backendSeamCell) {
      fail(`${rowLabel}: current backend seam must not be blank`)
    }
    if (!remainingWorkCell) {
      fail(`${rowLabel}: remaining backend work must not be blank`)
    }

    return {
      surfaceKey: parsedRouteSurface.surfaceKey,
      routeSurfaceKey: parsedRouteSurface.value,
      clientPromise: clientPromiseCell,
      currentBackendSeam: backendSeamCell,
      supportStatus,
      remainingBackendWork: remainingWorkCell,
    }
  })

  return normalizeBackendGapRows(rows, { routeSection, displayName, sourceLabel })
}

export function getRecognizedProofSuites(clientRoot) {
  const missingSuites = RECOGNIZED_PROOF_SUITES.filter((relativePath) => !existsSync(`${clientRoot}/${relativePath}`))

  if (missingSuites.length > 0) {
    fail(`recognized proof suite file is missing: ${missingSuites.join(', ')}`)
  }

  return new Set(RECOGNIZED_PROOF_SUITES)
}

export function parseDashboardRouteMapSource(source, { sourceLabel = 'dashboard-route-map.ts' } = {}) {
  const mapMatch = source.match(
    /export const DASHBOARD_ROUTE_MAP:[\s\S]*?=\s*{(?<body>[\s\S]*?)^}\n/m,
  )

  if (!mapMatch?.groups?.body) {
    fail(`${sourceLabel}: could not locate exported DASHBOARD_ROUTE_MAP object`)
  }

  const rows = []
  const entryPattern =
    /^\s*(?:'(?<propertyQuoted>[^']+)'|(?<propertyBare>[a-z][\w-]*)):\s*{\s*\n\s*key:\s*'(?<key>[^']+)'\s*,\s*\n\s*pathname:\s*'(?<pathname>[^']+)'\s*,/gm

  for (const match of mapMatch.groups.body.matchAll(entryPattern)) {
    const propertyKey = match.groups?.propertyQuoted ?? match.groups?.propertyBare
    const key = match.groups?.key
    const pathname = match.groups?.pathname

    if (!propertyKey || !key || !pathname) {
      fail(`${sourceLabel}: encountered a malformed DASHBOARD_ROUTE_MAP entry`)
    }

    if (propertyKey !== key) {
      fail(`${sourceLabel}: route entry key mismatch between property ${propertyKey} and key field ${key}`)
    }

    rows.push({
      key,
      pathname,
    })
  }

  return normalizeStableRows(rows, sourceLabel)
}

export function readDashboardRouteMap(routeMapPath) {
  return parseDashboardRouteMapSource(readRequiredText(routeMapPath, 'dashboard route map'), {
    sourceLabel: routeMapPath,
  })
}

export function parseRouteInventoryDocument(markdown, {
  sourceLabel = 'ROUTE-INVENTORY.md',
  recognizedProofSuites = recognizedProofSuiteSet,
} = {}) {
  const lines = splitMarkdownLines(markdown)
  const topLevelRows = parseTopLevelInventoryTable(lines, { sourceLabel, recognizedProofSuites })
  const orderedMixedSurfaceTables = extractOrderedSectionTableLines(
    lines,
    mixedRouteSectionDefinitions,
    sourceLabel,
  )
  const mixedSurfaceSections = Object.fromEntries(
    mixedRouteSectionDefinitions.map((sectionDefinition) => [
      sectionDefinition.routeSection,
      parseMixedSurfaceSectionTable(lines, sectionDefinition, {
        sourceLabel,
        recognizedProofSuites,
        tableLines: orderedMixedSurfaceTables.get(sectionDefinition.routeSection),
      }),
    ]),
  )
  const mixedSurfaceRows = MIXED_ROUTE_SECTIONS.flatMap((routeSection) => mixedSurfaceSections[routeSection])
  const orderedBackendGapTables = extractOrderedSectionTableLines(
    lines,
    backendGapSectionDefinitions,
    sourceLabel,
  )
  const backendGapSections = Object.fromEntries(
    backendGapSectionDefinitions.map((sectionDefinition) => [
      sectionDefinition.routeSection,
      parseBackendGapSectionTable(lines, sectionDefinition, {
        sourceLabel,
        tableLines: orderedBackendGapTables.get(sectionDefinition.routeSection),
      }),
    ]),
  )
  const backendGapRows = BACKEND_GAP_ROUTE_SECTIONS.flatMap(
    (routeSection) => backendGapSections[routeSection],
  )

  return {
    topLevelRows,
    mixedSurfaceSections,
    mixedSurfaceRows,
    backendGapSections,
    backendGapRows,
  }
}

export function parseRouteInventoryMarkdown(markdown, options = {}) {
  return parseRouteInventoryDocument(markdown, options).topLevelRows
}

export function readRouteInventoryDocument(inventoryPath, options = {}) {
  return parseRouteInventoryDocument(readRequiredText(inventoryPath, 'route inventory document'), {
    sourceLabel: inventoryPath,
    ...options,
  })
}

export function readRouteInventory(inventoryPath, options = {}) {
  return readRouteInventoryDocument(inventoryPath, options).topLevelRows
}
