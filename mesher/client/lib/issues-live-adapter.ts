import type {
  Breadcrumb,
  Issue,
  IssueEventSeriesPoint,
  IssuesOverviewStats,
  IssueStatus,
  Severity,
  StackFrame,
} from '@/lib/dashboard-types'
import {
  MesherApiError,
  type MesherApiRecord,
  type MesherDashboardBootstrapPayload,
  type MesherEventDetailResponse,
  type MesherIssueEventSummary,
  type MesherIssueTimelineEntry,
} from '@/lib/mesher-api'

export type IssuesOverviewSource = 'live'
export type IssueSummaryFieldSource = 'live' | 'derived-live'

export interface IssueRecentEvent {
  id: string
  level: Breadcrumb['level']
  message: string
  time: string
}

export interface HydratedIssueDetailSnapshot {
  issue: Issue
  latestEventId: string
  recentEvents: IssueRecentEvent[]
  source: 'live'
}

export interface IssuesOverviewSnapshot {
  issues: Issue[]
  stats: IssuesOverviewStats
  statsSources: Record<keyof IssuesOverviewStats, IssueSummaryFieldSource>
  eventSeries: IssueEventSeriesPoint[]
  sources: {
    issues: 'live'
    stats: 'live'
    chart: 'live'
    overall: 'live'
  }
  liveIssueCount: number
}

const RECENT_EVENT_LIMIT = 5

function isRecord(value: unknown): value is MesherApiRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function expectRecord(value: unknown, path: string, field: string): MesherApiRecord {
  if (!isRecord(value)) throw new MesherApiError('invalid-payload', path, `Expected ${field} to be an object`)
  return value
}

function expectRecordArray(value: unknown, path: string, field: string): MesherApiRecord[] {
  if (!Array.isArray(value) || value.some((entry) => !isRecord(entry))) {
    throw new MesherApiError('invalid-payload', path, `Expected ${field} to be an array of objects`)
  }
  return value
}

function expectString(value: unknown, path: string, field: string): string {
  if (typeof value !== 'string') throw new MesherApiError('invalid-payload', path, `Expected ${field} to be a string`)
  return value
}

function expectNumber(value: unknown, path: string, field: string): number {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  if (!Number.isFinite(number)) throw new MesherApiError('invalid-payload', path, `Expected ${field} to be numeric`)
  return Math.max(0, Math.round(number))
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function relativeTime(value: string): string {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return value
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function normalizeSeverity(value: unknown): Severity {
  switch (optionalString(value)?.toLowerCase()) {
    case 'fatal': return 'critical'
    case 'error': return 'high'
    case 'warning': return 'medium'
    case 'info':
    case 'debug': return 'low'
    default: return 'low'
  }
}

function normalizeStatus(value: unknown, path: string): IssueStatus {
  switch (optionalString(value)?.toLowerCase()) {
    case 'unresolved': return 'open'
    case 'resolved': return 'resolved'
    case 'archived':
    case 'discarded': return 'ignored'
    default: throw new MesherApiError('invalid-payload', path, `Unsupported issue status ${String(value)}`)
  }
}

function normalizeBreadcrumbLevel(value: unknown): Breadcrumb['level'] {
  switch (optionalString(value)?.toLowerCase()) {
    case 'fatal':
    case 'error': return 'error'
    case 'warning': return 'warning'
    default: return 'info'
  }
}

function adaptIssue(row: MesherApiRecord, projectName: string, index: number): Issue {
  const path = `/issues/${index}`
  const level = expectString(row.level, path, 'level')
  return {
    id: expectString(row.id, path, 'id'),
    title: expectString(row.title, path, 'title'),
    subtitle: `${level} issue`,
    file: null,
    severity: normalizeSeverity(level),
    status: normalizeStatus(row.status, path),
    count: expectNumber(row.event_count, path, 'event_count'),
    project: projectName,
    environment: null,
    firstSeen: relativeTime(expectString(row.first_seen, path, 'first_seen')),
    lastSeen: relativeTime(expectString(row.last_seen, path, 'last_seen')),
    assignee: optionalString(row.assigned_to) ?? undefined,
    tags: [],
    stacktrace: [],
    breadcrumbs: [],
    sdkName: null,
    sdkVersion: null,
    sessionId: null,
  }
}

function buildSeverityRatios(levels: MesherApiRecord[]) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const row of levels) counts[normalizeSeverity(row.level)] += expectNumber(row.count, '/dashboard/levels', 'count')
  const total = counts.critical + counts.high + counts.medium + counts.low
  if (total === 0) return { critical: 0, high: 0, medium: 0, low: 0 }
  return {
    critical: counts.critical / total,
    high: counts.high / total,
    medium: counts.medium / total,
    low: counts.low / total,
  }
}

function splitBucket(total: number, ratios: ReturnType<typeof buildSeverityRatios>) {
  const keys = ['critical', 'high', 'medium', 'low'] as const
  const result = { critical: 0, high: 0, medium: 0, low: 0 }
  let allocated = 0
  for (const key of keys) {
    result[key] = Math.floor(total * ratios[key])
    allocated += result[key]
  }
  for (let remainder = total - allocated, index = 0; remainder > 0; remainder -= 1, index += 1) {
    result[keys[index % keys.length]] += 1
  }
  return result
}

function buildEventSeries(volume: MesherApiRecord[], levels: MesherApiRecord[]): IssueEventSeriesPoint[] {
  const ratios = buildSeverityRatios(levels)
  return volume.map((row, index) => ({
    time: relativeTime(expectString(row.bucket, `/dashboard/volume/${index}`, 'bucket')),
    ...splitBucket(expectNumber(row.count, `/dashboard/volume/${index}`, 'count'), ratios),
  }))
}

export function buildEmptyIssuesOverview(): IssuesOverviewSnapshot {
  return {
    issues: [],
    stats: { totalEvents: 0, openIssues: 0, criticalIssues: 0, eventsPerMin: 0 },
    statsSources: {
      totalEvents: 'live',
      openIssues: 'live',
      criticalIssues: 'derived-live',
      eventsPerMin: 'derived-live',
    },
    eventSeries: [],
    liveIssueCount: 0,
    sources: { issues: 'live', stats: 'live', chart: 'live', overall: 'live' },
  }
}

export function adaptMesherDashboardBootstrap(
  payload: MesherDashboardBootstrapPayload,
  projectName: string,
): IssuesOverviewSnapshot {
  const issues = payload.issues.data.map((row, index) => adaptIssue(row, projectName, index))
  const totalEvents = expectNumber(payload.health.events_24h, '/dashboard/health', 'events_24h')
  const openIssues = expectNumber(payload.health.unresolved_count, '/dashboard/health', 'unresolved_count')
  const stats = {
    totalEvents,
    openIssues,
    criticalIssues: issues.filter((issue) => issue.severity === 'critical' && issue.status === 'open').length,
    eventsPerMin: Math.round(totalEvents / (24 * 60)),
  }

  return {
    issues,
    stats,
    statsSources: {
      totalEvents: 'live',
      openIssues: 'live',
      criticalIssues: 'derived-live',
      eventsPerMin: 'derived-live',
    },
    eventSeries: buildEventSeries(payload.volume, payload.levels),
    liveIssueCount: issues.length,
    sources: { issues: 'live', stats: 'live', chart: 'live', overall: 'live' },
  }
}

function adaptStacktrace(value: unknown, path: string): StackFrame[] {
  return expectRecordArray(value, path, 'event.stacktrace').map((frame, index) => {
    const framePath = `${path}/stacktrace/${index}`
    const contextLine = optionalString(frame.context_line)
    return {
      file: expectString(frame.filename, framePath, 'filename'),
      fn: expectString(frame.function_name, framePath, 'function_name'),
      line: expectNumber(frame.lineno, framePath, 'lineno'),
      col: expectNumber(frame.colno, framePath, 'colno'),
      code: contextLine ? [contextLine] : [],
      highlight: 0,
      isApp: Boolean(frame.in_app),
    }
  })
}

function adaptBreadcrumbs(value: unknown, path: string): Breadcrumb[] {
  return expectRecordArray(value, path, 'event.breadcrumbs').map((breadcrumb, index) => ({
    time: relativeTime(expectString(breadcrumb.timestamp, `${path}/breadcrumbs/${index}`, 'timestamp')),
    type: expectString(breadcrumb.category, `${path}/breadcrumbs/${index}`, 'category'),
    message: expectString(breadcrumb.message, `${path}/breadcrumbs/${index}`, 'message'),
    level: normalizeBreadcrumbLevel(breadcrumb.level),
  }))
}

function adaptTags(value: unknown, path: string): string[] {
  return Object.entries(expectRecord(value, path, 'event.tags'))
    .map(([key, value]) => optionalString(value) ? `${key}:${optionalString(value)}` : null)
    .filter((value): value is string => value !== null)
    .slice(0, 12)
}

function adaptRecentEvents(timeline: MesherIssueTimelineEntry[]): IssueRecentEvent[] {
  return timeline
    .map((entry) => ({
      id: entry.id,
      level: normalizeBreadcrumbLevel(entry.level),
      message: entry.message,
      time: relativeTime(entry.received_at),
      timestamp: Date.parse(entry.received_at),
    }))
    .toSorted((left, right) => right.timestamp - left.timestamp)
    .slice(0, RECENT_EVENT_LIMIT)
    .map(({ timestamp: _timestamp, ...event }) => event)
}

export function adaptMesherSelectedIssueDetail(
  baseIssue: Issue,
  latestEvent: MesherIssueEventSummary,
  detail: MesherEventDetailResponse,
  timeline: MesherIssueTimelineEntry[],
): HydratedIssueDetailSnapshot {
  const path = `/api/v1/events/${latestEvent.id}`
  const stacktrace = adaptStacktrace(detail.event.stacktrace, path)
  const breadcrumbs = adaptBreadcrumbs(detail.event.breadcrumbs, path)
  const firstFrame = stacktrace.find((frame) => frame.isApp) ?? stacktrace[0]

  return {
    issue: {
      ...baseIssue,
      subtitle: detail.event.message,
      file: firstFrame ? `${firstFrame.file}:${firstFrame.line}` : null,
      severity: normalizeSeverity(detail.event.level),
      environment: optionalString(detail.event.environment),
      tags: adaptTags(detail.event.tags, path),
      stacktrace,
      breadcrumbs,
      lastSeen: relativeTime(detail.event.received_at),
      sdkName: optionalString(detail.event.sdk_name),
      sdkVersion: optionalString(detail.event.sdk_version),
      sessionId: optionalString(detail.event.session_id),
    },
    latestEventId: latestEvent.id,
    recentEvents: adaptRecentEvents(timeline),
    source: 'live',
  }
}
