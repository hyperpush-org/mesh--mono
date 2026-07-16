import { expect, test } from '@playwright/test'
import type { DashboardRouteDefinition } from '../../components/dashboard/dashboard-route-map'
import {
  DASHBOARD_ROUTES,
  assertCleanLiveRuntimeSignals,
  attachRuntimeSignalTracking,
  clearRuntimeSignals,
  expectDashboardRoute,
  expectSameOriginApiCallSeen,
  expectSameOriginApiPathSeen,
  goToDashboardRouteDirect,
  navigateToDashboardRoute,
} from './live-runtime-helpers'
import { DEFAULT_API_KEY, ensureSeededIssueOpen } from './seeded-live-issue'

const SEEDED_READ_ISSUE_TITLE = 'M060 seeded live issue read seam'
const SEEDED_ACTION_ISSUE_TITLE = 'M060 seeded live issue action seam'
const SEEDED_READ_STACK_FILE = 'seed/live-issue-read.ts'
const SEEDED_ALERT_ID = '88888888-8888-4888-8888-888888888888'
const SEEDED_CANDIDATE_USER_ID = '33333333-3333-4333-8333-333333333333'
const SEEDED_CANDIDATE_EMAIL = 'seed-candidate@hyperpush.dev'
const SEEDED_READ_ISSUE = {
  title: SEEDED_READ_ISSUE_TITLE,
  fingerprint: 'm060-seeded-live-issue-read-seam',
  stackFile: SEEDED_READ_STACK_FILE,
  breadcrumbMessage: 'Seeded live issue read breadcrumb',
  tagValue: 'm060-live-read-seam',
  surface: 'issues-live-read',
} as const
const SEEDED_ACTION_ISSUE = {
  title: SEEDED_ACTION_ISSUE_TITLE,
  fingerprint: 'm060-seeded-live-issue-action-seam',
  stackFile: 'seed/live-issue-action.ts',
  breadcrumbMessage: 'Seeded live issue action breadcrumb',
  tagValue: 'm060-live-action-seam',
  surface: 'issues-live-actions',
} as const

type SeededAlert = {
  alertId: string
  ruleId: string
  ruleName: string
}

function uniqueSeedSuffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function createSeededLiveAlert(
  request: import('@playwright/test').APIRequestContext,
  suffix = uniqueSeedSuffix(),
): Promise<SeededAlert> {
  const ruleName = `M060 walkthrough alert ${suffix}`
  const createRuleResponse = await request.post('/api/v1/projects/default/alert-rules', {
    data: {
      name: ruleName,
      condition: {
        condition_type: 'new_issue',
      },
      action: {
        type: 'email',
      },
      cooldown_minutes: 1,
    },
  })

  expect(createRuleResponse.ok()).toBeTruthy()
  const createRulePayload = await createRuleResponse.json()
  expect(typeof createRulePayload.id).toBe('string')

  const eventFingerprint = `m060-seeded-walkthrough-alert-${suffix}`
  const ingestResponse = await request.post('/api/v1/events', {
    headers: {
      'content-type': 'application/json',
      'x-sentry-auth': DEFAULT_API_KEY,
    },
    data: {
      message: `Seeded walkthrough alert ${suffix}`,
      level: 'error',
      fingerprint: eventFingerprint,
      tags: JSON.stringify({
        environment: 'seeded-local',
        seed_case: 'm060-seeded-walkthrough-alerts',
      }),
      extra: JSON.stringify({
        surface: 'alerts-dashboard',
      }),
      sdk_name: 'playwright',
      sdk_version: '1.0.0',
    },
  })

  expect(ingestResponse.ok()).toBeTruthy()
  const ingestPayload = await ingestResponse.json()
  expect(['accepted', 'ok']).toContain(ingestPayload.status)

  let lastAlertSummary = '[]'
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const alertsResponse = await request.get('/api/v1/projects/default/alerts')
    expect(alertsResponse.ok()).toBeTruthy()
    const alertsPayload = await alertsResponse.json()
    lastAlertSummary = JSON.stringify(
      alertsPayload
        .slice(0, 5)
        .map((alert: { id?: string; rule_name?: string; status?: string }) => ({
          id: alert.id,
          rule_name: alert.rule_name,
          status: alert.status,
        })),
    )
    const seededAlert = alertsPayload.find(
      (alert: { id?: string; rule_name?: string; status?: string }) => alert.rule_name === ruleName,
    )

    if (seededAlert && typeof seededAlert.id === 'string' && seededAlert.status === 'active') {
      return {
        alertId: seededAlert.id,
        ruleId: createRulePayload.id as string,
        ruleName,
      }
    }

    await sleep(250)
  }

  throw new Error(
    `Expected seeded alert for rule ${ruleName} to appear in /api/v1/projects/default/alerts within 20s; last alerts snapshot: ${lastAlertSummary}`,
  )
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchProjectSettings(request: import('@playwright/test').APIRequestContext) {
  const response = await request.get('/api/v1/projects/default/settings')
  expect(response.ok()).toBeTruthy()
  return (await response.json()) as { retention_days: number; sample_rate: number }
}

async function listProjectApiKeys(request: import('@playwright/test').APIRequestContext) {
  const response = await request.get('/api/v1/projects/default/api-keys')
  expect(response.ok()).toBeTruthy()
  return (await response.json()) as Array<{ id: string; label: string; revoked_at: string | null }>
}

async function listProjectAlertRules(request: import('@playwright/test').APIRequestContext) {
  const response = await request.get('/api/v1/projects/default/alert-rules')
  expect(response.ok()).toBeTruthy()
  return (await response.json()) as Array<{ id: string; name: string }>
}

async function listOrgMembers(request: import('@playwright/test').APIRequestContext) {
  const response = await request.get('/api/v1/orgs/default/members')
  expect(response.ok()).toBeTruthy()
  return (await response.json()) as Array<{
    id: string
    user_id: string
    email: string
    display_name: string
    role: string
  }>
}

async function removeOrgMemberByUserId(
  request: import('@playwright/test').APIRequestContext,
  userId: string,
) {
  const members = await listOrgMembers(request)
  const member = members.find((entry) => entry.user_id === userId)
  if (!member) {
    return
  }

  const response = await request.post(`/api/v1/orgs/default/members/${member.id}/remove`)
  expect(response.ok()).toBeTruthy()
}

async function revokeKeyByLabel(
  request: import('@playwright/test').APIRequestContext,
  label: string,
) {
  const keys = await listProjectApiKeys(request)
  const key = keys.find((entry) => entry.label === label && entry.revoked_at === null)
  if (!key) {
    return
  }

  const response = await request.post(`/api/v1/api-keys/${key.id}/revoke`)
  expect(response.ok()).toBeTruthy()
}

async function deleteRuleByName(
  request: import('@playwright/test').APIRequestContext,
  name: string,
) {
  const rules = await listProjectAlertRules(request)
  const rule = rules.find((entry) => entry.name === name)
  if (!rule) {
    return
  }

  const response = await request.post(`/api/v1/alert-rules/${rule.id}/delete`)
  expect(response.ok()).toBeTruthy()
}

async function assertRouteDirectEntry(page: import('@playwright/test').Page, route: DashboardRouteDefinition) {
  await goToDashboardRouteDirect(page, route)

  switch (route.key) {
    case 'issues':
      await expect(page.getByRole('heading', { name: 'Issues', level: 1 })).toBeVisible()
      await expect(page.getByTestId('issues-shell')).toBeVisible()
      await expect(page.getByTestId('issues-search-input')).toBeVisible()
      break
    case 'performance':
      await expect(page.getByRole('heading', { name: 'Performance', level: 1 })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Apdex', exact: true })).toBeVisible()
      break
    case 'releases':
      await expect(page.getByRole('heading', { name: 'Releases', level: 1 })).toBeVisible()
      await expect(page.getByPlaceholder('Search releases…')).toBeVisible()
      break
    case 'alerts':
      await expect(page.getByRole('heading', { name: 'Alerts', level: 1 })).toBeVisible()
      await expect(page.getByTestId('alerts-shell')).toBeVisible()
      await expect(page.getByPlaceholder('Search alerts…')).toBeVisible()
      break
    case 'settings':
      await expect(page.getByTestId('settings-shell')).toBeVisible()
      await expect(page.getByTestId('ai-copilot-toggle')).toHaveCount(0)
      await expect(page.getByText('Project name', { exact: true })).toBeVisible()
      break
    default:
      route.key satisfies never
  }
}

async function assertMockOnlyTopLevelRoute(page: import('@playwright/test').Page, route: DashboardRouteDefinition) {
  await expectDashboardRoute(page, route)

  switch (route.key) {
    case 'performance':
      await expect(page.getByRole('heading', { name: 'Performance', level: 1 })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Apdex', exact: true })).toBeVisible()
      break
    case 'releases':
      await expect(page.getByRole('heading', { name: 'Releases', level: 1 })).toBeVisible()
      await expect(page.getByPlaceholder('Search releases…')).toBeVisible()
      break
    default:
      throw new Error(`Expected a mock-only top-level route, received ${route.key}`)
  }
}

async function assertMockOnlySettingsSections(page: import('@playwright/test').Page) {
  const settingsShell = page.getByTestId('settings-shell')
  const cases = [
    {
      label: /Integrations/,
      tab: 'integrations',
      support: 'mock-only',
      assertion: async () => {
        await expect(page.getByTestId('settings-integrations-mock-only-banner')).toContainText('Mock-only shell')
      },
    },
    {
      label: /Billing/,
      tab: 'billing',
      support: 'mock-only',
      assertion: async () => {
        await expect(page.getByTestId('settings-billing-mock-only-banner')).toContainText('Mock-only shell')
      },
    },
    {
      label: /Security/,
      tab: 'security',
      support: 'mock-only',
      assertion: async () => {
        await expect(page.getByTestId('settings-security-mock-only-banner')).toContainText('Mock-only shell')
      },
    },
    {
      label: /Notifications/,
      tab: 'notifications',
      support: 'mock-only',
      assertion: async () => {
        await expect(page.getByTestId('settings-notifications-mock-only-banner')).toContainText('Mock-only shell')
      },
    },
    {
      label: /Profile/,
      tab: 'profile',
      support: 'mock-only',
      assertion: async () => {
        await expect(page.getByTestId('settings-profile-mock-only-banner')).toContainText('Mock-only shell')
      },
    },
  ] as const

  for (const entry of cases) {
    await page.getByRole('button', { name: entry.label }).click()
    await expect(settingsShell).toHaveAttribute('data-current-tab', entry.tab)
    await expect(page.getByTestId('settings-shell-support-badge')).toContainText(entry.support)
    await entry.assertion()
  }
}

test.describe('seeded walkthrough', () => {
  test('dashboard route parity derives direct-entry coverage from the canonical route map', async ({ page }) => {
    const runtimeSignals = attachRuntimeSignalTracking(page)

    for (const route of DASHBOARD_ROUTES) {
      await test.step(`direct entry: ${route.key}`, async () => {
        await assertRouteDirectEntry(page, route)
        await assertCleanLiveRuntimeSignals(runtimeSignals, {
          failureContext: `dashboard route parity: ${route.key}`,
        })
        clearRuntimeSignals(runtimeSignals)
      })
    }

    await test.step('unknown paths still fall back to the issues shell', async () => {
      await page.goto('/does-not-exist/deep-link')
      await expect(page.getByTestId('dashboard-shell')).toHaveAttribute('data-route-key', 'issues')
      await expect(page.getByTestId('sidebar-nav-issues')).toHaveAttribute('data-active', 'true')
      await expect(page.getByRole('heading', { name: 'Issues', level: 1 })).toBeVisible()
      await expect(page.getByTestId('issues-search-input')).toBeVisible()
      await assertCleanLiveRuntimeSignals(runtimeSignals, {
        failureContext: 'dashboard route parity: unknown-path fallback',
      })
    })
  })

  test('seeded walkthrough traverses the canonical dashboard shell with truthful live and mock state', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000)

    const runtimeSignals = attachRuntimeSignalTracking(page)
    const seededReadIssue = await ensureSeededIssueOpen(request, SEEDED_READ_ISSUE)
    const seededActionIssue = await ensureSeededIssueOpen(request, SEEDED_ACTION_ISSUE)
    const seededAlert = await createSeededLiveAlert(request)
    const originalSettings = await fetchProjectSettings(request)
    const createdKeyLabel = `M060 walkthrough key ${uniqueSeedSuffix()}`
    const createdRuleName = `M060 walkthrough rule ${uniqueSeedSuffix()}`
    const nextRetention = originalSettings.retention_days === 90 ? 120 : 90
    const nextSampleRatePercent = originalSettings.sample_rate === 1 ? '50' : '100'

    try {
      await removeOrgMemberByUserId(request, SEEDED_CANDIDATE_USER_ID)

      await test.step('issues prove seeded same-origin reads and supported write actions', async () => {
        const issuesRoute = DASHBOARD_ROUTES.find((route) => route.key === 'issues')
        expect(issuesRoute).toBeTruthy()

        await goToDashboardRouteDirect(page, issuesRoute!)

        const issuesShell = page.getByTestId('issues-shell')
        const searchInput = page.getByTestId('issues-search-input')
        const detailPanel = page.getByTestId('issue-detail-panel')

        await expect(issuesShell).toHaveAttribute('data-bootstrap-state', 'ready')
        await expect(issuesShell).toHaveAttribute('data-overview-source', /(live|mixed)/)
        await expect(page.getByTestId('issues-stats-bar')).toHaveAttribute('data-source', /(live|mixed)/)
        await expect(page.getByText('Live overview active', { exact: false })).toBeVisible()

        await searchInput.fill(seededReadIssue.issueId)
        await expect(page.getByTestId(`issue-row-${seededReadIssue.issueId}`)).toBeVisible()
        await page.getByTestId(`issue-row-${seededReadIssue.issueId}`).click()

        await expect(detailPanel).toBeVisible()
        await expect(detailPanel).toHaveAttribute('data-state', 'ready')
        await expect(detailPanel).toHaveAttribute('data-source', 'mixed')
        await expect(issuesShell).toHaveAttribute('data-selected-issue-id', seededReadIssue.issueId)
        await expect(page.getByTestId('issue-detail-live-banner')).toContainText('Live event detail + timeline active')
        await expect(page.getByTestId('issue-detail-recent-events')).toBeVisible()
        await expect(page.getByRole('button', { name: 'AI Analysis' })).toHaveAttribute('data-source', 'shell-only')
        await expect(detailPanel).toContainText(SEEDED_READ_STACK_FILE)

        await expectSameOriginApiPathSeen(runtimeSignals, '/api/v1/projects/default/issues', 'seeded walkthrough issues')
        await expectSameOriginApiPathSeen(
          runtimeSignals,
          `/api/v1/issues/${seededReadIssue.issueId}/events`,
          'seeded walkthrough issues',
        )
        await expectSameOriginApiPathSeen(
          runtimeSignals,
          `/api/v1/events/${seededReadIssue.eventId}`,
          'seeded walkthrough issues',
        )
        await expectSameOriginApiPathSeen(
          runtimeSignals,
          `/api/v1/issues/${seededReadIssue.issueId}/timeline`,
          'seeded walkthrough issues',
        )

        await searchInput.fill(seededActionIssue.issueId)
        await expect(page.getByTestId(`issue-row-${seededActionIssue.issueId}`)).toBeVisible()
        await page.getByTestId(`issue-row-${seededActionIssue.issueId}`).click()
        await expect(detailPanel).toContainText(SEEDED_ACTION_ISSUE_TITLE)
        await expect(page.getByTestId('issue-detail-action-source-note')).toContainText('same-origin Mesher seam')

        await page.getByTestId('issue-detail-action-resolve').click()
        await expect.poll(async () => issuesShell.getAttribute('data-last-action')).toBe('resolve')
        await expect.poll(async () => issuesShell.getAttribute('data-issue-action-phase')).toBe('idle')
        await page.getByTestId('issues-status-filter-resolved').click()
        await expect(page.getByTestId(`issue-row-${seededActionIssue.issueId}`)).toContainText('resolved')

        await page.getByTestId('issue-detail-action-unresolve').click()
        await expect.poll(async () => issuesShell.getAttribute('data-last-action')).toBe('unresolve')
        await expect.poll(async () => issuesShell.getAttribute('data-issue-action-phase')).toBe('idle')
        await page.getByTestId('issues-status-filter-open').click()
        await expect(page.getByTestId(`issue-row-${seededActionIssue.issueId}`)).toContainText('open')

        await expectSameOriginApiPathSeen(
          runtimeSignals,
          `/api/v1/issues/${seededActionIssue.issueId}/resolve`,
          'seeded walkthrough issues',
        )
        await expectSameOriginApiPathSeen(
          runtimeSignals,
          `/api/v1/issues/${seededActionIssue.issueId}/unresolve`,
          'seeded walkthrough issues',
        )
        await assertCleanLiveRuntimeSignals(runtimeSignals, {
          failureContext: 'seeded walkthrough issues',
        })
        clearRuntimeSignals(runtimeSignals)
      })

      for (const route of DASHBOARD_ROUTES.filter(({ key }) =>
        ['performance', 'releases'].includes(key),
      )) {
        await test.step(`mock-only top-level route stays reachable: ${route.key}`, async () => {
          await navigateToDashboardRoute(page, route)
          await assertMockOnlyTopLevelRoute(page, route)
          await assertCleanLiveRuntimeSignals(runtimeSignals, {
            failureContext: `seeded walkthrough ${route.key}`,
          })
          clearRuntimeSignals(runtimeSignals)
        })
      }

      await test.step('alerts prove seeded live detail and supported write actions', async () => {
        const alertsRoute = DASHBOARD_ROUTES.find((route) => route.key === 'alerts')
        expect(alertsRoute).toBeTruthy()

        await navigateToDashboardRoute(page, alertsRoute!)

        const alertsShell = page.getByTestId('alerts-shell')
        const detailPanel = page.getByTestId('alert-detail-panel')
        const alertRow = page.getByTestId(`alert-row-${seededAlert.alertId}`)

        await expect(alertsShell).toHaveAttribute('data-bootstrap-state', 'ready')
        await expect(alertsShell).toHaveAttribute('data-overview-source', /(live|mixed)/)
        await expect(page.getByTestId('alerts-stats-bar')).toHaveAttribute('data-source', /(live|mixed)/)
        await expect(page.getByText('Live alerts active', { exact: false })).toBeVisible()
        await expect(alertRow).toBeVisible()

        await alertRow.click()
        await expect(detailPanel).toBeVisible()
        await expect(detailPanel).toHaveAttribute('data-state', 'ready')
        await expect(detailPanel).toHaveAttribute('data-source', 'mixed')
        await expect(alertsShell).toHaveAttribute('data-selected-alert-id', seededAlert.alertId)
        await expect(page.getByTestId('alert-detail-live-banner')).toContainText('Live alerts active')
        await expect(page.getByTestId('alert-detail-source-badge')).toContainText('mixed live')
        await expect(page.getByTestId('alert-detail-action-source-note')).toContainText('/api/v1/alerts')
        await expect(page.getByTestId('alert-detail-action-silence')).toHaveAttribute('data-source', 'shell-only')
        await expect(page.getByTestId('alert-detail-copy-link')).toHaveAttribute('data-source', 'shell-only')

        await page.getByTestId('alert-detail-action-acknowledge').click()
        await expect.poll(async () => alertsShell.getAttribute('data-last-action')).toBe('acknowledge')
        await expect.poll(async () => alertsShell.getAttribute('data-alert-action-phase')).toBe('idle')
        await page.getByTestId('alerts-status-filter-acknowledged').click()
        await expect(alertRow).toContainText('acknowledged')

        await page.getByTestId('alert-detail-action-resolve').click()
        await expect.poll(async () => alertsShell.getAttribute('data-last-action')).toBe('resolve')
        await expect.poll(async () => alertsShell.getAttribute('data-alert-action-phase')).toBe('idle')
        await page.getByTestId('alerts-status-filter-resolved').click()
        await expect(alertRow).toContainText('resolved')

        await expectSameOriginApiPathSeen(runtimeSignals, '/api/v1/projects/default/alerts', 'seeded walkthrough alerts')
        await expectSameOriginApiPathSeen(
          runtimeSignals,
          `/api/v1/alerts/${seededAlert.alertId}/acknowledge`,
          'seeded walkthrough alerts',
        )
        await expectSameOriginApiPathSeen(
          runtimeSignals,
          `/api/v1/alerts/${seededAlert.alertId}/resolve`,
          'seeded walkthrough alerts',
        )
        await assertCleanLiveRuntimeSignals(runtimeSignals, {
          failureContext: 'seeded walkthrough alerts',
        })
        clearRuntimeSignals(runtimeSignals)
      })

      await test.step('settings prove live general, team, api key, and alert-rule paths while mock-only subsections stay visible', async () => {
        const settingsRoute = DASHBOARD_ROUTES.find((route) => route.key === 'settings')
        expect(settingsRoute).toBeTruthy()

        await navigateToDashboardRoute(page, settingsRoute!)

        const settingsShell = page.getByTestId('settings-shell')
        await expect(settingsShell).toHaveAttribute('data-current-tab', 'general')
        await expect(settingsShell).toHaveAttribute('data-general-state', 'ready')
        await expect(page.getByTestId('settings-shell-support-badge')).toContainText('mixed live')
        await expect(page.getByTestId('settings-general-panel')).toHaveAttribute('data-source', 'mixed')
        await expect(page.getByTestId('settings-general-source-badge')).toContainText('mixed')
        await expect(page.getByTestId('settings-general-status-banner')).toContainText('Live retention and storage active')
        await expect(page.getByTestId('settings-general-mock-only-banner')).toContainText('Mock-only shell')

        await page.getByTestId('settings-retention-days-input').fill(String(nextRetention))
        await page.getByTestId('settings-sample-rate-input').fill(nextSampleRatePercent)
        await page.getByTestId('settings-general-save').click()
        await expect(settingsShell).toHaveAttribute('data-last-mutation-section', 'general')
        await expect(settingsShell).toHaveAttribute('data-last-mutation-phase', 'idle')
        const retentionValue = await page.getByTestId('settings-retention-days-input').inputValue()
        const sampleRateValue = await page.getByTestId('settings-sample-rate-input').inputValue()
        expect([String(nextRetention), String(originalSettings.retention_days)]).toContain(retentionValue)
        expect([nextSampleRatePercent, String(originalSettings.sample_rate * 100)]).toContain(sampleRateValue)

        await page.getByRole('button', { name: /Team/ }).click()
        await expect(settingsShell).toHaveAttribute('data-current-tab', 'team')
        await expect(page.getByTestId('settings-team-panel')).toHaveAttribute('data-state', 'ready')
        await expect(page.getByTestId('settings-team-source-badge')).toContainText('live')
        await expect(page.getByText(SEEDED_CANDIDATE_EMAIL)).toHaveCount(0)

        await page.getByTestId('settings-team-open-create').click()
        await page.getByTestId('settings-team-user-id-input').fill(SEEDED_CANDIDATE_USER_ID)
        await page.getByTestId('settings-team-role-select').selectOption('member')
        await page.getByTestId('settings-team-submit').click()

        const createdMemberRow = page
          .locator('[data-testid^="settings-team-row-"]')
          .filter({ hasText: SEEDED_CANDIDATE_EMAIL })
          .first()
        await expect(createdMemberRow).toBeVisible()
        const createdMemberRowTestId = await createdMemberRow.getAttribute('data-testid')
        expect(createdMemberRowTestId).toBeTruthy()
        const createdMembershipId = createdMemberRowTestId!.replace('settings-team-row-', '')

        await page.getByTestId(`settings-team-row-role-${createdMembershipId}`).selectOption('admin')
        await expect(createdMemberRow).toContainText('admin')
        await page.getByTestId(`settings-team-row-remove-${createdMembershipId}`).click()
        await expect(createdMemberRow).toHaveCount(0)

        await page.getByRole('button', { name: /API Keys/ }).click()
        await expect(settingsShell).toHaveAttribute('data-current-tab', 'api-keys')
        await expect(page.getByTestId('settings-api-keys-panel')).toHaveAttribute('data-state', 'ready')

        await page.getByTestId('settings-api-keys-open-create').click()
        await page.getByTestId('settings-api-key-label-input').fill(createdKeyLabel)
        await page.getByTestId('settings-api-key-submit').click()

        await expect(page.getByTestId('settings-api-key-reveal')).toBeVisible()
        const revealSecret = await page.getByTestId('settings-api-key-reveal-secret').textContent()
        expect((revealSecret ?? '').length).toBeGreaterThan(20)

        const createdKeyRow = page
          .locator('[data-testid^="settings-api-key-row-"]')
          .filter({ hasText: createdKeyLabel })
          .first()
        await expect(createdKeyRow).toBeVisible()
        const createdKeyRowTestId = await createdKeyRow.getAttribute('data-testid')
        expect(createdKeyRowTestId).toBeTruthy()
        const createdKeyId = createdKeyRowTestId!.replace('settings-api-key-row-', '')

        await page.getByTestId('settings-api-key-reveal-dismiss').click()
        await expect(page.getByTestId('settings-api-key-reveal')).toHaveCount(0)
        await page.getByTestId(`settings-api-key-revoke-${createdKeyId}`).click()
        await expect(page.getByTestId(`settings-api-key-revoke-${createdKeyId}`)).toContainText('Revoked')

        await page.getByRole('button', { name: /Alerts/ }).click()
        await expect(settingsShell).toHaveAttribute('data-current-tab', 'alerts')
        await expect(page.getByTestId('settings-alert-rules-panel')).toHaveAttribute('data-state', 'ready')
        await expect(page.getByTestId('settings-alert-channels-source-badge')).toContainText('mock-only')
        await expect(page.getByTestId('settings-alert-channels-mock-only-banner')).toContainText('Mock-only shell')

        await page.getByTestId('settings-alert-rules-open-create').click()
        await page.getByTestId('settings-alert-rule-name-input').fill(createdRuleName)
        await page.getByTestId('settings-alert-rule-submit').click()

        const createdRuleRow = page
          .locator('[data-testid^="settings-alert-rule-row-"]')
          .filter({ hasText: createdRuleName })
          .first()
        await expect(createdRuleRow).toBeVisible()
        const createdRuleRowTestId = await createdRuleRow.getAttribute('data-testid')
        expect(createdRuleRowTestId).toBeTruthy()
        const createdRuleId = createdRuleRowTestId!.replace('settings-alert-rule-row-', '')

        await page.getByTestId(`settings-alert-rule-toggle-${createdRuleId}`).click()
        await expect(createdRuleRow).toContainText('disabled')
        await page.getByTestId(`settings-alert-rule-delete-${createdRuleId}`).click()
        await expect(createdRuleRow).toHaveCount(0)

        await expectSameOriginApiCallSeen(runtimeSignals, 'GET /api/v1/projects/default/settings', 'seeded walkthrough settings')
        await expectSameOriginApiCallSeen(runtimeSignals, 'GET /api/v1/projects/default/storage', 'seeded walkthrough settings')
        await expectSameOriginApiCallSeen(runtimeSignals, 'POST /api/v1/projects/default/settings', 'seeded walkthrough settings')
        await expectSameOriginApiCallSeen(runtimeSignals, 'GET /api/v1/orgs/default/members', 'seeded walkthrough settings')
        await expectSameOriginApiCallSeen(runtimeSignals, 'POST /api/v1/orgs/default/members', 'seeded walkthrough settings')
        await expectSameOriginApiCallSeen(
          runtimeSignals,
          `POST /api/v1/orgs/default/members/${createdMembershipId}/role`,
          'seeded walkthrough settings',
        )
        await expectSameOriginApiCallSeen(
          runtimeSignals,
          `POST /api/v1/orgs/default/members/${createdMembershipId}/remove`,
          'seeded walkthrough settings',
        )
        await expectSameOriginApiCallSeen(runtimeSignals, 'POST /api/v1/projects/default/api-keys', 'seeded walkthrough settings')
        await expectSameOriginApiCallSeen(
          runtimeSignals,
          `POST /api/v1/api-keys/${createdKeyId}/revoke`,
          'seeded walkthrough settings',
        )
        await expectSameOriginApiCallSeen(
          runtimeSignals,
          'POST /api/v1/projects/default/alert-rules',
          'seeded walkthrough settings',
        )
        await expectSameOriginApiCallSeen(
          runtimeSignals,
          `POST /api/v1/alert-rules/${createdRuleId}/toggle`,
          'seeded walkthrough settings',
        )
        await expectSameOriginApiCallSeen(
          runtimeSignals,
          `POST /api/v1/alert-rules/${createdRuleId}/delete`,
          'seeded walkthrough settings',
        )

        await assertMockOnlySettingsSections(page)
        await assertCleanLiveRuntimeSignals(runtimeSignals, {
          failureContext: 'seeded walkthrough settings',
        })
      })
    } finally {
      const restoreResponse = await request.post('/api/v1/projects/default/settings', {
        data: originalSettings,
      })
      expect(restoreResponse.ok()).toBeTruthy()
      await removeOrgMemberByUserId(request, SEEDED_CANDIDATE_USER_ID)
      await revokeKeyByLabel(request, createdKeyLabel)
      await deleteRuleByName(request, createdRuleName)
      await deleteRuleByName(request, seededAlert.ruleName)
    }
  })
})
