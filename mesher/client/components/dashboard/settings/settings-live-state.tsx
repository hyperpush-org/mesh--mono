"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from '@/hooks/use-toast'
import {
  adaptMesherOrgMembers,
  adaptMesherProjectAlertRules,
  adaptMesherProjectApiKeys,
  adaptMesherProjectSettings,
  type SettingsAlertRulesSnapshot,
  type SettingsApiKeysSnapshot,
  type SettingsGeneralSnapshot,
  type SettingsTeamSnapshot,
} from '@/lib/admin-ops-live-adapter'
import {
  MesherApiError,
  type MesherApiErrorCode,
  addOrgMember,
  createProjectAlertRule,
  createProjectApiKey,
  deleteAlertRule,
  fetchProjectAlertRules,
  fetchProjectApiKeys,
  fetchProjectSettings,
  fetchProjectStorage,
  fetchOrgMembers,
  removeOrgMember,
  revokeApiKey,
  toggleAlertRule,
  updateProjectSettings,
  updateOrgMemberRole,
} from '@/lib/mesher-api'
import { useDashboardSession } from '@/components/dashboard/dashboard-session'

export type SettingsLiveSection = 'general' | 'team' | 'api-keys' | 'alert-rules'
export type SettingsSectionState = 'loading' | 'ready' | 'failed'
export type SettingsSectionSource = 'live'
export type SettingsMutationStage = 'validation' | 'mutation' | 'refresh'
export type SettingsMutationPhase = 'idle' | 'mutating' | 'refreshing' | 'failed'

export interface SettingsSectionError {
  code: MesherApiErrorCode
  message: string
  path: string
  status: number | null
}

export interface SettingsMutationError extends SettingsSectionError {
  section: SettingsLiveSection
  action: string
  stage: SettingsMutationStage
}

export interface SettingsCreatedKeyReveal {
  label: string
  keyValue: string
}

interface GeneralSectionState {
  snapshot: SettingsGeneralSnapshot | null
  form: {
    retentionDays: string
    sampleRatePercent: string
  }
  formErrors: {
    retentionDays?: string
    sampleRatePercent?: string
  }
  state: SettingsSectionState
  source: SettingsSectionSource
  error: SettingsSectionError | null
  mutationPhase: SettingsMutationPhase
  mutationError: SettingsMutationError | null
}

interface ApiKeysSectionState {
  snapshot: SettingsApiKeysSnapshot | null
  createFormOpen: boolean
  createLabel: string
  createError: string | null
  reveal: SettingsCreatedKeyReveal | null
  state: SettingsSectionState
  source: SettingsSectionSource
  error: SettingsSectionError | null
  mutationPhase: SettingsMutationPhase
  mutationError: SettingsMutationError | null
}

interface AlertRulesSectionState {
  snapshot: SettingsAlertRulesSnapshot | null
  createFormOpen: boolean
  createName: string
  createConditionJson: string
  createActionJson: string
  createCooldownMinutes: string
  createErrors: {
    name?: string
    conditionJson?: string
    actionJson?: string
    cooldownMinutes?: string
  }
  state: SettingsSectionState
  source: SettingsSectionSource
  error: SettingsSectionError | null
  mutationPhase: SettingsMutationPhase
  mutationError: SettingsMutationError | null
}

interface TeamSectionState {
  snapshot: SettingsTeamSnapshot | null
  createFormOpen: boolean
  createUserId: string
  createRole: string
  createError: string | null
  state: SettingsSectionState
  source: SettingsSectionSource
  error: SettingsSectionError | null
  mutationPhase: SettingsMutationPhase
  mutationError: SettingsMutationError | null
}

const DEFAULT_GENERAL_FORM = {
  retentionDays: '90',
  sampleRatePercent: '100',
} as const

const DEFAULT_ALERT_RULE_FORM = {
  name: '',
  conditionJson: JSON.stringify({ condition_type: 'new_issue' }, null, 2),
  actionJson: JSON.stringify({ type: 'email' }, null, 2),
  cooldownMinutes: '1',
} as const

const DEFAULT_TEAM_FORM = {
  userId: '',
  role: 'member',
} as const

function emptyGeneralState(): GeneralSectionState {
  return {
    snapshot: null,
    form: { ...DEFAULT_GENERAL_FORM },
    formErrors: {},
    state: 'loading',
    source: 'live',
    error: null,
    mutationPhase: 'idle',
    mutationError: null,
  }
}

function emptyApiKeysState(): ApiKeysSectionState {
  return {
    snapshot: null,
    createFormOpen: false,
    createLabel: '',
    createError: null,
    reveal: null,
    state: 'loading',
    source: 'live',
    error: null,
    mutationPhase: 'idle',
    mutationError: null,
  }
}

function emptyAlertRulesState(): AlertRulesSectionState {
  return {
    snapshot: null,
    createFormOpen: false,
    createName: DEFAULT_ALERT_RULE_FORM.name,
    createConditionJson: DEFAULT_ALERT_RULE_FORM.conditionJson,
    createActionJson: DEFAULT_ALERT_RULE_FORM.actionJson,
    createCooldownMinutes: DEFAULT_ALERT_RULE_FORM.cooldownMinutes,
    createErrors: {},
    state: 'loading',
    source: 'live',
    error: null,
    mutationPhase: 'idle',
    mutationError: null,
  }
}

function emptyTeamState(): TeamSectionState {
  return {
    snapshot: null,
    createFormOpen: false,
    createUserId: DEFAULT_TEAM_FORM.userId,
    createRole: DEFAULT_TEAM_FORM.role,
    createError: null,
    state: 'loading',
    source: 'live',
    error: null,
    mutationPhase: 'idle',
    mutationError: null,
  }
}

function toSectionError(error: unknown, path: string): SettingsSectionError {
  if (error instanceof MesherApiError) {
    return {
      code: error.code,
      message: error.message,
      path: error.path,
      status: error.status,
    }
  }

  return {
    code: 'network',
    message: error instanceof Error ? error.message : 'Unknown settings request error',
    path,
    status: null,
  }
}

function toMutationError(
  error: unknown,
  section: SettingsLiveSection,
  action: string,
  stage: SettingsMutationStage,
  path: string,
): SettingsMutationError {
  const normalized = toSectionError(error, path)
  return {
    ...normalized,
    section,
    action,
    stage,
  }
}

function describeSection(section: SettingsLiveSection) {
  switch (section) {
    case 'general':
      return 'General'
    case 'team':
      return 'Team'
    case 'api-keys':
      return 'API keys'
    case 'alert-rules':
      return 'Alert rules'
  }
}

function describeAction(action: string) {
  switch (action) {
    case 'update-settings':
      return 'Update settings'
    case 'add-team-member':
      return 'Add team member'
    case 'update-team-role':
      return 'Update team role'
    case 'remove-team-member':
      return 'Remove team member'
    case 'create-api-key':
      return 'Create API key'
    case 'revoke-api-key':
      return 'Revoke API key'
    case 'create-alert-rule':
      return 'Create alert rule'
    case 'toggle-alert-rule':
      return 'Toggle alert rule'
    case 'delete-alert-rule':
      return 'Delete alert rule'
    default:
      return action
  }
}

function reasonLabel(error: SettingsSectionError) {
  return error.status ? `${error.code} · status ${error.status}` : error.code
}

function showSectionFailureToast(section: SettingsLiveSection, error: SettingsSectionError) {
  toast({
    title: `${describeSection(section)} live data failed`,
    description: `The same-origin ${describeSection(section).toLowerCase()} read failed (${reasonLabel(error)}). The Settings shell stayed mounted with explicit section markers instead of a fake page-wide save state.`,
    variant: 'destructive',
  })
}

function showMutationFailureToast(error: SettingsMutationError) {
  const actionLabel = describeAction(error.action)
  const sectionLabel = describeSection(error.section)

  if (error.stage === 'refresh') {
    toast({
      title: `${actionLabel} applied, but refresh failed`,
      description: `${sectionLabel} kept its previously confirmed values because the follow-up same-origin refresh failed (${reasonLabel(error)}).`,
      variant: 'destructive',
    })
    return
  }

  if (error.stage === 'validation') {
    toast({
      title: `${actionLabel} blocked`,
      description: `${sectionLabel} rejected malformed input before sending a write request.`,
      variant: 'destructive',
    })
    return
  }

  toast({
    title: `${actionLabel} failed`,
    description: `${sectionLabel} stayed on its current confirmed values because the same-origin write failed (${reasonLabel(error)}).`,
    variant: 'destructive',
  })
}

function parsePositiveInteger(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { value: null, error: 'Enter whole days.' }
  }

  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return { value: null, error: 'Use a positive whole number.' }
  }

  return { value: parsed, error: undefined }
}

function parseSampleRatePercent(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { value: null, error: 'Enter a percentage from 0 to 100.' }
  }

  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return { value: null, error: 'Use a percentage from 0 to 100.' }
  }

  return { value: Number((parsed / 100).toFixed(4)), error: undefined }
}

function parseJsonObject(raw: string, field: 'conditionJson' | 'actionJson') {
  const trimmed = raw.trim()
  if (!trimmed) {
    return {
      value: null,
      error: field === 'conditionJson' ? 'Enter a JSON object.' : 'Enter an action JSON object.',
    }
  }

  try {
    const parsed = JSON.parse(trimmed)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        value: null,
        error: 'Expected a JSON object.',
      }
    }

    return { value: parsed as Record<string, unknown>, error: undefined }
  } catch {
    return {
      value: null,
      error: 'Expected valid JSON.',
    }
  }
}

function parseTeamRole(raw: string) {
  const normalized = raw.trim().toLowerCase()
  switch (normalized) {
    case 'owner':
    case 'admin':
    case 'member':
      return { value: normalized, error: undefined }
    default:
      return { value: null, error: 'Use owner, admin, or member.' }
  }
}

export function useSettingsLiveState() {
  const { activeProject } = useDashboardSession()
  const projectId = activeProject?.id ?? ''
  const orgId = activeProject?.orgId ?? ''
  const projectApiPath = `/api/v1/projects/${encodeURIComponent(projectId)}`
  const orgApiPath = `/api/v1/orgs/${encodeURIComponent(orgId)}`
  const [general, setGeneral] = useState<GeneralSectionState>(() => emptyGeneralState())
  const [team, setTeam] = useState<TeamSectionState>(() => emptyTeamState())
  const [apiKeys, setApiKeys] = useState<ApiKeysSectionState>(() => emptyApiKeysState())
  const [alertRules, setAlertRules] = useState<AlertRulesSectionState>(() => emptyAlertRulesState())
  const [lastMutationSection, setLastMutationSection] = useState<SettingsLiveSection | 'none'>('none')
  const [lastMutationAction, setLastMutationAction] = useState<string | null>(null)
  const [lastMutationPhase, setLastMutationPhase] = useState<SettingsMutationPhase>('idle')
  const [lastMutationError, setLastMutationError] = useState<SettingsMutationError | null>(null)

  const generalAbortRef = useRef<AbortController | null>(null)
  const teamAbortRef = useRef<AbortController | null>(null)
  const apiKeysAbortRef = useRef<AbortController | null>(null)
  const alertRulesAbortRef = useRef<AbortController | null>(null)

  const rememberMutation = useCallback(
    (
      section: SettingsLiveSection,
      action: string,
      phase: SettingsMutationPhase,
      error: SettingsMutationError | null,
    ) => {
      setLastMutationSection(section)
      setLastMutationAction(action)
      setLastMutationPhase(phase)
      setLastMutationError(error)
    },
    [],
  )

  const refreshGeneral = useCallback(
    async ({ preserveStateOnFailure: _preserveStateOnFailure = false }: { preserveStateOnFailure?: boolean } = {}) => {
      generalAbortRef.current?.abort()
      const abortController = new AbortController()
      generalAbortRef.current = abortController

      setGeneral((current) => ({
        ...current,
        state: current.snapshot ? current.state : 'loading',
        error: null,
      }))

      try {
        const [settings, storage] = await Promise.all([
          fetchProjectSettings(projectId, abortController.signal),
          fetchProjectStorage(projectId, abortController.signal),
        ])
        if (abortController.signal.aborted) {
          return null
        }

        const snapshot = adaptMesherProjectSettings(settings, storage)
        setGeneral((current) => ({
          ...current,
          snapshot,
          form: {
            retentionDays: String(snapshot.retentionDays),
            sampleRatePercent: String(snapshot.sampleRatePercent),
          },
          formErrors: {},
          state: 'ready',
          source: 'live',
          error: null,
        }))
        return snapshot
      } catch (error) {
        if (abortController.signal.aborted) {
          return null
        }

        const normalized = toSectionError(error, `${projectApiPath}/settings`)
        setGeneral((current) => ({
          ...current,
          state: 'failed',
          source: 'live',
          error: normalized,
        }))
        showSectionFailureToast('general', normalized)
        throw error
      } finally {
        if (generalAbortRef.current === abortController) {
          generalAbortRef.current = null
        }
      }
    },
    [projectApiPath, projectId],
  )

  const refreshTeam = useCallback(
    async ({ preserveStateOnFailure: _preserveStateOnFailure = false }: { preserveStateOnFailure?: boolean } = {}) => {
      teamAbortRef.current?.abort()
      const abortController = new AbortController()
      teamAbortRef.current = abortController

      setTeam((current) => ({
        ...current,
        state: current.snapshot ? current.state : 'loading',
        error: null,
      }))

      try {
        const members = await fetchOrgMembers(orgId, abortController.signal)
        if (abortController.signal.aborted) {
          return null
        }

        const snapshot = adaptMesherOrgMembers(members)
        setTeam((current) => ({
          ...current,
          snapshot,
          state: 'ready',
          source: 'live',
          error: null,
        }))
        return snapshot
      } catch (error) {
        if (abortController.signal.aborted) {
          return null
        }

        const normalized = toSectionError(error, `${orgApiPath}/members`)
        setTeam((current) => ({
          ...current,
          state: 'failed',
          source: 'live',
          error: normalized,
        }))
        showSectionFailureToast('team', normalized)
        throw error
      } finally {
        if (teamAbortRef.current === abortController) {
          teamAbortRef.current = null
        }
      }
    },
    [orgApiPath, orgId],
  )

  const refreshApiKeys = useCallback(
    async ({ preserveStateOnFailure: _preserveStateOnFailure = false }: { preserveStateOnFailure?: boolean } = {}) => {
      apiKeysAbortRef.current?.abort()
      const abortController = new AbortController()
      apiKeysAbortRef.current = abortController

      setApiKeys((current) => ({
        ...current,
        state: current.snapshot ? current.state : 'loading',
        error: null,
      }))

      try {
        const keys = await fetchProjectApiKeys(projectId, abortController.signal)
        if (abortController.signal.aborted) {
          return null
        }

        const snapshot = adaptMesherProjectApiKeys(keys)
        setApiKeys((current) => ({
          ...current,
          snapshot,
          state: 'ready',
          source: 'live',
          error: null,
        }))
        return snapshot
      } catch (error) {
        if (abortController.signal.aborted) {
          return null
        }

        const normalized = toSectionError(error, `${projectApiPath}/api-keys`)
        setApiKeys((current) => ({
          ...current,
          state: 'failed',
          source: 'live',
          error: normalized,
        }))
        showSectionFailureToast('api-keys', normalized)
        throw error
      } finally {
        if (apiKeysAbortRef.current === abortController) {
          apiKeysAbortRef.current = null
        }
      }
    },
    [projectApiPath, projectId],
  )

  const refreshAlertRules = useCallback(
    async ({ preserveStateOnFailure: _preserveStateOnFailure = false }: { preserveStateOnFailure?: boolean } = {}) => {
      alertRulesAbortRef.current?.abort()
      const abortController = new AbortController()
      alertRulesAbortRef.current = abortController

      setAlertRules((current) => ({
        ...current,
        state: current.snapshot ? current.state : 'loading',
        error: null,
      }))

      try {
        const rules = await fetchProjectAlertRules(projectId, abortController.signal)
        if (abortController.signal.aborted) {
          return null
        }

        const snapshot = adaptMesherProjectAlertRules(rules)
        setAlertRules((current) => ({
          ...current,
          snapshot,
          state: 'ready',
          source: 'live',
          error: null,
        }))
        return snapshot
      } catch (error) {
        if (abortController.signal.aborted) {
          return null
        }

        const normalized = toSectionError(error, `${projectApiPath}/alert-rules`)
        setAlertRules((current) => ({
          ...current,
          state: 'failed',
          source: 'live',
          error: normalized,
        }))
        showSectionFailureToast('alert-rules', normalized)
        throw error
      } finally {
        if (alertRulesAbortRef.current === abortController) {
          alertRulesAbortRef.current = null
        }
      }
    },
    [projectApiPath, projectId],
  )

  useEffect(() => {
    void Promise.allSettled([
      refreshGeneral(),
      refreshTeam(),
      refreshApiKeys(),
      refreshAlertRules(),
    ])

    return () => {
      generalAbortRef.current?.abort()
      teamAbortRef.current?.abort()
      apiKeysAbortRef.current?.abort()
      alertRulesAbortRef.current?.abort()
    }
  }, [refreshAlertRules, refreshApiKeys, refreshGeneral, refreshTeam])

  const saveGeneral = useCallback(async () => {
    const retention = parsePositiveInteger(general.form.retentionDays)
    const sampleRate = parseSampleRatePercent(general.form.sampleRatePercent)
    const nextErrors = {
      retentionDays: retention.error,
      sampleRatePercent: sampleRate.error,
    }

    setGeneral((current) => ({
      ...current,
      formErrors: nextErrors,
    }))

    if (!retention.value || sampleRate.value === null) {
      const validationError = toMutationError(
        new MesherApiError('invalid-payload', `${projectApiPath}/settings`, 'Settings form validation failed'),
        'general',
        'update-settings',
        'validation',
        `${projectApiPath}/settings`,
      )
      setGeneral((current) => ({
        ...current,
        mutationPhase: 'failed',
        mutationError: validationError,
      }))
      rememberMutation('general', 'update-settings', 'failed', validationError)
      showMutationFailureToast(validationError)
      return
    }

    setGeneral((current) => ({
      ...current,
      mutationPhase: 'mutating',
      mutationError: null,
    }))
    rememberMutation('general', 'update-settings', 'mutating', null)

    try {
      await updateProjectSettings(projectId, {
        retention_days: retention.value,
        sample_rate: sampleRate.value,
      })
    } catch (error) {
      const mutationError = toMutationError(error, 'general', 'update-settings', 'mutation', `${projectApiPath}/settings`)
      setGeneral((current) => ({
        ...current,
        mutationPhase: 'failed',
        mutationError,
      }))
      rememberMutation('general', 'update-settings', 'failed', mutationError)
      showMutationFailureToast(mutationError)
      return
    }

    setGeneral((current) => ({
      ...current,
      mutationPhase: 'refreshing',
      mutationError: null,
    }))
    rememberMutation('general', 'update-settings', 'refreshing', null)

    try {
      await refreshGeneral({ preserveStateOnFailure: true })
      setGeneral((current) => ({
        ...current,
        mutationPhase: 'idle',
        mutationError: null,
      }))
      rememberMutation('general', 'update-settings', 'idle', null)
    } catch (error) {
      const refreshError = toMutationError(error, 'general', 'update-settings', 'refresh', `${projectApiPath}/settings`)
      setGeneral((current) => ({
        ...current,
        mutationPhase: 'failed',
        mutationError: refreshError,
      }))
      rememberMutation('general', 'update-settings', 'failed', refreshError)
      showMutationFailureToast(refreshError)
    }
  }, [general.form.retentionDays, general.form.sampleRatePercent, projectApiPath, projectId, refreshGeneral, rememberMutation])

  const createTeamMember = useCallback(async () => {
    const userId = team.createUserId.trim()
    const role = parseTeamRole(team.createRole)

    if (!userId || !role.value) {
      const validationMessage = !userId ? 'Enter a raw user_id.' : role.error ?? 'Use owner, admin, or member.'
      const validationError = toMutationError(
        new MesherApiError('invalid-payload', `${orgApiPath}/members`, 'Team form validation failed'),
        'team',
        'add-team-member',
        'validation',
        `${orgApiPath}/members`,
      )
      setTeam((current) => ({
        ...current,
        createError: validationMessage,
        mutationPhase: 'failed',
        mutationError: validationError,
      }))
      rememberMutation('team', 'add-team-member', 'failed', validationError)
      showMutationFailureToast(validationError)
      return
    }

    setTeam((current) => ({
      ...current,
      createError: null,
      mutationPhase: 'mutating',
      mutationError: null,
    }))
    rememberMutation('team', 'add-team-member', 'mutating', null)

    try {
      await addOrgMember(orgId, { user_id: userId, role: role.value })
    } catch (error) {
      const mutationError = toMutationError(error, 'team', 'add-team-member', 'mutation', `${orgApiPath}/members`)
      setTeam((current) => ({
        ...current,
        mutationPhase: 'failed',
        mutationError,
      }))
      rememberMutation('team', 'add-team-member', 'failed', mutationError)
      showMutationFailureToast(mutationError)
      return
    }

    setTeam((current) => ({
      ...current,
      mutationPhase: 'refreshing',
      mutationError: null,
    }))
    rememberMutation('team', 'add-team-member', 'refreshing', null)

    try {
      await refreshTeam({ preserveStateOnFailure: true })
      setTeam((current) => ({
        ...current,
        createFormOpen: false,
        createUserId: DEFAULT_TEAM_FORM.userId,
        createRole: DEFAULT_TEAM_FORM.role,
        createError: null,
        mutationPhase: 'idle',
        mutationError: null,
      }))
      rememberMutation('team', 'add-team-member', 'idle', null)
    } catch (error) {
      const refreshError = toMutationError(error, 'team', 'add-team-member', 'refresh', `${orgApiPath}/members`)
      setTeam((current) => ({
        ...current,
        mutationPhase: 'failed',
        mutationError: refreshError,
      }))
      rememberMutation('team', 'add-team-member', 'failed', refreshError)
      showMutationFailureToast(refreshError)
    }
  }, [orgApiPath, orgId, refreshTeam, rememberMutation, team.createRole, team.createUserId])

  const updateTeamRole = useCallback(async (membershipId: string, roleRaw: string) => {
    const role = parseTeamRole(roleRaw)
    if (!role.value) {
      const validationError = toMutationError(
        new MesherApiError('invalid-payload', `${orgApiPath}/members/${encodeURIComponent(membershipId)}/role`, 'Team role validation failed'),
        'team',
        'update-team-role',
        'validation',
        `${orgApiPath}/members/${encodeURIComponent(membershipId)}/role`,
      )
      setTeam((current) => ({
        ...current,
        mutationPhase: 'failed',
        mutationError: validationError,
      }))
      rememberMutation('team', 'update-team-role', 'failed', validationError)
      showMutationFailureToast(validationError)
      return
    }

    setTeam((current) => ({
      ...current,
      mutationPhase: 'mutating',
      mutationError: null,
    }))
    rememberMutation('team', 'update-team-role', 'mutating', null)

    try {
      await updateOrgMemberRole(orgId, membershipId, role.value)
    } catch (error) {
      const mutationError = toMutationError(error, 'team', 'update-team-role', 'mutation', `${orgApiPath}/members/${encodeURIComponent(membershipId)}/role`)
      setTeam((current) => ({
        ...current,
        mutationPhase: 'failed',
        mutationError,
      }))
      rememberMutation('team', 'update-team-role', 'failed', mutationError)
      showMutationFailureToast(mutationError)
      return
    }

    setTeam((current) => ({
      ...current,
      mutationPhase: 'refreshing',
      mutationError: null,
    }))
    rememberMutation('team', 'update-team-role', 'refreshing', null)

    try {
      await refreshTeam({ preserveStateOnFailure: true })
      setTeam((current) => ({
        ...current,
        mutationPhase: 'idle',
        mutationError: null,
      }))
      rememberMutation('team', 'update-team-role', 'idle', null)
    } catch (error) {
      const refreshError = toMutationError(error, 'team', 'update-team-role', 'refresh', `${orgApiPath}/members`)
      setTeam((current) => ({
        ...current,
        mutationPhase: 'failed',
        mutationError: refreshError,
      }))
      rememberMutation('team', 'update-team-role', 'failed', refreshError)
      showMutationFailureToast(refreshError)
    }
  }, [orgApiPath, orgId, refreshTeam, rememberMutation])

  const removeTeamMember = useCallback(async (membershipId: string) => {
    setTeam((current) => ({
      ...current,
      mutationPhase: 'mutating',
      mutationError: null,
    }))
    rememberMutation('team', 'remove-team-member', 'mutating', null)

    try {
      await removeOrgMember(orgId, membershipId)
    } catch (error) {
      const mutationError = toMutationError(error, 'team', 'remove-team-member', 'mutation', `${orgApiPath}/members/${encodeURIComponent(membershipId)}/remove`)
      setTeam((current) => ({
        ...current,
        mutationPhase: 'failed',
        mutationError,
      }))
      rememberMutation('team', 'remove-team-member', 'failed', mutationError)
      showMutationFailureToast(mutationError)
      return
    }

    setTeam((current) => ({
      ...current,
      mutationPhase: 'refreshing',
      mutationError: null,
    }))
    rememberMutation('team', 'remove-team-member', 'refreshing', null)

    try {
      await refreshTeam({ preserveStateOnFailure: true })
      setTeam((current) => ({
        ...current,
        mutationPhase: 'idle',
        mutationError: null,
      }))
      rememberMutation('team', 'remove-team-member', 'idle', null)
    } catch (error) {
      const refreshError = toMutationError(error, 'team', 'remove-team-member', 'refresh', `${orgApiPath}/members`)
      setTeam((current) => ({
        ...current,
        mutationPhase: 'failed',
        mutationError: refreshError,
      }))
      rememberMutation('team', 'remove-team-member', 'failed', refreshError)
      showMutationFailureToast(refreshError)
    }
  }, [orgApiPath, orgId, refreshTeam, rememberMutation])

  const createApiKey = useCallback(async () => {
    const label = apiKeys.createLabel.trim()
    if (!label) {
      const validationError = toMutationError(
        new MesherApiError('invalid-payload', `${projectApiPath}/api-keys`, 'API key label is required'),
        'api-keys',
        'create-api-key',
        'validation',
        `${projectApiPath}/api-keys`,
      )
      setApiKeys((current) => ({
        ...current,
        createError: 'Enter a key label.',
        reveal: null,
        mutationPhase: 'failed',
        mutationError: validationError,
      }))
      rememberMutation('api-keys', 'create-api-key', 'failed', validationError)
      showMutationFailureToast(validationError)
      return
    }

    setApiKeys((current) => ({
      ...current,
      createError: null,
      reveal: null,
      mutationPhase: 'mutating',
      mutationError: null,
    }))
    rememberMutation('api-keys', 'create-api-key', 'mutating', null)

    let createdKeyValue = ''

    try {
      const created = await createProjectApiKey(projectId, { label })
      createdKeyValue = created.key_value
    } catch (error) {
      const mutationError = toMutationError(error, 'api-keys', 'create-api-key', 'mutation', `${projectApiPath}/api-keys`)
      setApiKeys((current) => ({
        ...current,
        reveal: null,
        mutationPhase: 'failed',
        mutationError,
      }))
      rememberMutation('api-keys', 'create-api-key', 'failed', mutationError)
      showMutationFailureToast(mutationError)
      return
    }

    setApiKeys((current) => ({
      ...current,
      mutationPhase: 'refreshing',
      mutationError: null,
    }))
    rememberMutation('api-keys', 'create-api-key', 'refreshing', null)

    try {
      await refreshApiKeys({ preserveStateOnFailure: true })
      setApiKeys((current) => ({
        ...current,
        createFormOpen: false,
        createLabel: '',
        createError: null,
        reveal: {
          label,
          keyValue: createdKeyValue,
        },
        mutationPhase: 'idle',
        mutationError: null,
      }))
      rememberMutation('api-keys', 'create-api-key', 'idle', null)
    } catch (error) {
      const refreshError = toMutationError(error, 'api-keys', 'create-api-key', 'refresh', `${projectApiPath}/api-keys`)
      setApiKeys((current) => ({
        ...current,
        reveal: null,
        mutationPhase: 'failed',
        mutationError: refreshError,
      }))
      rememberMutation('api-keys', 'create-api-key', 'failed', refreshError)
      showMutationFailureToast(refreshError)
    }
  }, [apiKeys.createLabel, projectApiPath, projectId, refreshApiKeys, rememberMutation])

  const revokeKey = useCallback(async (keyId: string) => {
    setApiKeys((current) => ({
      ...current,
      mutationPhase: 'mutating',
      mutationError: null,
    }))
    rememberMutation('api-keys', 'revoke-api-key', 'mutating', null)

    try {
      await revokeApiKey(keyId)
    } catch (error) {
      const mutationError = toMutationError(error, 'api-keys', 'revoke-api-key', 'mutation', `/api/v1/api-keys/${encodeURIComponent(keyId)}/revoke`)
      setApiKeys((current) => ({
        ...current,
        mutationPhase: 'failed',
        mutationError,
      }))
      rememberMutation('api-keys', 'revoke-api-key', 'failed', mutationError)
      showMutationFailureToast(mutationError)
      return
    }

    setApiKeys((current) => ({
      ...current,
      mutationPhase: 'refreshing',
      mutationError: null,
    }))
    rememberMutation('api-keys', 'revoke-api-key', 'refreshing', null)

    try {
      await refreshApiKeys({ preserveStateOnFailure: true })
      setApiKeys((current) => ({
        ...current,
        mutationPhase: 'idle',
        mutationError: null,
      }))
      rememberMutation('api-keys', 'revoke-api-key', 'idle', null)
    } catch (error) {
      const refreshError = toMutationError(error, 'api-keys', 'revoke-api-key', 'refresh', `${projectApiPath}/api-keys`)
      setApiKeys((current) => ({
        ...current,
        mutationPhase: 'failed',
        mutationError: refreshError,
      }))
      rememberMutation('api-keys', 'revoke-api-key', 'failed', refreshError)
      showMutationFailureToast(refreshError)
    }
  }, [projectApiPath, refreshApiKeys, rememberMutation])

  const createAlertRule = useCallback(async () => {
    const name = alertRules.createName.trim()
    const condition = parseJsonObject(alertRules.createConditionJson, 'conditionJson')
    const action = parseJsonObject(alertRules.createActionJson, 'actionJson')
    const cooldown = parsePositiveInteger(alertRules.createCooldownMinutes)
    const createErrors = {
      name: name ? undefined : 'Enter a rule name.',
      conditionJson: condition.error,
      actionJson: action.error,
      cooldownMinutes: cooldown.error,
    }

    setAlertRules((current) => ({
      ...current,
      createErrors,
    }))

    if (!name || !condition.value || !action.value || !cooldown.value) {
      const validationError = toMutationError(
        new MesherApiError('invalid-payload', `${projectApiPath}/alert-rules`, 'Alert rule validation failed'),
        'alert-rules',
        'create-alert-rule',
        'validation',
        `${projectApiPath}/alert-rules`,
      )
      setAlertRules((current) => ({
        ...current,
        mutationPhase: 'failed',
        mutationError: validationError,
      }))
      rememberMutation('alert-rules', 'create-alert-rule', 'failed', validationError)
      showMutationFailureToast(validationError)
      return
    }

    setAlertRules((current) => ({
      ...current,
      mutationPhase: 'mutating',
      mutationError: null,
    }))
    rememberMutation('alert-rules', 'create-alert-rule', 'mutating', null)

    try {
      await createProjectAlertRule(projectId, {
        name,
        condition: condition.value,
        action: action.value,
        cooldown_minutes: cooldown.value,
      })
    } catch (error) {
      const mutationError = toMutationError(error, 'alert-rules', 'create-alert-rule', 'mutation', `${projectApiPath}/alert-rules`)
      setAlertRules((current) => ({
        ...current,
        mutationPhase: 'failed',
        mutationError,
      }))
      rememberMutation('alert-rules', 'create-alert-rule', 'failed', mutationError)
      showMutationFailureToast(mutationError)
      return
    }

    setAlertRules((current) => ({
      ...current,
      mutationPhase: 'refreshing',
      mutationError: null,
    }))
    rememberMutation('alert-rules', 'create-alert-rule', 'refreshing', null)

    try {
      await refreshAlertRules({ preserveStateOnFailure: true })
      setAlertRules((current) => ({
        ...current,
        createFormOpen: false,
        createName: DEFAULT_ALERT_RULE_FORM.name,
        createConditionJson: DEFAULT_ALERT_RULE_FORM.conditionJson,
        createActionJson: DEFAULT_ALERT_RULE_FORM.actionJson,
        createCooldownMinutes: DEFAULT_ALERT_RULE_FORM.cooldownMinutes,
        createErrors: {},
        mutationPhase: 'idle',
        mutationError: null,
      }))
      rememberMutation('alert-rules', 'create-alert-rule', 'idle', null)
    } catch (error) {
      const refreshError = toMutationError(error, 'alert-rules', 'create-alert-rule', 'refresh', `${projectApiPath}/alert-rules`)
      setAlertRules((current) => ({
        ...current,
        mutationPhase: 'failed',
        mutationError: refreshError,
      }))
      rememberMutation('alert-rules', 'create-alert-rule', 'failed', refreshError)
      showMutationFailureToast(refreshError)
    }
  }, [
    alertRules.createActionJson,
    alertRules.createConditionJson,
    alertRules.createCooldownMinutes,
    alertRules.createName,
    projectApiPath,
    projectId,
    refreshAlertRules,
    rememberMutation,
  ])

  const toggleRuleEnabled = useCallback(async (ruleId: string, enabled: boolean) => {
    setAlertRules((current) => ({
      ...current,
      mutationPhase: 'mutating',
      mutationError: null,
    }))
    rememberMutation('alert-rules', 'toggle-alert-rule', 'mutating', null)

    try {
      await toggleAlertRule(ruleId, enabled)
    } catch (error) {
      const mutationError = toMutationError(error, 'alert-rules', 'toggle-alert-rule', 'mutation', `/api/v1/alert-rules/${encodeURIComponent(ruleId)}/toggle`)
      setAlertRules((current) => ({
        ...current,
        mutationPhase: 'failed',
        mutationError,
      }))
      rememberMutation('alert-rules', 'toggle-alert-rule', 'failed', mutationError)
      showMutationFailureToast(mutationError)
      return
    }

    setAlertRules((current) => ({
      ...current,
      mutationPhase: 'refreshing',
      mutationError: null,
    }))
    rememberMutation('alert-rules', 'toggle-alert-rule', 'refreshing', null)

    try {
      await refreshAlertRules({ preserveStateOnFailure: true })
      setAlertRules((current) => ({
        ...current,
        mutationPhase: 'idle',
        mutationError: null,
      }))
      rememberMutation('alert-rules', 'toggle-alert-rule', 'idle', null)
    } catch (error) {
      const refreshError = toMutationError(error, 'alert-rules', 'toggle-alert-rule', 'refresh', `${projectApiPath}/alert-rules`)
      setAlertRules((current) => ({
        ...current,
        mutationPhase: 'failed',
        mutationError: refreshError,
      }))
      rememberMutation('alert-rules', 'toggle-alert-rule', 'failed', refreshError)
      showMutationFailureToast(refreshError)
    }
  }, [projectApiPath, refreshAlertRules, rememberMutation])

  const removeRule = useCallback(async (ruleId: string) => {
    setAlertRules((current) => ({
      ...current,
      mutationPhase: 'mutating',
      mutationError: null,
    }))
    rememberMutation('alert-rules', 'delete-alert-rule', 'mutating', null)

    try {
      await deleteAlertRule(ruleId)
    } catch (error) {
      const mutationError = toMutationError(error, 'alert-rules', 'delete-alert-rule', 'mutation', `/api/v1/alert-rules/${encodeURIComponent(ruleId)}/delete`)
      setAlertRules((current) => ({
        ...current,
        mutationPhase: 'failed',
        mutationError,
      }))
      rememberMutation('alert-rules', 'delete-alert-rule', 'failed', mutationError)
      showMutationFailureToast(mutationError)
      return
    }

    setAlertRules((current) => ({
      ...current,
      mutationPhase: 'refreshing',
      mutationError: null,
    }))
    rememberMutation('alert-rules', 'delete-alert-rule', 'refreshing', null)

    try {
      await refreshAlertRules({ preserveStateOnFailure: true })
      setAlertRules((current) => ({
        ...current,
        mutationPhase: 'idle',
        mutationError: null,
      }))
      rememberMutation('alert-rules', 'delete-alert-rule', 'idle', null)
    } catch (error) {
      const refreshError = toMutationError(error, 'alert-rules', 'delete-alert-rule', 'refresh', `${projectApiPath}/alert-rules`)
      setAlertRules((current) => ({
        ...current,
        mutationPhase: 'failed',
        mutationError: refreshError,
      }))
      rememberMutation('alert-rules', 'delete-alert-rule', 'failed', refreshError)
      showMutationFailureToast(refreshError)
    }
  }, [projectApiPath, refreshAlertRules, rememberMutation])

  const shellState = useMemo<SettingsSectionState>(() => {
    if ([general, team, apiKeys, alertRules].every((section) => section.state === 'ready')) {
      return 'ready'
    }
    if ([general, team, apiKeys, alertRules].some((section) => section.state === 'failed')) {
      return 'failed'
    }
    return 'loading'
  }, [alertRules, apiKeys, general, team])

  const shellSource: SettingsSectionSource = 'live'

  return {
    shellState,
    shellSource,
    lastMutationSection,
    lastMutationAction,
    lastMutationPhase,
    lastMutationError,
    general: {
      ...general,
      setRetentionDays: (value: string) => {
        setGeneral((current) => ({
          ...current,
          form: {
            ...current.form,
            retentionDays: value,
          },
          formErrors: {
            ...current.formErrors,
            retentionDays: undefined,
          },
        }))
      },
      setSampleRatePercent: (value: string) => {
        setGeneral((current) => ({
          ...current,
          form: {
            ...current.form,
            sampleRatePercent: value,
          },
          formErrors: {
            ...current.formErrors,
            sampleRatePercent: undefined,
          },
        }))
      },
      refresh: refreshGeneral,
      save: saveGeneral,
      isPending: general.mutationPhase === 'mutating' || general.mutationPhase === 'refreshing',
    },
    team: {
      ...team,
      setCreateFormOpen: (open: boolean) => {
        setTeam((current) => ({
          ...current,
          createFormOpen: open,
          createError: open ? current.createError : null,
        }))
      },
      setCreateUserId: (value: string) => {
        setTeam((current) => ({
          ...current,
          createUserId: value,
          createError: null,
        }))
      },
      setCreateRole: (value: string) => {
        setTeam((current) => ({
          ...current,
          createRole: value,
          createError: null,
        }))
      },
      refresh: refreshTeam,
      create: createTeamMember,
      updateRole: updateTeamRole,
      remove: removeTeamMember,
      isPending: team.mutationPhase === 'mutating' || team.mutationPhase === 'refreshing',
    },
    apiKeys: {
      ...apiKeys,
      setCreateFormOpen: (open: boolean) => {
        setApiKeys((current) => ({
          ...current,
          createFormOpen: open,
          createError: open ? current.createError : null,
        }))
      },
      setCreateLabel: (value: string) => {
        setApiKeys((current) => ({
          ...current,
          createLabel: value,
          createError: null,
        }))
      },
      dismissReveal: () => {
        setApiKeys((current) => ({
          ...current,
          reveal: null,
        }))
      },
      refresh: refreshApiKeys,
      create: createApiKey,
      revoke: revokeKey,
      isPending: apiKeys.mutationPhase === 'mutating' || apiKeys.mutationPhase === 'refreshing',
    },
    alertRules: {
      ...alertRules,
      setCreateFormOpen: (open: boolean) => {
        setAlertRules((current) => ({
          ...current,
          createFormOpen: open,
        }))
      },
      setCreateName: (value: string) => {
        setAlertRules((current) => ({
          ...current,
          createName: value,
          createErrors: {
            ...current.createErrors,
            name: undefined,
          },
        }))
      },
      setCreateConditionJson: (value: string) => {
        setAlertRules((current) => ({
          ...current,
          createConditionJson: value,
          createErrors: {
            ...current.createErrors,
            conditionJson: undefined,
          },
        }))
      },
      setCreateActionJson: (value: string) => {
        setAlertRules((current) => ({
          ...current,
          createActionJson: value,
          createErrors: {
            ...current.createErrors,
            actionJson: undefined,
          },
        }))
      },
      setCreateCooldownMinutes: (value: string) => {
        setAlertRules((current) => ({
          ...current,
          createCooldownMinutes: value,
          createErrors: {
            ...current.createErrors,
            cooldownMinutes: undefined,
          },
        }))
      },
      refresh: refreshAlertRules,
      create: createAlertRule,
      toggleEnabled: toggleRuleEnabled,
      remove: removeRule,
      isPending: alertRules.mutationPhase === 'mutating' || alertRules.mutationPhase === 'refreshing',
    },
  }
}
