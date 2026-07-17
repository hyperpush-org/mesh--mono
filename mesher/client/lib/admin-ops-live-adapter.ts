import type { Severity } from '@/lib/dashboard-types'
import type {
  MesherAlertRule,
  MesherApiKeyRecord,
  MesherApiRecord,
  MesherOrgMember,
  MesherProjectSettings,
  MesherProjectStorage,
} from '@/lib/mesher-api'

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

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(number) ? number : null
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

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`
}

function inferAlertChannels(action: MesherApiRecord): string[] {
  const type = nonEmptyString(action.type)
  if (type) return [type]
  if (!Array.isArray(action.channels)) return []
  return action.channels.map(nonEmptyString).filter((channel): channel is string => channel !== null)
}

function inferAlertSeverity(condition: MesherApiRecord): Severity {
  switch (nonEmptyString(condition.severity)?.toLowerCase()) {
    case 'critical': return 'critical'
    case 'high': return 'high'
    case 'medium': return 'medium'
    default: return 'low'
  }
}

function initialsFromMember(member: MesherOrgMember) {
  const tokens = (member.display_name || member.email || member.user_id).split(/[^A-Za-z0-9]+/).filter(Boolean)
  if (tokens.length === 0) return 'TM'
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase()
  return `${tokens[0][0]}${tokens[1][0]}`.toUpperCase()
}

function summarizeRuleCondition(condition: MesherApiRecord) {
  const expression = nonEmptyString(condition.expression) ?? nonEmptyString(condition.condition)
  if (expression) return expression
  const type = nonEmptyString(condition.condition_type)
  const comparator = nonEmptyString(condition.operator) ?? nonEmptyString(condition.comparator)
  const threshold = finiteNumber(condition.threshold)
  const windowMinutes = finiteNumber(condition.window_minutes)
  if (!type) return 'Custom validated condition'
  if (threshold === null) return type.replace(/_/g, ' ')
  return [type.replace(/_/g, ' '), comparator ?? '>=', String(threshold), windowMinutes === null ? null : `over ${windowMinutes}m`]
    .filter(Boolean)
    .join(' ')
}

export function adaptMesherProjectSettings(settings: MesherProjectSettings, storage: MesherProjectStorage): SettingsGeneralSnapshot {
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
    maskedValue: `${key.key_prefix}••••`,
    createdAt: key.created_at,
    revokedAt: key.revoked_at,
    createdAtLabel: relativeTime(key.created_at),
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
    severity: inferAlertSeverity(rule.condition),
    lastFiredAt: rule.last_fired_at,
    lastFiredLabel: rule.last_fired_at ? relativeTime(rule.last_fired_at) : 'Never fired',
    createdAt: rule.created_at,
    createdAtLabel: relativeTime(rule.created_at),
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
    joinedAtLabel: relativeTime(member.joined_at),
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
