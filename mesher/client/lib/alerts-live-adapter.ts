import type { Alert, AlertHistory, AlertStatus, AlertType, Severity } from '@/lib/dashboard-types'
import type { MesherApiRecord, MesherProjectAlert } from '@/lib/mesher-api'

export interface AlertsOverviewStats {
  totalAlerts: number
  firing: number
  acknowledged: number
  resolved: number
}

export interface AlertsOverviewSnapshot {
  alerts: Alert[]
  stats: AlertsOverviewStats
  liveAlertCount: number
  sources: { alerts: 'live'; stats: 'live'; overall: 'live' }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function number(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : null
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

function status(value: MesherProjectAlert['status']): AlertStatus {
  if (value === 'active') return 'firing'
  return value
}

function severity(snapshot: MesherApiRecord): Severity {
  switch (text(snapshot.severity)?.toLowerCase()) {
    case 'critical': return 'critical'
    case 'high': return 'high'
    case 'medium': return 'medium'
    default: return 'low'
  }
}

function type(snapshot: MesherApiRecord): AlertType {
  switch (text(snapshot.condition_type)?.toLowerCase()) {
    case 'error_rate':
    case 'error-rate': return 'error-rate'
    case 'latency':
    case 'p95_latency': return 'latency'
    case 'availability':
    case 'http_status': return 'availability'
    default: return 'custom'
  }
}

function displayValue(snapshot: MesherApiRecord, keys: string[]): string | null {
  for (const key of keys) {
    const numeric = number(snapshot[key])
    if (numeric !== null) return `${numeric}${text(snapshot.unit) ? ` ${text(snapshot.unit)}` : ''}`
    const label = text(snapshot[key])
    if (label) return label
  }
  return null
}

function history(alert: MesherProjectAlert, currentValue: string | null): AlertHistory[] {
  const rows: Array<AlertHistory & { sort: number }> = []
  const add = (timestamp: string | null, nextStatus: AlertStatus) => {
    if (!timestamp) return
    rows.push({ timestamp: relativeTime(timestamp), status: nextStatus, value: currentValue ?? 'Not recorded', sort: Date.parse(timestamp) })
  }
  add(alert.triggered_at, 'firing')
  add(alert.acknowledged_at, 'acknowledged')
  add(alert.resolved_at, 'resolved')
  return rows.toSorted((left, right) => left.sort - right.sort).map(({ sort: _sort, ...row }) => row)
}

function adaptAlert(alert: MesherProjectAlert, projectName: string): Alert {
  const currentValue = displayValue(alert.condition_snapshot, ['current_value', 'value', 'event_count', 'count'])
  const threshold = displayValue(alert.condition_snapshot, ['threshold', 'threshold_label', 'threshold_display'])
  const alertStatus = status(alert.status)
  const conditionType = text(alert.condition_snapshot.condition_type)
  const expression = text(alert.condition_snapshot.expression) ?? text(alert.condition_snapshot.condition)
  const windowMinutes = number(alert.condition_snapshot.window_minutes)
  return {
    id: alert.id,
    name: alert.rule_name,
    description: alert.message,
    type: type(alert.condition_snapshot),
    status: alertStatus,
    severity: severity(alert.condition_snapshot),
    project: projectName,
    environment: text(alert.condition_snapshot.environment) ?? text(alert.condition_snapshot.env),
    triggeredAt: relativeTime(alert.triggered_at),
    lastFired: relativeTime(alert.resolved_at ?? alert.acknowledged_at ?? alert.triggered_at),
    firedCount: Math.max(1, Math.round(number(alert.condition_snapshot.event_count) ?? number(alert.condition_snapshot.count) ?? 1)),
    threshold,
    currentValue,
    condition: expression ?? conditionType?.replace(/_/g, ' ') ?? 'Validated server rule',
    evaluationWindow: windowMinutes === null ? text(alert.condition_snapshot.window) : `${windowMinutes}m`,
    history: history(alert, currentValue),
    ruleName: alert.rule_name,
    supportedActions: alertStatus === 'firing' ? ['acknowledge', 'resolve'] : alertStatus === 'acknowledged' ? ['resolve'] : [],
  }
}

export function buildEmptyAlertsOverview(): AlertsOverviewSnapshot {
  return {
    alerts: [],
    stats: { totalAlerts: 0, firing: 0, acknowledged: 0, resolved: 0 },
    liveAlertCount: 0,
    sources: { alerts: 'live', stats: 'live', overall: 'live' },
  }
}

export function adaptMesherProjectAlerts(alerts: MesherProjectAlert[], projectName: string): AlertsOverviewSnapshot {
  const adapted = alerts.map((alert) => adaptAlert(alert, projectName))
  return {
    alerts: adapted,
    stats: {
      totalAlerts: adapted.length,
      firing: adapted.filter((alert) => alert.status === 'firing').length,
      acknowledged: adapted.filter((alert) => alert.status === 'acknowledged').length,
      resolved: adapted.filter((alert) => alert.status === 'resolved').length,
    },
    liveAlertCount: adapted.length,
    sources: { alerts: 'live', stats: 'live', overall: 'live' },
  }
}
