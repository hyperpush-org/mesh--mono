import {
  MOCK_ALERTS,
  type Alert,
  type AlertHistory,
  type AlertLiveAction,
  type AlertStatus,
  type AlertType,
  type Severity,
} from '@/lib/mock-data'
import {
  type MesherAlertRule,
  type MesherApiKeyRecord,
  type MesherApiRecord,
  type MesherOrgMember,
  type MesherProjectAlert,
  type MesherProjectSettings,
  type MesherProjectStorage,
} from '@/lib/mesher-api'

export type AlertOverviewSource = 'live' | 'mixed' | 'fallback'
export type AlertSummaryFieldSource = 'live' | 'derived-live' | 'fallback'

export interface AlertsOverviewStats {
  totalAlerts: number
  firing: number
  acknowledged: number
  resolved: number
  mtta: string
  avgResolutionTime: string
  avgFiringDuration: string
}

export interface AlertsOverviewSnapshot {
  alerts: Alert[]
  stats: AlertsOverviewStats
  statsSources: Record<keyof AlertsOverviewStats, AlertSummaryFieldSource>
  liveAlertCount: number
  sources: {
    alerts: AlertOverviewSource
    stats: AlertOverviewSource
    overall: AlertOverviewSource
  }
}

const DEFAULT_PROJECT_LABEL = 'default'
const FALLBACK_ALERT_TEMPLATE = MOCK_ALERTS[0]
const ALERT_TEMPLATE_BY_ID = new Map(MOCK_ALERTS.map((alert) => [alert.id, alert] as const))

function collapseSources(...sources: AlertOverviewSource[]): AlertOverviewSource {
  if (sources.every((source) => source === 'live')) {
    return 'live'
  }

  if (sources.every((source) => source === 'fallback')) {
    return 'fallback'
  }

  return 'mixed'
}

function collapseSummaryFieldSources(
  sources: AlertSummaryFieldSource[],
): AlertOverviewSource {
  if (sources.every((source) => source === 'live')) {
    return 'live'
  }

  if (sources.every((source) => source === 'fallback')) {
    return 'fallback'
  }

  return 'mixed'
}

function toNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function toNonNegativeInteger(value: unknown): number | null {
  const numeric = toNumber(value)
  if (numeric === null) {
    return null
  }

  return Math.max(0, Math.round(numeric))
}

function relativeTimeFromIso(value: unknown, fallback: string): string {
  const raw = toNonEmptyString(value)
  if (!raw) {
    return fallback
  }

  const timestamp = Date.parse(raw)
  if (!Number.isFinite(timestamp)) {
    return fallback
  }

  const diffMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000))

  if (diffMinutes < 1) {
    return 'just now'
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`
  }

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) {
    return `${diffHours}h ago`
  }

  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

function hashString(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return hash
}

function pickOverlayTemplate(alertId: string, index: number): Alert {
  const directTemplate = ALERT_TEMPLATE_BY_ID.get(alertId)
  if (directTemplate) {
    return directTemplate
  }

  if (MOCK_ALERTS.length === 0) {
    return FALLBACK_ALERT_TEMPLATE
  }

  return MOCK_ALERTS[(hashString(alertId || `alert-${index}`) + index) % MOCK_ALERTS.length]
}

function normalizeLiveAlertStatus(status: MesherProjectAlert['status']): AlertStatus {
  switch (status) {
    case 'active':
      return 'firing'
    case 'acknowledged':
      return 'acknowledged'
    case 'resolved':
      return 'resolved'
  }
}

function normalizeAlertType(snapshot: MesherApiRecord, fallback: AlertType): AlertType {
  switch (toNonEmptyString(snapshot.condition_type)?.toLowerCase()) {
    case 'error_rate':
    case 'error-rate':
      return 'error-rate'
    case 'latency':
    case 'p95_latency':
    case 'p95-latency':
      return 'latency'
    case 'availability':
    case 'http_status':
    case 'uptime':
      return 'availability'
    case 'new_issue':
      return 'custom'
    default:
      return fallback
  }
}

function normalizeAlertSeverity(snapshot: MesherApiRecord, fallback: Severity, alert: MesherProjectAlert): Severity {
  const explicit = toNonEmptyString(snapshot.severity)?.toLowerCase()
  switch (explicit) {
    case 'critical':
    case 'high':
    case 'medium':
    case 'low':
      return explicit
  }

  const haystack = `${alert.rule_name} ${alert.message}`.toLowerCase()
  if (haystack.includes('critical')) {
    return 'critical'
  }
  if (haystack.includes('high')) {
    return 'high'
  }
  if (haystack.includes('medium')) {
    return 'medium'
  }
  if (haystack.includes('low')) {
    return 'low'
  }

  return fallback
}

function formatThreshold(snapshot: MesherApiRecord, fallback: string) {
  const comparator = toNonEmptyString(snapshot.operator) ?? toNonEmptyString(snapshot.comparator)
  const threshold = toNumber(snapshot.threshold)
  const unit = toNonEmptyString(snapshot.unit)

  if (threshold !== null) {
    return `${comparator ?? '>='} ${threshold}${unit ? ` ${unit}` : ''}`
  }

  const rawThreshold = toNonEmptyString(snapshot.threshold_label) ?? toNonEmptyString(snapshot.threshold_display)
  return rawThreshold ?? fallback
}

function formatCurrentValue(snapshot: MesherApiRecord, fallback: string) {
  const numeric =
    toNumber(snapshot.current_value) ??
    toNumber(snapshot.value) ??
    toNumber(snapshot.event_count) ??
    toNumber(snapshot.count)
  const unit = toNonEmptyString(snapshot.unit)

  if (numeric !== null) {
    return `${numeric}${unit ? ` ${unit}` : ''}`
  }

  return (
    toNonEmptyString(snapshot.current_value_label) ??
    toNonEmptyString(snapshot.value_label) ??
    fallback
  )
}

function buildConditionLabel(alert: MesherProjectAlert, fallback: string) {
  const snapshot = alert.condition_snapshot
  const explicit = toNonEmptyString(snapshot.expression) ?? toNonEmptyString(snapshot.condition)
  if (explicit) {
    return explicit
  }

  const conditionType = toNonEmptyString(snapshot.condition_type)
  if (conditionType) {
    return conditionType.replace(/_/g, ' ')
  }

  return fallback
}

function buildEvaluationWindow(snapshot: MesherApiRecord, fallback: string) {
  const minutes = toNumber(snapshot.window_minutes)
  if (minutes !== null) {
    return `${minutes}m`
  }

  return (
    toNonEmptyString(snapshot.window) ??
    toNonEmptyString(snapshot.evaluation_window) ??
    fallback
  )
}

function buildSupportedActions(status: AlertStatus): AlertLiveAction[] {
  switch (status) {
    case 'firing':
      return ['acknowledge', 'resolve']
    case 'acknowledged':
      return ['resolve']
    case 'resolved':
    case 'silenced':
    default:
      return []
  }
}

function buildHistory(alert: MesherProjectAlert, fallback: AlertHistory[]): AlertHistory[] {
  const liveEntries: Array<{ timestamp: string; status: AlertStatus; value: string; notified: boolean; sort: number }> = []
  const currentValue = formatCurrentValue(alert.condition_snapshot, fallback[0]?.value ?? 'server-defined')

  const triggeredAt = Date.parse(alert.triggered_at)
  if (Number.isFinite(triggeredAt)) {
    liveEntries.push({
      timestamp: relativeTimeFromIso(alert.triggered_at, alert.triggered_at),
      status: 'firing',
      value: currentValue,
      notified: true,
      sort: triggeredAt,
    })
  }

  if (alert.acknowledged_at) {
    const acknowledgedAt = Date.parse(alert.acknowledged_at)
    if (Number.isFinite(acknowledgedAt)) {
      liveEntries.push({
        timestamp: relativeTimeFromIso(alert.acknowledged_at, alert.acknowledged_at),
        status: 'acknowledged',
        value: currentValue,
        notified: true,
        sort: acknowledgedAt,
      })
    }
  }

  if (alert.resolved_at) {
    const resolvedAt = Date.parse(alert.resolved_at)
    if (Number.isFinite(resolvedAt)) {
      liveEntries.push({
        timestamp: relativeTimeFromIso(alert.resolved_at, alert.resolved_at),
        status: 'resolved',
        value: currentValue,
        notified: true,
        sort: resolvedAt,
      })
    }
  }

  if (liveEntries.length === 0) {
    return fallback
  }

  return liveEntries
    .toSorted((left, right) => left.sort - right.sort)
    .map(({ sort: _sort, ...entry }) => entry)
}

function adaptLiveAlert(alert: MesherProjectAlert, index: number): Alert {
  const template = pickOverlayTemplate(alert.id, index)
  const status = normalizeLiveAlertStatus(alert.status)
  const currentValueNumeric =
    toNumber(alert.condition_snapshot.current_value) ??
    toNumber(alert.condition_snapshot.value) ??
    toNumber(alert.condition_snapshot.event_count) ??
    template.currentValueNumeric
  const thresholdNumeric =
    toNumber(alert.condition_snapshot.threshold) ??
    template.thresholdNumeric

  return {
    ...template,
    id: alert.id,
    name: alert.rule_name,
    description: alert.message,
    type: normalizeAlertType(alert.condition_snapshot, template.type),
    status,
    severity: normalizeAlertSeverity(alert.condition_snapshot, template.severity, alert),
    project: DEFAULT_PROJECT_LABEL,
    environment:
      toNonEmptyString(alert.condition_snapshot.environment) ??
      toNonEmptyString(alert.condition_snapshot.env) ??
      template.environment,
    triggeredAt: relativeTimeFromIso(alert.triggered_at, template.triggeredAt),
    lastFired: relativeTimeFromIso(alert.resolved_at ?? alert.acknowledged_at ?? alert.triggered_at, template.lastFired),
    firedCount:
      toNonNegativeInteger(alert.condition_snapshot.event_count) ??
      toNonNegativeInteger(alert.condition_snapshot.count) ??
      1,
    threshold: formatThreshold(alert.condition_snapshot, template.threshold),
    currentValue: formatCurrentValue(alert.condition_snapshot, template.currentValue),
    currentValueNumeric,
    thresholdNumeric,
    condition: buildConditionLabel(alert, template.condition),
    evaluationWindow: buildEvaluationWindow(alert.condition_snapshot, template.evaluationWindow),
    history: buildHistory(alert, template.history),
    ruleName: alert.rule_name,
    source: 'live',
    statusSource: 'live',
    supportedActions: buildSupportedActions(status),
    unsupportedActions: status === 'silenced' ? ['unsnooze'] : ['silence'],
  }
}

function buildFallbackStats(alerts: Alert[]): AlertsOverviewStats {
  return {
    totalAlerts: alerts.length,
    firing: alerts.filter((alert) => alert.status === 'firing').length,
    acknowledged: alerts.filter((alert) => alert.status === 'acknowledged').length,
    resolved: alerts.filter((alert) => alert.status === 'resolved').length,
    mtta: '8m 24s',
    avgResolutionTime: '1h 12m',
    avgFiringDuration: '45m',
  }
}

function buildStats(alerts: Alert[]) {
  const stats = buildFallbackStats(alerts)
  const fieldSources: Record<keyof AlertsOverviewStats, AlertSummaryFieldSource> = {
    totalAlerts: 'derived-live',
    firing: 'derived-live',
    acknowledged: 'derived-live',
    resolved: 'derived-live',
    mtta: 'fallback',
    avgResolutionTime: 'fallback',
    avgFiringDuration: 'fallback',
  }

  return {
    data: stats,
    fieldSources,
    source: collapseSummaryFieldSources(Object.values(fieldSources)),
  }
}

export function buildFallbackAlertsOverview(): AlertsOverviewSnapshot {
  const stats = buildFallbackStats(MOCK_ALERTS)

  return {
    alerts: MOCK_ALERTS,
    stats,
    statsSources: {
      totalAlerts: 'fallback',
      firing: 'fallback',
      acknowledged: 'fallback',
      resolved: 'fallback',
      mtta: 'fallback',
      avgResolutionTime: 'fallback',
      avgFiringDuration: 'fallback',
    },
    liveAlertCount: 0,
    sources: {
      alerts: 'fallback',
      stats: 'fallback',
      overall: 'fallback',
    },
  }
}

export function adaptMesherProjectAlerts(alerts: MesherProjectAlert[]): AlertsOverviewSnapshot {
  const adaptedAlerts = alerts.map((alert, index) => adaptLiveAlert(alert, index))
  const stats = buildStats(adaptedAlerts)
  const alertsSource: AlertOverviewSource = adaptedAlerts.length > 0 ? 'mixed' : 'live'

  return {
    alerts: adaptedAlerts,
    stats: stats.data,
    statsSources: stats.fieldSources,
    liveAlertCount: alerts.length,
    sources: {
      alerts: alertsSource,
      stats: stats.source,
      overall: collapseSources(alertsSource, stats.source),
    },
  }
}

export interface SettingsGeneralSnapshot {
  retentionDays: number
  sampleRate: number
  sampleRatePercent: number
  storageEventCount: number
  storageEstimatedBytes: number
  storageEstimatedBytesLabel: string
  source: 'live'
}

export interface SettingsApiKeyItem {
  id: string
  label: string
  maskedValue: string
  createdAt: string
  revokedAt: string | null
  createdAtLabel: string
  status: 'active' | 'revoked'
  source: 'live'
}

export interface SettingsApiKeysSnapshot {
  items: SettingsApiKeyItem[]
  activeCount: number
  revokedCount: number
  source: 'live'
}

export interface SettingsAlertRuleItem {
  id: string
  name: string
  enabled: boolean
  cooldownMinutes: number
  conditionSummary: string
  conditionJson: string
  actionJson: string
  channels: string[]
  severity: Severity
  lastFiredAt: string | null
  lastFiredLabel: string
  createdAt: string
  createdAtLabel: string
  source: 'live'
}

export interface SettingsAlertRulesSnapshot {
  items: SettingsAlertRuleItem[]
  activeCount: number
  disabledCount: number
  source: 'live'
}

export interface SettingsTeamMemberItem {
  id: string
  userId: string
  email: string
  displayName: string
  initials: string
  role: string
  joinedAt: string
  joinedAtLabel: string
  canRemove: boolean
  source: 'live'
}

export interface SettingsTeamSnapshot {
  items: SettingsTeamMemberItem[]
  ownerCount: number
  adminCount: number
  memberCount: number
  source: 'live'
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const rounded = value >= 10 ? value.toFixed(0) : value.toFixed(1)
  return `${rounded} ${units[unitIndex]}`
}

function formatIsoDate(value: string) {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) {
    return value
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(timestamp)
}

function maskApiKeyValue(value: string) {
  if (value.length <= 10) {
    return value
  }

  return `${value.slice(0, 6)}••••${value.slice(-4)}`
}

function inferAlertChannels(action: MesherApiRecord): string[] {
  const directType = toNonEmptyString(action.type)
  if (directType) {
    return [directType]
  }

  const channels = action.channels
  if (Array.isArray(channels)) {
    return channels
      .map((entry) => toNonEmptyString(entry))
      .filter((entry): entry is string => entry !== null)
  }

  return ['websocket']
}

function inferAlertSeverity(condition: MesherApiRecord, ruleName: string): Severity {
  const explicit = toNonEmptyString(condition.severity)?.toLowerCase()
  switch (explicit) {
    case 'critical':
    case 'high':
    case 'medium':
    case 'low':
      return explicit
  }

  const haystack = `${ruleName} ${JSON.stringify(condition)}`.toLowerCase()
  if (haystack.includes('critical')) {
    return 'critical'
  }
  if (haystack.includes('high')) {
    return 'high'
  }
  if (haystack.includes('medium')) {
    return 'medium'
  }
  return 'low'
}

function initialsFromMember(member: MesherOrgMember) {
  const base = member.display_name.trim() || member.email.trim() || member.user_id.trim()
  if (!base) {
    return 'TM'
  }

  const tokens = base
    .split(/[^A-Za-z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean)

  if (tokens.length === 0) {
    return base.slice(0, 2).toUpperCase()
  }

  if (tokens.length === 1) {
    return tokens[0].slice(0, 2).toUpperCase()
  }

  return `${tokens[0][0] ?? ''}${tokens[1][0] ?? ''}`.toUpperCase()
}

function summarizeRuleCondition(condition: MesherApiRecord) {
  const expression = toNonEmptyString(condition.expression) ?? toNonEmptyString(condition.condition)
  if (expression) {
    return expression
  }

  const conditionType = toNonEmptyString(condition.condition_type)
  const comparator = toNonEmptyString(condition.operator) ?? toNonEmptyString(condition.comparator)
  const threshold = toNumber(condition.threshold)
  const windowMinutes = toNumber(condition.window_minutes)

  if (conditionType && threshold !== null) {
    const pieces = [conditionType.replace(/_/g, ' '), comparator ?? '>=', String(threshold)]
    if (windowMinutes !== null) {
      pieces.push(`over ${windowMinutes}m`)
    }
    return pieces.join(' ')
  }

  if (conditionType) {
    return conditionType.replace(/_/g, ' ')
  }

  return 'Custom rule payload'
}

export function adaptMesherProjectSettings(
  settings: MesherProjectSettings,
  storage: MesherProjectStorage,
): SettingsGeneralSnapshot {
  const sampleRate = Number(settings.sample_rate.toFixed(4))

  return {
    retentionDays: settings.retention_days,
    sampleRate,
    sampleRatePercent: Number((sampleRate * 100).toFixed(2)),
    storageEventCount: storage.event_count,
    storageEstimatedBytes: storage.estimated_bytes,
    storageEstimatedBytesLabel: formatBytes(storage.estimated_bytes),
    source: 'live',
  }
}

export function adaptMesherProjectApiKeys(keys: MesherApiKeyRecord[]): SettingsApiKeysSnapshot {
  const items = keys.map<SettingsApiKeyItem>((key) => ({
    id: key.id,
    label: key.label,
    maskedValue: maskApiKeyValue(key.key_value),
    createdAt: key.created_at,
    revokedAt: key.revoked_at,
    createdAtLabel: relativeTimeFromIso(key.created_at, formatIsoDate(key.created_at)),
    status: key.revoked_at ? 'revoked' : 'active',
    source: 'live',
  }))

  return {
    items,
    activeCount: items.filter((item) => item.status === 'active').length,
    revokedCount: items.filter((item) => item.status === 'revoked').length,
    source: 'live',
  }
}

export function adaptMesherProjectAlertRules(rules: MesherAlertRule[]): SettingsAlertRulesSnapshot {
  const items = rules.map<SettingsAlertRuleItem>((rule) => ({
    id: rule.id,
    name: rule.name,
    enabled: rule.enabled,
    cooldownMinutes: rule.cooldown_minutes,
    conditionSummary: summarizeRuleCondition(rule.condition),
    conditionJson: JSON.stringify(rule.condition, null, 2),
    actionJson: JSON.stringify(rule.action, null, 2),
    channels: inferAlertChannels(rule.action),
    severity: inferAlertSeverity(rule.condition, rule.name),
    lastFiredAt: rule.last_fired_at,
    lastFiredLabel: rule.last_fired_at ? relativeTimeFromIso(rule.last_fired_at, formatIsoDate(rule.last_fired_at)) : 'Never fired',
    createdAt: rule.created_at,
    createdAtLabel: relativeTimeFromIso(rule.created_at, formatIsoDate(rule.created_at)),
    source: 'live',
  }))

  return {
    items,
    activeCount: items.filter((item) => item.enabled).length,
    disabledCount: items.filter((item) => !item.enabled).length,
    source: 'live',
  }
}

export function adaptMesherOrgMembers(members: MesherOrgMember[]): SettingsTeamSnapshot {
  const items = members.map<SettingsTeamMemberItem>((member) => ({
    id: member.id,
    userId: member.user_id,
    email: member.email,
    displayName: member.display_name,
    initials: initialsFromMember(member),
    role: member.role,
    joinedAt: member.joined_at,
    joinedAtLabel: relativeTimeFromIso(member.joined_at, formatIsoDate(member.joined_at)),
    canRemove: member.role !== 'owner',
    source: 'live',
  }))

  return {
    items,
    ownerCount: items.filter((item) => item.role === 'owner').length,
    adminCount: items.filter((item) => item.role === 'admin').length,
    memberCount: items.filter((item) => item.role === 'member').length,
    source: 'live',
  }
}
