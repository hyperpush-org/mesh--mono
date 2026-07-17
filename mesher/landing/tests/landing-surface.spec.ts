import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('@smoke homepage exposes responsive navigation and metadata', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1 })).toContainText('See what broke')
  await expect(page.getByRole('navigation')).toBeVisible()
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /hyperpush/)
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /production errors/i)

  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(horizontalOverflow).toBeLessThanOrEqual(1)

  const robots = await page.request.get('/robots.txt')
  const sitemap = await page.request.get('/sitemap.xml')
  expect(robots.ok()).toBeTruthy()
  expect(await robots.text()).toContain('Sitemap:')
  expect(sitemap.ok()).toBeTruthy()
  expect(await sitemap.text()).toContain('/privacy')
})

test('@smoke waitlist reports success only after an acknowledged response', async ({ page }) => {
  await page.route('https://formspree.io/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
  )
  await page.goto('/')
  const trigger = page.getByRole('button', { name: 'Join Waitlist' }).first()
  await trigger.click()

  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill('Ada Lovelace')
  await dialog.getByLabel('Email').fill('ada@example.com')
  await dialog.getByRole('button', { name: 'Join Waitlist' }).click()

  await expect(dialog.getByText("You're on the list!")).toBeVisible()
})

test('@smoke waitlist keeps failure visible and retryable', async ({ page }) => {
  await page.route('https://formspree.io/**', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"unavailable"}' }),
  )
  await page.goto('/')
  const trigger = page.getByRole('button', { name: 'Join Waitlist' }).first()
  await trigger.click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Email').fill('retry@example.com')
  await dialog.getByRole('button', { name: 'Join Waitlist' }).click()

  await expect(dialog.getByRole('alert')).toContainText('could not confirm')
  await expect(dialog.getByRole('button', { name: 'Join Waitlist' })).toBeEnabled()
  await expect(dialog.getByText("You're on the list!")).toHaveCount(0)
})

test('primary pages and the waitlist dialog pass WCAG 2.1 A/AA automation', async ({ page }) => {
  for (const path of ['/', '/privacy']) {
    await page.goto(path)
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
  }

  await page.goto('/')
  await page.getByRole('button', { name: 'Join Waitlist' }).first().click()
  const dialogResults = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(dialogResults.violations, JSON.stringify(dialogResults.violations, null, 2)).toEqual([])
})

test('@smoke dialog supports keyboard close and restores focus', async ({ page }) => {
  await page.goto('/')
  const trigger = page.getByRole('button', { name: 'Join Waitlist' }).first()
  await trigger.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('@smoke reduced motion retains semantic canvas alternatives', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const canvas = page.getByRole('img', { name: /isolated Mesh actors/i })
  await canvas.scrollIntoViewIfNeeded()
  await expect(canvas).toBeVisible()
  await expect(canvas).toContainText(/actors process events independently/i)
})

test('@smoke homepage lab vitals stay within release budgets', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Layout Shift timing is a Chromium lab metric')
  await page.addInitScript(() => {
    const metrics = { lcp: 0, cls: 0 }
    Object.assign(window, { __hyperpushVitals: metrics })
    new PerformanceObserver((list) => {
      const entries = list.getEntries()
      metrics.lcp = entries.at(-1)?.startTime ?? metrics.lcp
    }).observe({ type: 'largest-contentful-paint', buffered: true })
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number }
        if (!shift.hadRecentInput) metrics.cls += shift.value ?? 0
      }
    }).observe({ type: 'layout-shift', buffered: true })
  })
  await page.goto('/')
  await page.getByRole('heading', { level: 1 }).waitFor()
  await page.waitForLoadState('networkidle')
  const vitals = await page.evaluate(() =>
    (window as typeof window & { __hyperpushVitals: { lcp: number; cls: number } }).__hyperpushVitals,
  )
  expect(vitals.lcp).toBeGreaterThan(0)
  expect(vitals.lcp).toBeLessThan(4_000)
  expect(vitals.cls).toBeLessThan(0.1)
})
