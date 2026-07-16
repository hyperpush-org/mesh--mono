import { expect, test } from '@playwright/test'
import type { DashboardRouteDefinition } from '../../components/dashboard/dashboard-route-map'
import {
  DASHBOARD_ROUTES,
  assertCleanLiveRuntimeSignals,
  attachRuntimeSignalTracking,
  clearRuntimeSignals,
  expectDashboardRoute,
  goToDashboardRouteDirect,
  navigateToDashboardRoute,
} from './live-runtime-helpers'

async function firstVisibleIssueRow(page: import('@playwright/test').Page) {
  const row = page.locator('[data-testid^="issue-row-"]:not([data-testid^="issue-row-status-"])').first()
  await expect(row).toBeVisible()
  const testId = await row.getAttribute('data-testid')

  expect(testId, 'Expected a visible issue row test id').toBeTruthy()

  return {
    row,
    issueId: testId!.replace('issue-row-', ''),
  }
}

async function waitForIssuesOverviewReady(page: import('@playwright/test').Page) {
  const issuesShell = page.getByTestId('issues-shell')
  await expect(issuesShell).toHaveAttribute('data-bootstrap-state', 'ready', { timeout: 20_000 })
  await expect(page.getByTestId('issues-list')).toBeVisible({ timeout: 20_000 })
}

async function assertDirectEntryRoute(page: import('@playwright/test').Page, route: DashboardRouteDefinition) {
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

test.describe('dashboard route parity', () => {
  test('issues shell keeps current root landmarks and shell controls', async ({ page }) => {
    const runtimeSignals = attachRuntimeSignalTracking(page)

    await page.goto('/')

    await expect(page.getByTestId('dashboard-shell')).toHaveAttribute('data-route-key', 'issues')
    await expect(page.getByRole('heading', { name: 'Issues', level: 1 })).toBeVisible()
    await expect(page.getByTestId('issues-shell')).toBeVisible()
    await expect(page.getByTestId('sidebar-nav-issues')).toHaveAttribute('data-active', 'true')
    await expect(page.getByTestId('issues-search-input')).toBeVisible()
    await expect(page.getByText('Bulk actions')).toBeVisible()

    await page.getByTestId('sidebar-collapse-toggle').click()
    await expect(page.getByTestId('dashboard-sidebar')).toHaveAttribute('data-collapsed', 'true')

    await page.getByTestId('ai-copilot-toggle').click()
    await expect(page.getByTestId('ai-panel')).toBeVisible()
    await expect(page.getByTestId('ai-panel').getByText('AI Copilot', { exact: true })).toBeVisible()

    await page.getByTestId('ai-copilot-toggle').click()
    await expect(page.getByTestId('ai-panel')).toBeHidden()
    await expect(page.getByTestId('dashboard-sidebar')).toHaveAttribute('data-collapsed', 'true')

    await assertCleanLiveRuntimeSignals(runtimeSignals, {
      failureContext: 'dashboard route parity root chrome',
    })
  })

  test('issues interactions persist across shell re-renders and browser history', async ({ page }) => {
    test.setTimeout(60_000)
    const runtimeSignals = attachRuntimeSignalTracking(page)
    const issuesShell = page.getByTestId('issues-shell')
    const searchInput = page.getByTestId('issues-search-input')
    const detailPanel = page.getByTestId('issue-detail-panel')

    await page.goto('/')
    await waitForIssuesOverviewReady(page)

    const { issueId } = await firstVisibleIssueRow(page)

    await searchInput.fill(issueId)
    await expect(searchInput).toHaveValue(issueId)
    await expect(issuesShell).toHaveAttribute('data-search-value', issueId)

    const filteredIssueRow = page.getByTestId(`issue-row-${issueId}`)
    await expect(filteredIssueRow).toBeVisible()
    await filteredIssueRow.click()
    await expect.poll(async () => issuesShell.getAttribute('data-selected-issue-id'), { timeout: 20_000 }).toBe(issueId)
    await expect(detailPanel).toBeVisible()

    await page.getByTestId('sidebar-nav-performance').click()
    await expect(page.getByTestId('dashboard-shell')).toHaveAttribute('data-route-key', 'performance')
    await expect(page.getByRole('heading', { name: 'Performance', level: 1 })).toBeVisible()

    await page.goBack()
    await expect(page.getByTestId('dashboard-shell')).toHaveAttribute('data-route-key', 'issues')
    await expect(searchInput).toHaveValue(issueId)

    await page.goForward()
    await expect(page.getByTestId('dashboard-shell')).toHaveAttribute('data-route-key', 'performance')
    await page.goBack()
    await expect(page.getByTestId('dashboard-shell')).toHaveAttribute('data-route-key', 'issues')

    await expect(filteredIssueRow).toBeVisible()
    const selectedIssueIdAfterHistory = await issuesShell.getAttribute('data-selected-issue-id')
    if (selectedIssueIdAfterHistory !== issueId) {
      await filteredIssueRow.click()
      await expect.poll(async () => issuesShell.getAttribute('data-selected-issue-id'), { timeout: 20_000 }).toBe(issueId)
    }
    await expect(detailPanel).toBeVisible()
    await expect(page.getByTestId('issue-detail-close')).toBeVisible()

    await page.getByTestId('issue-detail-close').click({ force: true })
    await expect(detailPanel).toBeHidden()
    await expect(issuesShell).toHaveAttribute('data-selected-issue-id', '')
    await expect(searchInput).toHaveValue(issueId)

    await assertCleanLiveRuntimeSignals(runtimeSignals, {
      failureContext: 'dashboard route parity issues history',
    })
  })

  test('navigation parity keeps URL, active nav, AI visibility, and settings chrome aligned', async ({ page }) => {
    const runtimeSignals = attachRuntimeSignalTracking(page)
    const issuesShell = page.getByTestId('issues-shell')
    const searchInput = page.getByTestId('issues-search-input')
    const sidebar = page.getByTestId('dashboard-sidebar')

    await page.goto('/')
    await waitForIssuesOverviewReady(page)

    const { issueId } = await firstVisibleIssueRow(page)
    await searchInput.fill(issueId)
    await expect(issuesShell).toHaveAttribute('data-search-value', issueId)

    await page.getByTestId('sidebar-collapse-toggle').click()
    await expect(sidebar).toHaveAttribute('data-collapsed', 'true')

    await page.getByTestId('ai-copilot-toggle').click()
    await expect(page.getByTestId('ai-panel')).toBeVisible()

    const performanceRoute = DASHBOARD_ROUTES.find((route) => route.key === 'performance')
    const releasesRoute = DASHBOARD_ROUTES.find((route) => route.key === 'releases')
    const settingsRoute = DASHBOARD_ROUTES.find((route) => route.key === 'settings')
    const issuesRoute = DASHBOARD_ROUTES.find((route) => route.key === 'issues')

    expect(performanceRoute && releasesRoute && settingsRoute && issuesRoute).toBeTruthy()

    await navigateToDashboardRoute(page, performanceRoute!)
    await expect(page.getByRole('heading', { name: 'Performance', level: 1 })).toBeVisible()
    await expect(page.getByTestId('ai-panel')).toBeHidden()
    await expect(sidebar).toHaveAttribute('data-collapsed', 'true')

    await page.getByTestId('ai-copilot-toggle').click()
    await expect(page.getByTestId('ai-panel')).toBeVisible()

    await navigateToDashboardRoute(page, releasesRoute!)
    await expect(page.getByRole('heading', { name: 'Releases', level: 1 })).toBeVisible()
    await expect(page.getByTestId('ai-panel')).toBeHidden()

    await navigateToDashboardRoute(page, settingsRoute!)
    await expect(page.getByTestId('settings-shell')).toBeVisible()
    await expect(page.getByTestId('ai-copilot-toggle')).toHaveCount(0)
    await expect(page.getByText('Project name', { exact: true })).toBeVisible()
    await expect(sidebar).toHaveAttribute('data-collapsed', 'true')

    await navigateToDashboardRoute(page, issuesRoute!)
    await expect(page.getByRole('heading', { name: 'Issues', level: 1 })).toBeVisible()
    await expect(searchInput).toHaveValue(issueId)
    await expect(issuesShell).toHaveAttribute('data-search-value', issueId)
    await expect(sidebar).toHaveAttribute('data-collapsed', 'true')

    await assertCleanLiveRuntimeSignals(runtimeSignals, {
      failureContext: 'dashboard route parity navigation',
    })
  })

  test('direct-entry routes render the expected shell state and landmarks', async ({ page }) => {
    const runtimeSignals = attachRuntimeSignalTracking(page)

    for (const route of DASHBOARD_ROUTES) {
      await test.step(`direct entry: ${route.key}`, async () => {
        await assertDirectEntryRoute(page, route)
        await assertCleanLiveRuntimeSignals(runtimeSignals, {
          failureContext: `dashboard route parity direct entry ${route.key}`,
        })
        clearRuntimeSignals(runtimeSignals)
      })
    }
  })

  test('direct-entry routes fall back to issues for unknown paths', async ({ page }) => {
    const runtimeSignals = attachRuntimeSignalTracking(page)

    await page.goto('/does-not-exist/deep-link')

    expect(await page.evaluate(() => window.location.pathname)).toBe('/does-not-exist/deep-link')
    await expect(page.getByTestId('dashboard-shell')).toHaveAttribute('data-route-key', 'issues')
    await expect(page.getByTestId('sidebar-nav-issues')).toHaveAttribute('data-active', 'true')
    await expect(page.getByRole('heading', { name: 'Issues', level: 1 })).toBeVisible()
    await expect(page.getByTestId('issues-search-input')).toBeVisible()

    await assertCleanLiveRuntimeSignals(runtimeSignals, {
      failureContext: 'dashboard route parity unknown path',
    })
  })
})
