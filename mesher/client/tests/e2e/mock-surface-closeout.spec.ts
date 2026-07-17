import { expect, test, type Page } from '@playwright/test'
import { ensureSeededIssueOpen } from './seeded-live-issue'

const SESSION_STORAGE_KEY = 'hyperpush.management-session'
const E2E_SESSION_TOKEN =
  process.env.MESHER_E2E_SESSION_TOKEN ??
  'hyperpush-e2e-session-token-0000000000000000000000000000'
const SEEDED_TITLE = 'Mock surface closeout live issue'
const SEEDED_STACK_FILE = 'proof/mock-surface-closeout.ts'
const SEEDED_BREADCRUMB = 'Mock surface closeout breadcrumb'

async function installSession(page: Page) {
  await page.addInitScript(
    ({ key, token }) => window.sessionStorage.setItem(key, token),
    { key: SESSION_STORAGE_KEY, token: E2E_SESSION_TOKEN },
  )
}

test.describe('mock surface closeout', () => {
  test('requires a management session and blocks removed routes', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()

    for (const removedPath of ['/performance', '/releases']) {
      await page.goto(removedPath)
      await expect(page.getByText('Capability unavailable', { exact: true })).toBeVisible()
      await expect(page.getByTestId('dashboard-shell')).toHaveCount(0)
    }
  })

  test('retained routes render only live, capability-backed surfaces', async ({ page, request }) => {
    await installSession(page)
    const seeded = await ensureSeededIssueOpen(request, {
      title: SEEDED_TITLE,
      fingerprint: 'mock-surface-closeout-live-issue',
      stackFile: SEEDED_STACK_FILE,
      breadcrumbMessage: SEEDED_BREADCRUMB,
      tagValue: 'mock-surface-closeout',
      surface: 'mock-surface-closeout',
    })

    await page.goto('/')
    await expect(page.getByTestId('issues-shell')).toHaveAttribute('data-bootstrap-state', 'ready')
    await expect(page.getByTestId(`issue-row-${seeded.issueId}`)).toBeVisible()
    await page.getByTestId(`issue-row-${seeded.issueId}`).click()
    await expect(page.getByTestId('issue-detail-panel')).toHaveAttribute('data-state', 'ready')
    await expect(page.getByTestId('issue-detail-panel')).toContainText(SEEDED_STACK_FILE)
    await page.getByRole('button', { name: 'breadcrumbs' }).click()
    await expect(page.getByTestId('issue-detail-panel')).toContainText(SEEDED_BREADCRUMB)

    await page.getByTestId('issue-detail-action-resolve').click()
    await expect(page.getByTestId(`issue-row-status-${seeded.issueId}`)).toHaveText('resolved')
    await expect(page.getByTestId('issue-detail-action-unresolve')).toBeVisible()
    await page.getByTestId('issue-detail-action-unresolve').click()
    await expect(page.getByTestId(`issue-row-status-${seeded.issueId}`)).toHaveText('open')

    await page.getByTestId('sidebar-nav-alerts').click()
    await expect(page).toHaveURL(/\/alerts$/)
    await expect(page.getByTestId('alerts-shell')).toHaveAttribute('data-bootstrap-state', 'ready')
    await expect(page.getByTestId('alerts-list').or(page.getByTestId('alerts-list-empty'))).toBeVisible()

    await page.getByTestId('sidebar-nav-settings').click()
    await expect(page).toHaveURL(/\/settings$/)
    await expect(page.getByTestId('settings-shell')).toHaveAttribute('data-shell-state', 'ready')
    await expect(page.getByTestId('settings-general-panel')).toBeVisible()
    await page.getByRole('button', { name: 'Team' }).click()
    await expect(page.getByTestId('settings-team-panel')).toBeVisible()
    await page.getByRole('button', { name: 'API Keys' }).click()
    await expect(page.getByTestId('settings-api-keys-panel')).toBeVisible()
    await page.getByRole('button', { name: 'Alert Rules' }).click()
    await expect(page.getByTestId('settings-alert-rules-panel')).toBeVisible()

    for (const unavailableLabel of [
      'AI Analysis',
      'Performance',
      'Releases',
      'Integrations',
      'Billing',
      'Security',
      'Notifications',
      'Profile',
    ]) {
      await expect(page.getByText(unavailableLabel, { exact: true })).toHaveCount(0)
    }

  })

  test('switches project context and refetches by the selected project id', async ({ page }) => {
    await installSession(page)
    const secondProjectId = '22222222-2222-4222-8222-222222222222'
    let primaryProjectId = ''
    const secondProjectCalls: string[] = []

    await page.route('**/api/v1/auth/me', async (route) => {
      const response = await route.fetch()
      const payload = await response.json()
      const primaryMembership = payload.memberships[0]
      primaryProjectId = primaryMembership.project_id
      payload.memberships.push({
        ...primaryMembership,
        project_id: secondProjectId,
        project_name: 'Second Project',
        project_slug: 'second-project',
      })
      await route.fulfill({ response, json: payload })
    })

    await page.route(`**/api/v1/projects/${secondProjectId}/**`, async (route) => {
      secondProjectCalls.push(new URL(route.request().url()).pathname)
      const response = await route.fetch({
        url: route.request().url().replace(secondProjectId, primaryProjectId),
      })
      await route.fulfill({ response })
    })

    await page.goto('/')
    await expect(page.getByTestId('issues-shell')).toHaveAttribute('data-bootstrap-state', 'ready')
    await page.getByTestId('active-project-select').selectOption({ label: 'Second Project' })
    await expect.poll(() => secondProjectCalls.length).toBeGreaterThanOrEqual(4)
    expect(secondProjectCalls).toEqual(
      expect.arrayContaining([
        `/api/v1/projects/${secondProjectId}/issues`,
        `/api/v1/projects/${secondProjectId}/dashboard/health`,
        `/api/v1/projects/${secondProjectId}/dashboard/levels`,
        `/api/v1/projects/${secondProjectId}/dashboard/volume`,
      ]),
    )
    await expect(page.getByTestId('issues-shell')).toHaveAttribute('data-bootstrap-state', 'ready')
  })

  test('shows a truthful error state without substituting seeded records', async ({ page }) => {
    await installSession(page)
    await page.route('**/api/v1/projects/*/issues*', async (route) => {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"proof failure"}' })
    })

    await page.goto('/')
    await expect(page.getByTestId('issues-shell')).toHaveAttribute('data-bootstrap-state', 'failed')
    await expect(page.getByRole('alert')).toContainText('No fallback records were loaded')
    await expect(page.getByText(SEEDED_TITLE, { exact: true })).toHaveCount(0)
    await expect(page.getByTestId('issues-shell')).toHaveAttribute('data-live-issue-count', '0')
  })
})
