export type MesherApiRecord = Record<string, unknown>

export interface MesherIssuesResponse {
  data: MesherApiRecord[]
  has_more?: boolean
  next_cursor?: string
  next_cursor_id?: string
}

export interface MesherIssueEventSummary {
  id: string
  issue_id: string
  level: string
  message: string
  received_at: string
  tags: MesherApiRecord
}

export interface MesherIssueEventsResponse {
  data: MesherIssueEventSummary[]
  has_more?: boolean
  next_cursor?: string
  next_cursor_id?: string
}

export interface MesherEventDetailEvent {
  id: string
  project_id: string
  issue_id: string
  level: string
  message: string
  fingerprint: string
  exception: unknown
  stacktrace: unknown
  breadcrumbs: unknown
  tags: unknown
  extra: unknown
  user_context: unknown
  sdk_name: string
  sdk_version: string
  environment: string
  session_id: string
  received_at: string
}

export interface MesherEventDetailResponse {
  event: MesherEventDetailEvent
  navigation: {
    next_id: string | null
    prev_id: string | null
  }
}

export interface MesherIssueTimelineEntry {
  id: string
  level: string
  message: string
  received_at: string
}

export interface MesherIssueMutationResponse {
  status: 'ok'
}

export type MesherIssueMutationAction = 'resolve' | 'unresolve' | 'archive'

export type MesherHealthResponse = MesherApiRecord
export type MesherLevelsResponse = MesherApiRecord[]
export type MesherVolumeResponse = MesherApiRecord[]

export interface MesherDashboardBootstrapPayload {
  issues: MesherIssuesResponse
  health: MesherHealthResponse
  levels: MesherLevelsResponse
  volume: MesherVolumeResponse
}

export type MesherAlertStatus = 'active' | 'acknowledged' | 'resolved'

export interface MesherProjectAlert {
  id: string
  rule_id: string
  project_id: string
  status: MesherAlertStatus
  message: string
  condition_snapshot: MesherApiRecord
  triggered_at: string
  acknowledged_at: string | null
  resolved_at: string | null
  rule_name: string
}

export type MesherProjectAlertsResponse = MesherProjectAlert[]

export interface MesherAlertRule {
  id: string
  project_id: string
  name: string
  condition: MesherApiRecord
  action: MesherApiRecord
  enabled: boolean
  cooldown_minutes: number
  last_fired_at: string | null
  created_at: string
}

export type MesherAlertRulesResponse = MesherAlertRule[]

export interface MesherProjectSettings {
  retention_days: number
  sample_rate: number
}

export interface MesherProjectStorage {
  event_count: number
  estimated_bytes: number
}

export interface MesherOrgMember {
  id: string
  user_id: string
  email: string
  display_name: string
  role: string
  joined_at: string
}

export type MesherOrgMembersResponse = MesherOrgMember[]

export interface MesherApiKeyRecord {
  id: string
  project_id: string
  key_prefix: string
  label: string
  created_at: string
  revoked_at: string | null
}

export type MesherApiKeysResponse = MesherApiKeyRecord[]

export interface MesherMutationStatusResponse {
  status: 'ok'
}

export interface MesherCreatedIdResponse {
  id: string
}

export interface MesherCreatedApiKeyResponse {
  key_value: string
}

export interface MesherLoginResponse {
  token: string
  token_type: 'Bearer'
  expires_in: number
  user: {
    id: string
    email: string
    display_name: string
  }
}

export interface MesherSessionMembership {
  org_id: string
  org_name: string
  org_slug: string
  role: 'owner' | 'admin' | 'member'
  project_id: string
  project_slug: string
  project_name: string
  project_platform: string
}

export interface MesherSessionContext {
  user: MesherLoginResponse['user']
  memberships: MesherSessionMembership[]
}

export type MesherApiErrorCode =
  | 'timeout'
  | 'network'
  | 'http'
  | 'invalid-json'
  | 'invalid-payload'

export class MesherApiError extends Error {
  readonly code: MesherApiErrorCode
  readonly path: string
  readonly status: number | null

  constructor(code: MesherApiErrorCode, path: string, message: string, status?: number | null) {
    super(message)
    this.name = 'MesherApiError'
    this.code = code
    this.path = path
    this.status = status ?? null
  }
}

const DEFAULT_TIMEOUT_MS = 4_000
const MESHER_ISSUE_MUTATION_ACTIONS: readonly MesherIssueMutationAction[] = ['resolve', 'unresolve', 'archive']

function isRecord(value: unknown): value is MesherApiRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isRecordArray(value: unknown): value is MesherApiRecord[] {
  return Array.isArray(value) && value.every(isRecord)
}

function parsePaginationMetadata(value: MesherApiRecord) {
  return {
    has_more: typeof value.has_more === 'boolean' ? value.has_more : undefined,
    next_cursor: typeof value.next_cursor === 'string' ? value.next_cursor : undefined,
    next_cursor_id: typeof value.next_cursor_id === 'string' ? value.next_cursor_id : undefined,
  }
}

function parseIssuesResponse(value: unknown, path: string): MesherIssuesResponse {
  if (!isRecord(value) || !isRecordArray(value.data)) {
    throw new MesherApiError('invalid-payload', path, 'Expected an issues payload with a data array')
  }

  return {
    data: value.data,
    ...parsePaginationMetadata(value),
  }
}

function parseRecordResponse(value: unknown, path: string): MesherHealthResponse {
  if (!isRecord(value)) {
    throw new MesherApiError('invalid-payload', path, 'Expected an object payload')
  }

  return value
}

function parseRecordArrayResponse(value: unknown, path: string): MesherApiRecord[] {
  if (!isRecordArray(value)) {
    throw new MesherApiError('invalid-payload', path, 'Expected an array payload')
  }

  return value
}

function parseIssueEventRow(value: unknown, path: string): MesherIssueEventSummary {
  if (!isRecord(value)) {
    throw new MesherApiError('invalid-payload', path, 'Expected an issue event object')
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.issue_id !== 'string' ||
    typeof value.level !== 'string' ||
    typeof value.message !== 'string' ||
    typeof value.received_at !== 'string'
  ) {
    throw new MesherApiError('invalid-payload', path, 'Expected issue event rows with id, issue_id, level, message, and received_at strings')
  }

  return {
    id: value.id,
    issue_id: value.issue_id,
    level: value.level,
    message: value.message,
    received_at: value.received_at,
    tags: isRecord(value.tags) ? value.tags : {},
  }
}

function parseIssueEventsResponse(value: unknown, path: string): MesherIssueEventsResponse {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    throw new MesherApiError('invalid-payload', path, 'Expected an issue events payload with a data array')
  }

  return {
    data: value.data.map((row) => parseIssueEventRow(row, path)),
    ...parsePaginationMetadata(value),
  }
}

function parseNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function parseString(value: unknown, path: string, field: string): string {
  if (typeof value === 'string') {
    return value
  }

  throw new MesherApiError('invalid-payload', path, `Expected ${field} to be a string`)
}

function parseFiniteNumber(value: unknown, path: string, field: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  throw new MesherApiError('invalid-payload', path, `Expected ${field} to be a finite number`)
}

function parseBoolean(value: unknown, path: string, field: string): boolean {
  if (typeof value === 'boolean') {
    return value
  }

  throw new MesherApiError('invalid-payload', path, `Expected ${field} to be a boolean`)
}

function parseObjectRecord(value: unknown, path: string, field: string): MesherApiRecord {
  if (isRecord(value)) {
    return value
  }

  throw new MesherApiError('invalid-payload', path, `Expected ${field} to be an object`)
}

function parseAlertStatus(value: unknown, path: string): MesherAlertStatus {
  switch (value) {
    case 'active':
    case 'acknowledged':
    case 'resolved':
      return value
    default:
      throw new MesherApiError('invalid-payload', path, `Unsupported live alert status "${String(value)}"`)
  }
}

function parseJsonEncodedField(value: unknown, path: string, field: string): unknown {
  if (typeof value !== 'string') {
    return value
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return value
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    throw new MesherApiError('invalid-payload', path, `Expected event.${field} JSON string to parse successfully`)
  }
}

function parseEventDetailResponse(value: unknown, path: string): MesherEventDetailResponse {
  if (!isRecord(value) || !isRecord(value.event) || !isRecord(value.navigation)) {
    throw new MesherApiError('invalid-payload', path, 'Expected an event detail payload with event and navigation objects')
  }

  const event = value.event
  const navigation = value.navigation

  return {
    event: {
      id: parseString(event.id, path, 'event.id'),
      project_id: parseString(event.project_id, path, 'event.project_id'),
      issue_id: parseString(event.issue_id, path, 'event.issue_id'),
      level: parseString(event.level, path, 'event.level'),
      message: parseString(event.message, path, 'event.message'),
      fingerprint: parseString(event.fingerprint, path, 'event.fingerprint'),
      exception: parseJsonEncodedField(event.exception, path, 'exception'),
      stacktrace: parseJsonEncodedField(event.stacktrace, path, 'stacktrace'),
      breadcrumbs: parseJsonEncodedField(event.breadcrumbs, path, 'breadcrumbs'),
      tags: parseJsonEncodedField(event.tags, path, 'tags'),
      extra: parseJsonEncodedField(event.extra, path, 'extra'),
      user_context: parseJsonEncodedField(event.user_context, path, 'user_context'),
      sdk_name: parseString(event.sdk_name, path, 'event.sdk_name'),
      sdk_version: parseString(event.sdk_version, path, 'event.sdk_version'),
      environment: parseString(event.environment, path, 'event.environment'),
      session_id: parseString(event.session_id, path, 'event.session_id'),
      received_at: parseString(event.received_at, path, 'event.received_at'),
    },
    navigation: {
      next_id: parseNullableString(navigation.next_id),
      prev_id: parseNullableString(navigation.prev_id),
    },
  }
}

function parseIssueTimelineEntry(value: unknown, path: string): MesherIssueTimelineEntry {
  if (!isRecord(value)) {
    throw new MesherApiError('invalid-payload', path, 'Expected a timeline entry object')
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.level !== 'string' ||
    typeof value.message !== 'string' ||
    typeof value.received_at !== 'string'
  ) {
    throw new MesherApiError('invalid-payload', path, 'Expected timeline entries with id, level, message, and received_at strings')
  }

  return {
    id: value.id,
    level: value.level,
    message: value.message,
    received_at: value.received_at,
  }
}

function parseIssueTimelineResponse(value: unknown, path: string): MesherIssueTimelineEntry[] {
  if (!Array.isArray(value)) {
    throw new MesherApiError('invalid-payload', path, 'Expected a timeline array payload')
  }

  return value.map((row) => parseIssueTimelineEntry(row, path))
}

function parseIssueMutationResponse(value: unknown, path: string): MesherIssueMutationResponse {
  if (!isRecord(value) || value.status !== 'ok') {
    throw new MesherApiError('invalid-payload', path, 'Expected an issue mutation payload with status "ok"')
  }

  return {
    status: 'ok',
  }
}

function parseMutationStatusResponse(value: unknown, path: string): MesherMutationStatusResponse {
  if (!isRecord(value) || value.status !== 'ok') {
    throw new MesherApiError('invalid-payload', path, 'Expected a mutation payload with status "ok"')
  }

  return {
    status: 'ok',
  }
}

function parseCreatedIdResponse(value: unknown, path: string): MesherCreatedIdResponse {
  if (!isRecord(value) || typeof value.id !== 'string') {
    throw new MesherApiError('invalid-payload', path, 'Expected a creation payload with id')
  }

  return {
    id: value.id,
  }
}

function parseCreatedApiKeyResponse(value: unknown, path: string): MesherCreatedApiKeyResponse {
  if (!isRecord(value) || typeof value.key_value !== 'string') {
    throw new MesherApiError('invalid-payload', path, 'Expected an API key creation payload with key_value')
  }

  return {
    key_value: value.key_value,
  }
}

function parseLoginResponse(value: unknown, path: string): MesherLoginResponse {
  if (
    !isRecord(value) ||
    typeof value.token !== 'string' ||
    value.token_type !== 'Bearer' ||
    typeof value.expires_in !== 'number' ||
    !isRecord(value.user) ||
    typeof value.user.id !== 'string' ||
    typeof value.user.email !== 'string' ||
    typeof value.user.display_name !== 'string'
  ) {
    throw new MesherApiError('invalid-payload', path, 'Expected a bearer login response')
  }

  return {
    token: value.token,
    token_type: 'Bearer',
    expires_in: value.expires_in,
    user: {
      id: value.user.id,
      email: value.user.email,
      display_name: value.user.display_name,
    },
  }
}

function parseSessionRole(value: unknown, path: string): MesherSessionMembership['role'] {
  switch (value) {
    case 'owner':
    case 'admin':
    case 'member':
      return value
    default:
      throw new MesherApiError('invalid-payload', path, 'Expected membership.role to be owner, admin, or member')
  }
}

function parseSessionMembership(value: unknown, path: string): MesherSessionMembership {
  if (!isRecord(value)) {
    throw new MesherApiError('invalid-payload', path, 'Expected a session membership object')
  }

  return {
    org_id: parseString(value.org_id, path, 'membership.org_id'),
    org_name: parseString(value.org_name, path, 'membership.org_name'),
    org_slug: parseString(value.org_slug, path, 'membership.org_slug'),
    role: parseSessionRole(value.role, path),
    project_id: parseString(value.project_id, path, 'membership.project_id'),
    project_slug: parseString(value.project_slug, path, 'membership.project_slug'),
    project_name: parseString(value.project_name, path, 'membership.project_name'),
    project_platform: parseString(value.project_platform, path, 'membership.project_platform'),
  }
}

function parseSessionContext(value: unknown, path: string): MesherSessionContext {
  if (
    !isRecord(value) ||
    !isRecord(value.user) ||
    !Array.isArray(value.memberships) ||
    typeof value.user.id !== 'string' ||
    typeof value.user.email !== 'string' ||
    typeof value.user.display_name !== 'string'
  ) {
    throw new MesherApiError('invalid-payload', path, 'Expected current user and membership context')
  }

  return {
    user: {
      id: value.user.id,
      email: value.user.email,
      display_name: value.user.display_name,
    },
    memberships: value.memberships.map((membership) => parseSessionMembership(membership, path)),
  }
}

function parseProjectAlertRow(value: unknown, path: string): MesherProjectAlert {
  if (!isRecord(value)) {
    throw new MesherApiError('invalid-payload', path, 'Expected an alert object')
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.rule_id !== 'string' ||
    typeof value.project_id !== 'string' ||
    typeof value.message !== 'string' ||
    typeof value.triggered_at !== 'string' ||
    typeof value.rule_name !== 'string'
  ) {
    throw new MesherApiError(
      'invalid-payload',
      path,
      'Expected alert rows with id, rule_id, project_id, message, triggered_at, and rule_name strings',
    )
  }

  return {
    id: value.id,
    rule_id: value.rule_id,
    project_id: value.project_id,
    status: parseAlertStatus(value.status, path),
    message: value.message,
    condition_snapshot: parseObjectRecord(value.condition_snapshot, path, 'condition_snapshot'),
    triggered_at: value.triggered_at,
    acknowledged_at: value.acknowledged_at === null || typeof value.acknowledged_at === 'string' ? value.acknowledged_at : null,
    resolved_at: value.resolved_at === null || typeof value.resolved_at === 'string' ? value.resolved_at : null,
    rule_name: value.rule_name,
  }
}

function parseProjectAlertsResponse(value: unknown, path: string): MesherProjectAlertsResponse {
  if (!Array.isArray(value)) {
    throw new MesherApiError('invalid-payload', path, 'Expected an alerts array payload')
  }

  return value.map((row) => parseProjectAlertRow(row, path))
}

function parseAlertRuleRow(value: unknown, path: string): MesherAlertRule {
  if (!isRecord(value)) {
    throw new MesherApiError('invalid-payload', path, 'Expected an alert rule object')
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.project_id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.created_at !== 'string'
  ) {
    throw new MesherApiError('invalid-payload', path, 'Expected alert rule rows with id, project_id, name, and created_at strings')
  }

  return {
    id: value.id,
    project_id: value.project_id,
    name: value.name,
    condition: parseObjectRecord(value.condition, path, 'condition'),
    action: parseObjectRecord(value.action, path, 'action'),
    enabled: parseBoolean(value.enabled, path, 'enabled'),
    cooldown_minutes: Math.max(0, Math.round(parseFiniteNumber(value.cooldown_minutes, path, 'cooldown_minutes'))),
    last_fired_at: value.last_fired_at === null || typeof value.last_fired_at === 'string' ? value.last_fired_at : null,
    created_at: value.created_at,
  }
}

function parseAlertRulesResponse(value: unknown, path: string): MesherAlertRulesResponse {
  if (!Array.isArray(value)) {
    throw new MesherApiError('invalid-payload', path, 'Expected an alert rules array payload')
  }

  return value.map((row) => parseAlertRuleRow(row, path))
}

function parseProjectSettingsResponse(value: unknown, path: string): MesherProjectSettings {
  if (!isRecord(value)) {
    throw new MesherApiError('invalid-payload', path, 'Expected a settings object payload')
  }

  return {
    retention_days: Math.max(0, Math.round(parseFiniteNumber(value.retention_days, path, 'retention_days'))),
    sample_rate: parseFiniteNumber(value.sample_rate, path, 'sample_rate'),
  }
}

function parseProjectStorageResponse(value: unknown, path: string): MesherProjectStorage {
  if (!isRecord(value)) {
    throw new MesherApiError('invalid-payload', path, 'Expected a storage object payload')
  }

  return {
    event_count: Math.max(0, Math.round(parseFiniteNumber(value.event_count, path, 'event_count'))),
    estimated_bytes: Math.max(0, Math.round(parseFiniteNumber(value.estimated_bytes, path, 'estimated_bytes'))),
  }
}

function parseOrgMemberRow(value: unknown, path: string): MesherOrgMember {
  if (!isRecord(value)) {
    throw new MesherApiError('invalid-payload', path, 'Expected an org member object')
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.user_id !== 'string' ||
    typeof value.email !== 'string' ||
    typeof value.display_name !== 'string' ||
    typeof value.role !== 'string' ||
    typeof value.joined_at !== 'string'
  ) {
    throw new MesherApiError(
      'invalid-payload',
      path,
      'Expected org member rows with id, user_id, email, display_name, role, and joined_at strings',
    )
  }

  return {
    id: value.id,
    user_id: value.user_id,
    email: value.email,
    display_name: value.display_name,
    role: value.role,
    joined_at: value.joined_at,
  }
}

function parseOrgMembersResponse(value: unknown, path: string): MesherOrgMembersResponse {
  if (!Array.isArray(value)) {
    throw new MesherApiError('invalid-payload', path, 'Expected an org members array payload')
  }

  return value.map((row) => parseOrgMemberRow(row, path))
}

function parseApiKeyRecord(value: unknown, path: string): MesherApiKeyRecord {
  if (!isRecord(value)) {
    throw new MesherApiError('invalid-payload', path, 'Expected an API key object')
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.project_id !== 'string' ||
    typeof value.key_prefix !== 'string' ||
    typeof value.label !== 'string' ||
    typeof value.created_at !== 'string'
  ) {
    throw new MesherApiError('invalid-payload', path, 'Expected API key rows with id, project_id, key_prefix, label, and created_at strings')
  }

  return {
    id: value.id,
    project_id: value.project_id,
    key_prefix: value.key_prefix,
    label: value.label,
    created_at: value.created_at,
    revoked_at: value.revoked_at === null || typeof value.revoked_at === 'string' ? value.revoked_at : null,
  }
}

function parseApiKeysResponse(value: unknown, path: string): MesherApiKeysResponse {
  if (!Array.isArray(value)) {
    throw new MesherApiError('invalid-payload', path, 'Expected an API keys array payload')
  }

  return value.map((row) => parseApiKeyRecord(row, path))
}

async function requestMesherJson<T>(
  path: string,
  parse: (value: unknown, path: string) => T,
  options?: {
    timeoutMs?: number
    signal?: AbortSignal
    method?: string
    body?: BodyInit | null
    headers?: HeadersInit
  },
): Promise<T> {
  const abortController = new AbortController()
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  let didTimeout = false

  const forwardAbort = () => abortController.abort()
  if (options?.signal) {
    if (options.signal.aborted) {
      abortController.abort(options.signal.reason)
    } else {
      options.signal.addEventListener('abort', forwardAbort, { once: true })
    }
  }

  const timeout = window.setTimeout(() => {
    didTimeout = true
    abortController.abort()
  }, timeoutMs)

  try {
    const headers = new Headers(options?.headers)
    if (!headers.has('accept')) headers.set('accept', 'application/json')
    const sessionToken = getMesherSessionToken()
    if (sessionToken && !headers.has('authorization')) {
      headers.set('authorization', `Bearer ${sessionToken}`)
    }

    const response = await fetch(path, {
      method: options?.method ?? 'GET',
      headers,
      body: options?.body,
      signal: abortController.signal,
    })

    if (!response.ok) {
      if (response.status === 401 && path !== '/api/v1/auth/login') {
        clearMesherSessionToken()
        window.location.assign('/login')
      }
      throw new MesherApiError('http', path, `Mesher request failed with status ${response.status}`, response.status)
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new MesherApiError('invalid-json', path, 'Mesher returned invalid JSON')
    }

    return parse(payload, path)
  } catch (error) {
    if (error instanceof MesherApiError) {
      throw error
    }

    if (didTimeout) {
      throw new MesherApiError('timeout', path, `Mesher request timed out after ${timeoutMs}ms`)
    }

    if (options?.signal?.aborted) {
      throw error
    }

    const message = error instanceof Error ? error.message : 'Unknown network error'
    throw new MesherApiError('network', path, message)
  } finally {
    window.clearTimeout(timeout)
    options?.signal?.removeEventListener('abort', forwardAbort)
  }
}

async function requestMesherJsonWithTransientRetry<T>(
  path: string,
  parse: (value: unknown, path: string) => T,
  signal?: AbortSignal,
): Promise<T> {
  try {
    return await requestMesherJson(path, parse, { signal })
  } catch (error) {
    const transient =
      error instanceof MesherApiError && (error.code === 'timeout' || error.code === 'network')
    if (!transient || signal?.aborted) {
      throw error
    }

    return requestMesherJson(path, parse, { signal })
  }
}

const MESHER_SESSION_STORAGE_KEY = 'hyperpush.management-session'

export function getMesherSessionToken() {
  if (typeof window === 'undefined') return null
  return window.sessionStorage.getItem(MESHER_SESSION_STORAGE_KEY)
}

export function setMesherSessionToken(token: string) {
  window.sessionStorage.setItem(MESHER_SESSION_STORAGE_KEY, token)
}

export function clearMesherSessionToken() {
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(MESHER_SESSION_STORAGE_KEY)
  }
}

export async function loginToMesher(email: string, password: string) {
  const result = await requestMesherJson('/api/v1/auth/login', parseLoginResponse, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  setMesherSessionToken(result.token)
  return result
}

export async function logoutFromMesher() {
  try {
    await requestMesherJson('/api/v1/auth/logout', parseMutationStatusResponse, { method: 'POST' })
  } finally {
    clearMesherSessionToken()
  }
}

export function fetchMesherSessionContext(signal?: AbortSignal) {
  return requestMesherJsonWithTransientRetry('/api/v1/auth/me', parseSessionContext, signal)
}

function projectPath(projectId: string, suffix: string) {
  return `/api/v1/projects/${encodeURIComponent(projectId)}${suffix}`
}

function orgPath(orgId: string, suffix: string) {
  return `/api/v1/orgs/${encodeURIComponent(orgId)}${suffix}`
}

function issueMutationPath(issueId: string, action: MesherIssueMutationAction) {
  return `/api/v1/issues/${encodeURIComponent(issueId)}/${action}`
}

function alertMutationPath(alertId: string, action: 'acknowledge' | 'resolve') {
  return `/api/v1/alerts/${encodeURIComponent(alertId)}/${action}`
}

function alertRuleMutationPath(ruleId: string, action: 'toggle' | 'delete') {
  return `/api/v1/alert-rules/${encodeURIComponent(ruleId)}/${action}`
}

function apiKeyMutationPath(keyId: string) {
  return `/api/v1/api-keys/${encodeURIComponent(keyId)}/revoke`
}

export function isMesherIssueMutationAction(value: string): value is MesherIssueMutationAction {
  return MESHER_ISSUE_MUTATION_ACTIONS.includes(value as MesherIssueMutationAction)
}

export function fetchProjectIssues(projectId: string, signal?: AbortSignal) {
  return requestMesherJsonWithTransientRetry(projectPath(projectId, '/issues'), parseIssuesResponse, signal)
}

export function fetchProjectHealth(projectId: string, signal?: AbortSignal) {
  return requestMesherJsonWithTransientRetry(projectPath(projectId, '/dashboard/health'), parseRecordResponse, signal)
}

export function fetchProjectLevels(projectId: string, signal?: AbortSignal) {
  return requestMesherJsonWithTransientRetry(projectPath(projectId, '/dashboard/levels'), parseRecordArrayResponse, signal)
}

export function fetchProjectVolume(projectId: string, signal?: AbortSignal) {
  return requestMesherJsonWithTransientRetry(projectPath(projectId, '/dashboard/volume'), parseRecordArrayResponse, signal)
}

export async function fetchProjectDashboardBootstrap(
  projectId: string,
  signal?: AbortSignal,
): Promise<MesherDashboardBootstrapPayload> {
  const [issues, health, levels, volume] = await Promise.all([
    fetchProjectIssues(projectId, signal),
    fetchProjectHealth(projectId, signal),
    fetchProjectLevels(projectId, signal),
    fetchProjectVolume(projectId, signal),
  ])

  return {
    issues,
    health,
    levels,
    volume,
  }
}

export function fetchIssueLatestEvents(issueId: string, signal?: AbortSignal) {
  return requestMesherJsonWithTransientRetry(
    `/api/v1/issues/${issueId}/events?limit=1`,
    parseIssueEventsResponse,
    signal,
  )
}

export function fetchEventDetail(eventId: string, signal?: AbortSignal) {
  return requestMesherJsonWithTransientRetry(`/api/v1/events/${eventId}`, parseEventDetailResponse, signal)
}

export function fetchIssueTimeline(issueId: string, signal?: AbortSignal) {
  return requestMesherJsonWithTransientRetry(
    `/api/v1/issues/${issueId}/timeline`,
    parseIssueTimelineResponse,
    signal,
  )
}

export function mutateIssue(issueId: string, action: string, signal?: AbortSignal) {
  if (!isMesherIssueMutationAction(action)) {
    throw new MesherApiError(
      'invalid-payload',
      `/api/v1/issues/${encodeURIComponent(issueId)}/${encodeURIComponent(action || 'unknown')}`,
      `Unsupported issue action "${action}"`,
    )
  }

  return requestMesherJson(issueMutationPath(issueId, action), parseIssueMutationResponse, {
    method: 'POST',
    signal,
  })
}

export function resolveIssue(issueId: string, signal?: AbortSignal) {
  return mutateIssue(issueId, 'resolve', signal)
}

export function unresolveIssue(issueId: string, signal?: AbortSignal) {
  return mutateIssue(issueId, 'unresolve', signal)
}

export function archiveIssue(issueId: string, signal?: AbortSignal) {
  return mutateIssue(issueId, 'archive', signal)
}

export function fetchProjectAlerts(projectId: string, signal?: AbortSignal) {
  return requestMesherJsonWithTransientRetry(projectPath(projectId, '/alerts'), parseProjectAlertsResponse, signal)
}

export function acknowledgeAlert(alertId: string, signal?: AbortSignal) {
  return requestMesherJson(alertMutationPath(alertId, 'acknowledge'), parseMutationStatusResponse, {
    method: 'POST',
    signal,
  })
}

export function resolveAlert(alertId: string, signal?: AbortSignal) {
  return requestMesherJson(alertMutationPath(alertId, 'resolve'), parseMutationStatusResponse, {
    method: 'POST',
    signal,
  })
}

export function fetchProjectAlertRules(projectId: string, signal?: AbortSignal) {
  return requestMesherJsonWithTransientRetry(projectPath(projectId, '/alert-rules'), parseAlertRulesResponse, signal)
}

export function createProjectAlertRule(
  projectId: string,
  body: {
    name?: string
    condition?: MesherApiRecord
    action?: MesherApiRecord
    cooldown_minutes?: number
  },
  signal?: AbortSignal,
) {
  return requestMesherJson(projectPath(projectId, '/alert-rules'), parseCreatedIdResponse, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

export function toggleAlertRule(ruleId: string, enabled: boolean, signal?: AbortSignal) {
  return requestMesherJson(alertRuleMutationPath(ruleId, 'toggle'), parseMutationStatusResponse, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ enabled }),
  })
}

export function deleteAlertRule(ruleId: string, signal?: AbortSignal) {
  return requestMesherJson(alertRuleMutationPath(ruleId, 'delete'), parseMutationStatusResponse, {
    method: 'POST',
    signal,
  })
}

export function fetchProjectSettings(projectId: string, signal?: AbortSignal) {
  return requestMesherJsonWithTransientRetry(
    projectPath(projectId, '/settings'),
    parseProjectSettingsResponse,
    signal,
  )
}

export function updateProjectSettings(
  projectId: string,
  body: {
    retention_days?: number
    sample_rate?: number
  },
  signal?: AbortSignal,
) {
  return requestMesherJson(projectPath(projectId, '/settings'), parseMutationStatusResponse, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

export function fetchProjectStorage(projectId: string, signal?: AbortSignal) {
  return requestMesherJsonWithTransientRetry(
    projectPath(projectId, '/storage'),
    parseProjectStorageResponse,
    signal,
  )
}

export function fetchOrgMembers(orgId: string, signal?: AbortSignal) {
  return requestMesherJsonWithTransientRetry(orgPath(orgId, '/members'), parseOrgMembersResponse, signal)
}

export function addOrgMember(orgId: string, body: { user_id: string; role?: string }, signal?: AbortSignal) {
  return requestMesherJson(orgPath(orgId, '/members'), parseCreatedIdResponse, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

export function updateOrgMemberRole(orgId: string, membershipId: string, role: string, signal?: AbortSignal) {
  return requestMesherJson(orgPath(orgId, `/members/${encodeURIComponent(membershipId)}/role`), parseMutationStatusResponse, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ role }),
  })
}

export function removeOrgMember(orgId: string, membershipId: string, signal?: AbortSignal) {
  return requestMesherJson(orgPath(orgId, `/members/${encodeURIComponent(membershipId)}/remove`), parseMutationStatusResponse, {
    method: 'POST',
    signal,
  })
}

export function fetchProjectApiKeys(projectId: string, signal?: AbortSignal) {
  return requestMesherJsonWithTransientRetry(projectPath(projectId, '/api-keys'), parseApiKeysResponse, signal)
}

export function createProjectApiKey(projectId: string, body: { label?: string }, signal?: AbortSignal) {
  return requestMesherJson(projectPath(projectId, '/api-keys'), parseCreatedApiKeyResponse, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

export function revokeApiKey(keyId: string, signal?: AbortSignal) {
  return requestMesherJson(apiKeyMutationPath(keyId), parseMutationStatusResponse, {
    method: 'POST',
    signal,
  })
}
